export const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  issued: "outline",
  partially_paid: "secondary",
  paid: "default",
  cancelled: "destructive",
};

export const statusLabelKeys: Record<string, string> = {
  draft: "statusDraft",
  issued: "statusIssued",
  partially_paid: "statusPartiallyPaid",
  paid: "statusPaid",
  cancelled: "statusCancelled",
};

// The generic Badge variants (statusVariant above) are tuned for a
// light card background -- "outline" in particular is just a border
// with foreground text, which disappears against a dark header band.
// Solid, high-contrast colors for use there instead.
export const statusHeaderClasses: Record<string, string> = {
  draft: "border-transparent bg-slate-500 text-white",
  issued: "border-transparent bg-blue-500 text-white",
  partially_paid: "border-transparent bg-amber-500 text-white",
  paid: "border-transparent bg-emerald-500 text-white",
  cancelled: "border-transparent bg-red-500 text-white",
};
