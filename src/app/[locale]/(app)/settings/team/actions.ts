"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

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
