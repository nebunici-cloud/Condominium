import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { embedOne } from "@/lib/embed";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { statusVariant, statusLabelKeys } from "../invoice-status";
import { AdjustmentDialog } from "./adjustment-dialog";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  const t = await getTranslations("invoices");
  const tUnits = await getTranslations("units");
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

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, billing_period_start, billing_period_end, total_amount, status, units!inner(unit_number, building_id)"
    )
    .eq("id", invoiceId)
    .eq("units.building_id", id)
    .maybeSingle();

  if (!invoice) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, building.association_id);
  const capabilities = context?.capabilities ?? [];
  const canEditLines = invoice.status === "draft" && capabilities.includes("finance.invoice.generate");

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("id, amount, adjustment_amount, adjustment_reason, fee_types(label)")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const associationName = embedOne(building.associations)?.name ?? tAssociations("title");
  const unitNumber = embedOne(invoice.units)?.unit_number;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name, href: `/buildings/${building.id}` },
          { label: t("title"), href: `/buildings/${building.id}/invoices` },
          { label: `${unitNumber} — ${invoice.billing_period_start}` },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {tUnits("unitNumberLabel")} {unitNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invoice.billing_period_start} – {invoice.billing_period_end}
          </p>
        </div>
        <Badge variant={statusVariant[invoice.status]}>{t(statusLabelKeys[invoice.status])}</Badge>
      </div>

      {!lines || lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noLines")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("feeTypeColumn")}</TableHead>
                <TableHead>{t("baseAmountColumn")}</TableHead>
                <TableHead>{t("adjustmentColumn")}</TableHead>
                <TableHead>{t("lineTotalColumn")}</TableHead>
                {canEditLines && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const adjustment = line.adjustment_amount ?? 0;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{embedOne(line.fee_types)?.label}</TableCell>
                    <TableCell>{line.amount}</TableCell>
                    <TableCell>
                      {adjustment !== 0 ? (
                        <div className="flex flex-col">
                          <span>{adjustment}</span>
                          {line.adjustment_reason && (
                            <span className="text-xs text-muted-foreground">
                              {line.adjustment_reason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {(Number(line.amount) + Number(adjustment)).toFixed(2)}
                    </TableCell>
                    {canEditLines && (
                      <TableCell>
                        <AdjustmentDialog
                          invoiceLineId={line.id}
                          currentAmount={adjustment}
                          currentReason={line.adjustment_reason}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>{t("totalAmount")}</TableCell>
                <TableCell className="font-semibold">{invoice.total_amount}</TableCell>
                {canEditLines && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </main>
  );
}
