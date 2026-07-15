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

  // Same idea as an association's code -- assigned once, feeds every
  // unit's Cod Personal in this building.
  const { data: code } = await supabase.rpc("generate_building_code", {
    p_association_id: parsed.associationId,
  });

  const { error } = await supabase.from("buildings").insert({
    tenant_id: parsed.tenantId,
    association_id: parsed.associationId,
    name: parsed.name,
    address: parsed.address || null,
    code: code ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const updateBuildingSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  address: z.string().trim().optional(),
});

export async function updateBuilding(input: z.infer<typeof updateBuildingSchema>) {
  const parsed = updateBuildingSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("buildings")
    .update({
      name: parsed.name,
      address: parsed.address || null,
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
