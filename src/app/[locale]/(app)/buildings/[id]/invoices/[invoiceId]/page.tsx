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
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { statusVariant, statusLabelKeys } from "../invoice-status";
import { AdjustmentDialog } from "./adjustment-dialog";

// Short unit-of-measure labels matching how a real invoice prints
// them (u.m. column) -- keyed by the allocation basis stored on each
// line's calculation_input.
const quantityUnitLabels: Record<string, string> = {
  cota_parte: "%",
  by_area: "m²",
  per_unit: "ap.",
  per_resident: "pers.",
  by_meter: "u.c.",
};

type CalculationInput = {
  quantity?: number;
  unit_of_measure?: string;
  rate?: number;
};

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
    .select("id, amount, adjustment_amount, adjustment_reason, calculation_input, fee_types(label)")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const associationName = embedOne(building.associations)?.name ?? tAssociations("title");
  const unitNumber = embedOne(invoice.units)?.unit_number;

  const rows = (lines ?? []).map((line) => {
    const input = (line.calculation_input ?? {}) as CalculationInput;
    const quantity = input.quantity;
    const unitLabel = input.unit_of_measure ? (quantityUnitLabels[input.unit_of_measure] ?? "") : "";
    const rate = input.rate ?? (quantity && quantity > 0 ? line.amount / quantity : undefined);
    const adjustment = line.adjustment_amount ?? 0;
    return {
      id: line.id,
      feeTypeLabel: embedOne(line.fee_types)?.label ?? "",
      quantity,
      unitLabel,
      rate,
      amount: line.amount,
      adjustment,
      adjustmentReason: line.adjustment_reason,
      total: Number(line.amount) + Number(adjustment),
    };
  });

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

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {tUnits("unitNumberLabel")} {unitNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {associationName} — {building.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("period")}: {invoice.billing_period_start} – {invoice.billing_period_end}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={statusVariant[invoice.status]}>{t(statusLabelKeys[invoice.status])}</Badge>
            <p className="text-2xl font-semibold">{invoice.total_amount}</p>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noLines")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("feeTypeColumn")}</TableHead>
                <TableHead className="text-right">{t("quantityColumn")}</TableHead>
                <TableHead>{t("unitOfMeasureColumnShort")}</TableHead>
                <TableHead className="text-right">{t("rateColumn")}</TableHead>
                <TableHead className="text-right">{t("baseAmountColumn")}</TableHead>
                <TableHead className="text-right">{t("adjustmentColumn")}</TableHead>
                <TableHead className="text-right">{t("lineTotalColumn")}</TableHead>
                {canEditLines && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.feeTypeLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity !== undefined ? row.quantity : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.unitLabel || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.rate !== undefined ? row.rate.toFixed(2) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.amount}</TableCell>
                  <TableCell className="text-right">
                    {row.adjustment !== 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="tabular-nums">{row.adjustment}</span>
                        {row.adjustmentReason && (
                          <span className="text-xs text-muted-foreground">{row.adjustmentReason}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {row.total.toFixed(2)}
                  </TableCell>
                  {canEditLines && (
                    <TableCell>
                      <AdjustmentDialog
                        invoiceLineId={row.id}
                        currentAmount={row.adjustment}
                        currentReason={row.adjustmentReason}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>{t("totalAmount")}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {invoice.total_amount}
                </TableCell>
                {canEditLines && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </main>
  );
}
