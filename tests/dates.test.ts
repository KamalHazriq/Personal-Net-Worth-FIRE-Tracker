import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthEnd, monthStart, ymFromCell } from '../server/src/lib/dates.ts';

test('monthEnd handles leap years and month lengths', () => {
  assert.equal(monthEnd(2024, 2), '2024-02-29'); // leap
  assert.equal(monthEnd(2026, 2), '2026-02-28'); // non-leap
  assert.equal(monthEnd(2026, 4), '2026-04-30');
  assert.equal(monthEnd(2026, 12), '2026-12-31');
  assert.equal(monthEnd(2025, 1), '2025-01-31');
});

test('monthStart formats the first of the month', () => {
  assert.equal(monthStart(2026, 1), '2026-01-01');
  assert.equal(monthStart(2026, 9), '2026-09-01');
});

test('ymFromCell extracts year/month from Date and string', () => {
  assert.deepEqual(ymFromCell(new Date(Date.UTC(2026, 0, 31))), { year: 2026, month: 1 });
  assert.deepEqual(ymFromCell('2026-03-31'), { year: 2026, month: 3 });
  assert.equal(ymFromCell(null), null);
});
