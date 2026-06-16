import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, sensitivity, fireNumber, solveContribution, type FireInputs } from '../client/src/lib/fireEngine.ts';

const base: FireInputs = {
  currentAge: 24,
  targetRetireAge: 45,
  epfUnlockAge: 55,
  horizonAge: 60,
  swr: 0.04,
  targetIncome: 10000,
  cashStart: 13000,
  cashReturn: 0,
  accounts: [
    { id: 1, name: 'Stocks', subtype: 'Stocks', is_epf: 0, startBalance: 60000, monthly: 1500, annualReturn: 0.1, growth: 0 },
    { id: 2, name: 'EPF', subtype: 'EPF', is_epf: 1, startBalance: 17000, monthly: 1273, annualReturn: 0.055, growth: 0 },
  ],
};

test('FIRE number = income*12 / SWR', () => {
  assert.equal(fireNumber(10000, 0.04), 3_000_000);
  assert.equal(fireNumber(5000, 0.04), 1_500_000);
});

test('projection compounds upward and excludes EPF from accessible', () => {
  const r = project(base);
  assert.ok(r.finalAccessible > base.cashStart);
  assert.ok(r.finalTotal > r.finalAccessible); // EPF makes total > accessible
  assert.ok(r.finalEpf > 0);
});

test('higher returns → more wealth and earlier (or equal) FIRE age', () => {
  const s = sensitivity(base, [0.1, 0.12, 0.15]);
  assert.ok(s[1].finalAccessible > s[0].finalAccessible);
  assert.ok(s[2].finalAccessible > s[1].finalAccessible);
  const age = (x: number | null) => (x == null ? Infinity : x);
  assert.ok(age(s[1].fireAge) <= age(s[0].fireAge));
  assert.ok(age(s[2].fireAge) <= age(s[1].fireAge));
});

test('reverse solver: higher return needs less contribution', () => {
  const fn = fireNumber(10000, 0.04);
  const r10 = solveContribution(73000, 0.1, 24, 45, fn);
  const r15 = solveContribution(73000, 0.15, 24, 45, fn);
  assert.ok(r10 != null && r15 != null);
  assert.ok((r15 as number) < (r10 as number));
});
