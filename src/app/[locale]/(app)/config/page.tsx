import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { NewConfigEntryDialog } from "./new-config-entry-dialog";
import { ToggleActiveButton } from "./toggle-active-button";

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ association?: string }>;
}) {
  const { association: associationParam } = await searchParams;
  const t = await getTranslations("config");
  const tCommon = await getTranslations("common");
  const supabase = await createClient();
  const context = await getCurrentCapabilities(supabase);
  const canManage = (context?.capabilities ?? []).includes("core.config.manage");

  const { data: associations } = await supabase
    .from("associations")
    .select("id, tenant_id, name")
    .order("created_at", { ascending: true });

  const selected = associationParam
    ? associations?.find((a) => a.id === associationParam)
    : associations?.[0];

  const { data: entries } = selected
    ? await supabase
        .from("config_registry")
        .select("id, category, key, label, is_active, sort_order")
        .eq("association_id", selected.id)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {associations && associations.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {associations.map((association) => (
            <Button
              key={association.id}
              size="sm"
              variant={selected?.id === association.id ? "secondary" : "outline"}
              asChild
            >
              <Link href={`/config?association=${association.id}`}>
                {association.name}
              </Link>
            </Button>
          ))}
        </div>
      )}

      {!selected ? (
        <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium">{selected.name}</h2>
            {canManage && (
              <NewConfigEntryDialog
                tenantId={selected.tenant_id}
                associationId={selected.id}
                defaultCategory="expense_category"
              />
            )}
          </div>

          {!entries || entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("category")}</TableHead>
                    <TableHead>{t("key")}</TableHead>
                    <TableHead>{t("label")}</TableHead>
                    <TableHead>{tCommon("status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="outline">{entry.category}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.key}</TableCell>
                      <TableCell className="font-medium">{entry.label}</TableCell>
                      <TableCell>
                        <Badge variant={entry.is_active ? "default" : "secondary"}>
                          {entry.is_active ? tCommon("active") : tCommon("inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <ToggleActiveButton id={entry.id} isActive={entry.is_active} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
