export interface FireAccount {
  id: number;
  name: string;
  subtype: string;
  is_epf: number;
  startBalance: number;
  monthly: number;
  annualReturn: number; // 0.12 = 12%
  growth: number; // annual contribution growth
  excluded?: boolean; // toggle off for simulation
}

/**
 * A debt carried alongside the portfolio. Borrowed money inflates the asset
 * side (e.g. ASB financing raises the ASB balance by the loan amount), so the
 * projection has to carry the obligation too or it compounds money you owe.
 *
 * With `monthlyPayment` and `annualRate` left at 0 the balance simply stays
 * flat — a deliberately neutral default, since guessing someone's loan terms
 * would be worse than showing the debt as unchanged until they enter them.
 */
export interface FireLiability {
  id: number;
  name: string;
  subtype: string;
  startBalance: number;   // outstanding today
  monthlyPayment: number; // total instalment (profit + principal)
  annualRate: number;     // financing rate, 0.0405 = 4.05%
  excluded?: boolean;
}

export interface FireInputs {
  currentAge: number;
  targetRetireAge: number;
  epfUnlockAge: number;
  horizonAge: number;
  swr: number;
  targetIncome: number; // RM / month
  cashStart: number;
  cashReturn: number;
  accounts: FireAccount[];
  liabilities?: FireLiability[];
}

export interface YearPoint {
  age: number;
  total: number;       // net of debt
  accessible: number;  // net of debt, excluding EPF
  epf: number;
  debt: number;        // outstanding at this point
  grossTotal: number;  // before netting debt off
}

export interface FireResult {
  points: YearPoint[];
  fireNumber: number;
  fireAgeAccessible: number | null;
  finalTotal: number;
  finalAccessible: number;
  finalEpf: number;
  atTarget: YearPoint | null;
  monthlyIncomeAtTarget: number;
  startDebt: number;
  debtClearedAge: number | null; // null if still outstanding at the horizon
}

const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

export function fireNumber(targetIncome: number, swr: number): number {
  return swr > 0 ? (targetIncome * 12) / swr : Infinity;
}

export function project(inp: FireInputs): FireResult {
  const months = Math.max(0, Math.round((inp.horizonAge - inp.currentAge) * 12));
  const balances = inp.accounts.map((a) => a.startBalance);
  const rates = inp.accounts.map((a) => monthlyRate(a.annualReturn));
  let cash = inp.cashStart;
  const cashM = monthlyRate(inp.cashReturn);

  const debts = (inp.liabilities ?? []).filter((l) => !l.excluded);
  const debtBal = debts.map((l) => l.startBalance);
  const debtRates = debts.map((l) => monthlyRate(l.annualRate));
  const startDebt = debtBal.reduce((a, b) => a + b, 0);
  let debtClearedAge: number | null = startDebt === 0 ? inp.currentAge : null;

  const points: YearPoint[] = [];
  const record = (m: number) => {
    let gross = cash;
    let epf = 0;
    inp.accounts.forEach((a, i) => {
      gross += balances[i];
      if (a.is_epf) epf += balances[i];
    });
    const debt = debtBal.reduce((a, b) => a + b, 0);
    const total = gross - debt;
    points.push({
      age: Math.round(inp.currentAge + m / 12),
      total,
      accessible: total - epf,
      epf,
      debt,
      grossTotal: gross,
    });
  };

  record(0);
  for (let m = 1; m <= months; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    cash = cash * (1 + cashM);
    inp.accounts.forEach((a, i) => {
      const isExcluded = !!a.excluded;
      const contrib = isExcluded ? 0 : a.monthly * Math.pow(1 + a.growth, yearIndex);
      const rate = isExcluded ? 0 : rates[i];
      balances[i] = balances[i] * (1 + rate) + contrib;
    });
    // Amortise each debt: accrue the financing charge, then apply the instalment.
    // A payment that never exceeds the charge leaves the balance standing, which
    // is the honest outcome rather than a hidden payoff.
    //
    // With no instalment entered we carry the balance FLAT rather than accruing.
    // Compounding an unpaid loan for decades would project a debt nobody is
    // actually letting run, so "terms not entered yet" shows as unchanged.
    debts.forEach((_, i) => {
      if (debtBal[i] <= 0) return;
      if (debts[i].monthlyPayment <= 0) return;
      debtBal[i] = Math.max(0, debtBal[i] * (1 + debtRates[i]) - debts[i].monthlyPayment);
    });
    if (debtClearedAge === null && debtBal.every((b) => b <= 0)) {
      debtClearedAge = Math.round(inp.currentAge + m / 12);
    }
    if (m % 12 === 0) record(m);
  }

  const fn = fireNumber(inp.targetIncome, inp.swr);
  const fireAge = points.find((p) => p.accessible >= fn)?.age ?? null;
  const atTarget = points.find((p) => p.age === inp.targetRetireAge) ?? null;
  const last = points[points.length - 1];

  return {
    points,
    fireNumber: fn,
    fireAgeAccessible: fireAge,
    finalTotal: last.total,
    finalAccessible: last.accessible,
    finalEpf: last.epf,
    atTarget,
    monthlyIncomeAtTarget: atTarget ? (atTarget.accessible * inp.swr) / 12 : 0,
    startDebt,
    debtClearedAge,
  };
}

/** Final accessible NW + FIRE age when all non-EPF accounts earn `r`. */
export function sensitivity(inp: FireInputs, rates: number[]): { rate: number; finalAccessible: number; fireAge: number | null }[] {
  return rates.map((r) => {
    const accounts = inp.accounts.map((a) => (a.is_epf ? a : { ...a, annualReturn: r }));
    const res = project({ ...inp, accounts });
    return { rate: r, finalAccessible: res.finalAccessible, fireAge: res.fireAgeAccessible };
  });
}

function futureValue(start: number, monthly: number, annualReturn: number, months: number, growth: number): number {
  let bal = start;
  const mr = monthlyRate(annualReturn);
  for (let i = 1; i <= months; i++) {
    const y = Math.floor((i - 1) / 12);
    bal = bal * (1 + mr) + monthly * Math.pow(1 + growth, y);
  }
  return bal;
}

/**
 * Required extra monthly contribution into the accessible (non-EPF) growth pool
 * to reach the FIRE number by `targetAge`, at a given return assumption.
 * Returns null if unreachable within a sane bound.
 */
export function solveContribution(
  accessibleStart: number,
  annualReturn: number,
  currentAge: number,
  targetAge: number,
  target: number,
  growth = 0,
): number | null {
  const months = Math.max(0, Math.round((targetAge - currentAge) * 12));
  if (months === 0) return accessibleStart >= target ? 0 : null;
  if (futureValue(accessibleStart, 0, annualReturn, months, growth) >= target) return 0;
  let lo = 0;
  let hi = 1_000_000;
  if (futureValue(accessibleStart, hi, annualReturn, months, growth) < target) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (futureValue(accessibleStart, mid, annualReturn, months, growth) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}
