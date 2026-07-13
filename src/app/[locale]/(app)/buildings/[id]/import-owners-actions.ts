"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ParsedOwnerRow = {
  rowNumber: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  unitNumber: string;
  sharePercent: number | null;
  effectiveFrom: string | null;
  errors: (
    | "missing_full_name"
    | "missing_unit_number"
    | "unit_not_found"
    | "missing_share_percent"
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

export async function parseOwnersImport(buildingId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided", rows: [] as ParsedOwnerRow[] };
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
    return { error: "Empty workbook", rows: [] as ParsedOwnerRow[] };
  }

  const rows: ParsedOwnerRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const fullNameRaw = row.getCell(1).value;
    const fullName = fullNameRaw ? String(fullNameRaw).trim() : "";
    const emailRaw = row.getCell(2).value;
    const email = emailRaw ? String(emailRaw).trim() : "";
    const phoneRaw = row.getCell(3).value;
    const phone = phoneRaw ? String(phoneRaw).trim() : "";
    const unitNumberRaw = row.getCell(4).value;
    const unitNumber = unitNumberRaw ? String(unitNumberRaw).trim() : "";
    const shareCell = row.getCell(5).value;
    const dateParsed = parseDateCell(row.getCell(6).value);

    if (!fullName && !email && !unitNumber && !shareCell) {
      return; // fully blank row, skip silently
    }

    const shareNum =
      shareCell === null || shareCell === undefined || shareCell === ""
        ? null
        : typeof shareCell === "number"
          ? shareCell
          : Number(String(shareCell).replace(",", "."));
    const shareInvalid = shareCell !== null && shareCell !== undefined && shareCell !== "" && Number.isNaN(shareNum);

    const errors: ParsedOwnerRow["errors"] = [];
    if (!fullName) errors.push("missing_full_name");
    if (!unitNumber) errors.push("missing_unit_number");
    else if (!unitByNumber.has(unitNumber.toLowerCase())) errors.push("unit_not_found");
    if (shareCell === null || shareCell === undefined || shareCell === "") {
      errors.push("missing_share_percent");
    } else if (shareInvalid) {
      errors.push("invalid_number");
    }
    if (dateParsed.invalid) errors.push("invalid_date");

    rows.push({
      rowNumber,
      fullName,
      email: email || null,
      phone: phone || null,
      unitNumber,
      sharePercent: shareInvalid ? null : shareNum,
      effectiveFrom: dateParsed.value,
      errors,
    });
  });

  return { error: null, rows, unitByNumber: Object.fromEntries(unitByNumber) };
}

export async function commitOwnersImport(
  buildingId: string,
  tenantId: string,
  rows: ParsedOwnerRow[]
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

  const { data: existingOwners } = await supabase
    .from("owners")
    .select("id, full_name, email")
    .eq("tenant_id", tenantId);
  const ownerByKey = new Map(
    (existingOwners ?? []).map((o) => [
      `${o.full_name.trim().toLowerCase()}|${(o.email ?? "").trim().toLowerCase()}`,
      o.id,
    ])
  );

  let imported = 0;

  for (const row of validRows) {
    const unitId = unitByNumber.get(row.unitNumber.toLowerCase());
    if (!unitId) continue;

    const key = `${row.fullName.trim().toLowerCase()}|${(row.email ?? "").trim().toLowerCase()}`;
    let ownerId = ownerByKey.get(key);

    if (!ownerId) {
      const { data: newOwner, error: ownerError } = await supabase
        .from("owners")
        .insert({
          tenant_id: tenantId,
          full_name: row.fullName,
          email: row.email,
          phone: row.phone,
        })
        .select("id")
        .single();

      if (ownerError || !newOwner) continue;
      ownerId = newOwner.id;
      ownerByKey.set(key, ownerId);
    }

    const { error: ownershipError } = await supabase.from("ownerships").insert({
      tenant_id: tenantId,
      unit_id: unitId,
      owner_id: ownerId,
      share_percent: row.sharePercent,
      ...(row.effectiveFrom ? { effective_from: row.effectiveFrom } : {}),
    });

    if (!ownershipError) imported += 1;
  }

  revalidatePath("/", "layout");
  return { error: null, imported };
}
