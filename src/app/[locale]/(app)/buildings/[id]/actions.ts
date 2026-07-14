"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

const meterSchema = z.object({
  type: z.string().trim().min(1),
  meterId: z.string().trim().min(1),
});

const unitSchema = z.object({
  buildingId: z.string().uuid(),
  tenantId: z.string().uuid(),
  unitNumber: z.string().trim().min(1),
  floor: z.union([z.number(), z.nan()]).optional(),
  areaSqm: z.union([z.number(), z.nan()]).optional(),
  ownershipSharePercent: z.union([z.number(), z.nan()]).optional(),
  residentCount: z.union([z.number(), z.nan()]).optional(),
  meters: z.array(meterSchema).default([]),
});

export async function createUnit(input: z.infer<typeof unitSchema>) {
  const parsed = unitSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.from("units").insert({
    tenant_id: parsed.tenantId,
    building_id: parsed.buildingId,
    unit_number: parsed.unitNumber,
    floor: Number.isFinite(parsed.floor) ? parsed.floor : null,
    area_sqm: Number.isFinite(parsed.areaSqm) ? parsed.areaSqm : null,
    ownership_share_percent: Number.isFinite(parsed.ownershipSharePercent)
      ? parsed.ownershipSharePercent
      : null,
    resident_count: Number.isFinite(parsed.residentCount) ? parsed.residentCount : null,
    meters: parsed.meters.map((m) => ({ type: normalizeMeterType(m.type), meter_id: m.meterId })),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const updateUnitSchema = z.object({
  id: z.string().uuid(),
  unitNumber: z.string().trim().min(1),
  floor: z.union([z.number(), z.nan()]).optional(),
  areaSqm: z.union([z.number(), z.nan()]).optional(),
  ownershipSharePercent: z.union([z.number(), z.nan()]).optional(),
  residentCount: z.union([z.number(), z.nan()]).optional(),
  meters: z.array(meterSchema).default([]),
});

export async function updateUnit(input: z.infer<typeof updateUnitSchema>) {
  const parsed = updateUnitSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("units")
    .update({
      unit_number: parsed.unitNumber,
      floor: Number.isFinite(parsed.floor) ? parsed.floor : null,
      area_sqm: Number.isFinite(parsed.areaSqm) ? parsed.areaSqm : null,
      ownership_share_percent: Number.isFinite(parsed.ownershipSharePercent)
        ? parsed.ownershipSharePercent
        : null,
      resident_count: Number.isFinite(parsed.residentCount) ? parsed.residentCount : null,
      meters: parsed.meters.map((m) => ({ type: normalizeMeterType(m.type), meter_id: m.meterId })),
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
