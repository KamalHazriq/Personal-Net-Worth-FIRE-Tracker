export interface FireAccount {
  id: number;
  name: string;
  subtype: string;
  is_epf: number;
  startBalance: number;
  monthly: number;
  annualReturn: number; // 0.12 = 12%
  growth: number; // annual contribution growth
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
}

export interface YearPoint {
  age: number;
  total: number;
  accessible: number;
  epf: number;
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
  const points: YearPoint[] = [];

  const record = (m: number) => {
    let total = cash;
    let epf = 0;
    inp.accounts.forEach((a, i) => {
      total += balances[i];
      if (a.is_epf) epf += balances[i];
    });
    points.push({ age: Math.round(inp.currentAge + m / 12), total, accessible: total - epf, epf });
  };

  record(0);
  for (let m = 1; m <= months; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    cash = cash * (1 + cashM);
    inp.accounts.forEach((a, i) => {
      const contrib = a.monthly * Math.pow(1 + a.growth, yearIndex);
      balances[i] = balances[i] * (1 + rates[i]) + contrib;
    });
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
