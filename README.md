# Personal Net Worth & FIRE Tracker

A local-first web app that replaces my `Net Worth.xlsx` workbook: an Excel-like tracker, a
visual dashboard, an investments/holdings breakdown, and a FIRE simulation engine.
Base currency **MYR (RM)**. Everything is
**Shariah-neutral** (no interest-based products are ever suggested). No cloud, no login —
your data lives in a local SQLite file on your machine.

---

## Quick start

```bash
git clone https://github.com/KamalHazriq/Personal-Net-Worth-FIRE-Tracker.git
cd Personal-Net-Worth-FIRE-Tracker
npm install        # installs both workspaces (server + client)
npm run dev        # starts the API (:8787) and the web app (:5173)
```

Then open **http://localhost:5173**. Requirements: Node 18+ (developed on Node 22). Windows/macOS/Linux.

> `npm install` builds `better-sqlite3` (a native module); it ships prebuilt binaries for common
> Node versions, so no compiler is normally needed.

### Starting with your own data

A fresh clone opens with an **empty database** — there's no personal financial data in the repo.
Add your own (everything stays local on your machine):

1. **Accounts page → “Add account”** to create your bank / investment / liability accounts, then
   click any month cell and type the balance. Subtotals, Net Worth and the FIRE projection update
   live. (Arrow keys / Enter move between cells like a spreadsheet.)
2. **Holdings page → “Import CSV”** to drop in a MooMoo positions export (or paste it). Tag holdings
   as ETF/Individual once and it sticks across imports.
3. **Settings** to set your USD/MYR rate, age, target retirement age, SWR and FIRE target income.

> **Bulk import from Excel:** the bundled importer in `server/src/import/` is tailored to *one
> specific* workbook layout (the author's `Net Worth.xlsx`). A different spreadsheet won't import
> as-is — start with the steps above, or adapt the parser in `parseWorkbook.ts` to your sheet format.
> If a file named `Net Worth.xlsx` *is* present in the project root on first run, it will be
> auto-seeded; otherwise the app simply starts empty.

---

## What's inside

| Page | What it does |
|---|---|
| **Dashboard** | KPI cards (net worth, net worth excl. EPF, invested-capital P/L, avg growth), net-worth line (with/without EPF toggle), stacked area by category, allocation donut, monthly-inflow bars, liquid-vs-locked gauge. |
| **Accounts** | Excel-like editable grid grouped by Bank / Income / Liabilities / Investments, with live subtotals, Net Worth, Net Worth w/o EPF and MoM deltas. Inline cell editing, add/rename/delete accounts, year tabs. |
| **Investments** | Per-platform P/L (Capital / Profit-Loss / Balance / P/L%), aggregate P/L%, P/L%-per-platform chart, and a per-coin crypto breakdown. |
| **Holdings** | Import your MooMoo positions CSV (drag-drop or paste, appended by date), editable positions table with MYR conversion, ETF/Individual + sector tagging that persists, allocation donut (by holding / class / sector), ETF-vs-Individual over time, and a "push latest total into Net Worth" button. |
| **FIRE** | Compounding projection of total vs **accessible (non-EPF)** money, FIRE number, the age you can retire, RM5k/10k/15k income cases, return sensitivity (10/12/15%), a reverse "required contribution" solver, and saveable scenario comparison. |
| **Goals** | Track goals (net-worth target, emergency fund, holding %, contribution, retire-by-age) with progress bars computed locally; single-stock **concentration alerts**; a **Zakat calculator** (nisab-aware, computed from your real bank/investment/liability balances); and a dated **monthly-review journal** computed from your own numbers. |
| **Recurring** | Track recurring bills, subscriptions and income (monthly/yearly), with a running total of monthly outflow. |
| **Playbook** | Your own rules (e.g. the "When markets drop" checklist) as editable cards. |
| **Studio** | Generate 1080×1080 social cards (number/donut/trend styles) from your live numbers — theme presets, RM-vs-%-only toggle, PNG download or clipboard copy. Your handle & theme stay in `localStorage` only, never in the repo. |
| **Settings** | USD/MYR rate, ages, SWR, target income, zakat nisab, appearance (Classic/New UI/New UI v3), local passcode, and **export** to .xlsx / .csv / .json. |

---

## How to add a new month

1. Go to **Accounts** and pick the year tab.
2. The grid already shows all 12 month columns. Click the cell for the account + month and
   type the value, then press **Enter** or **Tab**. Subtotals, Net Worth and the MoM deltas
   recompute instantly and save to the local database.
3. To start a new year, click the forward year tab (e.g. `2027`).

## How to add / change an account

- **Add account** button on the Accounts page → name, category (Bank/Income/Liability/Investment)
  and subtype. It appears in its group immediately; start typing values.
- Hover a row and click the **pencil** to rename, change subtype, toggle EPF/liquid, or delete.

## Updating MooMoo holdings

On the **Holdings** page click **Import CSV**, then drag-drop or paste a `Positions_*.csv`
export. Each import is stored as a dated snapshot (history is kept). Tag each symbol as
ETF/Individual and add a sector once — the tags persist across future imports. Use
**Push to Net Worth** to copy the latest MYR total into the current month's MooMoo cell.

---

## Local passcode (optional)

The app runs on **localhost only** (`127.0.0.1`) — it is never reachable from other devices on your
network. If you also want to stop anyone at your computer from opening it, set a passcode in
**Settings → Security**:

- It's enforced by the **backend** — every API call needs a valid session token, so it can't be
  bypassed by hitting the API directly. The passcode is stored only as a salted **scrypt hash**.
- The app shows an **unlock screen** until you enter it, and re-locks when the server restarts.
- It does **not** encrypt the database file at rest — for that you'd add SQLCipher (not included).
  Your OS login remains the boundary for direct file access.

You can change or remove the passcode anytime in Settings, or hit **Lock now** to lock immediately.

## Export & backup

**Settings → Export**:
- **.xlsx** — a rebuilt workbook (one sheet per year + Holdings).
- **.csv** — all snapshots, long format.
- **.json** — a full backup of every table.

To reset and re-seed from the workbook: `npm run seed:reset` (clears data tables, preserves
nothing but the schema, re-imports `Net Worth.xlsx` + the CSV).

---

## Tests

```bash
npm test         # unit suite on synthetic data: parser, dates, query logic, FIRE engine
npm run test:local   # optional: ties the importer out against your own workbook (kept local, gitignored)
```

## Architecture

```
/                    npm workspaces; `npm run dev` runs both via concurrently
├─ server/           Express + better-sqlite3 (API on :8787, SERVER_PORT to override)
│   └─ src/
│      ├─ db.ts          schema + connection
│      ├─ seed.ts        one-time importer (xlsx + csv → SQLite)
│      ├─ import/        workbook & positions parsers (SheetJS)
│      └─ lib/           queries, FIRE seed, exporter
├─ client/           React + Vite + TypeScript + Tailwind + Recharts (:5173, proxies /api)
├─ Net Worth.xlsx    source workbook (seeded on first run)
├─ Positions_*.csv   MooMoo export (seeded on first run)
└─ DATA_MODEL.md     parsed workbook structure + app schema
```

Data is stored in `server/data.db` (gitignored). The frontend talks to the backend via a Vite
proxy, so there's nothing to configure.

---

## Notes

- **Net Worth excluding EPF** is highlighted throughout — it's the money accessible before 55.
- The importer reconciles a few quirks in the source workbook (renamed accounts, accounts that
  changed category between years) so every year-end net worth ties out exactly. See
  `DATA_MODEL.md` for the full breakdown.
- This is a personal tool for analysis and organisation — **not** financial advice.
