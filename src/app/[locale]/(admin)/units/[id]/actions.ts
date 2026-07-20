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

const ownerAndOwnershipSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fullName: z.string().trim().min(1),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  sharePercent: z.number().min(0.001).max(100),
});

export async function createOwnerAndOwnership(
  input: z.infer<typeof ownerAndOwnershipSchema>
) {
  const parsed = ownerAndOwnershipSchema.parse(input);
  const supabase = await createClient();

  const { data: owner, error: ownerError } = await supabase
    .from("owners")
    .insert({
      tenant_id: parsed.tenantId,
      full_name: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
    })
    .select("id")
    .single();

  if (ownerError || !owner) {
    return { error: ownerError?.message ?? "Failed to create owner" };
  }

  const { error: ownershipError } = await supabase.from("ownerships").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    owner_id: owner.id,
    share_percent: parsed.sharePercent,
  });

  if (ownershipError) {
    return { error: ownershipError.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const updateShareSchema = z.object({
  ownershipId: z.string().uuid(),
  sharePercent: z.number().min(0.001).max(100),
});

// Correct a current ownership's share in place -- e.g. after a buy-out
// the remaining owner goes from 50% to 100%. Authorization is the
// ownerships update RLS (core.ownership.update). Real transfers still
// use end + add, keeping the effective-dated history honest.
export async function updateOwnershipShare(input: z.infer<typeof updateShareSchema>) {
  const parsed = updateShareSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("ownerships")
    .update({ share_percent: parsed.sharePercent })
    .eq("id", parsed.ownershipId);

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

const ownerAsOccupantSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
});

export async function addOwnerAsOccupant(input: z.infer<typeof ownerAsOccupantSchema>) {
  const parsed = ownerAsOccupantSchema.parse(input);
  const supabase = await createClient();

  // Reuse the occupant record already linked to this owner, if one
  // exists, so clicking the button again doesn't create a duplicate
  // person every time.
  const { data: existingOccupant } = await supabase
    .from("occupants")
    .select("id")
    .eq("owner_id", parsed.ownerId)
    .maybeSingle();

  let occupantId = existingOccupant?.id;

  if (!occupantId) {
    const { data: owner, error: ownerError } = await supabase
      .from("owners")
      .select("full_name, email, phone")
      .eq("id", parsed.ownerId)
      .single();

    if (ownerError || !owner) {
      return { error: ownerError?.message ?? "Owner not found" };
    }

    const { data: occupant, error: occupantError } = await supabase
      .from("occupants")
      .insert({
        tenant_id: parsed.tenantId,
        owner_id: parsed.ownerId,
        full_name: owner.full_name,
        email: owner.email,
        phone: owner.phone,
      })
      .select("id")
      .single();

    if (occupantError || !occupant) {
      return { error: occupantError?.message ?? "Failed to create occupant" };
    }

    occupantId = occupant.id;
  }

  const { error: occupancyError } = await supabase.from("occupancies").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    occupant_id: occupantId,
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
