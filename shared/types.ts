// ── Shared type definitions for FIRE Tracker ──
//
// NOTE: nothing imports this file yet — both workspaces still type most API
// payloads as `any`. It is kept as the written description of the schema, which
// means it can drift from server/src/db.ts without anything failing. If you
// change the schema, change this too (or start importing it, which would make
// the drift impossible).

// ── Settings ──

export interface Settings {
  id: number;
  base_currency: string;
  usd_myr_rate: number;
  current_age: number;
  target_retire_age: number;
  epf_unlock_age: number;
  fire_target_monthly_income: number;
  swr: number;
  nisab: number;
  /** Which debts are deducted from zakatable wealth. */
  zakat_debt_basis: 'all' | 'short_term';
  passcode_hash?: string | null;
}

/** Settings returned to the client — never includes passcode_hash. */
export interface PublicSettings extends Omit<Settings, 'passcode_hash'> {
  passcode_set: boolean;
}

// ── Accounts & Snapshots ──

export type AccountCategory = 'Bank' | 'Income' | 'Liability' | 'Investment';

export type AccountSubtype =
  | 'Bank' | 'MMF' | 'HYSA' | 'ASB' | 'EPF' | 'Wahed'
  | 'Gold' | 'Crypto' | 'Stocks' | 'Other'
  | 'CreditCard' | 'Loan' | 'Cashback' | 'Salary' | 'SideIncome';

export interface Account {
  id: number;
  name: string;
  category: AccountCategory;
  subtype: AccountSubtype | null;
  currency: string;
  is_epf: number;
  is_liquid: number;
  shariah_ok: number;
  sort_order: number;
  active: number;
  /**
   * For a Liability: the Investment account this borrowing funded, if any.
   * Lets the allocation view show equity as well as gross exposure.
   */
  financed_account_id: number | null;
}

export interface Snapshot {
  account_id: number;
  date: string;        // 'YYYY-MM-DD'
  value: number;
}

// ── Investments ──

export interface Investment {
  platform: string;
  month: string;       // 'YYYY-MM-01'
  capital: number | null;
  profit_loss: number | null;
  balance: number | null;
}

export interface CryptoHolding {
  coin: string;
  month: string;       // 'YYYY-MM-DD'
  value: number;
}

// ── Positions (MooMoo / brokerage) ──

export interface PositionsSnapshot {
  id: number;
  import_date: string;
  source: string | null;
  created_at: string;
}

export interface Position {
  id: number;
  snapshot_id: number;
  symbol: string;
  name: string | null;
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

export interface SymbolTag {
  symbol: string;
  asset_class: 'ETF' | 'Individual';
  sub_tag: string | null;
}

// ── FIRE Planning ──

/**
 * Monthly cash flow and rate for an account. For an Investment this is the
 * contribution and its expected return; for a Liability the same row stores the
 * instalment and the financing rate (same shape, opposite sign).
 */
export interface Contribution {
  account_id: number;
  monthly_amount: number;
  annual_return_rate: number;
  annual_contribution_growth_rate: number;
  excluded?: number;
}

export interface Scenario {
  id: number;
  name: string;
  params_json: string;
  created_at: string;
}

// ── Companion Features ──

export interface PlaybookRule {
  id: number;
  title: string;
  body: string;
  sort_order: number;
}

export interface Goal {
  id: number;
  label: string;
  target_json: string;
  created_at: string;
}

export interface Review {
  id: number;
  date: string;
  summary: string;
}

// ── API Response Helpers ──

export interface ApiOk {
  ok: true;
}

export interface ApiError {
  error: string;
}

export interface AuthStatus {
  enabled: boolean;
  unlocked: boolean;
}

export interface AuthLoginResponse {
  ok: true;
  token: string;
}
