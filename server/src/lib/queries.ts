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
        financed_account_id: a.financed_account_id ?? null,
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
      `SELECT s.date, a.category, a.subtype, a.is_epf, SUM(s.value) v,
         (SELECT fa.subtype FROM accounts fa WHERE fa.id = a.financed_account_id) financedSubtype
       FROM snapshots s JOIN accounts a ON a.id = s.account_id
       GROUP BY s.date, a.category, a.subtype, a.is_epf, financedSubtype
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
        byCategoryNet: {} as Record<string, number>,
      });
    }
    const d = byDate.get(r.date);
    if (r.category === 'Bank') d.bank += r.v;
    else if (r.category === 'Investment') {
      d.investment += r.v;
      if (r.is_epf) d.epf += r.v;
    } else if (r.category === 'Liability') d.liability += r.v;
    // Category buckets for the stacked area (investments split by subtype).
    // `byCategory` is gross assets; `byCategoryNet` subtracts each borrowing
    // from whatever it funded, so its buckets add up to net worth. A shared
    // card showing a net-worth figure has to use the net one, or the slices
    // describe a bigger portfolio than the number beside them.
    if (r.category === 'Bank') {
      d.byCategory['Bank'] = (d.byCategory['Bank'] || 0) + r.v;
      d.byCategoryNet['Bank'] = (d.byCategoryNet['Bank'] || 0) + r.v;
    } else if (r.category === 'Investment') {
      const k = r.subtype || 'Other';
      d.byCategory[k] = (d.byCategory[k] || 0) + r.v;
      d.byCategoryNet[k] = (d.byCategoryNet[k] || 0) + r.v;
    } else if (r.category === 'Liability') {
      // Unattributed debt (a card) comes off cash, where it is settled from.
      const k = r.financedSubtype || 'Bank';
      d.byCategoryNet[k] = (d.byCategoryNet[k] || 0) - r.v;
    }
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
    byCategoryNet: Object.fromEntries(
      Object.entries(d.byCategoryNet).map(([k, v]) => [k, round(v as number)]),
    ),
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

  // Net-of-debt view. Borrowing inflates whichever asset it funded, so the gross
  // donut describes exposure while this one describes equity. A debt that names
  // the asset it financed is subtracted from that bucket; anything else (cards)
  // comes off cash, which is where it will actually be settled from.
  const debts = db
    .prepare(
      `SELECT a.id, a.subtype, a.financed_account_id, s.value,
         (SELECT fa.subtype FROM accounts fa WHERE fa.id = a.financed_account_id) financedSubtype
       FROM snapshots s JOIN accounts a ON a.id = s.account_id
       WHERE s.date = ? AND a.category = 'Liability' AND s.value > 0`,
    )
    .all(latest) as any[];

  const netBuckets = new Map(buckets);
  let unattributed = 0;
  for (const d of debts) {
    const key = d.financedSubtype || null;
    if (key && netBuckets.has(key)) netBuckets.set(key, (netBuckets.get(key) || 0) - d.value);
    else unattributed += d.value;
  }
  if (unattributed) netBuckets.set('Cash/Bank', (netBuckets.get('Cash/Bank') || 0) - unattributed);

  const netTotal = Array.from(netBuckets.values()).reduce((t, v) => t + v, 0);
  const netItems = Array.from(netBuckets.entries())
    .map(([label, value]) => ({
      label,
      value: round(value),
      pct: netTotal > 0 ? round((value / netTotal) * 100, 2) : 0,
    }))
    .filter((i) => Math.abs(i.value) >= 0.005)
    .sort((a, b) => b.value - a.value);

  const totalDebt = debts.reduce((t, d) => t + d.value, 0);
  return {
    date: latest,
    total: round(total),
    items,
    netTotal: round(netTotal),
    netItems,
    totalDebt: round(totalDebt),
  };
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
  // Each platform contributes its OWN latest month, so this total can be a blend
  // of different dates and will lag the account snapshots. Surface the range so
  // the UI can label it instead of implying it is current.
  const months = rows.map((r) => r.month).filter(Boolean).sort();
  return {
    totalCapital: round(totalCapital),
    totalValue: round(totalValue),
    totalPL: round(totalValue - totalCapital),
    plPct: totalCapital ? round(((totalValue - totalCapital) / totalCapital) * 100, 2) : 0,
    asOf: months.length ? months[months.length - 1] : null,
    oldestAsOf: months.length ? months[0] : null,
    perPlatform,
  };
}

export function dashboardSummary(db: Database.Database) {
  const series = netWorthSeries(db);
  const settings = getSettings(db) as any;
  if (series.length === 0) return { empty: true };
  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;

  // Average monthly deltas. Invested-per-month is measured NET of borrowing:
  // a debt-funded purchase (e.g. ASB financing) raises the investment balance
  // without being money the user actually put in, and counting it gross
  // overstates the savings rate by the whole loan in the month it lands.
  const deltas: number[] = [];
  const investDeltas: number[] = [];
  for (let i = 1; i < series.length; i++) {
    deltas.push(series[i].netWorth - series[i - 1].netWorth);
    const netNow = series[i].investment - series[i].liability;
    const netPrev = series[i - 1].investment - series[i - 1].liability;
    investDeltas.push(netNow - netPrev);
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
    liability: latest.liability,
    momNetWorth: prev ? round(latest.netWorth - prev.netWorth) : 0,
    momNetWorthExEpf: prev ? round(latest.netWorthExEpf - prev.netWorthExEpf) : 0,
    momLiability: prev ? round(latest.liability - prev.liability) : 0,
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

// Debt worth stating as a position fact rather than noise. Below this a
// credit-card balance paid off monthly would be mentioned every month.
const LEVERAGE_FLAG_PCT = 20; // % of gross assets

// Groups of related holdings to watch as a combined bet (from the advisor pack).
const EXPOSURE_GROUPS: { label: string; symbols: string[]; cap: number }[] = [
  { label: 'Semiconductors', symbols: ['MRVL', 'MU', 'NVDA', 'AVGO', 'TSM', 'QCOM', 'AMD', 'INTC', 'SMCI'], cap: 35 },
  { label: 'AI / data-centre', symbols: ['NVDA', 'MRVL', 'AVGO', 'SMCI', 'NOW', 'ORCL'], cap: 30 },
];

export function driftAlerts(db: Database.Database, cap = DEFAULT_SINGLE_STOCK_CAP) {
  const h: any = holdingsLatest(db);
  const alerts: { level: string; symbol?: string; label?: string; msg: string }[] = [];
  if (h.summary) {
    // single-stock caps
    for (const p of h.positions) {
      if (p.asset_class !== 'ETF' && p.pct_portfolio != null && p.pct_portfolio > cap) {
        alerts.push({
          level: 'warn',
          symbol: p.symbol,
          msg: `${p.symbol} is ${p.pct_portfolio.toFixed(1)}% of MooMoo — over your ${cap}% single-stock cap`,
        });
      }
    }
    // combined-exposure caps (related names stacking up)
    for (const g of EXPOSURE_GROUPS) {
      const members = h.positions.filter((p: any) => g.symbols.includes(p.symbol));
      const total = members.reduce((s: number, p: any) => s + (p.pct_portfolio || 0), 0);
      if (total > g.cap) {
        alerts.push({
          level: 'warn',
          msg: `${g.label} exposure is ${total.toFixed(1)}% (${members.map((m: any) => m.symbol).join(', ')}) — over your ${g.cap}% cap`,
        });
      }
    }
  }
  // Borrowing to invest is a deliberate strategy, not a problem, so this is
  // kept OUT of `alerts` — those are concentration breaches against a cap and
  // render as warnings. This is a separate, neutral statement of the position.
  const position: { label: string; msg: string }[] = [];
  const nw = netWorthSeries(db);
  if (nw.length) {
    const latest = nw[nw.length - 1];
    const gross = latest.bank + latest.investment;
    const pct = gross > 0 ? (latest.liability / gross) * 100 : 0;
    if (pct >= LEVERAGE_FLAG_PCT) {
      const financed = db
        .prepare(
          `SELECT a.name, s.value v,
             (SELECT fa.name FROM accounts fa WHERE fa.id = a.financed_account_id) fundedName
           FROM snapshots s JOIN accounts a ON a.id=s.account_id
           WHERE a.category='Liability' AND a.subtype='Loan' AND s.date=? AND s.value>0
           ORDER BY s.value DESC LIMIT 1`,
        )
        .get(latest.date) as any;
      const money = (n: number) => 'RM ' + Math.round(n).toLocaleString('en-MY');
      position.push({
        label: 'leverage',
        msg:
          `${money(latest.liability)} of debt against ${money(gross)} of assets (${pct.toFixed(0)}%)` +
          (financed?.fundedName
            ? `, mostly ${financed.name} funding ${financed.fundedName}.`
            : financed
              ? `, mostly ${financed.name}.`
              : '.') +
          ' Net worth, the allocation view and the FIRE projection all account for it.',
      });
    }
  }

  return { cap, asOf: h.snapshot?.import_date ?? null, alerts, position };
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
  // Net of borrowing: a debt-funded purchase raises the investment balance
  // without being money that was saved. Measured gross, the month an ASB
  // financing lands reads as a six-figure "inflow" and a savings rate in the
  // thousands of percent.
  const invested = last.investment - last.liability - (prev.investment - prev.liability);
  // The change in the invested pool is contributions PLUS market movement, not a
  // savings rate: a writedown month reads as negative "saving". A real savings
  // rate needs actual contributions (the `capital` column on the Invest sheets),
  // which balances cannot yield. So name it for what it is, and skip the ratio
  // when income is too small to divide by — a month of only cashback produces a
  // five-figure percentage.
  const MIN_INCOME_FOR_RATIO = 100;
  const growthVsIncome = income >= MIN_INCOME_FOR_RATIO ? (invested / income) * 100 : null;
  const alloc: any = latestAllocation(db);
  const { alerts: drift, position } = driftAlerts(db);

  const lines = [
    `Net worth ${fmtDelta(last.netWorth - prev.netWorth)} to ${fmtRm(last.netWorth)} (accessible ${fmtDelta(
      last.netWorthExEpf - prev.netWorthExEpf,
    )} to ${fmtRm(last.netWorthExEpf)}).`,
    growthVsIncome != null
      ? `Invested pool ${fmtDelta(invested)} against ${fmtRm(income)} income (${growthVsIncome.toFixed(0)}%) — contributions and market movement together, not a savings rate.`
      : `Invested pool ${fmtDelta(invested)} (income too small this month to compare against).`,
    // With a financed asset the gross and net mixes differ a lot, so both are
    // given rather than quietly presenting exposure as ownership.
    (() => {
      const top = (items: any[]) =>
        (items || []).slice(0, 3).map((i: any) => `${i.label} ${i.pct.toFixed(0)}%`).join(', ');
      return (alloc.totalDebt || 0) > 0
        ? `Top allocation gross: ${top(alloc.items)} · net of debt: ${top(alloc.netItems)}.`
        : `Top allocation: ${top(alloc.items)}.`;
    })(),
    drift.length
      ? `⚠ ${drift.length} concentration flag(s): ${drift.map((d: any) => d.symbol).join(', ')}.`
      : 'No concentration flags.',
  ];

  if (last.liability > 0) {
    // The Goals page carries the fuller "Position" statement; here it is one
    // line, naming what the borrowing funded rather than repeating the share.
    const funded = db
      .prepare(
        `SELECT a.name, (SELECT fa.name FROM accounts fa WHERE fa.id = a.financed_account_id) fundedName
         FROM snapshots s JOIN accounts a ON a.id = s.account_id
         WHERE a.category='Liability' AND a.subtype='Loan' AND s.date=? AND s.value>0
         ORDER BY s.value DESC LIMIT 1`,
      )
      .get(last.date) as any;
    lines.splice(
      2,
      0,
      `Debt ${fmtRm(last.liability)} (${fmtDelta(last.liability - prev.liability)}) — ${(
        (last.liability / (last.bank + last.investment)) * 100
      ).toFixed(0)}% of gross assets` +
        (funded?.fundedName ? `, mostly ${funded.name} funding ${funded.fundedName}.` : '.'),
    );
  }
  return { date: last.date, summary: lines.join('\n'), drift, growthVsIncome, income };
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

  // Debts outstanding today. The `contributions` row doubles as the terms store
  // for a liability: monthly_amount is the instalment and annual_return_rate is
  // the financing rate (same shape, opposite sign of a contribution).
  // `recentMonthlyChange` is the observed average balance movement over the last
  // few months — shown in the UI purely as a hint for entering real terms.
  const liabilities = (
    db
      .prepare(
        `SELECT a.id, a.name, a.subtype, a.financed_account_id financedAccountId,
           COALESCE(c.monthly_amount,0) monthlyPayment,
           COALESCE(c.annual_return_rate,0) annualRate,
           COALESCE(c.excluded,0) excluded,
           COALESCE((SELECT s.value FROM snapshots s WHERE s.account_id=a.id AND s.date=?), 0) startBalance
         FROM accounts a LEFT JOIN contributions c ON c.account_id=a.id
         WHERE a.category='Liability'
         ORDER BY a.sort_order, a.id`,
      )
      .all(latestDate) as any[]
  )
    .filter((l) => l.startBalance > 0)
    .map((l) => {
      // Only months the debt actually existed — including the month it was taken
      // out would read the whole drawdown as a monthly movement.
      const hist = db
        .prepare('SELECT value FROM snapshots WHERE account_id=? AND value>0 ORDER BY date DESC LIMIT 4')
        .all(l.id) as any[];
      let recentMonthlyChange = 0;
      if (hist.length > 1) {
        recentMonthlyChange = (hist[0].value - hist[hist.length - 1].value) / (hist.length - 1);
      }
      return { ...l, startBalance: round(l.startBalance), recentMonthlyChange: round(recentMonthlyChange) };
    });

  return { settings, latestDate, cashStart: round(cashStart), accounts, liabilities };
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
