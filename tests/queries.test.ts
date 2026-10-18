import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../server/src/db.ts';
import {
  netWorthSeries,
  dashboardSummary,
  investmentsGrid,
  cryptoSeries,
  driftAlerts,
} from '../server/src/lib/queries.ts';

// A small, entirely synthetic dataset — verifies the query LOGIC without any
// real personal data. (The real tie-out lives in the gitignored tests/local/.)
let db: any;
before(() => {
  db = new Database(':memory:');
  initSchema(db);
  db.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run();

  const acc = db.prepare('INSERT INTO accounts (name, category, subtype, is_epf, is_liquid) VALUES (?,?,?,?,?)');
  const bank = acc.run('TestBank', 'Bank', 'Bank', 0, 1).lastInsertRowid;
  const stock = acc.run('TestStock', 'Investment', 'Stocks', 0, 1).lastInsertRowid;
  const epf = acc.run('TestEPF', 'Investment', 'EPF', 1, 0).lastInsertRowid;

  const snap = db.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  // Jan then Feb so deltas exist
  snap.run(bank, '2026-01-31', 1000);
  snap.run(stock, '2026-01-31', 5000);
  snap.run(epf, '2026-01-31', 2000);
  snap.run(bank, '2026-02-28', 1100);
  snap.run(stock, '2026-02-28', 5500);
  snap.run(epf, '2026-02-28', 2100);

  const inv = db.prepare('INSERT INTO investments (platform, month, capital, profit_loss, balance) VALUES (?,?,?,?,?)');
  inv.run('P1', '2026-01-01', 1000, 100, 1100); // normal
  inv.run('P1', '2026-03-01', 500, -500, null); // -100% glitch (should be filtered)

  const cry = db.prepare('INSERT INTO crypto_holdings (coin, month, value) VALUES (?,?,?)');
  cry.run('AAA', '2026-02-28', 300);
  cry.run('BBB', '2026-02-28', 200);

  const ps = db.prepare('INSERT INTO positions_snapshots (import_date) VALUES (?)').run('2026-02-15').lastInsertRowid;
  const pos = db.prepare('INSERT INTO positions (snapshot_id, symbol, market_value, pct_portfolio, currency) VALUES (?,?,?,?,?)');
  pos.run(ps, 'BIGSTOCK', 200, 20, 'USD'); // individual, over cap
  pos.run(ps, 'BIGETF', 300, 30, 'USD'); // ETF, over cap but exempt
  const tag = db.prepare('INSERT INTO symbol_tags (symbol, asset_class) VALUES (?,?)');
  tag.run('BIGSTOCK', 'Individual');
  tag.run('BIGETF', 'ETF');
});

test('dashboardSummary computes net worth and excludes EPF', () => {
  const d: any = dashboardSummary(db);
  assert.equal(d.netWorth, 8700); // 1100 + 5500 + 2100
  assert.equal(d.netWorthExEpf, 6600); // minus EPF 2100
  assert.equal(d.epf, 2100);
  assert.equal(d.momNetWorth, 700); // 8700 - 8000
});

test('investmentsGrid filters the -100% glitch row', () => {
  const g: any = investmentsGrid(db, 2026);
  assert.ok(g.months.includes('2026-01-01'));
  assert.ok(!g.months.includes('2026-03-01'));
});

test('cryptoSeries sums coin values per month', () => {
  const c: any = cryptoSeries(db);
  const feb = c.byMonth.find((m: any) => m.month === '2026-02-28');
  assert.equal(feb.AAA + feb.BBB, 500);
});

test('driftAlerts flags over-cap individual stocks but exempts ETFs', () => {
  const d: any = driftAlerts(db, 13);
  const symbols = d.alerts.map((a: any) => a.symbol);
  assert.ok(symbols.includes('BIGSTOCK'));
  assert.ok(!symbols.includes('BIGETF'));
});

test('byCategoryNet subtracts a borrowing from the asset it funded and adds up to net worth', () => {
  // A separate database: the shared fixture has no liabilities.
  const d: any = new Database(':memory:');
  initSchema(d);
  d.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run();
  const acc = d.prepare('INSERT INTO accounts (name, category, subtype, is_epf, is_liquid) VALUES (?,?,?,?,?)');
  const bank = acc.run('Bank', 'Bank', 'Bank', 0, 1).lastInsertRowid;
  const asb = acc.run('ASB', 'Investment', 'ASB', 0, 1).lastInsertRowid;
  const loan = acc.run('ASBF', 'Liability', 'Loan', 0, 1).lastInsertRowid;
  const card = acc.run('Card', 'Liability', 'CreditCard', 0, 1).lastInsertRowid;
  d.prepare('UPDATE accounts SET financed_account_id=? WHERE id=?').run(asb, loan);

  const snap = d.prepare('INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)');
  snap.run(bank, '2026-01-31', 10000);
  snap.run(asb, '2026-01-31', 100000);
  snap.run(loan, '2026-01-31', 80000);
  snap.run(card, '2026-01-31', 500);

  const [m] = netWorthSeries(d) as any[];
  // Gross describes exposure.
  assert.equal(m.byCategory.ASB, 100000);
  assert.equal(m.byCategory.Bank, 10000);
  // Net subtracts the financing from ASB, and the card from cash.
  assert.equal(m.byCategoryNet.ASB, 20000);
  assert.equal(m.byCategoryNet.Bank, 9500);
  // The whole point: the net buckets reconcile with net worth, so a shared
  // card showing both cannot describe a portfolio bigger than the one you own.
  const total = Object.values(m.byCategoryNet).reduce((a: any, b: any) => a + b, 0);
  assert.equal(total, m.netWorth);
  assert.equal(total, 29500);
});
