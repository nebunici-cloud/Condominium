"use client";

import { useTranslations, useLocale } from "next-intl";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", key: "dashboard", requiredCapabilities: ["core.association.view"] },
  { href: "/associations", key: "associations", requiredCapabilities: ["core.association.view"] },
  { href: "/owners", key: "owners", requiredCapabilities: ["core.owner.view"] },
  { href: "/maintenance", key: "maintenance", requiredCapabilities: ["maintenance.request.manage"] },
  { href: "/documents", key: "documents", requiredCapabilities: ["docs.document.manage"] },
  { href: "/audit", key: "audit", requiredCapabilities: ["core.audit.view"] },
  {
    href: "/settings",
    key: "settings",
    requiredCapabilities: ["core.tenant.manage", "core.role.manage", "core.config.manage"],
  },
] as const;

export function AppNav({
  capabilities,
  displayName,
  roleLabels,
  showPortalSwitch,
}: {
  capabilities: string[];
  displayName: string;
  roleLabels: string[];
  // Shown to staff who also own/occupy a unit: switches to the
  // resident portal module.
  showPortalSwitch: boolean;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const visibleNavItems = navItems.filter((item) =>
    item.requiredCapabilities.some((capability) => capabilities.includes(capability))
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  function switchLocale(nextLocale: "ro" | "ru") {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <header className="border-b print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {displayName && (
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{displayName}</p>
              {roleLabels.length > 0 && (
                <p className="text-xs text-muted-foreground">{roleLabels.join(", ")}</p>
              )}
            </div>
          )}
          {showPortalSwitch && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my">{t("portalView")}</Link>
            </Button>
          )}
          <Button
            variant={locale === "ro" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => switchLocale("ro")}
          >
            RO
          </Button>
          <Button
            variant={locale === "ru" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => switchLocale("ru")}
          >
            RU
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            {tCommon("signOut")}
          </Button>
        </div>
      </div>
    </header>
  );
}
