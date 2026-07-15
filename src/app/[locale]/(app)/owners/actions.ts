"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const ownerSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  personalCode: z.string().trim().optional(),
});

export async function createOwner(input: z.infer<typeof ownerSchema>) {
  const parsed = ownerSchema.parse(input);
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return { error: "No tenant" };
  }

  const { error } = await supabase.from("owners").insert({
    tenant_id: membership.tenant_id,
    full_name: parsed.fullName,
    email: parsed.email || null,
    phone: parsed.phone || null,
    personal_code: parsed.personalCode || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const updateOwnerSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  personalCode: z.string().trim().optional(),
});

export async function updateOwner(input: z.infer<typeof updateOwnerSchema>) {
  const parsed = updateOwnerSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("owners")
    .update({
      full_name: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      personal_code: parsed.personalCode || null,
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
