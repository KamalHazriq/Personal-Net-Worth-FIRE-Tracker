import type Database from 'better-sqlite3';
import { monthEnd } from './dates.js';

const GROUP_TITLES: Record<string, string> = {
  Bank: 'Bank Accounts',
  Income: 'Income',
  Liability: 'Liabilities',
  Investment: 'Investment Accounts',
};

/** Build the Excel-like grid for a year: 13 columns (Dec prev + Jan..Dec). */
export function gridForYear(db: Database.Database, year: number) {
  const opening = `${year - 1}-12-31`;
  const monthDates = [opening];
  for (let m = 1; m <= 12; m++) monthDates.push(monthEnd(year, m));
  const ph = monthDates.map(() => '?').join(',');

  const accts = db
    .prepare(
      `SELECT DISTINCT a.* FROM accounts a
       JOIN snapshots s ON s.account_id = a.id
       WHERE s.date IN (${ph})
       ORDER BY a.category, a.sort_order, a.id`,
    )
    .all(...monthDates) as any[];

  const snaps = db
    .prepare(`SELECT account_id, date, value FROM snapshots WHERE date IN (${ph})`)
    .all(...monthDates) as any[];
  const valMap = new Map<number, Record<string, number>>();
  for (const s of snaps) {
    if (!valMap.has(s.account_id)) valMap.set(s.account_id, {});
    valMap.get(s.account_id)![s.date] = s.value;
  }

  const order = ['Bank', 'Income', 'Liability', 'Investment'];
  const groups = order.map((cat) => ({
    category: cat,
    title: GROUP_TITLES[cat],
    accounts: accts
      .filter((a) => a.category === cat)
      .map((a) => ({
        id: a.id,
        name: a.name,
        subtype: a.subtype,
        is_epf: a.is_epf,
        is_liquid: a.is_liquid,
        currency: a.currency,
        values: valMap.get(a.id) || {},
      })),
  }));

  const years = (
    db.prepare(`SELECT DISTINCT substr(date,1,4) y FROM snapshots ORDER BY y`).all() as any[]
  ).map((r) => Number(r.y));

  return {
    year,
    years,
    opening,
    months: monthDates.map((d) => ({ date: d, opening: d === opening })),
    groups,
  };
}

export function getSettings(db: Database.Database) {
  return db.prepare('SELECT * FROM settings WHERE id=1').get();
}

/** All distinct snapshot dates, ascending. */
export function snapshotDates(db: Database.Database): string[] {
  return (db.prepare('SELECT DISTINCT date FROM snapshots ORDER BY date').all() as any[]).map(
    (r) => r.date,
  );
}

/**
 * Net-worth time series. For every month we compute:
 *   netWorth = bank + investment - liability
 *   netWorthExEpf = netWorth - epf
 * plus per-category totals for stacked charts.
 */
export function netWorthSeries(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT s.date, a.category, a.subtype, a.is_epf, SUM(s.value) v
       FROM snapshots s JOIN accounts a ON a.id = s.account_id
       GROUP BY s.date, a.category, a.subtype, a.is_epf
       ORDER BY s.date`,
    )
    .all() as any[];

  const byDate = new Map<string, any>();
  for (const r of rows) {
    if (!byDate.has(r.date)) {
      byDate.set(r.date, {
        date: r.date,
        bank: 0,
        investment: 0,
        liability: 0,
        epf: 0,
        byCategory: {} as Record<string, number>,
      });
    }
    const d = byDate.get(r.date);
    if (r.category === 'Bank') d.bank += r.v;
    else if (r.category === 'Investment') {
      d.investment += r.v;
      if (r.is_epf) d.epf += r.v;
    } else if (r.category === 'Liability') d.liability += r.v;
    // category buckets for the stacked area (split investments by subtype)
    if (r.category === 'Bank') d.byCategory['Bank'] = (d.byCategory['Bank'] || 0) + r.v;
    else if (r.category === 'Investment')
      d.byCategory[r.subtype || 'Other'] = (d.byCategory[r.subtype || 'Other'] || 0) + r.v;
  }

  return Array.from(byDate.values()).map((d) => ({
    date: d.date,
    bank: round(d.bank),
    investment: round(d.investment),
    liability: round(d.liability),
    epf: round(d.epf),
    netWorth: round(d.bank + d.investment - d.liability),
    netWorthExEpf: round(d.bank + d.investment - d.liability - d.epf),
    byCategory: Object.fromEntries(Object.entries(d.byCategory).map(([k, v]) => [k, round(v as number)])),
  }));
}

/** Allocation for the latest month, grouped by subtype. */
export function latestAllocation(db: Database.Database) {
  const latest = (db.prepare('SELECT MAX(date) d FROM snapshots').get() as any)?.d;
  if (!latest) return { date: null, items: [] };
  const rows = db
    .prepare(
      `SELECT a.category, a.subtype, a.name, a.is_epf, s.value
       FROM snapshots s JOIN accounts a ON a.id = s.account_id
       WHERE s.date = ? AND a.category IN ('Bank','Investment')
       ORDER BY s.value DESC`,
    )
    .all(latest) as any[];
  const total = rows.reduce((t, r) => t + r.value, 0);
  // group by a display bucket: Bank -> "Cash", investments by subtype
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const key = r.category === 'Bank' ? 'Cash/Bank' : r.subtype || 'Other';
    buckets.set(key, (buckets.get(key) || 0) + r.value);
  }
  const items = Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value: round(value), pct: round((value / total) * 100, 2) }))
    .sort((a, b) => b.value - a.value);
  return { date: latest, total: round(total), items };
}

/** Invested capital vs current value, using each platform's latest valid month. */
export function investmentsSummary(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT i.platform, i.month, i.capital, i.profit_loss, i.balance
       FROM investments i
       JOIN (
         SELECT platform, MAX(month) m FROM investments
         WHERE balance IS NOT NULL AND capital > 0 GROUP BY platform
       ) last ON last.platform = i.platform AND last.m = i.month`,
    )
    .all() as any[];
  let totalCapital = 0;
  let totalValue = 0;
  const perPlatform = rows
    .map((r) => {
      const cap = r.capital || 0;
      const bal = r.balance != null ? r.balance : cap + (r.profit_loss || 0);
      totalCapital += cap;
      totalValue += bal;
      return {
        platform: r.platform,
        month: r.month,
        capital: round(cap),
        balance: round(bal),
        pl: round(bal - cap),
        plPct: cap ? round(((bal - cap) / cap) * 100, 2) : 0,
      };
    })
    .sort((a, b) => b.balance - a.balance);
  return {
    totalCapital: round(totalCapital),
    totalValue: round(totalValue),
    totalPL: round(totalValue - totalCapital),
    plPct: totalCapital ? round(((totalValue - totalCapital) / totalCapital) * 100, 2) : 0,
    perPlatform,
  };
}

export function dashboardSummary(db: Database.Database) {
  const series = netWorthSeries(db);
  const settings = getSettings(db) as any;
  if (series.length === 0) return { empty: true };
  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;

  // average monthly deltas (net worth growth)
  const deltas: number[] = [];
  const investDeltas: number[] = [];
  for (let i = 1; i < series.length; i++) {
    deltas.push(series[i].netWorth - series[i - 1].netWorth);
    investDeltas.push(series[i].investment - series[i - 1].investment);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    empty: false,
    latestDate: latest.date,
    invested: investmentsSummary(db),
    netWorth: latest.netWorth,
    netWorthExEpf: latest.netWorthExEpf,
    epf: latest.epf,
    bank: latest.bank,
    investment: latest.investment,
    momNetWorth: prev ? round(latest.netWorth - prev.netWorth) : 0,
    momNetWorthExEpf: prev ? round(latest.netWorthExEpf - prev.netWorthExEpf) : 0,
    avgMonthlyGrowth: round(avg(deltas)),
    avgMonthlyInvested: round(avg(investDeltas)),
    liquid: round(latest.netWorth - latest.epf),
    locked: round(latest.epf),
    series,
    settings,
  };
}

function round(x: number, dp = 2): number {
  const m = Math.pow(10, dp);
  return Math.round(x * m) / m;
}

// ---- Companion: drift alerts + monthly review ------------------------------
const DEFAULT_SINGLE_STOCK_CAP = 13; // % of MooMoo portfolio

export function driftAlerts(db: Database.Database, cap = DEFAULT_SINGLE_STOCK_CAP) {
  const h: any = holdingsLatest(db);
  const alerts: { level: string; symbol?: string; msg: string }[] = [];
  if (h.summary) {
    for (const p of h.positions) {
      if (p.asset_class !== 'ETF' && p.pct_portfolio > cap) {
        alerts.push({
          level: 'warn',
          symbol: p.symbol,
          msg: `${p.symbol} is ${p.pct_portfolio.toFixed(1)}% of MooMoo — over your ${cap}% single-stock cap`,
        });
      }
    }
  }
  return { cap, asOf: h.snapshot?.import_date ?? null, alerts };
}

export function monthlyReviewSummary(db: Database.Database) {
  const series = netWorthSeries(db);
  if (series.length < 2) return { date: null, summary: 'Not enough history yet for a review.' };
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const settings: any = getSettings(db);
  const income =
    (db
      .prepare(
        `SELECT s.value v FROM snapshots s JOIN accounts a ON a.id=s.account_id
         WHERE a.name='Net Salary' ORDER BY s.date DESC LIMIT 1`,
      )
      .get() as any)?.v || 0;
  const invested = last.investment - prev.investment;
  const savingsRate = income > 0 ? (invested / income) * 100 : null;
  const alloc: any = latestAllocation(db);
  const drift = driftAlerts(db).alerts;

  const lines = [
    `Net worth ${fmtDelta(last.netWorth - prev.netWorth)} to ${fmtRm(last.netWorth)} (accessible ${fmtDelta(
      last.netWorthExEpf - prev.netWorthExEpf,
    )} to ${fmtRm(last.netWorthExEpf)}).`,
    savingsRate != null
      ? `Investment inflow ${fmtRm(invested)} on ${fmtRm(income)} income ≈ ${savingsRate.toFixed(0)}% savings rate.`
      : `Investment inflow ${fmtRm(invested)}.`,
    `Top allocation: ${(alloc.items || [])
      .slice(0, 3)
      .map((i: any) => `${i.label} ${i.pct.toFixed(0)}%`)
      .join(', ')}.`,
    drift.length ? `⚠ ${drift.length} concentration flag(s): ${drift.map((d: any) => d.symbol).join(', ')}.` : 'No concentration flags.',
  ];
  return { date: last.date, summary: lines.join('\n'), drift, savingsRate, income };
}

function fmtRm(n: number) {
  return 'RM ' + Math.round(n).toLocaleString('en-MY');
}
function fmtDelta(n: number) {
  return (n >= 0 ? 'up ' : 'down ') + 'RM ' + Math.round(Math.abs(n)).toLocaleString('en-MY');
}

// ---- FIRE simulation seed --------------------------------------------------
export function fireSeed(db: Database.Database) {
  const settings = getSettings(db) as any;
  const latestDate = (db.prepare('SELECT MAX(date) d FROM snapshots').get() as any)?.d;

  // Use the value at the single latest snapshot date (0 if the account wasn't
  // held that month) so the starting portfolio matches current net worth and
  // exited legacy accounts drop to 0.
  const accounts = (
    db
      .prepare(
        `SELECT a.id, a.name, a.subtype, a.is_epf,
           COALESCE(c.monthly_amount,0) monthly_amount,
           COALESCE(c.annual_return_rate,0) annual_return_rate,
           COALESCE(c.annual_contribution_growth_rate,0) growth,
           COALESCE(c.excluded,0) excluded,
           COALESCE((SELECT s.value FROM snapshots s WHERE s.account_id=a.id AND s.date=?), 0) startBalance
         FROM accounts a LEFT JOIN contributions c ON c.account_id=a.id
         WHERE a.category='Investment'
         ORDER BY a.is_epf, a.sort_order, a.id`,
      )
      .all(latestDate) as any[]
  ).map((a) => ({ ...a, startBalance: a.startBalance || 0 }));

  const cashStart =
    (db.prepare(`SELECT SUM(s.value) t FROM snapshots s JOIN accounts a ON a.id=s.account_id WHERE a.category='Bank' AND s.date=?`).get(latestDate) as any).t || 0;

  return { settings, latestDate, cashStart: round(cashStart), accounts };
}

// ---- Investments P/L (Invest sheets) --------------------------------------
export function investmentsGrid(db: Database.Database, year: number) {
  const rows = db
    .prepare(
      `SELECT platform, month, capital, profit_loss, balance
       FROM investments WHERE substr(month,1,4)=? ORDER BY month`,
    )
    .all(String(year)) as any[];
  const platforms = [...new Set(rows.map((r) => r.platform))];
  const byPlatform: Record<string, Record<string, any>> = {};
  for (const p of platforms) byPlatform[p] = {};
  for (const r of rows) {
    // Skip the known data-entry glitch: a full -100% (profit = -capital) with no
    // remaining balance — e.g. MooMoo March 2026 in the source workbook.
    const glitch =
      r.capital > 0 &&
      (r.balance == null || r.balance === 0) &&
      Math.abs((r.profit_loss ?? 0) + r.capital) < 0.01;
    if (glitch) continue;
    byPlatform[r.platform][r.month] = {
      capital: r.capital,
      profit_loss: r.profit_loss,
      balance: r.balance,
      plPct: r.capital ? round((r.profit_loss / r.capital) * 100, 2) : null,
    };
  }
  // months that still have at least one surviving platform entry
  const months = [...new Set(Object.values(byPlatform).flatMap((m) => Object.keys(m)))].sort();
  const totals: Record<string, any> = {};
  for (const m of months) {
    let cap = 0,
      pl = 0,
      bal = 0;
    for (const p of platforms) {
      const c = byPlatform[p][m];
      if (!c) continue;
      cap += c.capital || 0;
      pl += c.profit_loss || 0;
      bal += c.balance != null ? c.balance : (c.capital || 0) + (c.profit_loss || 0);
    }
    totals[m] = { capital: round(cap), profit_loss: round(pl), balance: round(bal), plPct: cap ? round((pl / cap) * 100, 2) : null };
  }
  const years = (
    db.prepare(`SELECT DISTINCT substr(month,1,4) y FROM investments ORDER BY y`).all() as any[]
  ).map((r) => Number(r.y));
  return { year, years, months, platforms, byPlatform, totals };
}

// ---- Crypto breakdown (CRYPTO sheets) -------------------------------------
export function cryptoSeries(db: Database.Database) {
  const rows = db.prepare(`SELECT coin, month, value FROM crypto_holdings ORDER BY month`).all() as any[];
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const coins = [...new Set(rows.map((r) => r.coin))];
  const byMonth = months.map((m) => {
    const o: any = { month: m };
    for (const r of rows) if (r.month === m) o[r.coin] = r.value;
    return o;
  });
  const latest = months[months.length - 1];
  const latestComposition = rows
    .filter((r) => r.month === latest && r.value > 0)
    .map((r) => ({ coin: r.coin, value: round(r.value) }))
    .sort((a, b) => b.value - a.value);
  return { months, coins, byMonth, latest, latestComposition };
}

// ---- Holdings (MooMoo positions) ------------------------------------------
export function holdingsLatest(db: Database.Database) {
  const snap = db
    .prepare('SELECT * FROM positions_snapshots ORDER BY import_date DESC LIMIT 1')
    .get() as any;
  const settings = getSettings(db) as any;
  const rate = settings.usd_myr_rate;
  if (!snap) return { snapshot: null, rate, positions: [], summary: null };
  const positions = (
    db
      .prepare(
        `SELECT p.*, COALESCE(t.asset_class,'Individual') asset_class, t.sub_tag
         FROM positions p LEFT JOIN symbol_tags t ON t.symbol=p.symbol
         WHERE p.snapshot_id=? ORDER BY p.market_value DESC`,
      )
      .all(snap.id) as any[]
  ).map((p) => ({ ...p, market_value_myr: round((p.market_value || 0) * rate) }));

  const totalMV = positions.reduce((s, p) => s + (p.market_value || 0), 0);
  const totalPL = positions.reduce((s, p) => s + (p.unrealized_pl || 0), 0);
  const cost = totalMV - totalPL;
  const etfMV = positions.filter((p) => p.asset_class === 'ETF').reduce((s, p) => s + (p.market_value || 0), 0);
  const ranked = [...positions].filter((p) => p.pct_unrealized_pl != null).sort((a, b) => b.pct_unrealized_pl - a.pct_unrealized_pl);
  const summary = {
    totalMV: round(totalMV),
    totalMV_myr: round(totalMV * rate),
    totalPL: round(totalPL),
    totalPL_myr: round(totalPL * rate),
    plPct: cost ? round((totalPL / cost) * 100, 2) : 0,
    etfPct: totalMV ? round((etfMV / totalMV) * 100, 2) : 0,
    individualPct: totalMV ? round(((totalMV - etfMV) / totalMV) * 100, 2) : 0,
    count: positions.length,
    biggestWinner: ranked[0] || null,
    biggestLoser: ranked[ranked.length - 1] || null,
  };
  return { snapshot: snap, rate, positions, summary };
}

export function holdingsSeries(db: Database.Database) {
  const snaps = db.prepare('SELECT * FROM positions_snapshots ORDER BY import_date').all() as any[];
  const tagRows = db.prepare('SELECT symbol, asset_class, sub_tag FROM symbol_tags').all() as any[];
  const tag = new Map(tagRows.map((t) => [t.symbol, t]));
  const series = snaps.map((s) => {
    const pos = db.prepare('SELECT symbol, market_value FROM positions WHERE snapshot_id=?').all(s.id) as any[];
    let etf = 0,
      ind = 0;
    const bySymbol: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    for (const p of pos) {
      const t: any = tag.get(p.symbol);
      const ac = t?.asset_class || 'Individual';
      const mv = p.market_value || 0;
      if (ac === 'ETF') etf += mv;
      else ind += mv;
      bySymbol[p.symbol] = round(mv);
      const sec = t?.sub_tag || 'Untagged';
      bySector[sec] = round((bySector[sec] || 0) + mv);
    }
    return { date: s.import_date, ETF: round(etf), Individual: round(ind), total: round(etf + ind), bySymbol, bySector };
  });
  const symbols = [...new Set(series.flatMap((s) => Object.keys(s.bySymbol)))];
  return { series, symbols };
}
