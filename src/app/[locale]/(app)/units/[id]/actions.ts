"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const ownershipSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  sharePercent: z.number().min(0.001).max(100),
});

export async function createOwnership(input: z.infer<typeof ownershipSchema>) {
  const parsed = ownershipSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.from("ownerships").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    owner_id: parsed.ownerId,
    share_percent: parsed.sharePercent,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function endOwnership(ownershipId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ownerships")
    .update({ effective_to: new Date().toISOString().slice(0, 10) })
    .eq("id", ownershipId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const occupancySchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fullName: z.string().trim().min(1),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export async function createOccupancy(input: z.infer<typeof occupancySchema>) {
  const parsed = occupancySchema.parse(input);
  const supabase = await createClient();

  const { data: occupant, error: occupantError } = await supabase
    .from("occupants")
    .insert({
      tenant_id: parsed.tenantId,
      full_name: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
    })
    .select("id")
    .single();

  if (occupantError || !occupant) {
    return { error: occupantError?.message ?? "Failed to create occupant" };
  }

  const { error: occupancyError } = await supabase.from("occupancies").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    occupant_id: occupant.id,
  });

  if (occupancyError) {
    return { error: occupancyError.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function endOccupancy(occupancyId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("occupancies")
    .update({ effective_to: new Date().toISOString().slice(0, 10) })
    .eq("id", occupancyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
