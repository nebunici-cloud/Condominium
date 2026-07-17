"use client";

import { useTranslations, useLocale } from "next-intl";
import { Building2Icon } from "lucide-react";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// The resident portal's header: intentionally sparse. One brand link
// home, the module switch for staff who also live in a building, the
// language toggle, and sign out. Everything a resident does lives on
// the pages themselves, not in chrome.
export function PortalNav({
  displayName,
  showAdminSwitch,
}: {
  displayName: string;
  showAdminSwitch: boolean;
}) {
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
    <header className="border-b print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/my" className="flex items-center gap-2 text-sm font-semibold">
          <Building2Icon className="size-4" />
          {t("myHome")}
        </Link>
        <div className="flex items-center gap-2">
          {displayName && (
            <p className="mr-1 hidden text-sm font-medium sm:block">{displayName}</p>
          )}
          {showAdminSwitch && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">{t("adminView")}</Link>
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
