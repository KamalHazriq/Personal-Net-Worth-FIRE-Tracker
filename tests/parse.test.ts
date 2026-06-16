import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePositionsText, dateFromFilename } from '../server/src/import/parsePositions.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(join(here, 'fixtures', 'sample-positions.csv'), 'utf8');

test('parses all holdings from a MooMoo-format export', () => {
  const { rows } = parsePositionsText(sampleCsv, '2026-01-01');
  assert.equal(rows.length, 3);
});

test('handles quoted fields (incl. commas in name), thousands separators and signed percents', () => {
  const { rows } = parsePositionsText(sampleCsv, '2026-01-01');
  const acme = rows.find((r) => r.symbol === 'ACME')!;
  assert.equal(acme.name, 'Acme Corp, Inc.'); // comma inside quotes preserved
  assert.equal(acme.market_value, 1500); // from quoted "1,500.00"
  assert.equal(acme.pct_unrealized_pl, 25); // "+25.00%"
  const widg = rows.find((r) => r.symbol === 'WIDG')!;
  assert.equal(widg.pct_unrealized_pl, -16.67); // negative percent
});

test('tolerates a BOM and maps "--" to null', () => {
  const tiny =
    '﻿"Symbol","Name","Quantity","Available QTY","Current price","Average Cost","Market Value","% Unrealized P/L","Total P/L","Unrealized P/L","Realized P/L","Today\'s P/L","% of Portfolio","Currency"\n' +
    '"ZZZ","Test Co","--","0","10.00","8.00","20.00","+25.00%","+4.00","+4.00","0.00","0.00","1.00%","USD"\n';
  const { rows } = parsePositionsText(tiny, '2026-01-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, null); // "--" -> null
  assert.equal(rows[0].current_price, 10);
  assert.equal(rows[0].pct_unrealized_pl, 25);
});

test('empty / header-only input yields no rows', () => {
  assert.equal(parsePositionsText('', '2026-01-01').rows.length, 0);
});

test('derives the snapshot date from the filename', () => {
  assert.equal(dateFromFilename('Positions_15_6_2026.csv', 'x'), '2026-06-15');
  assert.equal(dateFromFilename('Positions_2026-06-15.csv', 'x'), '2026-06-15');
  assert.equal(dateFromFilename('weird.csv', '2026-01-01'), '2026-01-01');
});
