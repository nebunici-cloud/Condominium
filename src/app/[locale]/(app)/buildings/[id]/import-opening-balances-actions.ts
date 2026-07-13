"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ParsedOpeningBalanceRow = {
  rowNumber: number;
  unitNumber: string;
  amount: number | null;
  asOfDate: string | null;
  note: string | null;
  errors: (
    | "missing_unit_number"
    | "unit_not_found"
    | "missing_amount"
    | "invalid_number"
    | "invalid_date"
  )[];
};

function parseDateCell(value: ExcelJS.CellValue): { value: string | null; invalid: boolean } {
  if (value === null || value === undefined || value === "") {
    return { value: null, invalid: false };
  }
  if (value instanceof Date) {
    return { value: value.toISOString().slice(0, 10), invalid: false };
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, invalid: true };
  }
  return { value: parsed.toISOString().slice(0, 10), invalid: false };
}

export async function parseOpeningBalancesImport(buildingId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided", rows: [] as ParsedOpeningBalanceRow[] };
  }

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("building_id", buildingId);
  const unitByNumber = new Map(
    (units ?? []).map((u) => [u.unit_number.trim().toLowerCase(), u.id])
  );

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { error: "Empty workbook", rows: [] as ParsedOpeningBalanceRow[] };
  }

  const rows: ParsedOpeningBalanceRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const unitNumberRaw = row.getCell(1).value;
    const unitNumber = unitNumberRaw ? String(unitNumberRaw).trim() : "";
    const amountCell = row.getCell(2).value;
    const dateParsed = parseDateCell(row.getCell(3).value);
    const noteRaw = row.getCell(4).value;
    const note = noteRaw ? String(noteRaw).trim() : "";

    if (!unitNumber && (amountCell === null || amountCell === undefined || amountCell === "")) {
      return; // fully blank row, skip silently
    }

    const amountNum =
      amountCell === null || amountCell === undefined || amountCell === ""
        ? null
        : typeof amountCell === "number"
          ? amountCell
          : Number(String(amountCell).replace(",", "."));
    const amountInvalid =
      amountCell !== null && amountCell !== undefined && amountCell !== "" && Number.isNaN(amountNum);

    const errors: ParsedOpeningBalanceRow["errors"] = [];
    if (!unitNumber) errors.push("missing_unit_number");
    else if (!unitByNumber.has(unitNumber.toLowerCase())) errors.push("unit_not_found");
    if (amountCell === null || amountCell === undefined || amountCell === "") {
      errors.push("missing_amount");
    } else if (amountInvalid) {
      errors.push("invalid_number");
    }
    if (dateParsed.invalid) errors.push("invalid_date");

    rows.push({
      rowNumber,
      unitNumber,
      amount: amountInvalid ? null : amountNum,
      asOfDate: dateParsed.value,
      note: note || null,
      errors,
    });
  });

  return { error: null, rows };
}

export async function commitOpeningBalancesImport(
  buildingId: string,
  tenantId: string,
  rows: ParsedOpeningBalanceRow[]
) {
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) {
    return { error: "No valid rows", imported: 0 };
  }

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("building_id", buildingId);
  const unitByNumber = new Map(
    (units ?? []).map((u) => [u.unit_number.trim().toLowerCase(), u.id])
  );

  const payload = validRows
    .map((row) => {
      const unitId = unitByNumber.get(row.unitNumber.toLowerCase());
      if (!unitId || row.amount === null) return null;
      return {
        tenant_id: tenantId,
        unit_id: unitId,
        amount: row.amount,
        as_of_date: row.asOfDate ?? new Date().toISOString().slice(0, 10),
        note: row.note,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const { error } = await supabase
    .from("opening_balances")
    .upsert(payload, { onConflict: "unit_id" });

  if (error) {
    return { error: error.message, imported: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, imported: payload.length };
}
