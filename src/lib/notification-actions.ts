"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Stamp the caller's own unread notifications as read. With no ids,
// clears everything unread (the "mark all read" case); with ids, only
// those rows. RLS scopes every write to user_id = auth.uid(), so the
// filter here is a convenience, not the security boundary.
export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { error } = await query;
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
