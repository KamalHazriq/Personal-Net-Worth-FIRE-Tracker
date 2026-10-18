/**
 * Data-integrity check for a hand-maintained dataset: `npm run check`.
 *
 * Balances are typed in by hand each month, and the usual damage isn't a crash
 * — it's a decimal point in the wrong place that quietly moves net worth. This
 * reports anything that looks like a slip and explains why, then exits non-zero
 * if it found something worth a second look. It never edits the database.
 */
import { openDb, initSchema } from './db.js';

type Finding = { level: 'warn' | 'info'; where: string; msg: string };

const rm = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthEnd = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const monthIdx = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));

export function checkData(db: ReturnType<typeof openDb>): Finding[] {
  const out: Finding[] = [];
  const dates = (db.prepare('SELECT DISTINCT date FROM snapshots ORDER BY date').all() as any[]).map((r) => r.date);
  if (!dates.length) return [{ level: 'info', where: 'database', msg: 'No snapshots yet — nothing to check.' }];

  // 1. Dates should be month-ends; anything else sorts oddly and breaks the grid.
  for (const d of dates) {
    if (d !== monthEnd(d)) {
      out.push({ level: 'warn', where: d, msg: `Not a month-end date (expected ${monthEnd(d)}).` });
    }
  }

  // 2. Gaps in the month series usually mean a month was skipped, not that
  //    nothing happened — the MoM deltas silently span the hole.
  for (let i = 1; i < dates.length; i++) {
    const gap = monthIdx(dates[i]) - monthIdx(dates[i - 1]);
    if (gap > 1) {
      out.push({
        level: 'warn',
        where: `${dates[i - 1]} -> ${dates[i]}`,
        msg: `${gap - 1} month(s) missing in between; month-over-month figures will jump across the gap.`,
      });
    }
  }

  // 3. Decimal-slip detection. Compared against the account's own typical
  //    movement rather than a fixed ringgit threshold, so a large account that
  //    normally moves thousands doesn't flag while a small one that normally
  //    moves tens does.
  const accounts = db
    .prepare(`SELECT id, name, category, subtype FROM accounts ORDER BY category, sort_order, id`)
    .all() as any[];

  for (const a of accounts) {
    const hist = db
      .prepare('SELECT date, value FROM snapshots WHERE account_id=? ORDER BY date')
      .all(a.id) as any[];
    if (hist.length < 4) continue;

    const steps: number[] = [];
    for (let i = 1; i < hist.length; i++) steps.push(Math.abs(hist[i].value - hist[i - 1].value));
    const sorted = [...steps].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    if (median < 1) continue; // a dormant or near-static account tells us nothing

    for (let i = 1; i < hist.length; i++) {
      const jump = Math.abs(hist[i].value - hist[i - 1].value);
      // 12x the usual movement AND at least RM1,000, so ordinary volatility is quiet.
      if (jump > median * 12 && jump > 1000) {
        const ratio = hist[i - 1].value !== 0 ? hist[i].value / hist[i - 1].value : null;
        // Within 2% OF THE FACTOR, not 2% absolute: an absolute tolerance makes
        // every near-zero ratio look like 0.01, so closing an account (5,378 ->
        // 0.14) would read as a misplaced decimal.
        const decimalish =
          ratio != null && [10, 100, 1000, 0.1, 0.01, 0.001].some((f) => Math.abs(ratio / f - 1) < 0.02);
        out.push({
          level: decimalish ? 'warn' : 'info',
          where: `${a.category}/${a.name} @ ${hist[i].date}`,
          msg:
            `${rm(hist[i - 1].value)} -> ${rm(hist[i].value)} is ${Math.round(jump / median)}x this ` +
            `account's usual monthly movement (${rm(median)})` +
            (decimalish ? ' and almost exactly a factor of ten — check the decimal point.' : '.'),
        });
      }
    }
  }

  // 4. Accounts carrying no history still show up in the FIRE seed at zero.
  const dormant = db
    .prepare(
      `SELECT a.name, a.category FROM accounts a
       WHERE NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.account_id = a.id)`,
    )
    .all() as any[];
  for (const d of dormant) {
    out.push({
      level: 'info',
      where: `${d.category}/${d.name}`,
      msg: 'No snapshots at all — it will sit at zero in the FIRE projection. Delete it if it is finished with.',
    });
  }

  // 5. A borrowing that funded an asset should say so, or the allocation view
  //    nets it off cash instead of the asset.
  const latest = dates[dates.length - 1];
  const unlinked = db
    .prepare(
      `SELECT a.name, s.value FROM accounts a JOIN snapshots s ON s.account_id = a.id
       WHERE a.category='Liability' AND a.subtype='Loan' AND a.financed_account_id IS NULL
         AND s.date=? AND s.value > 0`,
    )
    .all(latest) as any[];
  for (const l of unlinked) {
    out.push({
      level: 'info',
      where: `Liability/${l.name}`,
      msg:
        `${rm(l.value)} outstanding with no funded asset recorded. Set it in Accounts so the ` +
        `net-of-debt allocation subtracts it from that asset rather than from cash.`,
    });
  }

  return out;
}

// --- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/check.ts');
if (isMain) {
  const db = openDb();
  initSchema(db);
  const findings = checkData(db);
  const warns = findings.filter((f) => f.level === 'warn');
  const infos = findings.filter((f) => f.level === 'info');

  const show = (list: Finding[], heading: string) => {
    if (!list.length) return;
    console.log(`\n${heading}`);
    for (const f of list) console.log(`  ${f.where}\n    ${f.msg}`);
  };

  const dates = (db.prepare('SELECT DISTINCT date FROM snapshots ORDER BY date').all() as any[]).map((r) => r.date);
  console.log(
    `Checked ${dates.length} month(s)` +
      (dates.length ? ` from ${dates[0]} to ${dates[dates.length - 1]}` : '') +
      `, ${(db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c} accounts, ` +
      `${(db.prepare('SELECT COUNT(*) c FROM snapshots').get() as any).c} values.`,
  );

  show(warns, 'Worth a look:');
  show(infos, 'For information:');
  if (!findings.length) console.log('\nNothing looks out of place.');
  db.close();
  process.exit(warns.length ? 1 : 0);
}
