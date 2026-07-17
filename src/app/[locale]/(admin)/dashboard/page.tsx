import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { computeOutstandingBalance } from "@/lib/balance";
import { startOfMonth, endOfMonth } from "@/lib/period";
import { Link } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Staff landing: at-a-glance operational health across every unit the
// signed-in user can see (RLS scopes the reads, so a board member with
// finance visibility for one association sees only that slice). Every
// figure is derived from the same primitives the unit and invoice
// pages use, so numbers reconcile with the detail views.
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [{ data: units }, { data: openingBalances }, { data: invoices }, { data: payments }, { count: pendingReviews }] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, unit_number, building_id, buildings(name, association_id, associations(name))"),
      supabase.from("opening_balances").select("unit_id, amount"),
      supabase
        .from("invoices")
        .select("unit_id, total_amount, status, issued_at")
        .neq("status", "cancelled"),
      supabase.from("payments").select("unit_id, amount, paid_at"),
      supabase
        .from("meter_readings")
        .select("id", { count: "exact", head: true })
        .eq("self_submitted", true)
        .is("reviewed_at", null),
    ]);

  const { count: openRequests } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);

  const openingByUnit = new Map((openingBalances ?? []).map((b) => [b.unit_id, b.amount]));

  // Outstanding excludes drafts (nothing owed on an unpublished bill);
  // collection-this-month uses only published (issued_at) invoices.
  const invoicedByUnit = new Map<string, number>();
  let draftCount = 0;
  let invoicedThisMonth = 0;
  for (const inv of invoices ?? []) {
    if (inv.status === "draft") {
      draftCount += 1;
      continue;
    }
    invoicedByUnit.set(inv.unit_id, (invoicedByUnit.get(inv.unit_id) ?? 0) + inv.total_amount);
    if (inv.issued_at && inv.issued_at.slice(0, 10) >= monthStart && inv.issued_at.slice(0, 10) <= monthEnd) {
      invoicedThisMonth += inv.total_amount;
    }
  }

  const paidByUnit = new Map<string, number>();
  let collectedThisMonth = 0;
  for (const p of payments ?? []) {
    paidByUnit.set(p.unit_id, (paidByUnit.get(p.unit_id) ?? 0) + p.amount);
    if (p.paid_at >= monthStart && p.paid_at <= monthEnd) {
      collectedThisMonth += p.amount;
    }
  }

  const unitBalances = (units ?? []).map((unit) => {
    const outstanding = computeOutstandingBalance({
      openingBalance: openingByUnit.get(unit.id) ?? 0,
      invoiceTotal: invoicedByUnit.get(unit.id) ?? 0,
      paymentTotal: paidByUnit.get(unit.id) ?? 0,
    });
    return {
      unitId: unit.id,
      unitNumber: unit.unit_number,
      buildingName: unit.buildings?.name ?? "",
      associationName: unit.buildings?.associations?.name ?? "",
      outstanding,
    };
  });

  const totalOutstanding = unitBalances
    .filter((u) => u.outstanding > 0)
    .reduce((sum, u) => sum + u.outstanding, 0);

  const topDebtors = unitBalances
    .filter((u) => u.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 8);

  const collectionRate =
    invoicedThisMonth > 0
      ? Math.min(100, Math.round((collectedThisMonth / invoicedThisMonth) * 100))
      : null;

  const round2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

  const tiles = [
    { label: t("outstandingDebt"), value: `${round2(totalOutstanding)} lei` },
    {
      label: t("collectionRate"),
      value: collectionRate === null ? "—" : `${collectionRate}%`,
      hint: t("collectionRateHint", {
        collected: round2(collectedThisMonth),
        invoiced: round2(invoicedThisMonth),
      }),
    },
    { label: t("draftsPending"), value: String(draftCount) },
    { label: t("readingsPending"), value: String(pendingReviews ?? 0) },
    { label: t("openRequests"), value: String(openRequests ?? 0) },
  ];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{tile.value}</p>
              {tile.hint && <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">{t("topDebtors")}</h2>
        {topDebtors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDebtors")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("unitColumn")}</TableHead>
                  <TableHead>{t("buildingColumn")}</TableHead>
                  <TableHead className="text-right">{t("outstandingColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDebtors.map((debtor) => (
                  <TableRow key={debtor.unitId}>
                    <TableCell>
                      <Link
                        href={`/units/${debtor.unitId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {debtor.unitNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[debtor.associationName, debtor.buildingName].filter(Boolean).join(" · ")}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      {round2(debtor.outstanding)} lei
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
