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
