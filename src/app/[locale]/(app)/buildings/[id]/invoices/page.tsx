import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { GenerateInvoicesDialog } from "./generate-invoices-dialog";
import { PublishDraftsButton } from "./publish-drafts-button";
import { InvoicesTable } from "./invoices-table";
import { getBillingDefaults, getDraftBatchAmounts } from "./actions";

export default async function BuildingInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("invoices");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, name, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, building.association_id);
  const capabilities = context?.capabilities ?? [];
  const canPublish = capabilities.includes("finance.invoice.publish");
  // Matches the invoices_update RLS policy exactly: either capability
  // is enough to discard a draft or cancel an issued invoice.
  const canDiscard =
    capabilities.includes("finance.payment.record") || capabilities.includes("finance.invoice.publish");

  const associationName = building.associations?.name ?? tAssociations("title");

  const [{ data: feeTypes }, { data: invoices }, billingDefaults] = await Promise.all([
    supabase
      .from("fee_types")
      .select("id, label, allocation_rules(method, is_active)")
      .eq("association_id", building.association_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, issued_at, billing_period_start, billing_period_end, total_amount, status, units!inner(unit_number, building_id)"
      )
      .eq("units.building_id", id)
      .order("billing_period_start", { ascending: false }),
    getBillingDefaults(supabase, id),
  ]);

  const resolvedFeeTypes = (feeTypes ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    method: f.allocation_rules.find((r) => r.is_active)?.method ?? null,
  }));

  const draftInvoices = (invoices ?? []).filter((i) => i.status === "draft");
  const draftInvoiceIds = draftInvoices.map((i) => i.id);
  // Editing operates on the whole batch (a period's worth of draft
  // invoices), not one row -- there's only ever one draft period in
  // flight for a building in practice, since the exclude constraint
  // means a unit can't hold two overlapping drafts at once.
  const draftPeriod = draftInvoices[0]
    ? { start: draftInvoices[0].billing_period_start, end: draftInvoices[0].billing_period_end }
    : null;
  const draftAmounts = draftPeriod
    ? await getDraftBatchAmounts(supabase, id, draftPeriod.start, draftPeriod.end)
    : {};

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name, href: `/buildings/${building.id}` },
          { label: t("title") },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { building: building.name })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capabilities.includes("finance.invoice.generate") && draftPeriod && (
            <GenerateInvoicesDialog
              buildingId={building.id}
              feeTypes={resolvedFeeTypes}
              defaultPeriodStart={draftPeriod.start}
              suggestedAmounts={draftAmounts}
              mode="edit"
            />
          )}
          {canPublish && draftInvoiceIds.length > 0 && (
            <PublishDraftsButton invoiceIds={draftInvoiceIds} />
          )}
          {capabilities.includes("finance.invoice.generate") && (
            <GenerateInvoicesDialog
              buildingId={building.id}
              feeTypes={resolvedFeeTypes}
              defaultPeriodStart={billingDefaults.defaultPeriodStart}
              suggestedAmounts={billingDefaults.suggestedAmounts}
            />
          )}
        </div>
      </div>

      {!invoices || invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
      ) : (
        <InvoicesTable
          buildingId={building.id}
          canPublish={canPublish}
          canDiscard={canDiscard}
          invoices={invoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            unitNumber: invoice.units?.unit_number ?? "",
            periodStart: invoice.billing_period_start,
            periodEnd: invoice.billing_period_end,
            issuedAt: invoice.issued_at,
            totalAmount: invoice.total_amount,
            status: invoice.status,
          }))}
        />
      )}
    </main>
  );
}
