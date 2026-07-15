export const statusLabelKeys: Record<string, string> = {
  draft: "statusDraft",
  issued: "statusIssued",
  partially_paid: "statusPartiallyPaid",
  paid: "statusPaid",
  cancelled: "statusCancelled",
};

// Solid, high-contrast color coding for invoice status -- used both
// on the list (light card background) and the invoice detail header
// (dark slate band), so it needs to read clearly against both rather
// than relying on the generic Badge variants (which are tuned for
// one background only, e.g. "outline" disappears on a dark header).
// grey = draft (nothing owed yet), red = unpaid, orange = partially
// paid, green = paid in full; cancelled gets its own darker grey plus
// a strikethrough so it isn't confused with the draft grey.
export const statusBadgeClasses: Record<string, string> = {
  draft: "border-transparent bg-slate-400 text-white",
  issued: "border-transparent bg-red-500 text-white",
  partially_paid: "border-transparent bg-orange-500 text-white",
  paid: "border-transparent bg-emerald-500 text-white",
  cancelled: "border-transparent bg-slate-600 text-white line-through",
};
