"use client";

import { useTranslations, useLocale } from "next-intl";

import { formatDateTime } from "@/lib/period";
import { eventLabelKey } from "@/lib/maintenance-status";

export type TimelineEvent = {
  eventType: string;
  toStatus: string | null;
  actorName?: string | null;
  createdAt: string;
};

// The request's activity log rendered as a vertical timeline. Shared by
// the admin triage card and the resident's own request card (the
// resident view omits actor names).
export function MaintenanceTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("maintenance");
  const locale = useLocale();

  if (events.length === 0) return null;

  return (
    <ol className="flex flex-col gap-1 border-l pl-4 text-xs text-muted-foreground">
      {events.map((event, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[1.05rem] top-1 size-1.5 rounded-full bg-muted-foreground/50" />
          <span className="font-medium text-foreground">
            {t(eventLabelKey(event.eventType, event.toStatus))}
          </span>{" "}
          {event.actorName && <>— {event.actorName} </>}· {formatDateTime(event.createdAt, locale)}
        </li>
      ))}
    </ol>
  );
}
