"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ParsedPaymentRow = {
  rowNumber: number;
  unitNumber: string;
  amount: number | null;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
  errors: (
    | "missing_unit_number"
    | "unit_not_found"
    | "missing_amount"
    | "missing_date"
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

export async function parsePaymentsImport(buildingId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided", rows: [] as ParsedPaymentRow[] };
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
    return { error: "Empty workbook", rows: [] as ParsedPaymentRow[] };
  }

  const rows: ParsedPaymentRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const unitNumberRaw = row.getCell(1).value;
    const unitNumber = unitNumberRaw ? String(unitNumberRaw).trim() : "";
    const amountCell = row.getCell(2).value;
    const dateParsed = parseDateCell(row.getCell(3).value);
    const methodRaw = row.getCell(4).value;
    const method = methodRaw ? String(methodRaw).trim() : "";
    const referenceRaw = row.getCell(5).value;
    const reference = referenceRaw ? String(referenceRaw).trim() : "";

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

    const errors: ParsedPaymentRow["errors"] = [];
    if (!unitNumber) errors.push("missing_unit_number");
    else if (!unitByNumber.has(unitNumber.toLowerCase())) errors.push("unit_not_found");
    if (amountCell === null || amountCell === undefined || amountCell === "") {
      errors.push("missing_amount");
    } else if (amountInvalid) {
      errors.push("invalid_number");
    }
    if (dateParsed.invalid) errors.push("invalid_date");
    else if (!dateParsed.value) errors.push("missing_date");

    rows.push({
      rowNumber,
      unitNumber,
      amount: amountInvalid ? null : amountNum,
      paidAt: dateParsed.value,
      method: method || null,
      reference: reference || null,
      errors,
    });
  });

  return { error: null, rows };
}

export async function commitPaymentsImport(
  buildingId: string,
  tenantId: string,
  rows: ParsedPaymentRow[]
) {
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) {
    return { error: "No valid rows", imported: 0 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      if (!unitId || row.amount === null || !row.paidAt) return null;
      return {
        tenant_id: tenantId,
        unit_id: unitId,
        amount: row.amount,
        paid_at: row.paidAt,
        method: row.method,
        reference: row.reference,
        created_by: user?.id ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const { error } = await supabase.from("payments").insert(payload);

  if (error) {
    return { error: error.message, imported: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, imported: payload.length };
}
