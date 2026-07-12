"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const buildingSchema = z.object({
  associationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1),
  address: z.string().trim().optional(),
});

export async function createBuilding(input: z.infer<typeof buildingSchema>) {
  const parsed = buildingSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.from("buildings").insert({
    tenant_id: parsed.tenantId,
    association_id: parsed.associationId,
    name: parsed.name,
    address: parsed.address || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
