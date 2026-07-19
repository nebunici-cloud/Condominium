"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { inviteEmail, sendEmail } from "@/lib/email";

const inviteUserSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().email(),
  roleId: z.string().uuid(),
});

export async function inviteUser(input: z.infer<typeof inviteUserSchema>) {
  const parsed = inviteUserSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const email = parsed.email.toLowerCase();

  // Re-inviting the same address replaces any existing pending invite
  // (e.g. to change the assigned role) rather than erroring on the
  // unique (tenant_id, email) pending-invite index.
  await supabase
    .from("tenant_invites")
    .delete()
    .eq("tenant_id", parsed.tenantId)
    .eq("email", email)
    .is("accepted_at", null);

  const { error } = await supabase.from("tenant_invites").insert({
    tenant_id: parsed.tenantId,
    email,
    role_id: parsed.roleId,
    invited_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  // Best-effort notification; the invite itself already works the
  // moment this row exists (accepted on the invitee's first sign-in).
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", parsed.tenantId)
    .maybeSingle();
  await sendEmail({ to: email, ...inviteEmail(tenant?.name ?? "Condominium") });

  revalidatePath("/", "layout");
  return { error: null };
}

const memberRoleSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

// Grant/withdraw a role for an existing member. Authorization is the
// user_roles insert/delete RLS (core.role.manage). A member can hold
// several roles at once (e.g. accountant + owner) -- user_roles is a
// plain join table.
export async function setMemberRole(input: z.infer<typeof memberRoleSchema> & { grant: boolean }) {
  const parsed = memberRoleSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  if (input.grant) {
    // Tenant-wide grant (association_id null). NULLs are distinct in
    // the unique constraint, so check-then-insert instead of upsert.
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("tenant_id", parsed.tenantId)
      .eq("user_id", parsed.userId)
      .eq("role_id", parsed.roleId)
      .is("association_id", null)
      .limit(1);
    if ((existing ?? []).length === 0) {
      const { error } = await supabase.from("user_roles").insert({
        tenant_id: parsed.tenantId,
        user_id: parsed.userId,
        role_id: parsed.roleId,
      });
      if (error) return { error: error.message };
    }
  } else {
    // Lockout guard: you may not withdraw from *yourself* a role that
    // grants role management anywhere -- otherwise one click could
    // leave the tenant with nobody able to edit roles.
    if (parsed.userId === user.id) {
      const { data: managerGrant } = await supabase
        .from("role_capabilities")
        .select("role_id")
        .eq("role_id", parsed.roleId)
        .eq("capability_code", "core.role.manage")
        .limit(1);
      if ((managerGrant ?? []).length > 0) {
        // Sentinel the client maps to a translated message.
        return { error: "self_manager_role" };
      }
    }

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("tenant_id", parsed.tenantId)
      .eq("user_id", parsed.userId)
      .eq("role_id", parsed.roleId);
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function revokeInvite(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("tenant_invites").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
