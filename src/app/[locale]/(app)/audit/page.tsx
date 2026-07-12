import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

  const actionVariant: Record<string, "default" | "secondary" | "destructive"> = {
    create: "default",
    update: "secondary",
    delete: "destructive",
  };

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!entries || entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("timestamp")}</TableHead>
              <TableHead>{t("actor")}</TableHead>
              <TableHead>{t("action")}</TableHead>
              <TableHead>{t("entityType")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const profile = entry.actor_user_id
                ? profileMap.get(entry.actor_user_id)
                : undefined;
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{profile?.full_name || profile?.email || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={actionVariant[entry.action] ?? "outline"}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.entity_type}</TableCell>
                  <TableCell>
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        {t("viewDetails")}
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("before")}
                          </p>
                          <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(entry.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("after")}
                          </p>
                          <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(entry.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
