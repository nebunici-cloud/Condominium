// Shared date-range helpers for billing periods. Kept UTC-explicit
// throughout (date-only strings parsed/formatted as UTC midnight) so
// a container running in a non-UTC timezone can't shift a period's
// start/end by a day.

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function endOfMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

// "2026-06" (an <input type="month"> value) -> the full calendar
// month's date range.
export function monthToRange(month: string): { start: string; end: string } {
  const start = `${month}-01`;
  return { start, end: endOfMonth(start) };
}

// Inverse for pre-filling a month input from a period's start date.
export function periodToMonth(periodStart: string): string {
  return periodStart.slice(0, 7);
}

// "Iunie 2026" when the range is exactly one calendar month (which is
// all invoice generation ever produces now); falls back to the raw
// range for older/partial periods so nothing is misrepresented.
export function formatPeriodLabel(start: string, end: string, locale: string): string {
  const isFullMonth = start === startOfMonth(start) && end === endOfMonth(start);
  if (!isFullMonth) {
    return `${start} – ${end}`;
  }
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(start + "T00:00:00Z"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
