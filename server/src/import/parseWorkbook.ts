import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { monthEnd, monthStart } from '../lib/dates.js';
import { sectionFromHeader, isSkipRow, subtypeFor, isEpf, canonicalName } from './maps.js';

export interface ParsedAccount {
  name: string;
  category: string;
  subtype: string;
  is_epf: number;
  is_liquid: number;
  sort_order: number;
}
export interface ParsedSnapshot {
  name: string;
  category: string;
  date: string;
  value: number;
}
export interface ParsedInvestment {
  platform: string;
  month: string;
  capital: number | null;
  profit_loss: number | null;
  balance: number | null;
}
export interface ParsedCrypto {
  coin: string;
  month: string;
  value: number;
}
export interface ParsedWorkbook {
  accounts: ParsedAccount[];
  snapshots: ParsedSnapshot[];
  investments: ParsedInvestment[];
  crypto: ParsedCrypto[];
  playbook: { title: string; body: string }[];
  warnings: string[];
}

type AOA = any[][];

function num(v: any): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    if (isFinite(n)) return n;
  }
  return null;
}
function str(v: any): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
function aoaOf(wb: XLSX.WorkBook, name: string): AOA {
  const ws = wb.Sheets[name];
  if (!ws || !ws['!ref']) return [];
  // Force the range to start at A1 so column A maps to index 0 on every sheet.
  // (SheetJS otherwise trims leading empty columns, shifting indices on sheets
  // where column A is blank — e.g. CRYPTO and Invest.)
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s.r = 0;
  range.s.c = 0;
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    blankrows: true,
    range: XLSX.utils.encode_range(range),
  }) as AOA;
}

/**
 * Map a column index (0-based) to {year, month} for a yearly/crypto sheet.
 * Full format: col C(2)=Dec(year-1); D(3)..O(14)=Jan..Dec(year).
 * Early 2024 format: col C(2)=Jan(2024)..N(13)=Dec(2024).
 */
function colToYm(col: number, year: number, early: boolean): { year: number; month: number } | null {
  if (early) {
    const m = col - 1; // C(2)->1 .. N(13)->12
    if (m >= 1 && m <= 12) return { year, month: m };
    return null;
  }
  if (col === 2) return { year: year - 1, month: 12 };
  const m = col - 2; // D(3)->1 .. O(14)->12
  if (m >= 1 && m <= 12) return { year, month: m };
  return null;
}

// ---- Yearly sheets ----------------------------------------------------------
function parseYearly(aoa: AOA, year: number, out: ParsedWorkbook) {
  const early = !aoa.some((r) => r && /subtotal - bank/i.test(str(r[1])));
  const maxCol = early ? 13 : 14;

  // Find the Net Worth row to determine the last "real" month column.
  let nwRow = -1;
  for (let r = 0; r < aoa.length; r++) {
    if (/^net worth$/i.test(str(aoa[r]?.[1]))) {
      nwRow = r;
      break;
    }
  }
  let lastRealCol = 2;
  if (nwRow >= 0) {
    for (let c = 2; c <= maxCol; c++) {
      const v = num(aoa[nwRow][c]);
      if (v && Math.abs(v) > 0.001) lastRealCol = c;
    }
  } else {
    lastRealCol = maxCol; // fallback
  }

  let section: string | null = early ? 'Investment' : null;
  let order = 0;
  for (let r = 0; r < Math.min(aoa.length, 60); r++) {
    const row = aoa[r];
    if (!row) continue;
    const a = str(row[0]);
    const b = str(row[1]);
    if (!b) continue;

    const hdr = sectionFromHeader(b);
    if (hdr) {
      section = hdr;
      continue;
    }
    if (isSkipRow(b)) continue;
    if (!section) continue;

    // account row? must have at least one numeric value in C..lastRealCol
    let hasVal = false;
    for (let c = 2; c <= maxCol; c++) {
      if (num(row[c]) !== null) {
        hasVal = true;
        break;
      }
    }
    if (!hasVal) continue;

    const name = canonicalName(b);
    const category = section;
    const subtype = subtypeFor(category, name, a);
    const epf = isEpf(name, subtype) ? 1 : 0;
    out.accounts.push({
      name,
      category,
      subtype,
      is_epf: epf,
      is_liquid: epf ? 0 : 1,
      sort_order: order++,
    });
    for (let c = 2; c <= lastRealCol; c++) {
      const v = num(row[c]);
      if (v === null) continue;
      const ym = colToYm(c, year, early);
      if (!ym) continue;
      out.snapshots.push({ name, category, date: monthEnd(ym.year, ym.month), value: v });
    }
  }
}

// ---- Crypto sheets ----------------------------------------------------------
function parseCrypto(aoa: AOA, year: number, out: ParsedWorkbook) {
  // total row is labelled "Crypto Worth" (2026) or "Net Worth" (2025)
  let totalRow = -1;
  for (let r = 0; r < aoa.length; r++) {
    if (/crypto worth|net worth/i.test(str(aoa[r]?.[1]))) {
      totalRow = r;
      break;
    }
  }
  let lastRealCol = 2;
  if (totalRow >= 0) {
    for (let c = 2; c <= 14; c++) {
      const v = num(aoa[totalRow][c]);
      if (v && Math.abs(v) > 0.001) lastRealCol = c;
    }
  }
  for (let r = 0; r < aoa.length; r++) {
    const b = str(aoa[r]?.[1]);
    if (!b) continue;
    if (/institution|investment account|crypto worth|net worth/i.test(b)) continue;
    // a coin row has at least one numeric value
    let hasVal = false;
    for (let c = 2; c <= 14; c++) if (num(aoa[r][c]) !== null) hasVal = true;
    if (!hasVal) continue;
    for (let c = 2; c <= lastRealCol; c++) {
      const v = num(aoa[r][c]);
      if (v === null) continue;
      const ym = colToYm(c, year, false);
      if (!ym) continue;
      out.crypto.push({ coin: b, month: monthEnd(ym.year, ym.month), value: v });
    }
  }
}

// ---- Invest P/L grid --------------------------------------------------------
function parseInvest(aoa: AOA, year: number, out: ParsedWorkbook) {
  const rowBlocks = [4, 14, 24]; // 0-based header rows (Excel 5,15,25)
  const colBlocks = [1, 7, 13, 19]; // 0-based platform-name cols (B,H,N,T)
  for (let rb = 0; rb < rowBlocks.length; rb++) {
    const headerRow = rowBlocks[rb];
    for (let cb = 0; cb < colBlocks.length; cb++) {
      const c0 = colBlocks[cb];
      const month = rb + 1 + cb * 3; // Jan..Dec mapping
      // data rows start at headerRow+1, stop at a "Total" row
      for (let r = headerRow + 1; r < headerRow + 9 && r < aoa.length; r++) {
        const name = str(aoa[r]?.[c0]);
        if (!name) continue;
        if (/^total$/i.test(name)) break;
        const capital = num(aoa[r][c0 + 1]);
        const profit = num(aoa[r][c0 + 2]);
        const baki = num(aoa[r][c0 + 3]);
        if (capital === null && profit === null && baki === null) continue;
        // skip empty placeholder rows that only carry a stray 0
        if ((capital === null || capital === 0) && (baki === null || baki === 0) && !profit) continue;
        out.investments.push({
          platform: name,
          month: monthStart(year, month),
          capital,
          profit_loss: profit,
          balance: baki,
        });
      }
    }
  }
}

// ---- Advices / playbook -----------------------------------------------------
function parseAdvices(aoa: AOA, out: ParsedWorkbook) {
  const lines: string[] = [];
  let title = 'When markets drop';
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < 8; c++) {
      const t = str(aoa[r]?.[c]);
      if (!t) continue;
      if (/when markets drop/i.test(t)) {
        title = t.replace(/:$/, '').replace(/\b\w/g, (m) => m).trim();
        title = 'When markets drop';
      } else {
        lines.push(normalizeText(t));
      }
    }
  }
  if (lines.length) out.playbook.push({ title, body: lines.join('\n') });
}

function normalizeText(s: string): string {
  return s
    .replace(/�/g, '-') // replacement char from bad encoding -> dash
    .replace(/–|—/g, '-')
    .replace(/’/g, "'")
    .trim();
}

export function parseWorkbook(path: string): ParsedWorkbook {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
  const out: ParsedWorkbook = {
    accounts: [],
    snapshots: [],
    investments: [],
    crypto: [],
    playbook: [],
    warnings: [],
  };

  // Process yearly sheets in ascending year order so the latest year's
  // category/subtype wins on upsert (handles accounts that drift category).
  const yearlySheets = wb.SheetNames.filter((n) => /^\d{4}$/.test(n)).sort();
  for (const name of yearlySheets) {
    const year = parseInt(name, 10);
    parseYearly(aoaOf(wb, name), year, out);
  }

  for (const name of wb.SheetNames) {
    if (/^CRYPTO\s+\d{4}$/i.test(name)) {
      const year = parseInt(name.match(/\d{4}/)![0], 10);
      parseCrypto(aoaOf(wb, name), year, out);
    } else if (/^Invest\s+\d{4}$/i.test(name)) {
      const year = parseInt(name.match(/\d{4}/)![0], 10);
      parseInvest(aoaOf(wb, name), year, out);
    } else if (/^ADVICES$/i.test(name)) {
      parseAdvices(aoaOf(wb, name), out);
    }
  }

  reconcileAssetCategories(out);
  return out;
}

/**
 * Collapse accounts whose category drifted between Bank and Investment across
 * years — the same money reclassified (e.g. Webull MoneyBull: Bank in 2025 →
 * Stocks in 2026; TNG+: Investment in 2024 → Bank in 2025). Without this they
 * become two accounts that BOTH carry the shared year-boundary (Dec-31) snapshot,
 * double-counting net worth at that month. We keep the latest year's category.
 *
 * Income and Liability keep their own namespaces, so "Maybank Gold 2 Amex" stays
 * as two accounts (a cashback inflow AND a credit-card balance) — that is correct.
 */
function reconcileAssetCategories(out: ParsedWorkbook) {
  const ASSET = new Set(['Bank', 'Investment']);
  // accounts were pushed in ascending year order, so the last asset entry wins
  const finalCat = new Map<string, string>();
  for (const a of out.accounts) if (ASSET.has(a.category)) finalCat.set(a.name, a.category);
  const remap = (cat: string, name: string) =>
    ASSET.has(cat) ? finalCat.get(name) || cat : cat;

  for (const a of out.accounts) a.category = remap(a.category, a.name);
  for (const s of out.snapshots) s.category = remap(s.category, s.name);

  // dedupe accounts by (name, category), keeping the latest attributes
  const accMap = new Map<string, ParsedAccount>();
  for (const a of out.accounts) accMap.set(`${a.name}|${a.category}`, a);
  out.accounts = [...accMap.values()];
}
