"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Marks a self-submitted reading as reviewed. Authorization is the
// meter_readings_update RLS policy (finance.meter_reading.record).
export async function reviewMeterReading(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("meter_readings")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// Removes a bad self-submitted reading. Authorization is the
// meter_readings_delete RLS policy (finance.meter_reading.record).
export async function deleteMeterReading(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();

  const { error } = await supabase.from("meter_readings").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
