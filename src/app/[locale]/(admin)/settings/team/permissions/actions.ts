"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const toggleSchema = z.object({
  roleId: z.string().uuid(),
  capabilityCode: z.string().trim().min(1),
  // null = an organization-wide grant (association_id null); the
  // unique constraint is nulls-not-distinct, so upsert covers both.
  associationId: z.string().uuid().nullable(),
  tenantId: z.string().uuid(),
  grant: z.boolean(),
});

export async function toggleAssociationCapability(input: z.infer<typeof toggleSchema>) {
  const parsed = toggleSchema.parse(input);
  const supabase = await createClient();

  if (parsed.grant) {
    const { error } = await supabase.from("role_capabilities").upsert(
      {
        role_id: parsed.roleId,
        capability_code: parsed.capabilityCode,
        tenant_id: parsed.tenantId,
        association_id: parsed.associationId,
      },
      { onConflict: "role_id,capability_code,association_id", ignoreDuplicates: true }
    );
    if (error) return { error: error.message };
  } else {
    let query = supabase
      .from("role_capabilities")
      .delete()
      .eq("role_id", parsed.roleId)
      .eq("capability_code", parsed.capabilityCode);
    query =
      parsed.associationId === null
        ? query.is("association_id", null)
        : query.eq("association_id", parsed.associationId);
    const { error } = await query;
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
