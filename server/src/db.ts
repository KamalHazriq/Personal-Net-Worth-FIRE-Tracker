import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(__dirname, '..', 'data.db');
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

export function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Clear all data tables (preserves the settings row). Works while another
 *  connection holds the file open — unlike deleting the .db file on Windows. */
export function clearData(db: Database.Database) {
  const tables = [
    'snapshots',
    'positions',
    'positions_snapshots',
    'crypto_holdings',
    'investments',
    'contributions',
    'symbol_tags',
    'accounts',
    'playbook_rules',
    'scenarios',
    'goals',
    'reviews',
    'assistant_log',
  ];
  const tx = db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
    try {
      db.prepare(`DELETE FROM sqlite_sequence`).run();
    } catch {
      /* sqlite_sequence may not exist yet */
    }
  });
  tx();
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_currency TEXT NOT NULL DEFAULT 'MYR',
  usd_myr_rate REAL NOT NULL DEFAULT 4.09,
  current_age INTEGER NOT NULL DEFAULT 24,
  target_retire_age INTEGER NOT NULL DEFAULT 45,
  epf_unlock_age INTEGER NOT NULL DEFAULT 55,
  fire_target_monthly_income REAL NOT NULL DEFAULT 10000,
  swr REAL NOT NULL DEFAULT 0.04,
  assistant_model TEXT NOT NULL DEFAULT 'claude-opus-4-8',
  web_search_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,            -- Bank | Income | Liability | Investment
  subtype TEXT,                       -- Bank|MMF|HYSA|ASB|EPF|Wahed|Gold|Crypto|Stocks|Other|CreditCard|Cashback|Salary
  currency TEXT NOT NULL DEFAULT 'MYR',
  is_epf INTEGER NOT NULL DEFAULT 0,
  is_liquid INTEGER NOT NULL DEFAULT 1,
  shariah_ok INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (name, category)
);

CREATE TABLE IF NOT EXISTS snapshots (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                 -- month-end 'YYYY-MM-DD'
  value REAL NOT NULL,
  PRIMARY KEY (account_id, date)
);

CREATE TABLE IF NOT EXISTS investments (
  platform TEXT NOT NULL,
  month TEXT NOT NULL,                -- 'YYYY-MM-01'
  capital REAL,
  profit_loss REAL,
  balance REAL,
  PRIMARY KEY (platform, month)
);

CREATE TABLE IF NOT EXISTS crypto_holdings (
  coin TEXT NOT NULL,
  month TEXT NOT NULL,                -- month-end 'YYYY-MM-DD'
  value REAL NOT NULL,
  PRIMARY KEY (coin, month)
);

CREATE TABLE IF NOT EXISTS positions_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_date TEXT NOT NULL,          -- 'YYYY-MM-DD'
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (import_date)
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES positions_snapshots(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  quantity REAL,
  avg_cost REAL,
  current_price REAL,
  market_value REAL,
  unrealized_pl REAL,
  pct_unrealized_pl REAL,
  total_pl REAL,
  pct_portfolio REAL,
  currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS symbol_tags (
  symbol TEXT PRIMARY KEY,
  asset_class TEXT NOT NULL DEFAULT 'Individual', -- 'ETF' | 'Individual'
  sub_tag TEXT
);

CREATE TABLE IF NOT EXISTS contributions (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  monthly_amount REAL NOT NULL DEFAULT 0,
  annual_return_rate REAL NOT NULL DEFAULT 0,
  annual_contribution_growth_rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  params_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playbook_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  target_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  question TEXT NOT NULL,
  answer TEXT,
  used_web_search INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(date);
CREATE INDEX IF NOT EXISTS idx_positions_snapshot ON positions(snapshot_id);
`;

export function initSchema(db: Database.Database) {
  db.exec(SCHEMA);
}
