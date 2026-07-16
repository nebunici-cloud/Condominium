"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  tenantId: z.string().uuid(),
  associationId: z.string().uuid(),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

// Authorization lives in the announcements_insert/delete RLS policies
// (comms.announcement.manage, per association).
export async function createAnnouncement(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("announcements").insert({
    tenant_id: parsed.tenantId,
    association_id: parsed.associationId,
    title: parsed.title,
    body: parsed.body,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteAnnouncement(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();

  const { error } = await supabase.from("announcements").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
