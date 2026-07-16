"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

const submitReadingSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  meterType: z.string().trim().min(1),
  meterId: z.string().trim().optional(),
  readingValue: z.number().nonnegative(),
  readingDate: z.iso.date(),
});

// Resident self-service counterpart of recordMeterReading. Authority
// lives in RLS (meter_readings_insert_self: the unit must be one the
// caller currently owns or occupies), so this stays a thin insert --
// self_submitted marks the row for admin review.
export async function submitMyMeterReading(input: z.infer<typeof submitReadingSchema>) {
  const parsed = submitReadingSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("meter_readings").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    meter_type: normalizeMeterType(parsed.meterType),
    meter_id: parsed.meterId || null,
    reading_value: parsed.readingValue,
    reading_date: parsed.readingDate,
    self_submitted: true,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
