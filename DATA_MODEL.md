# DATA_MODEL.md — Workbook structure → App schema

> Documents how the source Excel workbook (`Net Worth.xlsx`) and the MooMoo positions
> CSV are structured, and the schema the app imports them into.
>
> **Privacy note:** all monetary values, account balances and holdings in this document are
> illustrative placeholders — the real workbook and exports are gitignored and never committed.

- **Source workbook:** `Net Worth.xlsx` (filename has a **space**, not an underscore).
- **MooMoo export:** `Positions_*.csv` (UTF-8 **with BOM**, quoted fields, fractional share quantities).
- **Base currency:** MYR (RM). MooMoo holdings are USD → convert with an editable `usd_myr_rate`.
- **Hard rule:** Shariah-compliant only — the app stays neutral and never suggests interest-based products.

---

## 1. Workbook inventory

| Sheet | Type | Notes |
|---|---|---|
| `2024` | Yearly (early format) | Simpler layout — investments only, no Bank/Income/Liability split, no "w/o EPF" line. |
| `2024 v1` | Yearly (draft) | Discarded draft of 2024. **Skipped on import.** |
| `2025`, `2026` | Yearly (full format) | Bank / Income / Liability / Investment / TOTAL blocks. Account roster evolves over the year. |
| `Invest 2025`, `Invest 2026` | Investment P/L grid | 3×4 grid of month panels (Platform / Capital / Profit-Loss / Baki / P-L). |
| `CRYPTO 2025`, `CRYPTO 2026` | Crypto monthly snapshot | One row per coin; a total row that ties to the crypto platform line in the yearly sheet. |
| `SIMULATION 2026`…`2032` | Forward projection | Yearly layout, linear fixed-contribution projection (no compounding). |
| `ADVICES` | Free-text rules | Becomes the Playbook page. |
| `INSPO FOR FUTURE` | Empty | Ignored. |

---

## 2. Yearly sheet layout (full format — `2025`, `2026`)

Columns: **A** = type/category tag · **B** = account name · **C** = Dec **prev** year (opening) ·
**D–O** = Jan–Dec of the sheet year (month-end snapshots). So 13 value columns C→O.

- **Row 1:** month index (`1`…`12` over D–O).
- **Row 2:** date-header row (`C2 = <prev>-12-31`, `D2 = <year>-01-31`, … `O2 = <year>-12-31`).

Row groups (representative; exact rows shift slightly between years):

| Block | Detail |
|---|---|
| `Bank Accounts` header | row value = MoM delta of the bank subtotal |
| Bank account rows | col A type ∈ {Bank, MMF, HYSA}; col B name |
| `Subtotal - Bank Accounts` | sum of bank rows |
| `Income` header → rows → `Subtotal - Incomes` | salary + cashback lines |
| `Liabilities` header → rows → `Subtotal - Liabilities` | credit-card balances |
| `Investment Accounts` header → rows → `Subtotal - Investments` | col A category ∈ {ASB, EPF, WAHED, GOLD, CRYPTO, STOCKS, OTHERS}; an "Average Invest" figure sits off-grid in col Q |
| `TOTAL` / `Net Worth` | Bank subtotal − Liabilities + Investments; "Average Net Worth P/L" in col Q |
| `Net Worth w/o KWSP` | Net Worth − EPF balance (the early-retirement / accessible figure) |
| delta row | MoM delta of `Net Worth w/o KWSP` |

**Verified relationships** hold per month: bank/investment subtotals = sum of their rows; the
two delta rows = month-over-month change; and `Net Worth − EPF = Net Worth w/o KWSP`.

### `2024` early format
Columns shift: **C–N = Jan–Dec** (no opening "Dec prev" column); row 2 header label is `Institution`.
Single block of investment-ish accounts + a `Net Worth` row. No bank/EPF split. Imported best-effort.

---

## 3. Investment P/L grid (`Invest 2025`, `Invest 2026`)

A **3 row-blocks × 4 col-blocks** matrix of month panels. Each panel:
`Platform | Capital | Profit/Loss | Baki | P/L` over the platform rows + a `Total`.

- Col-blocks: B–F · H–L · N–R · T–X. Row-blocks: rows 5–13 · 15–23 · 25–33.
- Month → panel: `month = (rowBlockIndex + 1) + colBlockIndex × 3` (so block-col 1 rows = Jan/Feb/Mar, block-col 2 = Apr/May/Jun, …).
- `P/L` column = a **ratio** (e.g. `0.07` = +7% = Profit/Loss ÷ Capital). `Baki` = running balance.
- Months with no data are blank; a full `-100%` row with no balance is treated as a data-entry glitch and filtered.

---

## 4. Crypto monthly snapshot (`CRYPTO 2025`, `CRYPTO 2026`)

Same simple layout as a yearly block (cols B–O):
- Row 2: date headers (C = Dec prev, D–O = Jan–Dec).
- One row per coin; a total row (labelled `Crypto Worth` in one year, `Net Worth` in another) that **ties to the crypto platform line** in the yearly sheet.

---

## 5. Simulation sheets (`SIMULATION 2026` … `2032`)

Yearly layout, **forward-projected with fixed monthly contributions and NO compounding** (linear):
investment accounts grow by a fixed monthly amount; banks held flat. The app keeps the
contribution amounts as **seed defaults** but replaces the math with a proper compounding engine.

---

## 6. MooMoo positions CSV (`Positions_*.csv`)

UTF-8-BOM, quoted, one row per holding, all USD. Header columns (verbatim):

`Symbol, Name, Quantity, Available QTY, Current price, Average Cost, Market Value,
% Unrealized P/L, Total P/L, Unrealized P/L, Realized P/L, Today's P/L, % of Portfolio,
Currency, Today's Turnover, Today's Purchase@Avg Price, Today's Sales@Avg Price`

- Numbers use thousands separators (`1,159.34`), signed percents (`+25.00%`), and `--` for empty.
- The snapshot date is parsed from the filename (`Positions_15_6_2026.csv` → `2026-06-15`).
- ETFs are pre-tagged; everything else defaults to "Individual" (editable, persists per symbol).
- A sanitized 3-row sample lives at `tests/fixtures/sample-positions.csv`.

---

## 7. Known quirks / gotchas (importer handles these)

1. Filename has a space — `Net Worth.xlsx`.
2. Some date-header rows are stale (copy-paste artifacts) — trust **column position**, not the header text.
3. **Account roster drifts year-to-year**, and some accounts **change category** (e.g. a cash product
   tracked as "Bank" one year and "Stocks" the next). Bank↔Investment drift is reconciled to one account
   by name; Income vs Liability keep separate namespaces (so a card that is both a cashback line and a
   credit-card balance stays as two accounts).
4. Some accounts were **renamed** between years; a small alias map merges them so history is continuous.
5. `2024` uses a different column-shifted layout; `2024 v1` is a dead draft (skipped).
6. **Future months are `0`, not blank** — treated as "no data", not a real RM0 snapshot.
7. The shared year-boundary date (Dec 31) is written by two sheets; the importer dedups so net worth
   isn't double-counted at boundaries.
8. SheetJS trims leading empty columns — the importer forces every sheet's range to start at A1 so
   column indices line up across sheets.
9. Read with computed values (`data_only` / buffer read) so formulas come through evaluated.

---

## 8. App schema (SQLite, local-first)

```
settings              base_currency, usd_myr_rate, current_age, target_retire_age,
                      epf_unlock_age, fire_target_monthly_income, swr, assistant_model, web_search_enabled

accounts              id, name, category (Bank|Income|Liability|Investment),
                      subtype (Bank|MMF|HYSA|ASB|EPF|Wahed|Gold|Crypto|Stocks|Other|CreditCard|Cashback|Salary),
                      currency, is_epf, is_liquid, shariah_ok, sort_order, active
                      UNIQUE(name, category)

snapshots             account_id, date (month-end), value           PK(account_id, date)
investments           platform, month, capital, profit_loss, balance  PK(platform, month)
crypto_holdings       coin, month, value                              PK(coin, month)

positions_snapshots   id, import_date (append-by-date history)
positions             snapshot_id, symbol, name, quantity, avg_cost, current_price,
                      market_value, unrealized_pl, pct_unrealized_pl, total_pl, pct_portfolio, currency
symbol_tags           symbol PK, asset_class (ETF|Individual), sub_tag

contributions         account_id PK, monthly_amount, annual_return_rate, annual_contribution_growth_rate
scenarios             id, name, params_json
playbook_rules        id, title, body, sort_order
goals                 id, label, target_json
reviews               id, date, summary
assistant_log         id, ts, question, answer, used_web_search
```

### Derived in code (never stored)
- Net Worth = Σ bank + Σ investment − Σ liability.
- Net Worth excl. EPF = Net Worth − EPF value (the accessible / early-retirement money).
- MoM deltas, average growth/invested, allocation %, P/L%, FIRE number/age, drift, savings rate.

---

## 9. Import plan (priority order)

1. `2026` + `Invest 2026` + `CRYPTO 2026` first (cleanest, current).
2. Then `2025` + its crypto/invest sheets.
3. Then `2024` (best-effort, early layout).
4. Simulation sheets → contribution defaults only (engine regenerates projections).
5. `ADVICES` → playbook rules.
6. MooMoo CSV → positions snapshot (append by date).
7. Skip `2024 v1`, `INSPO FOR FUTURE`.

The importer's tie-out (net worth at the latest month matching the workbook) is verified by a
local-only test (`npm run test:local`, gitignored) so it can assert against the real numbers
without committing them.
