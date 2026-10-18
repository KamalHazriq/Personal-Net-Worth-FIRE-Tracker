import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema, clearData } from '../server/src/db.ts';
import { checkData } from '../server/src/check.ts';

// Synthetic data only. The point of these is the decimal-slip heuristic, which
// has to fire on a misplaced decimal and stay quiet on a real account closure —
// the two look similar if you compare ratios carelessly.
let db: any;

beforeEach(() => {
  if (!db) {
    db = new Database(':memory:');
    initSchema(db);
    db.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run();
  }
  clearData(db);
});

const account = (name: string, category = 'Investment', subtype = 'Stocks') =>
  db
    .prepare('INSERT INTO accounts (name, category, subtype, is_epf, is_liquid) VALUES (?,?,?,0,1)')
    .run(name, category, subtype).lastInsertRowid as number;

/** Give an account a monthly history, starting 2026-01-31. */
function history(id: number, values: number[]) {
  const months = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
                  '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31'];
  const ins = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  values.forEach((v, i) => ins.run(id, months[i], v));
}

const warns = (f: any[]) => f.filter((x) => x.level === 'warn');
const find = (f: any[], needle: string) => f.filter((x) => x.where.includes(needle));

test('a misplaced decimal is flagged as worth a look', () => {
  // Steady ~RM200 account, then a 100x slip: 1,950.00 typed as 195,000.00
  const id = account('Steady');
  history(id, [1000, 1150, 1300, 1500, 1700, 1800, 1950, 195000]);

  const f = checkData(db);
  const hit = find(warns(f), 'Steady');
  assert.equal(hit.length, 1, JSON.stringify(f, null, 2));
  assert.match(hit[0].msg, /factor of ten/);
});

test('closing an account is not mistaken for a decimal slip', () => {
  // The bug this guards: 5,378.90 -> 0.14 has a ratio near zero, which an
  // absolute tolerance reads as "0.01" and reports as a typo.
  const id = account('Migrated Away');
  history(id, [5000, 5100, 5200, 5300, 5378.9, 0.14]);

  const f = checkData(db);
  assert.equal(warns(f).length, 0, 'a closure must not warn: ' + JSON.stringify(warns(f)));
  // It is still worth mentioning, just not as a suspected typo.
  const info = find(f, 'Migrated Away');
  assert.ok(info.length >= 1);
  assert.ok(!/factor of ten/.test(info[0].msg));
});

test('a partial withdrawal is not mistaken for a decimal slip', () => {
  // 5,635.14 -> 492.99 is ~0.0875, close enough to 0.1 to fool a loose check.
  const id = account('Withdrawn');
  history(id, [5500, 5550, 5600, 5620, 5635.14, 492.99]);

  const f = checkData(db);
  assert.equal(warns(f).length, 0, JSON.stringify(warns(f)));
});

test('ordinary month-to-month movement is left alone', () => {
  const id = account('Normal');
  history(id, [1000, 1200, 1100, 1350, 1500, 1420, 1600, 1750]);
  assert.equal(checkData(db).length, 0, JSON.stringify(checkData(db)));
});

test('a date that is not a month-end is flagged', () => {
  const id = account('Odd date');
  db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)').run(id, '2026-03-15', 100);
  const f = warns(checkData(db));
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /Not a month-end date \(expected 2026-03-31\)/);
});

test('a gap in the month series is flagged', () => {
  const id = account('Gappy');
  const ins = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  ins.run(id, '2026-01-31', 100);
  ins.run(id, '2026-04-30', 130); // Feb and Mar missing
  const f = warns(checkData(db));
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /2 month\(s\) missing/);
});

test('an account with no history at all is reported', () => {
  // Needs a populated account too: a database with no snapshots at all
  // short-circuits before the per-account checks, which is its own test below.
  history(account('Normal'), [1000, 1100, 1200, 1300]);
  account('Never Used');
  const f = checkData(db);
  const hit = find(f, 'Never Used');
  assert.equal(hit.length, 1);
  assert.match(hit[0].msg, /No snapshots at all/);
  assert.equal(hit[0].level, 'info'); // tidy-up, not a correctness problem
});

test('a loan with no funded asset recorded is reported, and linking clears it', () => {
  const asb = account('ASB', 'Investment', 'ASB');
  const loan = account('ASB financing', 'Liability', 'Loan');
  const ins = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  ins.run(asb, '2026-01-31', 100000);
  ins.run(loan, '2026-01-31', 80000);

  assert.equal(find(checkData(db), 'ASB financing').length, 1);

  db.prepare('UPDATE accounts SET financed_account_id=? WHERE id=?').run(asb, loan);
  assert.equal(find(checkData(db), 'ASB financing').length, 0);
});

test('an empty database says so rather than erroring', () => {
  const f = checkData(db);
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /No snapshots yet/);
});
