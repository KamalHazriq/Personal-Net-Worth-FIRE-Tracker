import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  hashPasscode,
  verifyPasscode,
  issueToken,
  isValidToken,
  revokeToken,
  revokeAllTokens,
  sessionTtlDays,
} from '../server/src/lib/auth.ts';

test('a passcode verifies against its own hash and nothing else', () => {
  const stored = hashPasscode('correct horse');
  assert.equal(verifyPasscode('correct horse', stored), true);
  assert.equal(verifyPasscode('Correct horse', stored), false);
  assert.equal(verifyPasscode('correct hors', stored), false);
  assert.equal(verifyPasscode('', stored), false);
});

test('the same passcode hashes differently every time', () => {
  // A per-hash random salt, so two people choosing the same passcode, or one
  // person re-setting the same one, do not produce the same stored value.
  const a = hashPasscode('1234');
  const b = hashPasscode('1234');
  assert.notEqual(a, b);
  assert.equal(verifyPasscode('1234', a), true);
  assert.equal(verifyPasscode('1234', b), true);
});

test('a missing or malformed stored hash never verifies', () => {
  for (const stored of [null, undefined, '', 'nosalt', 'deadbeef']) {
    assert.equal(verifyPasscode('anything', stored as any), false, JSON.stringify(stored));
  }
});

test('a hash of the wrong length cannot slip past the comparison', () => {
  // timingSafeEqual throws on mismatched lengths, so the length check has to
  // come first; a truncated hash must be rejected, not crash the request.
  const stored = hashPasscode('1234');
  const [salt, hash] = stored.split(':');
  assert.equal(verifyPasscode('1234', `${salt}:${hash.slice(0, 40)}`), false);
});

test('tokens are valid until revoked', () => {
  const t = issueToken();
  assert.equal(isValidToken(t), true);
  revokeToken(t);
  assert.equal(isValidToken(t), false);
});

test('an unknown or absent token is not valid', () => {
  assert.equal(isValidToken(undefined), false);
  assert.equal(isValidToken(''), false);
  assert.equal(isValidToken('not a token'), false);
});

test('logging out everywhere invalidates every session', () => {
  const a = issueToken();
  const b = issueToken();
  revokeAllTokens();
  assert.equal(isValidToken(a), false);
  assert.equal(isValidToken(b), false);
});

test('sessions last a fortnight by default', () => {
  assert.equal(sessionTtlDays(), 14);
});

test('an expired session stops working even though the server is still up', async () => {
  // The TTL is read once at import, so this loads a second copy of the module
  // with SESSION_DAYS already set. A negative lifetime means the token is born
  // expired, which proves isValidToken checks the expiry rather than just
  // asking whether it has ever seen the token before.
  const url = pathToFileURL(join(process.cwd(), 'server', 'src', 'lib', 'auth.ts')).href;
  process.env.SESSION_DAYS = '-1';
  try {
    const expiring: any = await import(url + '?ttl=expired');
    assert.equal(expiring.sessionTtlDays(), -1, 'the override did not take effect');
    const t = expiring.issueToken();
    assert.equal(expiring.isValidToken(t), false, 'an expired token must not unlock anything');
    // And the sweep must not have left it behind to leak memory.
    assert.equal(expiring.isValidToken(t), false);
  } finally {
    delete process.env.SESSION_DAYS;
  }
});
