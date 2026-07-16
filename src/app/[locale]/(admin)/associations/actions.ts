"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const associationSchema = z.object({
  name: z.string().trim().min(1),
  legalId: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export async function createAssociation(input: z.infer<typeof associationSchema>) {
  const parsed = associationSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return { error: "No tenant" };
  }

  const { error } = await supabase.from("associations").insert({
    tenant_id: membership.tenant_id,
    name: parsed.name,
    legal_id: parsed.legalId || null,
    address: parsed.address || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const updateAssociationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  legalId: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export async function updateAssociation(input: z.infer<typeof updateAssociationSchema>) {
  const parsed = updateAssociationSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("associations")
    .update({
      name: parsed.name,
      legal_id: parsed.legalId || null,
      address: parsed.address || null,
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
