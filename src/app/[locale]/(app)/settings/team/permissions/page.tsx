import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";

export default async function PermissionsAssociationPickerPage() {
  const t = await getTranslations("permissions");
  const supabase = await createClient();

  const { data: associations } = await supabase
    .from("associations")
    .select("id, name")
    .order("created_at", { ascending: true });

  const manageable: { id: string; name: string }[] = [];
  for (const association of associations ?? []) {
    const context = await getCurrentCapabilities(supabase, association.id);
    if ((context?.capabilities ?? []).includes("core.role.manage")) {
      manageable.push(association);
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ label: t("pageTitle") }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pickerSubtitle")}</p>
      </div>

      {manageable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noManageableAssociations")}</p>
      ) : (
        <div className="grid gap-2">
          {manageable.map((association) => (
            <Link
              key={association.id}
              href={`/settings/team/permissions/${association.id}`}
              className="flex items-center justify-between rounded-md border p-4 hover:bg-accent"
            >
              <span className="font-medium">{association.name}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
