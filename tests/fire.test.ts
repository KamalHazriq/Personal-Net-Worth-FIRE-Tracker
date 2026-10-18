import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, sensitivity, fireNumber, solveContribution, monthlyFinancingRate, type FireInputs, type FireLiability } from '../client/src/lib/fireEngine.ts';

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

// ---- leverage: the spread decides, not the structure ----------------------
// ASB financing is a deliberate strategy: borrow at ~4% into a fund paying
// ~5-6% and keep the spread. Netting the debt off must not penalise that.
//
// The comparison has to be like-for-like on cash out of pocket: the engine
// treats a loan instalment the same way it treats a contribution — money
// arriving from income it doesn't model — so servicing the debt is only a fair
// alternative to investing that same amount directly. Hold the monthly outflow
// equal and the spread is what decides the outcome, which is the real question.

const SPREAD_BASE = {
  currentAge: 24, targetRetireAge: 45, epfUnlockAge: 55, horizonAge: 45,
  swr: 0.05, targetIncome: 15000, cashStart: 0, cashReturn: 0,
};
const MONTHLY_OUTLAY = 700;

/** Same cash out of pocket either way: service the loan, or invest it directly. */
function compareLeverage(assetReturn: number, financingRate: number, equity: number, loan: number) {
  const unlevered = project({
    ...SPREAD_BASE,
    accounts: [{ id: 1, name: 'Asset', subtype: 'ASB', is_epf: 0, startBalance: equity, monthly: MONTHLY_OUTLAY, annualReturn: assetReturn, growth: 0 }],
  });
  const levered = project({
    ...SPREAD_BASE,
    accounts: [{ id: 1, name: 'Asset', subtype: 'ASB', is_epf: 0, startBalance: equity + loan, monthly: 0, annualReturn: assetReturn, growth: 0 }],
    liabilities: [{ id: 9, name: 'Financing', subtype: 'Loan', startBalance: loan, monthlyPayment: MONTHLY_OUTLAY, annualRate: financingRate, financedAccountId: 1 }],
  });
  return { unlevered, levered };
}

test('borrowing into a higher-returning asset ends ahead', () => {
  // ASB ~5.5% funded at ~4.05%: the spread is the point of the strategy.
  const { unlevered, levered } = compareLeverage(0.055, 0.0405, 18_970.13, 99_826.58);
  assert.ok(levered.debtClearedAge != null, 'the instalment should clear the loan inside the horizon');
  assert.ok(
    levered.finalAccessible > unlevered.finalAccessible,
    `a positive spread must end ahead: levered ${levered.finalAccessible.toFixed(0)} vs unlevered ${unlevered.finalAccessible.toFixed(0)}`,
  );
});

test('borrowing into a lower-returning asset ends behind', () => {
  // The same machinery must report a negative spread honestly, or the result
  // above would just be the model flattering leverage.
  const { unlevered, levered } = compareLeverage(0.02, 0.08, 20_000, 100_000);
  assert.ok(
    levered.finalAccessible < unlevered.finalAccessible,
    `a negative spread must end behind: levered ${levered.finalAccessible.toFixed(0)} vs unlevered ${unlevered.finalAccessible.toFixed(0)}`,
  );
});

test('a cleared debt frees its instalment into the asset it funded', () => {
  const common = {
    ...SPREAD_BASE,
    accounts: [{ id: 1, name: 'Asset', subtype: 'ASB', is_epf: 0, startBalance: 50_000, monthly: 0, annualReturn: 0.05, growth: 0 }],
  };
  const loan = { id: 9, name: 'Financing', subtype: 'Loan', startBalance: 10_000, monthlyPayment: 1_000, annualRate: 0.04 };

  // Linked: once the small loan clears, RM1,000/mo starts building the asset.
  const linked = project({ ...common, liabilities: [{ ...loan, financedAccountId: 1 }] });
  // Unlinked: the instalment has nowhere to go and is simply dropped.
  const unlinked = project({ ...common, liabilities: [{ ...loan }] });

  assert.ok(linked.debtClearedAge != null && linked.debtClearedAge! < 26, 'a 10k loan at 1k/mo clears in about a year');
  assert.ok(
    linked.finalAccessible > unlinked.finalAccessible,
    `the freed instalment must keep working: linked ${linked.finalAccessible.toFixed(0)} vs unlinked ${unlinked.finalAccessible.toFixed(0)}`,
  );
  // It must not start flowing before the debt is actually gone.
  assert.ok(Math.abs(linked.points[0].accessible - unlinked.points[0].accessible) < 0.01);
});

test('financing is charged at a nominal monthly rate, so a real instalment fits its real term', () => {
  // RM100,000 at 4.05% over 40 years is an instalment of about RM421/mo. That
  // only holds if the monthly charge is annual/12 (0.3375%); taking the twelfth
  // root instead (0.3314%) under-charges interest and retires the loan over a
  // year early, which would quietly flatter every long financing.
  assert.ok(Math.abs(monthlyFinancingRate(0.0405) - 0.0405 / 12) < 1e-12);

  const over40Years = {
    currentAge: 24, targetRetireAge: 64, epfUnlockAge: 55, horizonAge: 64,
    swr: 0.05, targetIncome: 15000, cashStart: 0, cashReturn: 0,
    accounts: [{ id: 1, name: 'ASB', subtype: 'ASB', is_epf: 0, startBalance: 100_000, monthly: 0, annualReturn: 0.055, growth: 0 }],
    liabilities: [{ id: 9, name: 'ASBF', subtype: 'Loan', startBalance: 100_000, monthlyPayment: 422, annualRate: 0.0405, financedAccountId: 1 }],
  };
  const r = project(over40Years);

  // Clears within the 40-year term, but only just — not years early.
  assert.ok(r.debtClearedAge != null, 'RM422/mo should retire the loan');
  assert.ok(r.debtClearedAge! >= 62, `should take close to 40 years, got age ${r.debtClearedAge}`);
  assert.ok(r.debtClearedAge! <= 64, `should not exceed the term, got age ${r.debtClearedAge}`);

  // First-month charge is the nominal one.
  const firstMonthCharge = 100_000 * monthlyFinancingRate(0.0405);
  assert.ok(Math.abs(firstMonthCharge - 337.5) < 0.01, `expected RM337.50, got ${firstMonthCharge.toFixed(2)}`);
});
