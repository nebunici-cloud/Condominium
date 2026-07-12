"use client";

import { useTranslations, useLocale } from "next-intl";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/associations", key: "associations" },
  { href: "/owners", key: "owners" },
  { href: "/roles", key: "roles" },
  { href: "/audit", key: "audit" },
  { href: "/config", key: "config" },
] as const;

export function AppNav() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

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
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <nav className="flex items-center gap-4">
          {navItems.map((item) => (
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
