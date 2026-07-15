import { describe, expect, it } from "vitest";

import { computeOutstandingBalance } from "./balance";

describe("computeOutstandingBalance", () => {
  it("adds opening balance and invoices, subtracts payments", () => {
    expect(
      computeOutstandingBalance({ openingBalance: 100, invoiceTotal: 250, paymentTotal: 300 })
    ).toBe(50);
  });

  it("supports credit (negative) opening balances and overpayment", () => {
    expect(
      computeOutstandingBalance({ openingBalance: -40, invoiceTotal: 100, paymentTotal: 100 })
    ).toBe(-40);
  });

  it("rounds floating-point artifacts to cents", () => {
    expect(
      computeOutstandingBalance({ openingBalance: 0.1, invoiceTotal: 0.2, paymentTotal: 0 })
    ).toBe(0.3);
  });
});
