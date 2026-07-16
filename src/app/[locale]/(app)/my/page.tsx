import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { computeOutstandingBalance } from "@/lib/balance";
import { formatDate, formatPeriodLabel } from "@/lib/period";
import { Link } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  statusBadgeClasses,
  statusLabelKeys,
} from "../buildings/[id]/invoices/invoice-status";
import { SubmitReadingDialog } from "./submit-reading-dialog";

// The resident's self-service home: everything scoped to the units
// the signed-in user currently owns or occupies. Data access is
// enforced by RLS (user_unit_ids()) -- these queries can only ever
// return the caller's own rows, so the page needs no capability
// checks of its own.
export default async function MyHomePage() {
  const t = await getTranslations("my");
  const tBalance = await getTranslations("balance");
  const tInvoices = await getTranslations("invoices");
  const tPayments = await getTranslations("payments");
  const tMeterReadings = await getTranslations("meterReadings");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: unitIds } = await supabase.rpc("user_unit_ids");

  if (!unitIds || unitIds.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
      </main>
    );
  }

  const [{ data: units }, { data: invoices }, { data: payments }, { data: openingBalances }, { data: readings }] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, tenant_id, unit_number, meters, building_id, buildings(name, address, association_id, associations(name))")
        .in("id", unitIds),
      supabase
        .from("invoices")
        .select("id, unit_id, invoice_number, billing_period_start, billing_period_end, total_amount, status, due_date")
        .in("unit_id", unitIds)
        .neq("status", "draft")
        .order("billing_period_start", { ascending: false }),
      supabase
        .from("payments")
        .select("id, unit_id, amount, paid_at, method")
        .in("unit_id", unitIds)
        .order("paid_at", { ascending: false })
        .limit(30),
      supabase.from("opening_balances").select("unit_id, amount").in("unit_id", unitIds),
      supabase
        .from("meter_readings")
        .select("unit_id, meter_type, meter_id, reading_value, reading_date")
        .in("unit_id", unitIds)
        .order("reading_date", { ascending: false })
        .limit(60),
    ]);

  const associationIds = Array.from(
    new Set((units ?? []).map((u) => u.buildings?.association_id).filter((v): v is string => Boolean(v)))
  );
  const { data: announcements } = associationIds.length
    ? await supabase
        .from("announcements")
        .select("id, title, body, published_at")
        .in("association_id", associationIds)
        .order("published_at", { ascending: false })
        .limit(5)
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      {(announcements ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {t("announcements")}
          </h2>
          <div className="flex flex-col gap-3">
            {(announcements ?? []).map((a) => (
              <div key={a.id} className="rounded-md border p-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(a.published_at.slice(0, 10))}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-8">
        {(units ?? []).map((unit) => {
          const unitInvoices = (invoices ?? []).filter((i) => i.unit_id === unit.id);
          const unitPayments = (payments ?? []).filter((p) => p.unit_id === unit.id);
          const opening = (openingBalances ?? []).find((b) => b.unit_id === unit.id);

          const balance = computeOutstandingBalance({
            openingBalance: opening?.amount ?? 0,
            invoiceTotal: unitInvoices
              .filter((i) => i.status !== "cancelled")
              .reduce((sum, i) => sum + i.total_amount, 0),
            paymentTotal: unitPayments.reduce((sum, p) => sum + p.amount, 0),
          });

          const unitMeters = Array.isArray(unit.meters)
            ? unit.meters.map((m) => {
                const meter = (m && typeof m === "object" && !Array.isArray(m) ? m : {}) as {
                  type?: string;
                  meter_id?: string;
                };
                return { type: meter.type ?? "", meterId: meter.meter_id ?? "" };
              })
            : [];

          const lastReadingByKey: Record<string, { value: number; date: string }> = {};
          for (const reading of (readings ?? []).filter((r) => r.unit_id === unit.id)) {
            const key = `${reading.meter_type}::${reading.meter_id ?? ""}`;
            if (!lastReadingByKey[key]) {
              lastReadingByKey[key] = {
                value: reading.reading_value,
                date: formatDate(reading.reading_date),
              };
            }
          }

          const buildingLabel = [unit.buildings?.associations?.name, unit.buildings?.name]
            .filter(Boolean)
            .join(" · ");

          return (
            <Card key={unit.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {t("unitTitle", { unitNumber: unit.unit_number })}
                    </CardTitle>
                    {buildingLabel && <CardDescription>{buildingLabel}</CardDescription>}
                  </div>
                  <SubmitReadingDialog
                    unitId={unit.id}
                    tenantId={unit.tenant_id}
                    meters={unitMeters}
                    lastReadingByKey={lastReadingByKey}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div
                  className={`rounded-md border p-4 text-lg font-semibold ${
                    balance > 0 ? "text-red-600" : balance < 0 ? "text-emerald-600" : ""
                  }`}
                >
                  {balance > 0
                    ? tBalance("owed", { amount: balance.toFixed(2) })
                    : balance < 0
                      ? tBalance("credit", { amount: Math.abs(balance).toFixed(2) })
                      : tBalance("settled")}
                </div>

                <section>
                  <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                    {tInvoices("title")}
                  </h2>
                  {unitInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tInvoices("noInvoices")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{tInvoices("period")}</TableHead>
                            <TableHead>{tInvoices("totalAmount")}</TableHead>
                            <TableHead>{tInvoices("dueDateLabel")}</TableHead>
                            <TableHead>{tCommon("status")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unitInvoices.slice(0, 12).map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell>
                                <Link
                                  href={`/buildings/${unit.building_id}/invoices/${invoice.id}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  {formatPeriodLabel(
                                    invoice.billing_period_start,
                                    invoice.billing_period_end,
                                    locale
                                  )}
                                </Link>
                              </TableCell>
                              <TableCell>{invoice.total_amount.toFixed(2)}</TableCell>
                              <TableCell>
                                {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusBadgeClasses[invoice.status] ?? ""}>
                                  {tInvoices(statusLabelKeys[invoice.status] ?? "statusIssued")}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                    {tPayments("title")}
                  </h2>
                  {unitPayments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tPayments("noPayments")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{tPayments("paidAtLabel")}</TableHead>
                            <TableHead>{tPayments("amountLabel")}</TableHead>
                            <TableHead>{tPayments("methodLabel")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unitPayments.slice(0, 12).map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{formatDate(payment.paid_at)}</TableCell>
                              <TableCell>{payment.amount.toFixed(2)}</TableCell>
                              <TableCell>{payment.method ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>

                {unitMeters.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                      {tMeterReadings("title")}
                    </h2>
                    <ul className="flex flex-col gap-1 text-sm">
                      {unitMeters.map((meter) => {
                        const key = `${meter.type}::${meter.meterId}`;
                        const last = lastReadingByKey[key];
                        return (
                          <li key={key} className="flex justify-between gap-4">
                            <span>
                              {meter.type}
                              {meter.meterId ? ` (${meter.meterId})` : ""}
                            </span>
                            <span className="text-muted-foreground">
                              {last
                                ? t("lastReading", { value: last.value, date: last.date })
                                : t("noReadingYet")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
