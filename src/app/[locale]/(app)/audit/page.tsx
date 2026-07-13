import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

import { AuditTable } from "./audit-table";

export default async function AuditPage() {
  const t = await getTranslations("audit");
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, actor_user_id, action, entity_type, entity_id, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = Array.from(
    new Set((entries ?? []).map((e) => e.actor_user_id).filter(Boolean))
  ) as string[];

  const { data: profiles } =
    actorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", actorIds)
      : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const tableEntries = (entries ?? []).map((entry) => {
    const profile = entry.actor_user_id ? profileMap.get(entry.actor_user_id) : undefined;
    return {
      id: entry.id,
      actorLabel: profile?.full_name || profile?.email || "—",
      action: entry.action,
      entityType: entry.entity_type,
      createdAt: entry.created_at,
      before: entry.before,
      after: entry.after,
    };
  });

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {tableEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <AuditTable entries={tableEntries} />
      )}
    </main>
  );
}
