import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb, initSchema, clearData, PROJECT_ROOT } from './db.js';
import { parseWorkbook } from './import/parseWorkbook.js';
import { parsePositionsCsv } from './import/parsePositions.js';
import { storePositionsSnapshot } from './import/positions.js';
import { CONTRIB_DEFAULTS } from './import/maps.js';
import { glob as findFiles } from './lib/files.js';

const WORKBOOK = join(PROJECT_ROOT, 'Net Worth.xlsx');

export function seed({ reset = false }: { reset?: boolean } = {}) {
  const db = openDb();
  initSchema(db);
  if (reset) clearData(db);

  // Only seed if empty (idempotent first-run seeding).
  const haveData = (db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c > 0;
  if (haveData && !reset) {
    console.log('DB already has data; skipping seed. Use --reset to rebuild.');
    return summarize(db);
  }

  seedInto(db);
  return summarize(db);
}

/** Import the workbook + positions into an already-open db. Used by seed() and tests. */
export function seedInto(db: any, { silent = false }: { silent?: boolean } = {}) {
  // settings (one row)
  db.prepare(
    `INSERT OR IGNORE INTO settings (id) VALUES (1)`,
  ).run();

  // ---- Workbook ----
  if (!existsSync(WORKBOOK)) {
    console.error(`Workbook not found at ${WORKBOOK}`);
  } else {
    const wb = parseWorkbook(WORKBOOK);

    const insAcc = db.prepare(
      `INSERT INTO accounts (name, category, subtype, is_epf, is_liquid, sort_order)
       VALUES (@name, @category, @subtype, @is_epf, @is_liquid, @sort_order)
       ON CONFLICT(name, category) DO UPDATE SET
         subtype=excluded.subtype, is_epf=excluded.is_epf, is_liquid=excluded.is_liquid`,
    );
    const getAcc = db.prepare(`SELECT id FROM accounts WHERE name=? AND category=?`);
    const insSnap = db.prepare(
      `INSERT INTO snapshots (account_id, date, value) VALUES (?, ?, ?)
       ON CONFLICT(account_id, date) DO UPDATE SET value=excluded.value`,
    );
    const insInv = db.prepare(
      `INSERT INTO investments (platform, month, capital, profit_loss, balance)
       VALUES (@platform, @month, @capital, @profit_loss, @balance)
       ON CONFLICT(platform, month) DO UPDATE SET
         capital=excluded.capital, profit_loss=excluded.profit_loss, balance=excluded.balance`,
    );
    const insCrypto = db.prepare(
      `INSERT INTO crypto_holdings (coin, month, value) VALUES (@coin, @month, @value)
       ON CONFLICT(coin, month) DO UPDATE SET value=excluded.value`,
    );
    const insRule = db.prepare(
      `INSERT INTO playbook_rules (title, body, sort_order) VALUES (?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      for (const a of wb.accounts) insAcc.run(a);
      for (const s of wb.snapshots) {
        const row = getAcc.get(s.name, s.category) as any;
        if (row) insSnap.run(row.id, s.date, s.value);
      }
      for (const i of wb.investments) insInv.run(i);
      for (const c of wb.crypto) insCrypto.run(c);
      wb.playbook.forEach((p, i) => insRule.run(p.title, p.body, i));
    });
    tx();

    // ---- Contributions (FIRE seed defaults, linked to Investment accounts) ----
    const invAccts = db
      .prepare(`SELECT id, name FROM accounts WHERE category='Investment'`)
      .all() as any[];
    const insContrib = db.prepare(
      `INSERT INTO contributions (account_id, monthly_amount, annual_return_rate, annual_contribution_growth_rate)
       VALUES (?, ?, ?, ?) ON CONFLICT(account_id) DO NOTHING`,
    );
    for (const acc of invAccts) {
      const d = CONTRIB_DEFAULTS[acc.name];
      if (d) insContrib.run(acc.id, d.monthly, d.annualReturn, d.growth);
      else insContrib.run(acc.id, 0, 0.04, 0);
    }

    if (!silent) {
      console.log(
        `Workbook: ${wb.accounts.length} account rows, ${wb.snapshots.length} snapshots, ` +
          `${wb.investments.length} invest rows, ${wb.crypto.length} crypto rows, ` +
          `${wb.playbook.length} playbook card(s).`,
      );
      // optional JSON dump for transparency
      writeFileSync(join(PROJECT_ROOT, 'server', 'seed.json'), JSON.stringify(wb, null, 2));
    }
  }

  // ---- MooMoo positions CSV (latest one in project root) ----
  const csvs = findFiles(PROJECT_ROOT, /Positions.*\.csv$/i);
  for (const csv of csvs) {
    const parsed = parsePositionsCsv(csv);
    storePositionsSnapshot(db, parsed.importDate, parsed.rows, csv.split(/[\\/]/).pop());
    if (!silent) console.log(`Positions: ${parsed.rows.length} holdings from ${parsed.importDate}.`);
  }
}

function summarize(db: any) {
  // Compute latest-month Net Worth to verify the import ties out.
  const latest = db
    .prepare(`SELECT MAX(date) d FROM snapshots`)
    .get() as any;
  if (!latest?.d) {
    console.log('No snapshots present.');
    return;
  }
  const rows = db
    .prepare(
      `SELECT a.category, a.is_epf, SUM(s.value) v
       FROM snapshots s JOIN accounts a ON a.id=s.account_id
       WHERE s.date=? GROUP BY a.category, a.is_epf`,
    )
    .all(latest.d) as any[];
  let bank = 0,
    inv = 0,
    liab = 0,
    epf = 0;
  for (const r of rows) {
    if (r.category === 'Bank') bank += r.v;
    else if (r.category === 'Investment') {
      inv += r.v;
      if (r.is_epf) epf += r.v;
    } else if (r.category === 'Liability') liab += r.v;
  }
  const nw = bank + inv - liab;
  const nwExEpf = nw - epf;
  const fmt = (x: number) => 'RM ' + x.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log('\n=== Seed verification (latest month ' + latest.d + ') ===');
  console.log('  Bank subtotal      :', fmt(bank));
  console.log('  Investment subtotal:', fmt(inv));
  console.log('  Liabilities        :', fmt(liab));
  console.log('  EPF (KWSP)         :', fmt(epf));
  console.log('  NET WORTH          :', fmt(nw));
  console.log('  NET WORTH w/o EPF  :', fmt(nwExEpf));
  console.log('  Accounts           :', (db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c);
  console.log('  Snapshots          :', (db.prepare('SELECT COUNT(*) c FROM snapshots').get() as any).c);
  return { nw, nwExEpf };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts')) {
  const reset = process.argv.includes('--reset');
  seed({ reset });
}
