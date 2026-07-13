import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
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

import { GenerateInvoicesDialog } from "./generate-invoices-dialog";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  issued: "outline",
  partially_paid: "secondary",
  paid: "default",
  cancelled: "destructive",
};

const statusLabelKeys: Record<string, string> = {
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

  const associationName = building.associations?.[0]?.name ?? tAssociations("title");

  const [{ data: feeTypes }, { data: invoices }] = await Promise.all([
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
  ]);

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
        <GenerateInvoicesDialog buildingId={building.id} feeTypes={feeTypes ?? []} />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.units?.[0]?.unit_number}</TableCell>
                  <TableCell>
                    {invoice.billing_period_start} – {invoice.billing_period_end}
                  </TableCell>
                  <TableCell>{invoice.total_amount}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[invoice.status]}>
                      {t(statusLabelKeys[invoice.status])}
                    </Badge>
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
