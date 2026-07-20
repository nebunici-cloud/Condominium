"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { inviteEmail, sendEmail } from "@/lib/email";

// Invite one owner to the platform (with the standard "owner" role).
// Works from the unit page and the directory alike. Re-inviting
// replaces a stale pending invite. Authorization is the tenant_invites
// insert RLS (core.user.invite); when the owner first signs in with
// this email, accept_pending_invite() links their owner record and the
// resident portal lights up.
export async function inviteOwner(ownerId: string) {
  z.string().uuid().parse(ownerId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: owner } = await supabase
    .from("owners")
    .select("id, tenant_id, email, user_id")
    .eq("id", ownerId)
    .maybeSingle();
  if (!owner) {
    return { error: "Owner not found" };
  }
  if (owner.user_id) {
    return { error: "already_linked" };
  }
  if (!owner.email || !owner.email.trim()) {
    return { error: "no_email" };
  }
  const email = owner.email.trim().toLowerCase();

  const { data: ownerRole } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", owner.tenant_id)
    .eq("code", "owner")
    .maybeSingle();
  if (!ownerRole) {
    return { error: "Owner role not found" };
  }

  await supabase
    .from("tenant_invites")
    .delete()
    .eq("tenant_id", owner.tenant_id)
    .eq("email", email)
    .is("accepted_at", null);

  const { error } = await supabase.from("tenant_invites").insert({
    tenant_id: owner.tenant_id,
    email,
    role_id: ownerRole.id,
    invited_by: user.id,
  });
  if (error) {
    return { error: error.message };
  }

  // Best-effort notification; a no-op until email is configured -- the
  // invite itself works the moment the row exists.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", owner.tenant_id)
    .maybeSingle();
  await sendEmail({ to: email, ...inviteEmail(tenant?.name ?? "Condominium") });

  revalidatePath("/", "layout");
  return { error: null };
}

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
