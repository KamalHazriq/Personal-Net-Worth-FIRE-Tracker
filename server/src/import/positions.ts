import type Database from 'better-sqlite3';
import type { ParsedPosition } from './parsePositions.js';
import { KNOWN_ETFS } from './maps.js';

/** Upsert a dated positions snapshot (append-by-date; replaces rows for that date). */
export function storePositionsSnapshot(
  db: Database.Database,
  importDate: string,
  rows: ParsedPosition[],
  source?: string,
) {
  const snapId = (
    db
      .prepare(
        `INSERT INTO positions_snapshots (import_date, source) VALUES (?, ?)
         ON CONFLICT(import_date) DO UPDATE SET source=excluded.source RETURNING id`,
      )
      .get(importDate, source ?? null) as any
  ).id;

  const insPos = db.prepare(
    `INSERT INTO positions
     (snapshot_id, symbol, name, quantity, avg_cost, current_price, market_value,
      unrealized_pl, pct_unrealized_pl, total_pl, pct_portfolio, currency)
     VALUES (@snapshot_id, @symbol, @name, @quantity, @avg_cost, @current_price, @market_value,
      @unrealized_pl, @pct_unrealized_pl, @total_pl, @pct_portfolio, @currency)`,
  );
  const insTag = db.prepare(
    `INSERT INTO symbol_tags (symbol, asset_class) VALUES (?, ?)
     ON CONFLICT(symbol) DO NOTHING`,
  );

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM positions WHERE snapshot_id=?`).run(snapId);
    for (const r of rows) {
      insPos.run({ snapshot_id: snapId, ...r });
      insTag.run(r.symbol, KNOWN_ETFS.has(r.symbol.toUpperCase()) ? 'ETF' : 'Individual');
    }
  });
  tx();
  return { snapId, count: rows.length, importDate };
}
