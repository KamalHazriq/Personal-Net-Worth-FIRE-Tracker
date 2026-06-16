import crypto from 'node:crypto';

// Valid session tokens live in memory only — cleared on server restart, so a
// restart requires unlocking again. That's the right trade-off for a local app.
const tokens = new Set<string>();

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
  const t = crypto.randomBytes(24).toString('hex');
  tokens.add(t);
  return t;
}

export function isValidToken(t?: string): boolean {
  return !!t && tokens.has(t);
}

export function revokeToken(t?: string) {
  if (t) tokens.delete(t);
}

export function revokeAllTokens() {
  tokens.clear();
}
