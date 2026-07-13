import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getUserCapabilities(
  supabase: SupabaseServerClient,
  tenantId: string,
  userId: string
): Promise<string[]> {
  const { data: userRoleRows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  const roleIds = (userRoleRows ?? []).map((row) => row.role_id);
  if (roleIds.length === 0) return [];

  const { data: capabilityRows } = await supabase
    .from("role_capabilities")
    .select("capability_code")
    .in("role_id", roleIds);

  return Array.from(new Set((capabilityRows ?? []).map((row) => row.capability_code)));
}

// Convenience wrapper for pages that just need "what can the signed-in
// user do here" without repeating the auth/tenant lookup boilerplate.
// Every (app) route already runs inside a layout that guarantees a
// signed-in, tenant-bound user, so a null return here would indicate a
// bug rather than a normal state to design around.
export async function getCurrentCapabilities(
  supabase: SupabaseServerClient
): Promise<{ userId: string; tenantId: string; capabilities: string[] } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const capabilities = await getUserCapabilities(supabase, membership.tenant_id, user.id);
  return { userId: user.id, tenantId: membership.tenant_id, capabilities };
}
