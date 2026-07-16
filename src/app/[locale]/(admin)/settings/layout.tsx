import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";

import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const context = await getCurrentCapabilities(supabase);
  const capabilities = context?.capabilities ?? [];

  const tabs = [
    ...(capabilities.includes("core.tenant.manage")
      ? [{ href: "/settings", label: t("tabOrganization") }]
      : []),
    ...(capabilities.includes("core.role.manage")
      ? [{ href: "/settings/team", label: t("tabTeam") }]
      : []),
    ...(capabilities.includes("core.config.manage")
      ? [{ href: "/settings/config", label: t("tabConfig") }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      {tabs.length > 1 && <SettingsTabs tabs={tabs} />}
      {children}
    </main>
  );
}
