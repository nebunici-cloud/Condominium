import { createClient } from "@/lib/supabase/server";
import { getUserCapabilities, isStaff } from "@/lib/capabilities";

// Everything both module shells (admin back-office and resident
// portal) need to render: who the user is, their tenant, what they
// can do, and which side(s) of the app belong to them. Shared so the
// two layouts can't drift apart on auth/onboarding behavior.
export type AppSession = {
  userId: string;
  email: string | null;
  tenantId: string;
  capabilities: string[];
  displayName: string;
  roles: { code: string; name: string }[];
  myUnitIds: string[];
  isStaff: boolean;
};

export type AppSessionResult =
  | { status: "unauthenticated" }
  | { status: "onboarding" }
  | { status: "ok"; session: AppSession };

export async function getAppSession(): Promise<AppSessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  let tenantId = membership?.tenant_id;

  if (!tenantId) {
    // First sign-in: a pending invite silently turns into membership
    // (and links owner/occupant records); otherwise the caller shows
    // the "name your organization" onboarding.
    const { data: acceptedTenantId } = await supabase.rpc("accept_pending_invite");
    if (acceptedTenantId) {
      tenantId = acceptedTenantId;
    } else {
      return { status: "onboarding" };
    }
  }

  const [capabilities, { data: profile }, { data: userRoleRows }, { data: myUnitIds }] =
    await Promise.all([
      getUserCapabilities(supabase, tenantId, user.id),
      supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_roles")
        .select("roles(code, name)")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id),
      supabase.rpc("user_unit_ids"),
    ]);

  const roles = (userRoleRows ?? [])
    .map((row) => row.roles)
    .filter((role): role is { code: string; name: string } => Boolean(role));

  return {
    status: "ok",
    session: {
      userId: user.id,
      email: user.email ?? null,
      tenantId,
      capabilities,
      displayName: profile?.full_name || profile?.email || user.email || "",
      roles,
      myUnitIds: myUnitIds ?? [],
      isStaff: isStaff(capabilities),
    },
  };
}
