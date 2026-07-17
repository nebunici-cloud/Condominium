"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const toggleSchema = z.object({
  roleId: z.string().uuid(),
  capabilityCode: z.string().trim().min(1),
  associationId: z.string().uuid(),
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
    const { error } = await supabase
      .from("role_capabilities")
      .delete()
      .eq("role_id", parsed.roleId)
      .eq("capability_code", parsed.capabilityCode)
      .eq("association_id", parsed.associationId);
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
