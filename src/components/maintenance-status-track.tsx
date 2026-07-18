"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { maintenanceStatusSteps, maintenanceStatusLabelKeys } from "@/lib/maintenance-status";

// A compact Open -> In progress -> Resolved stepper, replacing the
// bare status badge so a resident can see at a glance how far their
// request has moved. "rejected" is a terminal off-ramp and renders as
// its own red end state instead of a step.
export function MaintenanceStatusTrack({ status }: { status: string }) {
  const t = useTranslations("maintenance");

  if (status === "rejected") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span className="flex size-5 items-center justify-center rounded-full bg-slate-600 text-white">
          <XIcon className="size-3" />
        </span>
        {t("statusRejected")}
      </div>
    );
  }

  const currentIndex = Math.max(
    0,
    maintenanceStatusSteps.indexOf(status as (typeof maintenanceStatusSteps)[number])
  );

  return (
    <div className="flex items-center gap-1">
      {maintenanceStatusSteps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={step} className="flex items-center gap-1">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                done && "bg-emerald-500 text-white",
                current && "bg-sky-600 text-white",
                !done && !current && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <CheckIcon className="size-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                current ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {t(maintenanceStatusLabelKeys[step])}
            </span>
            {i < maintenanceStatusSteps.length - 1 && (
              <span className="mx-0.5 h-px w-3 bg-border" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
