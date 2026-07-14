"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b">
      {tabs.map((tab) => {
        // "/settings" itself should only be active on an exact match
        // (otherwise it'd stay lit on every /settings/* sub-route);
        // every other tab should also cover its own nested routes,
        // e.g. /settings/team/permissions/** still counts as "Roluri
        // și echipă".
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/settings" && pathname.startsWith(`${tab.href}/`));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
