import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { initSchema, clearData } from '../server/src/db.ts';
import { revokeAllTokens } from '../server/src/lib/auth.ts';
import { createApp } from '../server/src/app.ts';

// Exercises the real Express routes against a throwaway in-memory database —
// no data.db, no port 8787, no personal data. Covers the request-validation and
// error contracts that the pure-function tests can't reach.
let db: any;
let server: any;
let base: string;

before(async () => {
  db = new Database(':memory:');
  initSchema(db);
  db.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run();
  server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  db?.close();
});

beforeEach(() => {
  clearData(db);
  db.prepare(
    `UPDATE settings SET passcode_hash=NULL, swr=0.04, current_age=24, target_retire_age=45,
     epf_unlock_age=55, fire_target_monthly_income=10000, usd_myr_rate=4.09, nisab=30000,
     zakat_debt_basis='all' WHERE id=1`,
  ).run();
  revokeAllTokens();
});

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown; token?: string };

async function api(path: string, init: ApiInit = {}) {
  const { token, body, ...rest } = init;
  const res = await fetch(base + path, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (csv export) — keep the raw text */
  }
  return { status: res.status, body: parsed, text };
}

const addAccount = (name: string, category: string, subtype = 'Bank', isEpf = 0) =>
  db
    .prepare('INSERT INTO accounts (name, category, subtype, is_epf, is_liquid) VALUES (?,?,?,?,?)')
    .run(name, category, subtype, isEpf, 1).lastInsertRowid as number;

// ---------------------------------------------------------------- accounts --

test('POST /api/accounts rejects a category outside the known set', async () => {
  const r = await api('/api/accounts', { method: 'POST', body: { name: 'Bogus', category: 'NotACategory' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /category must be one of/);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c, 0);
});

test('POST /api/accounts requires name and category', async () => {
  assert.equal((await api('/api/accounts', { method: 'POST', body: { category: 'Bank' } })).status, 400);
  assert.equal((await api('/api/accounts', { method: 'POST', body: { name: 'NoCat' } })).status, 400);
});

test('POST /api/accounts creates a row for a valid category', async () => {
  const r = await api('/api/accounts', { method: 'POST', body: { name: 'Maybank', category: 'Bank', subtype: 'Bank' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Maybank');
  assert.equal(r.body.category, 'Bank');
  assert.equal((db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c, 1);
});

test('PATCH /api/accounts/:id rejects an invalid category but allows other edits', async () => {
  const id = addAccount('Acct', 'Bank');

  const bad = await api(`/api/accounts/${id}`, { method: 'PATCH', body: { category: 'Nope' } });
  assert.equal(bad.status, 400);
  assert.equal((db.prepare('SELECT category FROM accounts WHERE id=?').get(id) as any).category, 'Bank');

  const ok = await api(`/api/accounts/${id}`, { method: 'PATCH', body: { name: 'Renamed' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.name, 'Renamed');
});

// ---------------------------------------------------------------- settings --

test('PUT /api/settings rejects a non-positive SWR', async () => {
  const r = await api('/api/settings', { method: 'PUT', body: { swr: 0 } });
  assert.equal(r.status, 400);
  assert.equal((db.prepare('SELECT swr FROM settings WHERE id=1').get() as any).swr, 0.04);
});

test('PUT /api/settings rejects a percent-shaped SWR (it is stored as a fraction)', async () => {
  // Guards the unit mistake where 5 (meaning 5%) is written instead of 0.05,
  // which silently divides the FIRE number by 100.
  const r = await api('/api/settings', { method: 'PUT', body: { swr: 5 } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /fraction between 0 and 1/);
  assert.equal((db.prepare('SELECT swr FROM settings WHERE id=1').get() as any).swr, 0.04);
});

test('PUT /api/settings accepts a valid fractional SWR and persists it', async () => {
  const r = await api('/api/settings', { method: 'PUT', body: { swr: 0.05 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.swr, 0.05);
  assert.equal((db.prepare('SELECT swr FROM settings WHERE id=1').get() as any).swr, 0.05);
});

test('PUT /api/settings rejects non-numeric values for numeric columns', async () => {
  const r = await api('/api/settings', { method: 'PUT', body: { current_age: 'abc' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /must be a number/);
  assert.equal((db.prepare('SELECT current_age FROM settings WHERE id=1').get() as any).current_age, 24);
});

test('GET /api/settings never exposes the passcode hash', async () => {
  const open = await api('/api/settings');
  assert.equal(open.status, 200);
  assert.equal('passcode_hash' in open.body, false);
  assert.equal(open.body.passcode_set, false);

  const setup = await api('/api/auth/setup', { method: 'POST', body: { passcode: 'secret123' } });
  const locked = await api('/api/settings', { token: setup.body.token });
  assert.equal(locked.status, 200);
  assert.equal('passcode_hash' in locked.body, false);
  assert.equal(locked.body.passcode_set, true);
});

// ----------------------------------------------------------------- deletes --

test('DELETE returns 404 for an id that does not exist', async () => {
  for (const path of ['/api/accounts/999999', '/api/goals/999999', '/api/scenarios/999999', '/api/playbook/999999', '/api/recurring/999999']) {
    const r = await api(path, { method: 'DELETE' });
    assert.equal(r.status, 404, `${path} should 404`);
    assert.equal(r.body.error, 'not found');
  }
});

test('DELETE removes the row and reports success when it does exist', async () => {
  const id = addAccount('Doomed', 'Bank');
  const r = await api(`/api/accounts/${id}`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM accounts WHERE id=?').get(id).c, 0);
});

// --------------------------------------------------------------- snapshots --

test('PUT /api/snapshots upserts a value and clears it when blank', async () => {
  const id = addAccount('Cash', 'Bank');

  assert.equal((await api('/api/snapshots', { method: 'PUT', body: { account_id: id, date: '2026-01-31', value: 1500 } })).status, 200);
  assert.equal(db.prepare('SELECT value v FROM snapshots WHERE account_id=? AND date=?').get(id, '2026-01-31').v, 1500);

  // overwrite
  await api('/api/snapshots', { method: 'PUT', body: { account_id: id, date: '2026-01-31', value: 1600 } });
  assert.equal(db.prepare('SELECT value v FROM snapshots WHERE account_id=? AND date=?').get(id, '2026-01-31').v, 1600);

  // blank clears the cell
  const cleared = await api('/api/snapshots', { method: 'PUT', body: { account_id: id, date: '2026-01-31', value: '' } });
  assert.equal(cleared.body.deleted, true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM snapshots WHERE account_id=?').get(id).c, 0);
});

test('PUT /api/snapshots requires account_id and date', async () => {
  const r = await api('/api/snapshots', { method: 'PUT', body: { value: 10 } });
  assert.equal(r.status, 400);
});

// --------------------------------------------------------------- positions --

test('PATCH /api/positions/:id keeps the previous P/L% when avg_cost is zero', async () => {
  const snapId = db.prepare('INSERT INTO positions_snapshots (import_date) VALUES (?)').run('2026-02-15').lastInsertRowid;
  const posId = db
    .prepare('INSERT INTO positions (snapshot_id, symbol, quantity, avg_cost, current_price, market_value, pct_unrealized_pl) VALUES (?,?,?,?,?,?,?)')
    .run(snapId, 'FREE', 10, 0, 5, 50, 42).lastInsertRowid;

  const r = await api(`/api/positions/${posId}`, { method: 'PATCH', body: { quantity: 10, avg_cost: 0, current_price: 6 } });
  assert.equal(r.status, 200);

  const row: any = db.prepare('SELECT * FROM positions WHERE id=?').get(posId);
  assert.equal(row.market_value, 60); // still recomputed
  assert.equal(row.pct_unrealized_pl, 42); // previous value kept, not Infinity/NaN
  assert.ok(Number.isFinite(row.pct_unrealized_pl));
});

test('PATCH /api/positions/:id 404s for a missing position', async () => {
  assert.equal((await api('/api/positions/999999', { method: 'PATCH', body: { quantity: 1 } })).status, 404);
});

// ------------------------------------------------------------------ export --

test('GET /api/export/csv escapes quotes and neutralises formula prefixes', async () => {
  const quoted = addAccount('He said "hi"', 'Bank');
  const formula = addAccount('=1+1', 'Bank');
  db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)').run(quoted, '2026-01-31', 1);
  db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)').run(formula, '2026-01-31', 2);

  const r = await api('/api/export/csv');
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('"He said ""hi"""'), 'inner quotes should be doubled');
  assert.ok(r.text.includes(`"'=1+1"`), 'formula prefix should be escaped with a leading apostrophe');
});

// ------------------------------------------------------------------- zakat --

test('GET /api/zakat separates long-term financing from debt due now', async () => {
  const bank = addAccount('Bank', 'Bank');
  const stock = addAccount('Stocks', 'Investment', 'Stocks');
  const card = addAccount('Card', 'Liability', 'CreditCard');
  const loan = addAccount('ASB financing', 'Liability', 'Loan');
  const snap = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  snap.run(bank, '2026-01-31', 10000);
  snap.run(stock, '2026-01-31', 100000);
  snap.run(card, '2026-01-31', 500);
  snap.run(loan, '2026-01-31', 80000);
  await api('/api/settings', { method: 'PUT', body: { nisab: 1000 } });

  const r = await api('/api/zakat');
  assert.equal(r.body.shortTermDebt, 500);
  assert.equal(r.body.longTermDebt, 80000);
  assert.equal(r.body.grossWealth, 110000);

  // Default basis deducts everything.
  assert.equal(r.body.basis, 'all');
  assert.equal(r.body.zakatable_wealth, 29500);
  assert.equal(r.body.zakat_due, 737.5);

  // Both treatments are always reported so the choice is visible.
  assert.equal(r.body.alternatives.short_term.zakatable_wealth, 109500);
  assert.equal(r.body.alternatives.short_term.zakat_due, 2737.5);
});

test('GET /api/zakat follows the configured debt basis', async () => {
  const bank = addAccount('Bank', 'Bank');
  const loan = addAccount('ASB financing', 'Liability', 'Loan');
  const snap = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  snap.run(bank, '2026-01-31', 100000);
  snap.run(loan, '2026-01-31', 80000);
  await api('/api/settings', { method: 'PUT', body: { nisab: 1000 } });

  await api('/api/settings', { method: 'PUT', body: { zakat_debt_basis: 'short_term' } });
  const shortTerm = await api('/api/zakat');
  assert.equal(shortTerm.body.basis, 'short_term');
  assert.equal(shortTerm.body.zakatable_wealth, 100000); // the financing is left in
  assert.equal(shortTerm.body.zakat_due, 2500);

  await api('/api/settings', { method: 'PUT', body: { zakat_debt_basis: 'all' } });
  const all = await api('/api/zakat');
  assert.equal(all.body.zakatable_wealth, 20000);
  assert.equal(all.body.zakat_due, 500);
});

test('PUT /api/settings rejects an unknown zakat debt basis', async () => {
  const r = await api('/api/settings', { method: 'PUT', body: { zakat_debt_basis: 'whatever' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /zakat_debt_basis must be one of/);
  assert.equal((await api('/api/zakat')).body.basis, 'all');
});

test('GET /api/zakat nets liabilities and EPF out of zakatable wealth', async () => {
  const bank = addAccount('Bank', 'Bank');
  const stock = addAccount('Stocks', 'Investment', 'Stocks');
  const epf = addAccount('EPF', 'Investment', 'EPF', 1);
  const card = addAccount('Card', 'Liability', 'CreditCard');
  const snap = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  snap.run(bank, '2026-01-31', 1000);
  snap.run(stock, '2026-01-31', 3000);
  snap.run(epf, '2026-01-31', 2000);
  snap.run(card, '2026-01-31', 200);

  // 1000 + (5000 - 2000) - 200 = 3800, below the default nisab so nothing is due
  const below = await api('/api/zakat');
  assert.equal(below.body.zakatable_wealth, 3800);
  assert.equal(below.body.zakat_due, 0);

  // drop the threshold below the wealth and 2.5% becomes payable
  await api('/api/settings', { method: 'PUT', body: { nisab: 1000 } });
  const above = await api('/api/zakat');
  assert.equal(above.body.zakatable_wealth, 3800);
  assert.equal(above.body.zakat_due, 95); // 3800 * 2.5%
});

// -------------------------------------------------------------- auth gate --

test('with no passcode set the API is open', async () => {
  assert.equal((await api('/api/dashboard')).status, 200);
  assert.equal((await api('/api/auth/status')).body.enabled, false);
});

test('once a passcode is set every /api route needs a valid token', async () => {
  const setup = await api('/api/auth/setup', { method: 'POST', body: { passcode: 'letmein' } });
  assert.equal(setup.status, 200);
  assert.ok(setup.body.token);

  // no token -> locked
  const locked = await api('/api/dashboard');
  assert.equal(locked.status, 401);
  assert.equal(locked.body.error, 'locked');

  // valid token -> through
  assert.equal((await api('/api/dashboard', { token: setup.body.token })).status, 200);

  // health and auth routes stay reachable so the app can unlock itself
  assert.equal((await api('/api/health')).status, 200);
  assert.equal((await api('/api/auth/status')).status, 200);
});

test('login rejects the wrong passcode and accepts the right one', async () => {
  await api('/api/auth/setup', { method: 'POST', body: { passcode: 'correct-horse' } });

  const wrong = await api('/api/auth/login', { method: 'POST', body: { passcode: 'nope' } });
  assert.equal(wrong.status, 401);

  const right = await api('/api/auth/login', { method: 'POST', body: { passcode: 'correct-horse' } });
  assert.equal(right.status, 200);
  assert.equal((await api('/api/dashboard', { token: right.body.token })).status, 200);
});

test('a passcode must be at least 4 characters', async () => {
  const r = await api('/api/auth/setup', { method: 'POST', body: { passcode: 'abc' } });
  assert.equal(r.status, 400);
  assert.equal((await api('/api/auth/status')).body.enabled, false);
});
