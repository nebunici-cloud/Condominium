"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
});

export async function updateTenant(input: z.infer<typeof updateTenantSchema>) {
  const parsed = updateTenantSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tenants")
    .update({ name: parsed.name })
    .eq("id", parsed.id)
    .select()
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Not authorized" };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
