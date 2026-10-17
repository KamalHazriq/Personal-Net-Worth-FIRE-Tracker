import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, sensitivity, fireNumber, solveContribution, type FireInputs, type FireLiability } from '../client/src/lib/fireEngine.ts';

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

// ---- debts ---------------------------------------------------------------
// Borrowed money inflates the asset side (ASB financing raises the ASB balance
// by the loan), so the projection has to carry the obligation too.

const loan = (over: Partial<FireLiability> = {}): FireLiability => ({
  id: 9, name: 'ASBF', subtype: 'Loan',
  startBalance: 100_000, monthlyPayment: 0, annualRate: 0, ...over,
});

test('a debt is subtracted from both total and accessible net worth', () => {
  const without = project(base);
  const withDebt = project({ ...base, liabilities: [loan()] });
  assert.equal(withDebt.startDebt, 100_000);
  assert.ok(Math.abs((without.finalTotal - 100_000) - withDebt.finalTotal) < 0.01);
  assert.ok(Math.abs((without.finalAccessible - 100_000) - withDebt.finalAccessible) < 0.01);
  // gross is still reported so the UI can show both sides
  assert.ok(Math.abs(withDebt.points[0].grossTotal - without.points[0].total) < 0.01);
});

test('with no instalment the balance is carried flat, not grown or wished away', () => {
  const r = project({ ...base, liabilities: [loan({ annualRate: 0.0405 })] });
  assert.equal(r.points[r.points.length - 1].debt, 100_000);
  assert.equal(r.debtClearedAge, null);
});

test('an instalment above the financing charge amortises the debt to zero', () => {
  // 100k at 4.05% costs ~RM331/mo in profit; RM1,000 clears it well inside the horizon.
  const r = project({ ...base, liabilities: [loan({ annualRate: 0.0405, monthlyPayment: 1000 })] });
  assert.ok(r.debtClearedAge != null);
  assert.ok(r.debtClearedAge! > base.currentAge && r.debtClearedAge! < base.horizonAge);
  assert.equal(r.points[r.points.length - 1].debt, 0);
});

test('an instalment below the financing charge never clears the debt', () => {
  // RM100/mo against a ~RM331/mo charge: the balance must not drift down.
  const r = project({ ...base, liabilities: [loan({ annualRate: 0.0405, monthlyPayment: 100 })] });
  assert.equal(r.debtClearedAge, null);
  assert.ok(r.points[r.points.length - 1].debt >= 100_000);
});

test('debt delays the FIRE age rather than being ignored', () => {
  const clean = project({ ...base, targetIncome: 5000 });
  const levered = project({ ...base, targetIncome: 5000, liabilities: [loan()] });
  const age = (x: number | null) => (x == null ? Infinity : x);
  assert.ok(age(levered.fireAgeAccessible) >= age(clean.fireAgeAccessible));
});

test('an excluded debt is left out of the projection', () => {
  const r = project({ ...base, liabilities: [loan({ excluded: true })] });
  assert.equal(r.startDebt, 0);
  assert.equal(r.points[0].debt, 0);
});
