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
| **Dashboard** | KPI cards (net worth, net worth excl. EPF, **debt**, invested-capital P/L, avg growth), net-worth line (with/without EPF toggle), stacked area by category, allocation donut with a **gross-exposure / net-of-debt toggle**, monthly-inflow bars, liquid-vs-locked gauge. |
| **Accounts** | Excel-like editable grid grouped by Bank / Income / Liabilities / Investments, with live subtotals, Net Worth, Net Worth w/o EPF and MoM deltas. Inline cell editing, add/rename/delete accounts, year tabs. A debt can record **which asset it funded**. |
| **Investments** | Per-platform P/L (Capital / Profit-Loss / Balance / P/L%), aggregate P/L%, P/L%-per-platform chart, and a per-coin crypto breakdown. |
| **Holdings** | Import your MooMoo positions CSV (drag-drop or paste, appended by date), editable positions table with MYR conversion, ETF/Individual + sector tagging that persists, allocation donut (by holding / class / sector), ETF-vs-Individual over time, and a "push latest total into Net Worth" button. |
| **FIRE** | Compounding projection of total vs **accessible (non-EPF)** money, **net of debt**, FIRE number, the age you can retire, RM5k/10k/15k income cases, return sensitivity (10/12/15%), a reverse "required contribution" solver, and saveable scenario comparison. A **Debts** card amortises each borrowing from its instalment and rate. |
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

## Borrowing to invest

Financing an asset (ASB financing, for example) raises that asset's balance by
the loan without raising what you own, so the app keeps the two apart:

- **Net worth** has always netted debt off. The **dashboard** now also shows a
  Debt card, and "own money invested per month" is measured **net of borrowing**
  — counted gross, the month a loan lands reads as a six-figure inflow.
- **Allocation** has a *Gross exposure* / *Net of debt* toggle. Gross is what
  moves when markets move; net is what you would keep after settling. Tag the
  debt with the asset it funded (Accounts → edit the debt) and it is subtracted
  from that asset rather than from cash.
- **FIRE** subtracts the outstanding balance from the projection and amortises
  it: enter the instalment and rate on the Debts card and it reports whether the
  debt ever clears. Left at zero the balance is carried flat rather than
  compounded, and the card shows the average monthly movement from your own
  snapshots as a sanity check against the instalment you enter.
- **Studio** cards show your **equity**: each borrowing is subtracted from the
  asset it funded, so the slices add up to the net-worth figure printed beside
  them. A financed asset drawn gross would read as though you owned it outright,
  which is the one thing a shared card must not do — and netting also means the
  financing need not be disclosed at all.
- **Zakat** lets you choose whether long-term financing is deductible in full or
  only the portion due now (Settings). Both figures are shown side by side on
  the Goals page. That treatment is a fiqh question — the app reports both and
  does not rule on it.

---

## Local passcode (optional)

By default the app runs on **localhost only** (`127.0.0.1`) — nothing else on your network can
reach it, so a passcode is optional. It stops becoming optional the moment you want it on your
phone: see [Using it on your phone](#using-it-on-your-phone), which refuses to start without one.
Set one in **Settings → Security**:

- It's enforced by the **backend** — every API call needs a valid session token, so it can't be
  bypassed by hitting the API directly. The passcode is stored only as a salted **scrypt hash**.
- The app shows an **unlock screen** until you enter it, and re-locks when the server restarts.
- It does **not** encrypt the database file at rest — for that you'd add SQLCipher (not included).
  Your OS login remains the boundary for direct file access.

You can change or remove the passcode anytime in Settings, or hit **Lock now** to lock immediately.
A session lasts **14 days** by default (`SESSION_DAYS` in `.env`) and ends whenever the server
restarts, so a phone you lose stops working rather than staying unlocked indefinitely.

## Using it on your phone

Over [Tailscale](https://tailscale.com), which is a private network between your own devices
rather than an open port. Your laptop keeps the database; the phone is just a browser.

**First, on both devices:** install Tailscale and sign in to the same account. Free for personal
use. Nothing below works until the phone and laptop can see each other — check with
`tailscale status` on the laptop.

**Second, set a passcode** (Settings → Security). The server refuses to listen on anything but
localhost without one, because an address your phone can reach is an address other things can
try to reach too, and without a passcode every request gets answered.

Then pick one of two ways.

### Tailscale Serve (recommended)

Tailscale terminates HTTPS for you and forwards to the app, which stays bound to `127.0.0.1`.
The app never listens on a network interface at all — the only way in is through Tailscale's
own tunnel.

```bash
npm run build && npm start
```

In a second terminal, once per machine:

```bash
tailscale serve --bg --https=443 8787
```

Then open `https://<your-machine>.<your-tailnet>.ts.net` on your phone. `tailscale status` prints
the name. Requires **HTTPS certificates** enabled for your tailnet (admin console → **DNS** →
*Enable HTTPS*, MagicDNS on); new tailnets have it on already. `tailscale serve --https=443 off`
stops it.

Worth the extra step for two reasons: the traffic is encrypted, and because it is real HTTPS the
browser treats the page as a secure context — so **Add to Home Screen** gives you a proper
offline-capable app rather than a bookmark.

### Binding to the tailnet address directly

No HTTPS, no second terminal:

```bash
npm run phone
```

That builds the client and starts the server on this machine's own tailnet address (an IPv4 in
`100.64.0.0/10`), printing the URL to open. It refuses to start if Tailscale isn't up or no
passcode is set.

The trade-off: plain HTTP means the browser won't treat it as a secure context, so the service
worker won't register and "Add to Home Screen" is only a shortcut. The passcode still protects
the data, but the traffic itself isn't encrypted.

### Either way

- The whole app is served from the API server, so the phone needs **one** address — no Vite, no
  second port. Run `npm run build` again after changing the client.
- `SERVER_HOST=0.0.0.0` exists and is a bad idea: it puts the app on every network the laptop
  joins, including public wifi, with no HTTPS. The server warns when you use it.
- Nothing leaves your devices. There is no cloud component to any of this.

## Export & backup

**Settings → Export**:
- **.xlsx** — a rebuilt workbook (one sheet per year + Holdings).
- **.csv** — all snapshots, long format.
- **.json** — a full backup of every table.

To reset and re-seed from the workbook: `npm run seed:reset` (clears data tables, preserves
nothing but the schema, re-imports `Net Worth.xlsx` + the CSV).

---

## Checking your data

```bash
npm run check
```

Balances are typed in by hand each month, and the damage from a slip isn't a
crash — it's a decimal point in the wrong place quietly moving net worth. This
reads the database (never writes) and reports anything that looks like a
mistake: dates that aren't month-ends, missing months, and month-over-month
jumps far outside an account's own usual movement — called out specifically when
the jump is close to a factor of ten. It also notes accounts with no history at
all and a `Loan` with no funded asset recorded. It exits non-zero only for the
suspicious ones, so a clean month is a clean run.

Genuine large moves (a lump sum, closing an account, drawing financing) show up
as information, not warnings — the heuristic compares against each account's own
typical movement rather than a fixed ringgit threshold.

---

## Tests

```bash
npm test         # 96 tests on synthetic data: parser, dates, query logic, FIRE engine,
                 # API routes, data checks, passcode/session handling, phone serving
npm run test:local   # optional: ties the importer out against your own workbook (kept local, gitignored)
```

## Architecture

```
/                    npm workspaces; `npm run dev` runs both via concurrently
├─ server/           Express + better-sqlite3 (API on :8787, SERVER_PORT to override)
│   └─ src/
│      ├─ index.ts       bootstrap: picks the address, gates on a passcode, binds
│      ├─ app.ts         every route, built against any database (so tests can drive it)
│      ├─ db.ts          schema + connection
│      ├─ seed.ts        one-time importer (xlsx + csv → SQLite)
│      ├─ check.ts       `npm run check` data-integrity pass
│      ├─ phone.ts       `npm run phone` — start on the tailnet address
│      ├─ import/        workbook & positions parsers (SheetJS)
│      └─ lib/           queries, FIRE seed, exporter, passcode/sessions,
│                        address resolution (net.ts), static client (serve.ts)
├─ client/           React + Vite + TypeScript + Tailwind + Recharts (:5173, proxies /api)
├─ Net Worth.xlsx    source workbook (seeded on first run)
├─ Positions_*.csv   MooMoo export (seeded on first run)
└─ DATA_MODEL.md     parsed workbook structure + app schema
```

Data is stored in `server/data.db` (gitignored). In development the frontend talks to the backend
through a Vite proxy, so there's nothing to configure. In a production build the API server also
serves `client/dist`, which is what makes [phone access](#using-it-on-your-phone) a single
address.

---

## Notes

- **Net Worth excluding EPF** is highlighted throughout — it's the money accessible before 55.
- The importer reconciles a few quirks in the source workbook (renamed accounts, accounts that
  changed category between years) so every year-end net worth ties out exactly. See
  `DATA_MODEL.md` for the full breakdown.
- This is a personal tool for analysis and organisation — **not** financial advice.
