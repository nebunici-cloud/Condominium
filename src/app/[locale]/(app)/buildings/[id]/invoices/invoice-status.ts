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
