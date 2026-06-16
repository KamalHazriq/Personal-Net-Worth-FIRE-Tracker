# Personal Net Worth & FIRE Tracker

A local-first web app that replaces my `Net Worth.xlsx` workbook: an Excel-like tracker, a
visual dashboard, an investments/holdings breakdown, and a FIRE simulation engine — plus an
optional AI "My Finances" assistant. Base currency **MYR (RM)**. Everything is
**Shariah-neutral** (no interest-based products are ever suggested). No cloud, no login —
your data lives in a local SQLite file on your machine.

---

## Quick start

```bash
npm install        # installs both workspaces (server + client)
npm run dev        # starts the API (:8787) and the web app (:5173)
```

Then open **http://localhost:5173**.

On first run the backend automatically seeds the database from `Net Worth.xlsx` and
`Positions_*.csv` in this folder — so the app is fully populated immediately.

Requirements: Node 18+ (developed on Node 22). Windows/macOS/Linux.

> One-time: `npm install` builds `better-sqlite3` (a native module). It ships prebuilt
> binaries for common Node versions, so no compiler is normally needed.

---

## What's inside

| Page | What it does |
|---|---|
| **Dashboard** | KPI cards (net worth, net worth excl. EPF, invested-capital P/L, avg growth), net-worth line (with/without EPF toggle), stacked area by category, allocation donut, monthly-inflow bars, liquid-vs-locked gauge. |
| **Accounts** | Excel-like editable grid grouped by Bank / Income / Liabilities / Investments, with live subtotals, Net Worth, Net Worth w/o EPF and MoM deltas. Inline cell editing, add/rename/delete accounts, year tabs. |
| **Investments** | Per-platform P/L (Capital / Profit-Loss / Balance / P/L%), aggregate P/L%, P/L%-per-platform chart, and a per-coin crypto breakdown. |
| **Holdings** | Import your MooMoo positions CSV (drag-drop or paste, appended by date), editable positions table with MYR conversion, ETF/Individual + sector tagging that persists, allocation donut (by holding / class / sector), ETF-vs-Individual over time, and a "push latest total into Net Worth" button. |
| **FIRE** | Compounding projection of total vs **accessible (non-EPF)** money, FIRE number, the age you can retire, RM5k/10k/15k income cases, return sensitivity (10/12/15%), a reverse "required contribution" solver, and saveable scenario comparison. |
| **Goals** | Track goals (net-worth target, emergency fund, holding %, contribution, retire-by-age) with progress bars computed locally; single-stock **concentration alerts**; and a dated **monthly-review journal** (computed summary, optionally interpreted by the assistant). |
| **Playbook** | Your own rules (e.g. the "When markets drop" checklist) as editable cards. |
| **Assistant** | Optional AI companion that reasons over your live numbers (see below). |
| **Settings** | USD/MYR rate, ages, SWR, target income, assistant model/web-search, and **export** to .xlsx / .csv / .json. |

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

## AI Assistant (optional)

The Assistant works entirely through the **local backend** — your API key is never exposed
to the browser. The rest of the app works fully offline without it.

1. Copy `.env.example` to `.env` in this folder.
2. Add your key: `ANTHROPIC_API_KEY=sk-ant-...`
3. Restart (`npm run dev`). The Settings page will show "API key detected".

Open it from the floating **My Finances** button (every page) or the **Assistant** page. On
each question it auto-attaches a compact JSON snapshot of your real data (net worth with/without
EPF, allocation, MooMoo positions + tags, FIRE settings, playbook). Guardrails are enforced in
both the system prompt and the UI:

- It **never** gives a Shariah verdict from memory — it points you to a screener (Zoya / Musaffa
  / Islamicly) and, with web search on, looks it up and cites the source.
- It **never** presents prices/returns from training data as current (uses web search or labels
  them stale).
- Any buy/sell discussion shows a checklist you tick: **price verified** / **Shariah verified**.
- It frames everything as analysis & trade-offs, flags professional-advice questions (leverage,
  tax, EPF), and never executes anything.

Change the model or toggle web search on the **Settings** page. Every Q&A is logged locally.

---

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
│      └─ lib/           queries, FIRE seed, assistant, exporter
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
