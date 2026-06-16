import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export interface ParsedPosition {
  symbol: string;
  name: string;
  quantity: number | null;
  avg_cost: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  pct_unrealized_pl: number | null;
  total_pl: number | null;
  pct_portfolio: number | null;
  currency: string;
}

export interface ParsedPositionsFile {
  importDate: string;
  rows: ParsedPosition[];
}

/** Tolerant CSV line splitter: handles quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function n(v: string): number | null {
  if (v == null) return null;
  const t = v.replace(/[",%$]/g, '').replace(/\+/g, '').trim();
  if (t === '' || t === '--') return null;
  const f = parseFloat(t);
  return isFinite(f) ? f : null;
}

/** Derive import date from filename like Positions_15_6_2026.csv -> 2026-06-15. */
export function dateFromFilename(file: string, fallback: string): string {
  const m = basename(file).match(/(\d{1,2})[_-](\d{1,2})[_-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = basename(file).match(/(\d{4})[_-](\d{1,2})[_-](\d{1,2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return fallback;
}

export function parsePositionsCsv(path: string, fallbackDate = new Date().toISOString().slice(0, 10)) {
  const text = readFileSync(path, 'utf8');
  return { ...parsePositionsText(text), importDate: dateFromFilename(path, fallbackDate) };
}

/** Parse MooMoo positions CSV from raw text (tolerant of BOM + quoted fields). */
export function parsePositionsText(
  raw: string,
  importDate = new Date().toISOString().slice(0, 10),
): { importDate: string; rows: ParsedPosition[] } {
  const text = raw.replace(/^﻿/, '').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { importDate, rows: [] };
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());

  const col = {
    symbol: idx('symbol'),
    name: idx('name'),
    quantity: idx('quantity'),
    price: idx('current price'),
    avg: idx('average cost'),
    mv: idx('market value'),
    pctUnrl: idx('% unrealized p/l'),
    totalPl: idx('total p/l'),
    unrl: idx('unrealized p/l'),
    pctPort: idx('% of portfolio'),
    ccy: idx('currency'),
  };

  const rows: ParsedPosition[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const symbol = (f[col.symbol] || '').replace(/"/g, '').trim();
    if (!symbol) continue;
    rows.push({
      symbol,
      name: (f[col.name] || '').replace(/"/g, '').trim(),
      quantity: n(f[col.quantity]),
      avg_cost: n(f[col.avg]),
      current_price: n(f[col.price]),
      market_value: n(f[col.mv]),
      unrealized_pl: n(f[col.unrl]),
      pct_unrealized_pl: n(f[col.pctUnrl]),
      total_pl: n(f[col.totalPl]),
      pct_portfolio: n(f[col.pctPort]),
      currency: (f[col.ccy] || 'USD').replace(/"/g, '').trim() || 'USD',
    });
  }

  return { importDate, rows };
}
