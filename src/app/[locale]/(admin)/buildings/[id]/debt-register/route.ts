import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { computeOutstandingBalance } from "@/lib/balance";

// Debt register per building: one row per unit with opening balance,
// total invoiced (non-cancelled, non-draft), total paid, and the
// resulting outstanding balance -- the report accountants reach for
// first. Reads go through the normal client, so RLS still applies:
// only someone who can see this building's finance data can export it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "debtRegister" });
  const tUnits = await getTranslations({ locale, namespace: "units" });
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, name, association_id")
    .eq("id", id)
    .maybeSingle();
  if (!building) {
    return new Response("Not found", { status: 404 });
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, payment_account_code")
    .eq("building_id", id)
    .order("unit_number", { ascending: true });
  const unitIds = (units ?? []).map((u) => u.id);

  const [{ data: ownerships }, { data: openingBalances }, { data: invoices }, { data: payments }] =
    await Promise.all([
      unitIds.length
        ? supabase
            .from("ownerships")
            .select("unit_id, owners(full_name)")
            .in("unit_id", unitIds)
            .is("effective_to", null)
        : Promise.resolve({ data: [] as { unit_id: string; owners: { full_name: string } | null }[] }),
      unitIds.length
        ? supabase.from("opening_balances").select("unit_id, amount").in("unit_id", unitIds)
        : Promise.resolve({ data: [] as { unit_id: string; amount: number }[] }),
      unitIds.length
        ? supabase
            .from("invoices")
            .select("unit_id, total_amount, status")
            .in("unit_id", unitIds)
            .neq("status", "cancelled")
            .neq("status", "draft")
        : Promise.resolve({ data: [] as { unit_id: string; total_amount: number; status: string }[] }),
      unitIds.length
        ? supabase.from("payments").select("unit_id, amount").in("unit_id", unitIds)
        : Promise.resolve({ data: [] as { unit_id: string; amount: number }[] }),
    ]);

  const ownersByUnit = new Map<string, string[]>();
  for (const row of ownerships ?? []) {
    const name = row.owners?.full_name;
    if (!name) continue;
    const list = ownersByUnit.get(row.unit_id) ?? [];
    list.push(name);
    ownersByUnit.set(row.unit_id, list);
  }
  const openingByUnit = new Map((openingBalances ?? []).map((b) => [b.unit_id, b.amount]));
  const invoicedByUnit = new Map<string, number>();
  for (const inv of invoices ?? []) {
    invoicedByUnit.set(inv.unit_id, (invoicedByUnit.get(inv.unit_id) ?? 0) + inv.total_amount);
  }
  const paidByUnit = new Map<string, number>();
  for (const p of payments ?? []) {
    paidByUnit.set(p.unit_id, (paidByUnit.get(p.unit_id) ?? 0) + p.amount);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("sheetName"));
  sheet.columns = [
    { header: tUnits("unitNumberLabel"), key: "unit_number", width: 12 },
    { header: t("accountCodeColumn"), key: "account_code", width: 16 },
    { header: t("ownersColumn"), key: "owners", width: 30 },
    { header: t("openingColumn"), key: "opening", width: 14 },
    { header: t("invoicedColumn"), key: "invoiced", width: 14 },
    { header: t("paidColumn"), key: "paid", width: 14 },
    { header: t("outstandingColumn"), key: "outstanding", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  let totalOpening = 0;
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  for (const unit of units ?? []) {
    const opening = openingByUnit.get(unit.id) ?? 0;
    const invoiced = invoicedByUnit.get(unit.id) ?? 0;
    const paid = paidByUnit.get(unit.id) ?? 0;
    const outstanding = computeOutstandingBalance({
      openingBalance: opening,
      invoiceTotal: invoiced,
      paymentTotal: paid,
    });
    totalOpening += opening;
    totalInvoiced += invoiced;
    totalPaid += paid;
    totalOutstanding += outstanding;

    sheet.addRow({
      unit_number: unit.unit_number,
      account_code: unit.payment_account_code ?? "",
      owners: (ownersByUnit.get(unit.id) ?? []).join(", "),
      opening,
      invoiced,
      paid,
      outstanding,
    });
  }

  const totalRow = sheet.addRow({
    unit_number: t("totalRow"),
    account_code: "",
    owners: "",
    opening: Math.round(totalOpening * 100) / 100,
    invoiced: Math.round(totalInvoiced * 100) / 100,
    paid: Math.round(totalPaid * 100) / 100,
    outstanding: Math.round(totalOutstanding * 100) / 100,
  });
  totalRow.font = { bold: true };

  for (const col of ["opening", "invoiced", "paid", "outstanding"]) {
    sheet.getColumn(col).numFmt = "#,##0.00";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `debt-register-${building.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
