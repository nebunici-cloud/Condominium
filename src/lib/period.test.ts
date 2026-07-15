import { describe, expect, it } from "vitest";

import {
  addDays,
  endOfMonth,
  formatDate,
  formatPeriodLabel,
  monthToRange,
  periodToMonth,
  startOfMonth,
} from "./period";

describe("formatDate", () => {
  it("renders dd.mm.yyyy", () => {
    expect(formatDate("2026-07-05")).toBe("05.07.2026");
  });

  it("ignores any time component", () => {
    expect(formatDate("2026-07-05T13:45:00Z")).toBe("05.07.2026");
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-07-10", 5)).toBe("2026-07-15");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap-day arithmetic", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("returns the calendar month bounds", () => {
    expect(startOfMonth("2026-07-15")).toBe("2026-07-01");
    expect(endOfMonth("2026-07-15")).toBe("2026-07-31");
  });

  it("handles February in leap and non-leap years", () => {
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });
});

describe("monthToRange / periodToMonth", () => {
  it("expands a month input value to its full range", () => {
    expect(monthToRange("2026-06")).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });

  it("collapses a period start back to a month input value", () => {
    expect(periodToMonth("2026-06-01")).toBe("2026-06");
  });
});

describe("formatPeriodLabel", () => {
  it("labels an exact calendar month with a capitalized month name", () => {
    expect(formatPeriodLabel("2026-06-01", "2026-06-30", "en")).toBe("June 2026");
  });

  it("capitalizes lowercase locale month names", () => {
    const label = formatPeriodLabel("2026-06-01", "2026-06-30", "ro");
    expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    expect(label).toContain("2026");
  });

  it("falls back to the raw range for partial periods", () => {
    expect(formatPeriodLabel("2026-06-05", "2026-06-30", "en")).toBe("2026-06-05 – 2026-06-30");
  });
});
