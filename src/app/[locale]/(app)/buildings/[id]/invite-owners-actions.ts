"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Bulk-invites every owner of this building who has an email, no
// platform account yet, and no pending invite -- each with the
// standard "owner" role. Authorization is the tenant_invites insert
// policy (core.user.invite); when an invitee first signs in,
// accept_pending_invite() links their owner record, which is what
// lights up the resident portal for them.
export async function inviteBuildingOwners(buildingId: string) {
  z.string().uuid().parse(buildingId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated", invited: 0, skipped: 0 };
  }

  const { data: building } = await supabase
    .from("buildings")
    .select("tenant_id")
    .eq("id", buildingId)
    .maybeSingle();
  if (!building) {
    return { error: "Building not found", invited: 0, skipped: 0 };
  }

  const { data: ownerRole } = await supabase
    .from("roles")
    .select("id")
    .eq("tenant_id", building.tenant_id)
    .eq("code", "owner")
    .maybeSingle();
  if (!ownerRole) {
    return { error: "Owner role not found", invited: 0, skipped: 0 };
  }

  const { data: units } = await supabase.from("units").select("id").eq("building_id", buildingId);
  const unitIds = (units ?? []).map((u) => u.id);
  if (unitIds.length === 0) {
    return { error: null, invited: 0, skipped: 0 };
  }

  const { data: ownerships } = await supabase
    .from("ownerships")
    .select("owner_id")
    .in("unit_id", unitIds)
    .is("effective_to", null);
  const ownerIds = Array.from(new Set((ownerships ?? []).map((o) => o.owner_id)));
  if (ownerIds.length === 0) {
    return { error: null, invited: 0, skipped: 0 };
  }

  const { data: owners } = await supabase
    .from("owners")
    .select("id, email, user_id")
    .in("id", ownerIds);

  const candidateEmails = Array.from(
    new Set(
      (owners ?? [])
        .filter((o) => !o.user_id && o.email)
        .map((o) => (o.email as string).trim().toLowerCase())
        .filter((email) => email.length > 0)
    )
  );
  if (candidateEmails.length === 0) {
    return { error: null, invited: 0, skipped: 0 };
  }

  // Skip anyone already invited (pending) or already a member.
  const [{ data: pendingInvites }, { data: peers }] = await Promise.all([
    supabase
      .from("tenant_invites")
      .select("email")
      .eq("tenant_id", building.tenant_id)
      .is("accepted_at", null),
    supabase.from("profiles").select("email"),
  ]);
  const taken = new Set(
    [
      ...(pendingInvites ?? []).map((i) => i.email.toLowerCase()),
      ...(peers ?? []).map((p) => (p.email ?? "").toLowerCase()),
    ].filter(Boolean)
  );

  const toInvite = candidateEmails.filter((email) => !taken.has(email));
  const skipped = candidateEmails.length - toInvite.length;

  if (toInvite.length === 0) {
    return { error: null, invited: 0, skipped };
  }

  const { error } = await supabase.from("tenant_invites").insert(
    toInvite.map((email) => ({
      tenant_id: building.tenant_id,
      email,
      role_id: ownerRole.id,
      invited_by: user.id,
    }))
  );

  if (error) {
    return { error: error.message, invited: 0, skipped };
  }

  revalidatePath("/", "layout");
  return { error: null, invited: toInvite.length, skipped };
}
