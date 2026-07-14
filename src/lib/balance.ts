// A unit's true outstanding balance is opening balance (whatever debt
// or credit carried over from a prior system) plus everything ever
// invoiced (excluding cancelled invoices), minus everything ever paid
// -- regardless of whether a given payment was matched to a specific
// invoice. Matching is bookkeeping for which invoice a payment closes
// out; it isn't what makes a payment count against the total owed.
export function computeOutstandingBalance({
  openingBalance,
  invoiceTotal,
  paymentTotal,
}: {
  openingBalance: number;
  invoiceTotal: number;
  paymentTotal: number;
}): number {
  return round2(openingBalance + invoiceTotal - paymentTotal);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
