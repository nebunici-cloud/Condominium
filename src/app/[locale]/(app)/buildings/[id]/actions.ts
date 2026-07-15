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
  paymentAccountCode: z.string().trim().optional(),
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
    // A blank field means "start in auto mode, follow Locatari" --
    // resident_count stays null until the first occupancy change (or
    // a manual edit) sets it, same as any other unit.
    resident_count: Number.isFinite(parsed.residentCount) ? parsed.residentCount : null,
    resident_count_is_manual: Number.isFinite(parsed.residentCount),
    payment_account_code: parsed.paymentAccountCode || null,
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
  paymentAccountCode: z.string().trim().optional(),
  meters: z.array(meterSchema).default([]),
});

export async function updateUnit(input: z.infer<typeof updateUnitSchema>) {
  const parsed = updateUnitSchema.parse(input);
  const supabase = await createClient();

  // Typing a number locks resident_count as a manual override.
  // Clearing the field switches the unit back to auto -- and, unlike
  // the trigger that keeps auto units in sync as occupancies change,
  // this needs an explicit recompute so the number is right away
  // rather than stale until the next occupancy event.
  const residentCountIsManual = Number.isFinite(parsed.residentCount);

  const { error } = await supabase
    .from("units")
    .update({
      unit_number: parsed.unitNumber,
      floor: Number.isFinite(parsed.floor) ? parsed.floor : null,
      area_sqm: Number.isFinite(parsed.areaSqm) ? parsed.areaSqm : null,
      ownership_share_percent: Number.isFinite(parsed.ownershipSharePercent)
        ? parsed.ownershipSharePercent
        : null,
      ...(residentCountIsManual
        ? { resident_count: parsed.residentCount, resident_count_is_manual: true }
        : { resident_count_is_manual: false }),
      payment_account_code: parsed.paymentAccountCode || null,
      meters: parsed.meters.map((m) => ({ type: normalizeMeterType(m.type), meter_id: m.meterId })),
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  if (!residentCountIsManual) {
    await supabase.rpc("recompute_unit_resident_count", { p_unit_id: parsed.id });
  }

  revalidatePath("/", "layout");
  return { error: null };
}
