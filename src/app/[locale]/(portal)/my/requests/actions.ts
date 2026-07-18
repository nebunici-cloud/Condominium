"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const createSchema = z
  .object({
    tenantId: z.string().uuid(),
    scope: z.enum(["apartment", "common"]),
    unitId: z.string().uuid().optional(),
    buildingId: z.string().uuid().optional(),
    category: z.enum(["plumbing", "electrical", "heating", "elevator", "common_area", "other"]),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
  })
  .refine((v) => (v.scope === "apartment" ? !!v.unitId : !!v.buildingId), {
    message: "unit or building required",
  });

// Apartment requests are private (reporter + staff); common-area
// requests are public to the building's residents. Authorization is
// the maintenance_requests insert policy (own unit / own building, or
// staff filing on a resident's behalf).
export async function createMaintenanceRequest(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated", requestId: null };
  }

  const isCommon = parsed.scope === "common";
  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      tenant_id: parsed.tenantId,
      unit_id: isCommon ? null : parsed.unitId!,
      building_id: isCommon ? parsed.buildingId! : null,
      visibility: isCommon ? "public" : "private",
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
  return { error: null, requestId: data.id };
}

const attachSchema = z.object({
  requestId: z.string().uuid(),
  paths: z.array(z.string().min(1)).min(1).max(10),
});

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

// "This affects me too": follow a public request instead of filing a
// duplicate. RLS (maintenance_followers_insert) requires the request
// to be one the caller can see.
export async function followRequest(input: { requestId: string; tenantId: string }) {
  z.object({ requestId: z.string().uuid(), tenantId: z.string().uuid() }).parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("maintenance_request_followers").insert({
    request_id: input.requestId,
    tenant_id: input.tenantId,
    user_id: user.id,
  });

  if (error && error.code !== "23505") {
    // 23505 = already following; treat as success (idempotent).
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function unfollowRequest(requestId: string) {
  z.string().uuid().parse(requestId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("maintenance_request_followers")
    .delete()
    .eq("request_id", requestId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
