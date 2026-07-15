import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";

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
import { Card } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { computeOutstandingBalance } from "@/lib/balance";
import { formatPeriodLabel } from "@/lib/period";

import { statusHeaderClasses, statusLabelKeys } from "../invoice-status";
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
  const tAssociations = await getTranslations("associations");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, name, address, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, due_date, billing_period_start, billing_period_end, total_amount, status, unit_id, units!inner(unit_number, building_id, payment_account_code)"
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

  const [{ data: lines }, { data: ownerships }, { data: openingBalance }, { data: priorInvoices }, { data: priorPayments }] =
    await Promise.all([
      supabase
        .from("invoice_lines")
        .select("id, amount, adjustment_amount, adjustment_reason, calculation_input, fee_types(label)")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true }),
      supabase
        .from("ownerships")
        .select("share_percent, owners(full_name)")
        .eq("unit_id", invoice.unit_id)
        .is("effective_to", null)
        .order("share_percent", { ascending: false }),
      supabase
        .from("opening_balances")
        .select("amount")
        .eq("unit_id", invoice.unit_id)
        .maybeSingle(),
      // Everything already billed for this unit strictly before this
      // invoice's own period -- this invoice's own total is
      // deliberately excluded, it's shown as a separate line.
      supabase
        .from("invoices")
        .select("total_amount")
        .eq("unit_id", invoice.unit_id)
        .neq("status", "cancelled")
        .neq("status", "draft")
        .neq("id", invoiceId)
        .lt("billing_period_start", invoice.billing_period_start),
      supabase
        .from("payments")
        .select("amount")
        .eq("unit_id", invoice.unit_id)
        .lt("paid_at", invoice.billing_period_start),
    ]);

  const associationName = embedOne(building.associations)?.name ?? tAssociations("title");
  const unitEmbed = embedOne(invoice.units);
  const unitNumber = unitEmbed?.unit_number;
  // The invoice header shows one client -- the largest current
  // co-owner, same convention as the printed original this is modeled
  // after (a single "Proprietar Apartament" line, not a full co-owner
  // list).
  const primaryOwner = embedOne(ownerships?.[0]?.owners);
  const fullAddress = building.address ? `${building.address}, ap. ${unitNumber}` : `ap. ${unitNumber}`;

  // "Datorii" (Sold anterior): everything owed as of the start of
  // this invoice's period, before its own charges are added --
  // opening balance plus prior invoices minus prior payments, same
  // formula as the unit page's outstanding balance, just cut off
  // before this period instead of "as of now".
  const priorBalance = computeOutstandingBalance({
    openingBalance: openingBalance?.amount ?? 0,
    invoiceTotal: (priorInvoices ?? []).reduce((sum, i) => sum + i.total_amount, 0),
    paymentTotal: (priorPayments ?? []).reduce((sum, p) => sum + p.amount, 0),
  });
  const grandTotal = priorBalance + Number(invoice.total_amount);

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
          {
            label: `${unitNumber} — ${formatPeriodLabel(invoice.billing_period_start, invoice.billing_period_end, locale)}`,
          },
        ]}
      />

      <Card className="mb-6 gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 px-6 py-4 text-white">
          <div>
            <p className="text-xs tracking-wide text-slate-300 uppercase">{associationName}</p>
            <h1 className="text-xl font-semibold">{t("digitalInvoiceTitle")}</h1>
          </div>
          <Badge className={`text-sm ${statusHeaderClasses[invoice.status]}`}>
            {t(statusLabelKeys[invoice.status])}
          </Badge>
        </div>

        <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t("invoiceNumberLabel")}</dt>
            <dd className="font-medium">{invoice.invoice_number ?? t("draftPlaceholder")}</dd>
            <dt className="text-muted-foreground">{t("dueDateLabel")}</dt>
            <dd className="font-medium">{invoice.due_date ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("period")}</dt>
            <dd className="font-medium">
              {formatPeriodLabel(invoice.billing_period_start, invoice.billing_period_end, locale)}
            </dd>
          </dl>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t("clientLabel")}</dt>
            <dd className="font-medium">{primaryOwner?.full_name ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("personalCodeColumnLabel")}</dt>
            <dd className="font-medium">{unitEmbed?.payment_account_code ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("addressLabel")}</dt>
            <dd className="font-medium">{fullAddress}</dd>
          </dl>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t bg-muted/40 px-6 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("priorBalanceLabel")}</dt>
            <dd className="text-right font-medium tabular-nums">{priorBalance.toFixed(2)}</dd>
            <dt className="text-muted-foreground">{t("currentInvoiceLabel")}</dt>
            <dd className="text-right font-medium tabular-nums">
              {Number(invoice.total_amount).toFixed(2)}
            </dd>
          </dl>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t("totalDueLabel")}</p>
            <p className="text-3xl font-bold">{grandTotal.toFixed(2)} MDL</p>
            {invoice.due_date && (
              <p className="text-xs text-muted-foreground">
                {t("dueDateHint", { date: invoice.due_date })}
              </p>
            )}
          </div>
        </div>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noLines")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/50">
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
