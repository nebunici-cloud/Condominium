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
