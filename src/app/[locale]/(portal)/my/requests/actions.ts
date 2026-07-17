"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  tenantId: z.string().uuid(),
  unitId: z.string().uuid(),
  category: z.enum(["plumbing", "electrical", "heating", "elevator", "common_area", "other"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
});

// Authorization is the maintenance_requests_insert RLS policy: the
// unit must be one the caller owns/occupies (or the caller is staff).
export async function createMaintenanceRequest(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("maintenance_requests").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    created_by: user.id,
    category: parsed.category,
    title: parsed.title,
    description: parsed.description || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
