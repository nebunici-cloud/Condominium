"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const entrySchema = z.object({
  tenantId: z.string().uuid(),
  associationId: z.string().uuid(),
  category: z.string().trim().min(1),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export async function createConfigEntry(input: z.infer<typeof entrySchema>) {
  const parsed = entrySchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.from("config_registry").insert({
    tenant_id: parsed.tenantId,
    association_id: parsed.associationId,
    category: parsed.category,
    key: parsed.key,
    label: parsed.label,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function toggleConfigEntryActive(id: string, isActive: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("config_registry")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
