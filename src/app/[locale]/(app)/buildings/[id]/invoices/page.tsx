import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { embedOne } from "@/lib/embed";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EndEffectiveDatedButton } from "@/components/end-effective-dated-button";

import { GenerateInvoicesDialog } from "./generate-invoices-dialog";
import { PublishDraftsButton } from "./publish-drafts-button";
import { cancelInvoice, publishInvoice, getBillingDefaults } from "./actions";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  issued: "outline",
  partially_paid: "secondary",
  paid: "default",
  cancelled: "destructive",
};

const statusLabelKeys: Record<string, string> = {
  draft: "statusDraft",
  issued: "statusIssued",
  partially_paid: "statusPartiallyPaid",
  paid: "statusPaid",
  cancelled: "statusCancelled",
};

export default async function BuildingInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("invoices");
  const tUnits = await getTranslations("units");
  const tCommon = await getTranslations("common");
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

  const associationName = embedOne(building.associations)?.name ?? tAssociations("title");

  const [{ data: feeTypes }, { data: invoices }, billingDefaults] = await Promise.all([
    supabase
      .from("fee_types")
      .select("id, label")
      .eq("association_id", building.association_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, billing_period_start, billing_period_end, total_amount, status, units!inner(unit_number, building_id)")
      .eq("units.building_id", id)
      .order("billing_period_start", { ascending: false }),
    getBillingDefaults(supabase, id),
  ]);

  const draftInvoiceIds = (invoices ?? []).filter((i) => i.status === "draft").map((i) => i.id);

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
        <div className="flex flex-wrap gap-2">
          {canPublish && draftInvoiceIds.length > 0 && (
            <PublishDraftsButton invoiceIds={draftInvoiceIds} />
          )}
          {capabilities.includes("finance.invoice.generate") && (
            <GenerateInvoicesDialog
              buildingId={building.id}
              feeTypes={feeTypes ?? []}
              defaultPeriodStart={billingDefaults.defaultPeriodStart}
              defaultPeriodEnd={billingDefaults.defaultPeriodEnd}
              suggestedAmounts={billingDefaults.suggestedAmounts}
            />
          )}
        </div>
      </div>

      {!invoices || invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tUnits("unitNumberLabel")}</TableHead>
                <TableHead>{t("period")}</TableHead>
                <TableHead>{t("totalAmount")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{embedOne(invoice.units)?.unit_number}</TableCell>
                  <TableCell>
                    {invoice.billing_period_start} – {invoice.billing_period_end}
                  </TableCell>
                  <TableCell>{invoice.total_amount}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[invoice.status]}>
                      {t(statusLabelKeys[invoice.status])}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canPublish && invoice.status === "draft" && (
                        <EndEffectiveDatedButton
                          id={invoice.id}
                          action={publishInvoice}
                          triggerLabel={t("publish")}
                          confirmTitle={t("publish")}
                          confirmDescription={t("publishConfirm")}
                          successMessage={t("publishSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                          confirmVariant="default"
                        />
                      )}
                      {canDiscard &&
                        (invoice.status === "draft" ||
                          invoice.status === "issued" ||
                          invoice.status === "partially_paid") && (
                          <EndEffectiveDatedButton
                            id={invoice.id}
                            action={cancelInvoice}
                            triggerLabel={
                              invoice.status === "draft" ? t("discardDraft") : t("cancelInvoice")
                            }
                            confirmTitle={
                              invoice.status === "draft" ? t("discardDraft") : t("cancelInvoice")
                            }
                            confirmDescription={
                              invoice.status === "draft"
                                ? t("discardDraftConfirm")
                                : t("cancelInvoiceConfirm")
                            }
                            successMessage={
                              invoice.status === "draft" ? t("discardDraftSuccess") : t("cancelSuccess")
                            }
                            cancelLabel={tCommon("cancel")}
                            confirmLabel={tCommon("confirm")}
                          />
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
