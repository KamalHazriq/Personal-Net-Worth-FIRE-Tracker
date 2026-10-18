import crypto from 'node:crypto';

// Valid session tokens live in memory only — cleared on server restart, so a
// restart requires unlocking again. They also expire, which matters once the
// app is reachable from a phone: a device that goes missing shouldn't hold a
// working session indefinitely just because the server stays up.
const TOKEN_TTL_MS = (process.env.SESSION_DAYS ? Number(process.env.SESSION_DAYS) : 14) * 86_400_000;
const tokens = new Map<string, number>(); // token -> expires at (epoch ms)

function sweep(now: number) {
  for (const [t, exp] of tokens) if (exp <= now) tokens.delete(t);
}

export function hashPasscode(pass: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasscode(pass: string, stored?: string | null): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pass, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueToken(): string {
  const now = Date.now();
  sweep(now);
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, now + TOKEN_TTL_MS);
  return t;
}

export function isValidToken(t?: string): boolean {
  if (!t) return false;
  const exp = tokens.get(t);
  if (exp === undefined) return false;
  if (exp <= Date.now()) {
    tokens.delete(t);
    return false;
  }
  return true;
}

/** How long a freshly issued session lasts, for the startup banner. */
export function sessionTtlDays(): number {
  return TOKEN_TTL_MS / 86_400_000;
}

export function revokeToken(t?: string) {
  if (t) tokens.delete(t);
}

export function revokeAllTokens() {
  tokens.clear();
}
