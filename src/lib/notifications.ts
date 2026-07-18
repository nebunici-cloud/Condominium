import { createClient } from "@/lib/supabase/server";
import type { NotificationItem } from "@/components/notification-bell";

// The caller's most recent notifications plus their unread count, for
// the header bell. RLS scopes both reads to the current user.
export async function loadNotifications(): Promise<{
  items: NotificationItem[];
  unreadCount: number;
}> {
  const supabase = await createClient();

  const [{ data: rows }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, data, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  const items: NotificationItem[] = (rows ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    data: (row.data as Record<string, unknown>) ?? {},
    link: row.link,
    read_at: row.read_at,
    created_at: row.created_at,
  }));

  return { items, unreadCount: count ?? 0 };
}
