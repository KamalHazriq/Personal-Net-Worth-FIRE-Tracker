/** Last calendar day of a given year/month, as 'YYYY-MM-DD'. month is 1-12. */
export function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this month
  return iso(last);
}

/** First calendar day, as 'YYYY-MM-DD'. month is 1-12. */
export function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Parse a date-like cell (Date | serial-ish | string) into {year, month} or null. */
export function ymFromCell(v: any): { year: number; month: number } | null {
  if (v instanceof Date) {
    // Shift to noon UTC to dodge timezone rounding from SheetJS.
    const t = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return { year: +m[1], month: +m[2] };
  }
  return null;
}
