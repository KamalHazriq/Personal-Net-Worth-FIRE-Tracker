import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { join } from 'node:path';
import { openDb, initSchema, PROJECT_ROOT } from './db.js';
import { seed } from './seed.js';
import { buildContext, callAnthropic } from './lib/assistant.js';
import { exportJson, exportSnapshotsCsv, exportXlsxBuffer } from './lib/exporter.js';

// Load .env from project root first, then server dir / cwd as fallback.
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
dotenv.config();
import {
  getSettings,
  netWorthSeries,
  latestAllocation,
  dashboardSummary,
  investmentsSummary,
  gridForYear,
  investmentsGrid,
  cryptoSeries,
  holdingsLatest,
  holdingsSeries,
  fireSeed,
  driftAlerts,
  monthlyReviewSummary,
} from './lib/queries.js';
import { parsePositionsText } from './import/parsePositions.js';
import { storePositionsSnapshot } from './import/positions.js';

// Use SERVER_PORT (not PORT) so external launchers that inject PORT for the
// frontend don't accidentally rebind the API onto the client's port.
const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 8787;

const db = openDb();
initSchema(db);

// Auto-seed on first run if the DB is empty.
const empty = (db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c === 0;
if (empty) {
  console.log('Empty DB detected — seeding from workbook…');
  seed({ reset: false });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const num = (v: any, fallback: number | null): number | null => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Settings ----
app.get('/api/settings', (_req, res) => res.json(getSettings(db)));
app.put('/api/settings', (req, res) => {
  const allowed = [
    'usd_myr_rate',
    'current_age',
    'target_retire_age',
    'epf_unlock_age',
    'fire_target_monthly_income',
    'swr',
    'assistant_model',
    'web_search_enabled',
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k}=?`);
      vals.push(req.body[k]);
    }
  }
  if (sets.length) db.prepare(`UPDATE settings SET ${sets.join(',')} WHERE id=1`).run(...vals);
  res.json(getSettings(db));
});

// ---- Accounts ----
app.get('/api/accounts', (_req, res) => {
  res.json(db.prepare('SELECT * FROM accounts ORDER BY category, sort_order').all());
});

app.post('/api/accounts', (req, res) => {
  const { name, category, subtype = null, is_epf = 0, is_liquid = 1, currency = 'MYR' } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });
  const order =
    (db.prepare('SELECT MAX(sort_order) m FROM accounts WHERE category=?').get(category) as any)?.m ??
    0;
  try {
    const info = db
      .prepare(
        `INSERT INTO accounts (name, category, subtype, is_epf, is_liquid, currency, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(name, category, subtype, is_epf ? 1 : 0, is_liquid ? 1 : 0, currency, order + 1);
    res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(info.lastInsertRowid));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields = ['name', 'category', 'subtype', 'is_epf', 'is_liquid', 'currency', 'sort_order'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (f in req.body) {
      sets.push(`${f}=?`);
      vals.push(f === 'is_epf' || f === 'is_liquid' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (!sets.length) return res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(id));
  try {
    db.prepare(`UPDATE accounts SET ${sets.join(',')} WHERE id=?`).run(...vals, id);
    res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(id));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Grid + cell editing ----
app.get('/api/grid', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(gridForYear(db, year));
});

app.put('/api/snapshots', (req, res) => {
  const { account_id, date } = req.body;
  let { value } = req.body;
  if (!account_id || !date) return res.status(400).json({ error: 'account_id and date required' });
  if (value === '' || value === null || value === undefined || isNaN(Number(value))) {
    db.prepare('DELETE FROM snapshots WHERE account_id=? AND date=?').run(account_id, date);
    return res.json({ ok: true, deleted: true });
  }
  db.prepare(
    `INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)
     ON CONFLICT(account_id, date) DO UPDATE SET value=excluded.value`,
  ).run(account_id, date, Number(value));
  res.json({ ok: true });
});

// ---- Net worth + dashboard ----
app.get('/api/networth/series', (_req, res) => res.json(netWorthSeries(db)));
app.get('/api/allocation', (_req, res) => res.json(latestAllocation(db)));
app.get('/api/dashboard', (_req, res) => res.json(dashboardSummary(db)));
app.get('/api/investments/summary', (_req, res) => res.json(investmentsSummary(db)));

// ---- Investments P/L + Crypto ----
app.get('/api/investments', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(investmentsGrid(db, year));
});
app.get('/api/crypto', (_req, res) => res.json(cryptoSeries(db)));

// ---- Holdings (MooMoo positions) ----
app.get('/api/positions/latest', (_req, res) => res.json(holdingsLatest(db)));
app.get('/api/holdings', (_req, res) => res.json(holdingsLatest(db)));
app.get('/api/holdings/series', (_req, res) => res.json(holdingsSeries(db)));
app.get('/api/positions/snapshots', (_req, res) =>
  res.json(db.prepare('SELECT * FROM positions_snapshots ORDER BY import_date DESC').all()),
);

app.post('/api/positions/import', (req, res) => {
  const { csv, date } = req.body || {};
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text required' });
  const parsed = parsePositionsText(csv, date || new Date().toISOString().slice(0, 10));
  if (!parsed.rows.length) return res.status(400).json({ error: 'no positions parsed from CSV' });
  const r = storePositionsSnapshot(db, parsed.importDate, parsed.rows, 'pasted/upload');
  res.json({ ok: true, ...r });
});

app.patch('/api/positions/:id', (req, res) => {
  const id = Number(req.params.id);
  const pos = db.prepare('SELECT * FROM positions WHERE id=?').get(id) as any;
  if (!pos) return res.status(404).json({ error: 'not found' });
  const quantity = num(req.body.quantity, pos.quantity);
  const avg_cost = num(req.body.avg_cost, pos.avg_cost);
  const current_price = num(req.body.current_price, pos.current_price);
  const market_value = quantity != null && current_price != null ? quantity * current_price : pos.market_value;
  const unrealized_pl =
    quantity != null && current_price != null && avg_cost != null
      ? (current_price - avg_cost) * quantity
      : pos.unrealized_pl;
  const pct_unrealized_pl = avg_cost ? ((current_price - avg_cost) / avg_cost) * 100 : pos.pct_unrealized_pl;
  db.prepare(
    `UPDATE positions SET quantity=?, avg_cost=?, current_price=?, market_value=?, unrealized_pl=?, pct_unrealized_pl=? WHERE id=?`,
  ).run(quantity, avg_cost, current_price, market_value, unrealized_pl, pct_unrealized_pl, id);
  // recompute % of portfolio across the snapshot
  const total = (db.prepare('SELECT SUM(market_value) t FROM positions WHERE snapshot_id=?').get(pos.snapshot_id) as any).t || 0;
  if (total) {
    const all = db.prepare('SELECT id, market_value FROM positions WHERE snapshot_id=?').all(pos.snapshot_id) as any[];
    const upd = db.prepare('UPDATE positions SET pct_portfolio=? WHERE id=?');
    const tx = db.transaction(() => {
      for (const p of all) upd.run((p.market_value / total) * 100, p.id);
    });
    tx();
  }
  res.json({ ok: true });
});

app.put('/api/symbol-tags/:symbol', (req, res) => {
  const symbol = req.params.symbol;
  const { asset_class, sub_tag } = req.body || {};
  const cur = db.prepare('SELECT * FROM symbol_tags WHERE symbol=?').get(symbol) as any;
  const asset = asset_class ?? cur?.asset_class ?? 'Individual';
  const sub = sub_tag !== undefined ? sub_tag || null : (cur?.sub_tag ?? null);
  db.prepare(
    `INSERT INTO symbol_tags (symbol, asset_class, sub_tag) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET asset_class=excluded.asset_class, sub_tag=excluded.sub_tag`,
  ).run(symbol, asset, sub);
  res.json({ ok: true });
});

// Push the latest MooMoo total (converted to MYR) into a month-end snapshot for
// the MooMoo investment account.
app.post('/api/holdings/push-to-networth', (req, res) => {
  const h = holdingsLatest(db) as any;
  if (!h.snapshot) return res.status(400).json({ error: 'no positions imported' });
  const acc = db
    .prepare(`SELECT id FROM accounts WHERE name='MooMoo' AND category='Investment'`)
    .get() as any;
  if (!acc) return res.status(404).json({ error: 'MooMoo investment account not found' });
  // target month-end: provided date, else latest tracked snapshot month
  let date = req.body?.date as string | undefined;
  if (!date) {
    date = (db.prepare('SELECT MAX(date) d FROM snapshots').get() as any)?.d;
  }
  const valueMyr = Math.round(h.summary.totalMV_myr * 100) / 100;
  db.prepare(
    `INSERT INTO snapshots (account_id, date, value) VALUES (?,?,?)
     ON CONFLICT(account_id, date) DO UPDATE SET value=excluded.value`,
  ).run(acc.id, date, valueMyr);
  res.json({ ok: true, date, value: valueMyr });
});

// ---- FIRE simulation ----
app.get('/api/fire/seed', (_req, res) => res.json(fireSeed(db)));

app.patch('/api/contributions/:accountId', (req, res) => {
  const id = Number(req.params.accountId);
  const cur = db.prepare('SELECT * FROM contributions WHERE account_id=?').get(id) as any;
  const monthly = num(req.body.monthly_amount, cur?.monthly_amount ?? 0)!;
  const ret = num(req.body.annual_return_rate, cur?.annual_return_rate ?? 0)!;
  const growth = num(req.body.annual_contribution_growth_rate, cur?.annual_contribution_growth_rate ?? 0)!;
  db.prepare(
    `INSERT INTO contributions (account_id, monthly_amount, annual_return_rate, annual_contribution_growth_rate)
     VALUES (?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET
       monthly_amount=excluded.monthly_amount,
       annual_return_rate=excluded.annual_return_rate,
       annual_contribution_growth_rate=excluded.annual_contribution_growth_rate`,
  ).run(id, monthly, ret, growth);
  res.json({ ok: true });
});

app.get('/api/scenarios', (_req, res) =>
  res.json(db.prepare('SELECT * FROM scenarios ORDER BY created_at').all()),
);
app.post('/api/scenarios', (req, res) => {
  const { name, params_json } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db
    .prepare('INSERT INTO scenarios (name, params_json) VALUES (?, ?)')
    .run(name, typeof params_json === 'string' ? params_json : JSON.stringify(params_json ?? {}));
  res.json(db.prepare('SELECT * FROM scenarios WHERE id=?').get(info.lastInsertRowid));
});
app.delete('/api/scenarios/:id', (req, res) => {
  db.prepare('DELETE FROM scenarios WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Playbook ----
app.get('/api/playbook', (_req, res) => {
  res.json(db.prepare('SELECT * FROM playbook_rules ORDER BY sort_order').all());
});
app.post('/api/playbook', (req, res) => {
  const { title, body } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const order = ((db.prepare('SELECT MAX(sort_order) m FROM playbook_rules').get() as any)?.m ?? 0) + 1;
  const info = db.prepare('INSERT INTO playbook_rules (title, body, sort_order) VALUES (?,?,?)').run(title, body || '', order);
  res.json(db.prepare('SELECT * FROM playbook_rules WHERE id=?').get(info.lastInsertRowid));
});
app.patch('/api/playbook/:id', (req, res) => {
  const { title, body } = req.body || {};
  const cur = db.prepare('SELECT * FROM playbook_rules WHERE id=?').get(Number(req.params.id)) as any;
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE playbook_rules SET title=?, body=? WHERE id=?').run(title ?? cur.title, body ?? cur.body, cur.id);
  res.json(db.prepare('SELECT * FROM playbook_rules WHERE id=?').get(cur.id));
});
app.delete('/api/playbook/:id', (req, res) => {
  db.prepare('DELETE FROM playbook_rules WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Export ----
app.get('/api/export/json', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="networth-export.json"');
  res.json(exportJson(db));
});
app.get('/api/export/csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="networth-snapshots.csv"');
  res.send(exportSnapshotsCsv(db));
});
app.get('/api/export/xlsx', (_req, res) => {
  const buf = exportXlsxBuffer(db);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="networth-export.xlsx"');
  res.send(buf);
});

// ---- Companion: goals, drift, monthly review ----
app.get('/api/goals', (_req, res) => res.json(db.prepare('SELECT * FROM goals ORDER BY created_at').all()));
app.post('/api/goals', (req, res) => {
  const { label, target_json } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label required' });
  const info = db
    .prepare('INSERT INTO goals (label, target_json) VALUES (?, ?)')
    .run(label, typeof target_json === 'string' ? target_json : JSON.stringify(target_json ?? {}));
  res.json(db.prepare('SELECT * FROM goals WHERE id=?').get(info.lastInsertRowid));
});
app.patch('/api/goals/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM goals WHERE id=?').get(Number(req.params.id)) as any;
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { label, target_json } = req.body || {};
  db.prepare('UPDATE goals SET label=?, target_json=? WHERE id=?').run(
    label ?? cur.label,
    target_json ? (typeof target_json === 'string' ? target_json : JSON.stringify(target_json)) : cur.target_json,
    cur.id,
  );
  res.json(db.prepare('SELECT * FROM goals WHERE id=?').get(cur.id));
});
app.delete('/api/goals/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/drift', (_req, res) => res.json(driftAlerts(db)));

app.get('/api/reviews', (_req, res) => res.json(db.prepare('SELECT * FROM reviews ORDER BY date DESC').all()));
app.post('/api/reviews', async (req, res) => {
  const r = monthlyReviewSummary(db);
  let summary = r.summary;
  // optional Claude interpretation if a key is configured
  if (process.env.ANTHROPIC_API_KEY && req.body?.interpret !== false) {
    const settings = getSettings(db) as any;
    const out = await callAnthropic({
      model: settings.assistant_model,
      question:
        'This is my computed monthly review. In 2-3 short sentences, interpret what changed and surface 2-3 things worth my attention. Do not invent numbers; only use what is given.\n\n' +
        r.summary,
      context: buildContext(db),
      useWebSearch: false,
    });
    if (out.ok && out.text) summary = r.summary + '\n\n— Assistant —\n' + out.text;
  }
  const info = db.prepare('INSERT INTO reviews (date, summary) VALUES (?, ?)').run(r.date || new Date().toISOString().slice(0, 10), summary);
  res.json(db.prepare('SELECT * FROM reviews WHERE id=?').get(info.lastInsertRowid));
});

// ---- AI Assistant ----
app.get('/api/assistant/status', (_req, res) => {
  const settings = getSettings(db) as any;
  res.json({
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    model: settings.assistant_model,
    webSearch: !!settings.web_search_enabled,
  });
});
app.get('/api/assistant/context', (_req, res) => res.json(buildContext(db)));
app.get('/api/assistant/log', (_req, res) =>
  res.json(db.prepare('SELECT * FROM assistant_log ORDER BY ts DESC LIMIT 100').all()),
);
app.post('/api/assistant/chat', async (req, res) => {
  const { question, useWebSearch } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question required' });
  const settings = getSettings(db) as any;
  const context = buildContext(db);
  const result = await callAnthropic({
    model: settings.assistant_model,
    question,
    context,
    useWebSearch: useWebSearch ?? !!settings.web_search_enabled,
  });
  if (result.ok) {
    db.prepare('INSERT INTO assistant_log (question, answer, used_web_search) VALUES (?,?,?)').run(
      question,
      result.text,
      result.usedWebSearch ? 1 : 0,
    );
  }
  res.json(result);
});

// Bind to localhost only — this serves your full financial data with no auth,
// so it must not be reachable from other machines on the network.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});
