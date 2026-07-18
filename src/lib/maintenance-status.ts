// Status labels and badge colors for maintenance requests, shared by
// the portal (resident view) and the admin triage page.
export const maintenanceStatusLabelKeys: Record<string, string> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
  rejected: "statusRejected",
};

export const maintenanceStatusBadgeClasses: Record<string, string> = {
  open: "border-transparent bg-red-500 text-white",
  in_progress: "border-transparent bg-orange-500 text-white",
  resolved: "border-transparent bg-emerald-500 text-white",
  rejected: "border-transparent bg-slate-600 text-white",
};

// Fixed, bilingual category list (label keys live in the maintenance
// i18n namespace). Old rows with a null category render as "other".
export const maintenanceCategories = [
  "plumbing",
  "electrical",
  "heating",
  "elevator",
  "common_area",
  "other",
] as const;

export const maintenanceCategoryLabelKeys: Record<string, string> = {
  plumbing: "categoryPlumbing",
  electrical: "categoryElectrical",
  heating: "categoryHeating",
  elevator: "categoryElevator",
  common_area: "categoryCommonArea",
  other: "categoryOther",
};

export const maintenancePriorityLabelKeys: Record<string, string> = {
  low: "priorityLow",
  normal: "priorityNormal",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

export const maintenancePriorityBadgeClasses: Record<string, string> = {
  low: "border-transparent bg-slate-400 text-white",
  normal: "border-transparent bg-sky-600 text-white",
  high: "border-transparent bg-orange-500 text-white",
  urgent: "border-transparent bg-red-600 text-white",
};

// Queue order: urgent first, then by age.
export const maintenancePriorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// The happy-path progression a request moves through. "rejected" is a
// terminal off-ramp, rendered separately by the status track.
export const maintenanceStatusSteps = ["open", "in_progress", "resolved"] as const;

// Maps an activity-log event to its timeline i18n label key (in the
// maintenance namespace). Shared by the admin and portal timelines.
export function eventLabelKey(eventType: string, toStatus: string | null): string {
  if (eventType === "created") return "eventCreated";
  if (eventType === "planned") return "eventPlanned";
  if (eventType === "status_changed") {
    return (
      {
        in_progress: "eventStarted",
        resolved: "eventResolved",
        rejected: "eventRejected",
        open: "eventReopened",
      }[toStatus ?? ""] ?? "eventUpdated"
    );
  }
  return "eventUpdated";
}
