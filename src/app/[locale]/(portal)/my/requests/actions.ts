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

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      tenant_id: parsed.tenantId,
      unit_id: parsed.unitId,
      created_by: user.id,
      category: parsed.category,
      title: parsed.title,
      description: parsed.description || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, requestId: null };
  }

  revalidatePath("/", "layout");
  // The id lets the browser upload photos into this request's storage
  // folder (the storage INSERT policy requires the row to exist).
  return { error: null, requestId: data.id };
}

const attachSchema = z.object({
  requestId: z.string().uuid(),
  paths: z.array(z.string().min(1)).min(1).max(10),
});

// Registers browser-uploaded photo paths on the request via the
// attach_request_photos RPC (authorship + path-prefix checks live
// there, since the request row's UPDATE policy is staff-only).
export async function attachRequestPhotos(input: z.infer<typeof attachSchema>) {
  const parsed = attachSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.rpc("attach_request_photos", {
    p_request_id: parsed.requestId,
    p_paths: parsed.paths,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
