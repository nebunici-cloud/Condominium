"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isDevLoginEnabled } from "@/lib/dev-login";

// Dev-only shortcut: signs straight into a synthetic per-role test
// account (dev-<roleCode>@test.local), creating it the first time,
// bypassing the email round-trip entirely by generating the sign-in
// link directly via the admin API instead of sending it. Gated by
// isDevLoginEnabled() here (not just in the page that hides the
// panel) because a server action is an endpoint anyone can call.
export async function devLoginAsRole(roleCode: string, locale: string, origin: string) {
  if (!isDevLoginEnabled()) {
    return { error: "Dev login is not enabled.", url: null };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Dev login is not enabled.", url: null };
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!tenant) {
    return { error: "No tenant found.", url: null };
  }

  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("code", roleCode)
    .maybeSingle();
  if (!role) {
    return { error: "Role not found for this tenant.", url: null };
  }

  const email = `dev-${roleCode}@test.local`;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  let userId = existingProfile?.id;

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return { error: createError?.message ?? "Failed to create dev user.", url: null };
    }
    userId = created.user.id;
    await admin.from("profiles").update({ full_name: `Dev: ${roleCode}` }).eq("id", userId);
  }

  const { data: existingMembership } = await admin
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existingMembership) {
    await admin.from("tenant_users").insert({ tenant_id: tenant.id, user_id: userId });
  }

  const { data: existingRole } = await admin
    .from("user_roles")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .maybeSingle();
  if (!existingRole) {
    await admin
      .from("user_roles")
      .insert({ tenant_id: tenant.id, user_id: userId, role_id: role.id });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/${locale}/auth/callback-token` },
  });

  if (linkError || !linkData) {
    return { error: linkError?.message ?? "Failed to generate link.", url: null };
  }

  return { error: null, url: linkData.properties.action_link };
}
