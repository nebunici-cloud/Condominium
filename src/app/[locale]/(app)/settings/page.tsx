import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const supabase = await createClient();

  const { data: tenant } = await supabase.from("tenants").select("id, name").maybeSingle();

  if (!tenant) {
    return null;
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SettingsForm tenantId={tenant.id} defaultValues={{ name: tenant.name }} />
    </main>
  );
}
