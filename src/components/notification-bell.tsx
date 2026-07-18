"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { BellIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/period";
import { maintenanceStatusLabelKeys } from "@/lib/maintenance-status";
import { markNotificationsRead } from "@/lib/notification-actions";

export type NotificationItem = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// The header bell: unread count badge + a dropdown of recent items.
// Opening the dropdown marks everything read (optimistically, so the
// badge clears instantly); each item links to the relevant page.
export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationItem[];
  unreadCount: number;
}) {
  const t = useTranslations("notifications");
  const tMaintenance = useTranslations("maintenance");
  const locale = useLocale();
  const [unread, setUnread] = useState(unreadCount);
  const [, startTransition] = useTransition();

  function onOpenChange(open: boolean) {
    if (open && unread > 0) {
      setUnread(0);
      startTransition(async () => {
        await markNotificationsRead();
      });
    }
  }

  function describe(item: NotificationItem): string {
    switch (item.type) {
      case "invoice_published":
        return t("invoicePublished", { number: String(item.data.invoice_number ?? "") });
      case "announcement":
        return t("announcement", { title: String(item.data.title ?? "") });
      case "maintenance_status": {
        const statusKey = maintenanceStatusLabelKeys[String(item.data.to_status ?? "")] ?? "statusOpen";
        return t("maintenanceStatus", { status: tMaintenance(statusKey) });
      }
      default:
        return t("generic");
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("title")}>
          <BellIcon className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => {
              const body = (
                <div className="flex flex-col gap-0.5 px-2 py-2 text-sm">
                  <span>{describe(item)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.created_at, locale)}
                  </span>
                </div>
              );
              return item.link ? (
                <Link
                  key={item.id}
                  href={item.link}
                  className="block rounded-sm hover:bg-accent focus:bg-accent focus:outline-none"
                >
                  {body}
                </Link>
              ) : (
                <div key={item.id}>{body}</div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
