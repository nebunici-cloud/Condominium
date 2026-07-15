"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

export type ParsedUnitRow = {
  rowNumber: number;
  unitNumber: string;
  floor: number | null;
  areaSqm: number | null;
  ownershipSharePercent: number | null;
  meters: { type: string; meterId: string }[];
  errors: ("missing_unit_number" | "duplicate_in_file" | "duplicate_in_building" | "invalid_number")[];
};

function parseNumericCell(value: ExcelJS.CellValue): { value: number | null; invalid: boolean } {
  if (value === null || value === undefined || value === "") {
    return { value: null, invalid: false };
  }
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (Number.isNaN(num)) {
    return { value: null, invalid: true };
  }
  return { value: num, invalid: false };
}

function parseMetersCell(value: ExcelJS.CellValue): { type: string; meterId: string }[] {
  if (!value) return [];
  const text = String(value);
  return text
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [type, meterId] = part.split(":").map((s) => s.trim());
      return { type: type ? normalizeMeterType(type) : "", meterId: meterId ?? "" };
    })
    .filter((m) => m.type && m.meterId);
}

export async function parseUnitsImport(buildingId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided", rows: [] as ParsedUnitRow[] };
  }

  const supabase = await createClient();
  const { data: existingUnits } = await supabase
    .from("units")
    .select("unit_number")
    .eq("building_id", buildingId);
  const existingUnitNumbers = new Set(
    (existingUnits ?? []).map((u) => u.unit_number.trim().toLowerCase())
  );

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return { error: "Empty workbook", rows: [] as ParsedUnitRow[] };
  }

  const rows: ParsedUnitRow[] = [];
  const seenInFile = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row

    const unitNumberRaw = row.getCell(1).value;
    const unitNumber = unitNumberRaw ? String(unitNumberRaw).trim() : "";
    if (
      !unitNumber &&
      !row.getCell(2).value &&
      !row.getCell(3).value &&
      !row.getCell(4).value &&
      !row.getCell(5).value
    ) {
      return; // fully blank row, skip silently
    }

    const floorParsed = parseNumericCell(row.getCell(2).value);
    const areaParsed = parseNumericCell(row.getCell(3).value);
    const shareParsed = parseNumericCell(row.getCell(4).value);
    const meters = parseMetersCell(row.getCell(5).value);

    const errors: ParsedUnitRow["errors"] = [];
    if (!unitNumber) errors.push("missing_unit_number");
    if (floorParsed.invalid || areaParsed.invalid || shareParsed.invalid) {
      errors.push("invalid_number");
    }

    const key = unitNumber.toLowerCase();
    if (unitNumber && seenInFile.has(key)) {
      errors.push("duplicate_in_file");
    }
    if (unitNumber && existingUnitNumbers.has(key)) {
      errors.push("duplicate_in_building");
    }
    if (unitNumber) seenInFile.add(key);

    rows.push({
      rowNumber,
      unitNumber,
      floor: floorParsed.value,
      areaSqm: areaParsed.value,
      ownershipSharePercent: shareParsed.value,
      meters,
      errors,
    });
  });

  return { error: null, rows };
}

export async function commitUnitsImport(
  buildingId: string,
  tenantId: string,
  rows: ParsedUnitRow[]
) {
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) {
    return { error: "No valid rows", imported: 0 };
  }

  const supabase = await createClient();

  // One reserved block from the shared per-tenant counter, not one
  // round trip per row -- see generate_unit_codes.
  const { data: accountCodes } = await supabase.rpc("generate_unit_codes", {
    p_tenant_id: tenantId,
    p_count: validRows.length,
  });

  const { error } = await supabase.from("units").insert(
    validRows.map((row, i) => ({
      tenant_id: tenantId,
      building_id: buildingId,
      unit_number: row.unitNumber,
      floor: row.floor,
      area_sqm: row.areaSqm,
      ownership_share_percent: row.ownershipSharePercent,
      payment_account_code: accountCodes?.[i] ?? null,
      meters: row.meters.map((m) => ({ type: m.type, meter_id: m.meterId })),
    }))
  );

  if (error) {
    return { error: error.message, imported: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, imported: validRows.length };
}
