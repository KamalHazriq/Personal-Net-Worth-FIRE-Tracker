// ---- Category / subtype mapping --------------------------------------------

// Col-A category tags used in the 2026 sheet -> canonical subtype.
export const TAG_TO_SUBTYPE: Record<string, string> = {
  ASB: 'ASB',
  EPF: 'EPF',
  KWSP: 'EPF',
  WAHED: 'Wahed',
  GOLD: 'Gold',
  CRYPTO: 'Crypto',
  STOCKS: 'Stocks',
  OTHERS: 'Other',
  BANK: 'Bank',
  MMF: 'MMF',
  HYSA: 'HYSA',
};

// Account-name -> subtype, used when col-A has no tag (2024/2025 sheets).
export const NAME_TO_SUBTYPE: Record<string, string> = {
  // banks
  Maybank: 'Bank',
  'Zest-i': 'Bank',
  Cimb: 'Bank',
  Rize: 'Bank',
  'TNG+': 'MMF',
  'Versa Cash i': 'MMF',
  MAE: 'MMF',
  'MooMoo Cash Plus': 'MMF',
  'Webull MoneyBull': 'MMF',
  'Kaf Bank': 'HYSA',
  ShopeePay: 'HYSA',
  'Aeon Bank': 'HYSA',
  VersaSave: 'MMF',
  // investments
  ASB: 'ASB',
  KWSP: 'EPF',
  'Wahed Invest': 'Wahed',
  'Versa Gold': 'Gold',
  Luno: 'Crypto',
  MooMoo: 'Stocks',
  Webull: 'Stocks',
  AHB: 'Other',
  'Principal Balanced Fund': 'Other',
  'Global Titans Fund': 'Other',
  'GoInvest Principal Balanced Fund': 'Other',
  'GoInvest Global Titans Fund': 'Other',
  'Raiz Invest': 'Other',
};

// Accounts that were renamed between sheets (same underlying account). Merging
// them removes year-boundary double-counts and gives a continuous time series.
export const NAME_ALIAS: Record<string, string> = {
  VersaSave: 'Versa Cash i',
  'GoInvest Global Titans Fund': 'Global Titans Fund',
  'GoInvest Principal Balanced Fund': 'Principal Balanced Fund',
};
export function canonicalName(n: string): string {
  const t = (n || '').trim();
  return NAME_ALIAS[t] || t;
}

export function subtypeFor(category: string, name: string, tag?: string): string {
  const t = (tag || '').toString().trim().toUpperCase();
  if (t && TAG_TO_SUBTYPE[t]) return TAG_TO_SUBTYPE[t];
  if (NAME_TO_SUBTYPE[name]) return NAME_TO_SUBTYPE[name];
  switch (category) {
    case 'Bank':
      return 'Bank';
    case 'Income':
      return /salary/i.test(name) ? 'Salary' : 'Cashback';
    case 'Liability':
      return 'CreditCard';
    case 'Investment':
      return 'Other';
    default:
      return 'Other';
  }
}

export function isEpf(name: string, subtype: string): boolean {
  return subtype === 'EPF' || /kwsp|epf/i.test(name);
}

// ---- FIRE seed defaults (per-account contribution + return assumptions) -----
// Monthly contribution amounts are read from the workbook's SIMULATION sheet
// where possible; these are the fallback defaults + annual return rates.
export const CONTRIB_DEFAULTS: Record<
  string,
  { monthly: number; annualReturn: number; growth: number }
> = {
  ASB: { monthly: 500, annualReturn: 0.055, growth: 0 },
  KWSP: { monthly: 1273, annualReturn: 0.055, growth: 0.04 },
  'Wahed Invest': { monthly: 150, annualReturn: 0.06, growth: 0 },
  'Versa Gold': { monthly: 300, annualReturn: 0.07, growth: 0 },
  Luno: { monthly: 172, annualReturn: 0.15, growth: 0 },
  MooMoo: { monthly: 1049, annualReturn: 0.12, growth: 0.05 },
  'Webull MoneyBull': { monthly: 0, annualReturn: 0.035, growth: 0 },
  AHB: { monthly: 0, annualReturn: 0, growth: 0 },
};

// Symbols pre-tagged as ETF in the MooMoo positions import.
export const KNOWN_ETFS = new Set(['SPUS', 'SPWO']);

// Section-header detection on a yearly sheet's column B.
export function sectionFromHeader(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes('bank account')) return 'Bank';
  if (t === 'income' || t.startsWith('income')) return 'Income';
  if (t.includes('liabilit')) return 'Liability';
  if (t.includes('investment account')) return 'Investment';
  return null;
}

const SKIP_RE = /subtotal|net worth|^total$|average|w\/o kwsp|shopee affliate/i;
export function isSkipRow(text: string): boolean {
  return SKIP_RE.test(text.trim());
}
