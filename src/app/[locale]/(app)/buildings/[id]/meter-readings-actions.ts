"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

const readingSchema = z.object({
  unitId: z.string().uuid(),
  meterId: z.string().trim().optional(),
  readingValue: z.number().nonnegative(),
});

const bulkSchema = z.object({
  tenantId: z.string().uuid(),
  meterType: z.string().trim().min(1),
  readingDate: z.iso.date(),
  readings: z.array(readingSchema).min(1),
});

// Same insert every per-unit RecordMeterReadingDialog call already
// does, just batched into one round trip -- RLS (meter_readings_insert)
// authorizes each row exactly as it would one at a time, so a caller
// can't record a reading for a unit outside their own association by
// building the array themselves.
export async function recordMeterReadings(input: z.infer<typeof bulkSchema>) {
  const parsed = bulkSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("meter_readings").insert(
    parsed.readings.map((r) => ({
      tenant_id: parsed.tenantId,
      unit_id: r.unitId,
      meter_type: normalizeMeterType(parsed.meterType),
      meter_id: r.meterId || null,
      reading_value: r.readingValue,
      reading_date: parsed.readingDate,
      created_by: user?.id ?? null,
    }))
  );

  if (error) {
    return { error: error.message, recorded: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, recorded: parsed.readings.length };
}
