import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";

import { NewOwnerDialog } from "./new-owner-dialog";
import { OwnersTable } from "./owners-table";

export default async function OwnersPage() {
  const t = await getTranslations("owners");
  const supabase = await createClient();
  const context = await getCurrentCapabilities(supabase);
  const capabilities = context?.capabilities ?? [];

  const { data: owners } = await supabase
    .from("owners")
    .select("id, full_name, email, phone, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {capabilities.includes("core.owner.create") && <NewOwnerDialog />}
      </div>

      {!owners || owners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noOwners")}</p>
      ) : (
        <OwnersTable owners={owners} canEdit={capabilities.includes("core.owner.update")} />
      )}
    </main>
  );
}
