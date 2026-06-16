import * as XLSX from 'xlsx';
import type Database from 'better-sqlite3';
import { gridForYear, holdingsLatest } from './queries.js';
import { monthLabel } from './format.js';

/** Full JSON dump of all user data. */
export function exportJson(db: Database.Database) {
  const tables = [
    'settings',
    'accounts',
    'snapshots',
    'investments',
    'crypto_holdings',
    'positions_snapshots',
    'positions',
    'symbol_tags',
    'contributions',
    'scenarios',
    'playbook_rules',
    'goals',
    'reviews',
  ];
  const out: Record<string, any> = { exportedAt: new Date().toISOString() };
  for (const t of tables) out[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return out;
}

/** Snapshots as a long CSV (account, category, subtype, date, value). */
export function exportSnapshotsCsv(db: Database.Database): string {
  const rows = db
    .prepare(
      `SELECT a.name, a.category, a.subtype, s.date, s.value
       FROM snapshots s JOIN accounts a ON a.id=s.account_id
       ORDER BY a.category, a.name, s.date`,
    )
    .all() as any[];
  const head = 'Account,Category,Subtype,Date,Value';
  const body = rows
    .map((r) => `"${r.name}","${r.category}","${r.subtype || ''}",${r.date},${r.value}`)
    .join('\n');
  return head + '\n' + body + '\n';
}

/** Rebuild an .xlsx workbook (one sheet per year grid + a Holdings sheet). */
export function exportXlsxBuffer(db: Database.Database): Buffer {
  const wb = XLSX.utils.book_new();
  const years = (
    db.prepare(`SELECT DISTINCT substr(date,1,4) y FROM snapshots ORDER BY y`).all() as any[]
  ).map((r) => Number(r.y));

  for (const year of years) {
    const grid = gridForYear(db, year);
    const aoa: any[][] = [];
    const header = ['Account', 'Type', ...grid.months.map((m) => monthLabel(m.date))];
    aoa.push(header);
    for (const g of grid.groups) {
      aoa.push([g.title]);
      for (const a of g.accounts) {
        aoa.push([a.name, a.subtype, ...grid.months.map((m) => a.values[m.date] ?? null)]);
      }
      aoa.push([
        `Subtotal - ${g.title}`,
        '',
        ...grid.months.map((m) => g.accounts.reduce((s, a) => s + (a.values[m.date] || 0), 0)),
      ]);
      aoa.push([]);
    }
    // net worth rows
    const nw = (m: string, exEpf: boolean) => {
      let bank = 0,
        inv = 0,
        liab = 0,
        epf = 0;
      for (const g of grid.groups)
        for (const a of g.accounts) {
          const v = a.values[m] || 0;
          if (g.category === 'Bank') bank += v;
          else if (g.category === 'Investment') {
            inv += v;
            if (a.is_epf) epf += v;
          } else if (g.category === 'Liability') liab += v;
        }
      return bank + inv - liab - (exEpf ? epf : 0);
    };
    aoa.push(['Net Worth', '', ...grid.months.map((m) => nw(m.date, false))]);
    aoa.push(['Net Worth w/o EPF', '', ...grid.months.map((m) => nw(m.date, true))]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), String(year));
  }

  // Holdings sheet
  const h: any = holdingsLatest(db);
  if (h.snapshot) {
    const head = ['Symbol', 'Name', 'Qty', 'Avg Cost', 'Price', 'MV USD', 'MV MYR', 'P/L %', '% Port', 'Class', 'Sector'];
    const rows = h.positions.map((p: any) => [
      p.symbol,
      p.name,
      p.quantity,
      p.avg_cost,
      p.current_price,
      p.market_value,
      p.market_value_myr,
      p.pct_unrealized_pl,
      p.pct_portfolio,
      p.asset_class,
      p.sub_tag || '',
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), 'Holdings');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
