"use client";

import { useTranslations, useLocale } from "next-intl";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/associations", key: "associations", requiredCapability: "core.association.view" },
  { href: "/owners", key: "owners", requiredCapability: "core.owner.view" },
  { href: "/roles", key: "roles", requiredCapability: "core.role.manage" },
  { href: "/audit", key: "audit", requiredCapability: "core.audit.view" },
  { href: "/config", key: "config", requiredCapability: "core.config.manage" },
  { href: "/settings", key: "settings", requiredCapability: "core.tenant.manage" },
] as const;

export function AppNav({ capabilities }: { capabilities: string[] }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const visibleNavItems = navItems.filter((item) =>
    capabilities.includes(item.requiredCapability)
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
    <header className="border-b">
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
        <div className="flex items-center gap-2">
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
