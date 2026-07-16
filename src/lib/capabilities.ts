import { z } from "zod";

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const uuidSchema = z.string().uuid();

// What separates back-office (admin module) users from residents. The
// owner/tenant role bundles carry only view capabilities for the
// entity graph (association/building/unit/ownership view), none of
// which appear here -- so holding ANY of these marks the user as
// staff and unlocks the admin module. RLS remains the real security
// boundary; this drives module routing and shell UX.
const STAFF_CAPABILITIES = [
  "core.owner.view",
  "core.occupant.view",
  "core.audit.view",
  "core.role.manage",
  "core.tenant.manage",
  "core.config.manage",
  "core.user.invite",
  "core.unit.create",
  "core.building.create",
  "finance.fee_type.view",
  "finance.invoice.view",
  "finance.invoice.generate",
  "finance.invoice.publish",
  "finance.invoice.cancel",
  "finance.payment.view",
  "finance.payment.record",
  "finance.meter_reading.record",
  "finance.opening_balance.import",
  "comms.announcement.manage",
];

export function isStaff(capabilities: string[]): boolean {
  return STAFF_CAPABILITIES.some((capability) => capabilities.includes(capability));
}

// Capability grants are tenant-wide (role_capabilities.association_id
// is null) for org-level concerns, or scoped to one association for
// everything tied to an association-owned resource (buildings, units,
// finance, etc.) -- see the per-association-role-capabilities
// migration. Passing associationId restricts the result to "what can
// this user do IN THIS association" (tenant-wide grants always count,
// association-scoped grants only count for a matching association).
// Omitting it returns the union across every association the user has
// any grant in, which is what nav-level "should this link show at
// all" checks want.
export async function getUserCapabilities(
  supabase: SupabaseServerClient,
  tenantId: string,
  userId: string,
  associationId?: string
): Promise<string[]> {
  const { data: userRoleRows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  const roleIds = (userRoleRows ?? []).map((row) => row.role_id);
  if (roleIds.length === 0) return [];

  let query = supabase.from("role_capabilities").select("capability_code").in("role_id", roleIds);
  if (associationId) {
    // associationId is interpolated into a PostgREST filter string, so
    // it must be a real UUID -- callers pass route params here, and a
    // crafted value could otherwise inject extra filter clauses into
    // this authorization query.
    uuidSchema.parse(associationId);
    query = query.or(`association_id.is.null,association_id.eq.${associationId}`);
  }
  const { data: capabilityRows } = await query;

  return Array.from(new Set((capabilityRows ?? []).map((row) => row.capability_code)));
}

// Convenience wrapper for pages that just need "what can the signed-in
// user do here" without repeating the auth/tenant lookup boilerplate.
// Every (app) route already runs inside a layout that guarantees a
// signed-in, tenant-bound user, so a null return here would indicate a
// bug rather than a normal state to design around.
export async function getCurrentCapabilities(
  supabase: SupabaseServerClient,
  associationId?: string
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

  const capabilities = await getUserCapabilities(
    supabase,
    membership.tenant_id,
    user.id,
    associationId
  );
  return { userId: user.id, tenantId: membership.tenant_id, capabilities };
}
