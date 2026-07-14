"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

const recordMeterReadingSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  meterType: z.string().trim().min(1),
  meterId: z.string().trim().optional(),
  readingValue: z.number().nonnegative(),
  readingDate: z.string().trim().min(1),
});

export async function recordMeterReading(input: z.infer<typeof recordMeterReadingSchema>) {
  const parsed = recordMeterReadingSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("meter_readings").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    meter_type: normalizeMeterType(parsed.meterType),
    meter_id: parsed.meterId || null,
    reading_value: parsed.readingValue,
    reading_date: parsed.readingDate,
    created_by: user?.id ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
