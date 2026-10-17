export function rm(n: number | null | undefined, dp = 2): string {
  if (n == null || isNaN(n as number)) return 'RM 0';
  return (
    'RM ' +
    Number(n).toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  );
}

export function usd(n: number | null | undefined, dp = 2): string {
  if (n == null || isNaN(n as number)) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pct(n: number | null | undefined, dp = 1): string {
  if (n == null || isNaN(n as number)) return '0%';
  const v = Number(n);
  return (v > 0 ? '+' : '') + v.toFixed(dp) + '%';
}

/** A share of a total as "12%" — guards divide-by-zero. No +/- sign. */
export function pctOf(part: number | null | undefined, total: number | null | undefined, dp = 0): string {
  if (!part || !total) return '0%';
  return ((part / total) * 100).toFixed(dp) + '%';
}

export function signedRm(n: number | null | undefined): string {
  if (n == null) return rm(0);
  return (n > 0 ? '+' : n < 0 ? '-' : '') + rm(Math.abs(n));
}

export function monthLabel(date: string): string {
  const [y, m] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

/** Parse a JSON column that may already be an object, or malformed. Falls back to {}. */
export function safeJson(value: unknown): any {
  if (value == null) return {};
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
