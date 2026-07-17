import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Flame, Lock, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { rm, pct } from '../lib/format';
import { Card, CardHeader, Stat, Badge, Button, cn, PageSkeleton, PageHeader, Modal, Field, TextInput } from '../components/ui';
import {
  project,
  sensitivity,
  solveContribution,
  fireNumber,
  type FireAccount,
  type FireInputs,
} from '../lib/fireEngine';

const SCEN_COLORS = ['#4f8cff', '#2ec27e', '#f5b301', '#a06bff'];

export default function Fire() {
  const [seed, setSeed] = useState<any>(null);
  const [p, setP] = useState({ currentAge: 24, targetRetireAge: 45, epfUnlockAge: 55, swr: 0.04, targetIncome: 10000, horizonAge: 60 });
  const [accts, setAccts] = useState<FireAccount[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [namingScenario, setNamingScenario] = useState(false);

  useEffect(() => {
    api('/fire/seed').then((d) => {
      setSeed(d);
      setP({
        currentAge: d.settings.current_age,
        targetRetireAge: d.settings.target_retire_age,
        epfUnlockAge: d.settings.epf_unlock_age,
        swr: d.settings.swr,
        targetIncome: d.settings.fire_target_monthly_income,
        horizonAge: Math.max(60, d.settings.epf_unlock_age + 5),
      });
      setAccts(
        d.accounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          subtype: a.subtype,
          is_epf: a.is_epf,
          startBalance: a.startBalance,
          monthly: a.monthly_amount,
          annualReturn: a.annual_return_rate,
          growth: a.growth,
          excluded: !!a.excluded,
        })),
      );
    });
    api('/scenarios').then(setScenarios);
  }, []);

  const inputs: FireInputs | null = useMemo(
    () => (seed ? { ...p, cashStart: seed.cashStart, cashReturn: 0, accounts: accts } : null),
    [seed, p, accts],
  );
  const result = useMemo(() => (inputs ? project(inputs) : null), [inputs]);

  const setParam = (k: string, v: number) => {
    setP((prev) => ({ ...prev, [k]: v }));
    const map: any = { currentAge: 'current_age', targetRetireAge: 'target_retire_age', swr: 'swr', targetIncome: 'fire_target_monthly_income' };
    if (map[k]) api('/settings', { method: 'PUT', body: JSON.stringify({ [map[k]]: v }) }).catch(() => {});
  };

  const setAcct = (id: number, patch: Partial<FireAccount>) => {
    setAccts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const a = { ...accts.find((x) => x.id === id)!, ...patch };
    api(`/contributions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ monthly_amount: a.monthly, annual_return_rate: a.annualReturn, annual_contribution_growth_rate: a.growth }),
    }).catch(() => {});
  };

  const toggleExcluded = async (id: number) => {
    setAccts((prev) => prev.map((a) => (a.id === id ? { ...a, excluded: !a.excluded } : a)));
    await api(`/contributions/${id}/toggle`, { method: 'PATCH' });
  };

  const toggleAllExcluded = async () => {
    const anyIncluded = accts.some(a => !a.excluded);
    const newExcluded = anyIncluded; // if any included, turn all off. else turn all on.
    const toToggle = accts.filter(a => !!a.excluded !== newExcluded);
    setAccts(prev => prev.map(a => ({ ...a, excluded: newExcluded })));
    for (const a of toToggle) {
      await api(`/contributions/${a.id}/toggle`, { method: 'PATCH' });
    }
  };

  if (!seed || !inputs || !result) return <PageSkeleton />;

  const fn = result.fireNumber;
  const reached = result.fireAgeAccessible;
  const accessibleStart = seed.cashStart + accts.filter((a) => !a.is_epf && !a.excluded).reduce((s, a) => s + a.startBalance, 0);

  const saveScenario = async (name: string) => {
    const params_json = JSON.stringify({ ...p, cashStart: seed.cashStart, accounts: accts });
    const sc = await api('/scenarios', { method: 'POST', body: JSON.stringify({ name, params_json }) });
    setScenarios((s) => [...s, sc]);
    setNamingScenario(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Flame}
        title="FIRE Simulation"
        subtitle="Compounding projection of your accessible (non-EPF) money to retirement"
      />

      {/* Global inputs */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SliderInput label="Current age" value={p.currentAge} min={18} max={50} onChange={(v) => setParam('currentAge', v)} />
          <SliderInput label="Target retire age" value={p.targetRetireAge} min={p.currentAge + 1} max={60} onChange={(v) => setParam('targetRetireAge', v)} />
          <NumberField label="Target income / mo" value={p.targetIncome} step={500} onChange={(v) => setParam('targetIncome', v)} prefix="RM" />
          <NumberField label="SWR %" value={p.swr * 100} step={0.5} onChange={(v) => setParam('swr', v / 100)} suffix="%" />
          <SliderInput label="Project to age" value={p.horizonAge} min={p.targetRetireAge} max={75} onChange={(v) => setP((x) => ({ ...x, horizonAge: v }))} />
        </div>
        <div className="flex gap-1.5 mt-3">
          <span className="text-xs text-muted self-center mr-1">Quick target:</span>
          {[5000, 10000, 15000].map((v) => (
            <button
              key={v}
              onClick={() => setParam('targetIncome', v)}
              className={cn('px-2 py-1 rounded-md text-xs', p.targetIncome === v ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-text')}
            >
              RM {v.toLocaleString()}/mo
            </button>
          ))}
        </div>
      </Card>

      {/* Readiness cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="FIRE number" value={rm(fn)} sub={`${rm(p.targetIncome)}/mo ÷ ${(p.swr * 100).toFixed(1)}% SWR`} />
        <Stat
          label="Can retire (accessible) at"
          value={reached ? `age ${reached}` : 'beyond ' + p.horizonAge}
          tone={reached && reached <= p.targetRetireAge ? 'gain' : reached ? 'neutral' : 'loss'}
          sub={reached ? `${reached <= p.targetRetireAge ? 'on track for ' : 'after target '}${p.targetRetireAge}` : 'raise contributions / returns'}
        />
        <Stat
          label={`Accessible at ${p.targetRetireAge}`}
          value={rm(result.atTarget?.accessible)}
          tone={result.atTarget && result.atTarget.accessible >= fn ? 'gain' : 'loss'}
          sub={`supports ${rm(result.monthlyIncomeAtTarget)}/mo`}
        />
        <Stat label={`EPF unlocks at ${p.epfUnlockAge}`} value={rm(result.atTarget?.epf)} tone="locked" sub="locked until then">
          <Lock size={12} className="text-locked mt-1" />
        </Stat>
      </div>

      {/* Projection chart */}
      <Card>
        <CardHeader title="Projected net worth" subtitle="Total (with EPF) vs accessible (non-EPF) money" />
        <div className="p-2">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={result.points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(a) => 'age ' + a} />
              <YAxis tickFormatter={(v) => 'RM' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => [rm(v), n]}
                labelFormatter={(a) => 'Age ' + a}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {fn < result.finalTotal * 2 && (
                <ReferenceLine y={fn} stroke="#f5b301" strokeDasharray="4 4" label={{ value: 'FIRE number', fontSize: 10, fill: '#f5b301', position: 'insideTopRight' }} />
              )}
              <ReferenceLine x={p.targetRetireAge} stroke="var(--accent)" strokeDasharray="2 2" label={{ value: 'target', fontSize: 10, fill: 'var(--accent)' }} />
              <ReferenceLine x={p.epfUnlockAge} stroke="var(--locked)" strokeDasharray="2 2" label={{ value: 'EPF 55', fontSize: 10, fill: 'var(--locked)' }} />
              <Line type="monotone" dataKey="total" name="With EPF" stroke="#4f8cff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="accessible" name="Accessible (ex-EPF)" stroke="#2ec27e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Per-account assumptions */}
      <Card>
        <CardHeader title="Per-account assumptions" subtitle="Edit monthly contribution, expected return and contribution growth — projection updates live & saves" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                <th className="text-left px-3 py-2 font-medium w-8">
                  <input type="checkbox" checked={accts.length > 0 && accts.every(a => !a.excluded)} onChange={toggleAllExcluded} className="accent-[var(--accent)]" />
                </th>
                <th className="text-left px-3 py-2 font-medium">Account</th>
                <th className="text-right px-3 py-2 font-medium">Start balance</th>
                <th className="text-right px-3 py-2 font-medium">Monthly +</th>
                <th className="text-right px-3 py-2 font-medium">Return %</th>
                <th className="text-right px-3 py-2 font-medium">Contrib growth %</th>
                <th className="text-right px-3 py-2 font-medium">Proj. at {p.targetRetireAge}</th>
              </tr>
            </thead>
            <tbody>
              {accts.map((a) => (
                <tr key={a.id} className={cn("border-b border-border/40", a.excluded ? "opacity-40" : "")}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={!a.excluded} onChange={() => toggleExcluded(a.id)} className="accent-[var(--accent)]" />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-1.5">
                      {a.is_epf ? <Lock size={11} className="text-locked" /> : null}
                      {a.name}
                      <span className="text-[10px] text-muted bg-surface-2 rounded px-1">{a.subtype}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">{rm(a.startBalance)}</td>
                  <NumTd value={a.monthly} onCommit={(v) => setAcct(a.id, { monthly: v })} prefix="RM" />
                  <NumTd value={a.annualReturn * 100} onCommit={(v) => setAcct(a.id, { annualReturn: v / 100 })} suffix="%" dp={1} />
                  <NumTd value={a.growth * 100} onCommit={(v) => setAcct(a.id, { growth: v / 100 })} suffix="%" dp={1} />
                  <td className="px-3 py-1.5 text-right tabular-nums">{a.excluded ? '—' : rm(projectOne(a, inputs))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-xs text-muted border-t border-border">
          {accts.filter(a => !a.excluded).length} of {accts.length} accounts included · RM {accts.filter(a => !a.excluded).reduce((s, a) => s + a.monthly, 0).toLocaleString()}/mo total contributions
        </div>
      </Card>

      {/* target income cases + sensitivity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Target income cases" subtitle="FIRE number & age for RM5k / 10k / 15k per month" />
          <div className="p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border">
                  <th className="text-left py-2">Income/mo</th>
                  <th className="text-right py-2">FIRE number</th>
                  <th className="text-right py-2">Reach at</th>
                  <th className="text-right py-2">Accessible @{p.targetRetireAge}</th>
                </tr>
              </thead>
              <tbody>
                {[5000, 10000, 15000].map((inc) => {
                  const num = fireNumber(inc, p.swr);
                  const age = result.points.find((pt) => pt.accessible >= num)?.age ?? null;
                  const ok = result.atTarget && result.atTarget.accessible >= num;
                  return (
                    <tr key={inc} className={cn('border-b border-border/40', inc === p.targetIncome && 'bg-accent/5')}>
                      <td className="py-2">RM {inc.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{rm(num)}</td>
                      <td className="py-2 text-right">{age ? <Badge tone={age <= p.targetRetireAge ? 'gain' : 'neutral'}>age {age}</Badge> : <Badge tone="loss">{'>'}{p.horizonAge}</Badge>}</td>
                      <td className={cn('py-2 text-right tabular-nums', ok ? 'text-gain' : 'text-loss')}>{rm(result.atTarget?.accessible)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Return sensitivity" subtitle="Final accessible NW & FIRE age at 10 / 12 / 15% — don't over-rely on optimism" />
          <div className="p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border">
                  <th className="text-left py-2">Return</th>
                  <th className="text-right py-2">Final accessible @{p.horizonAge}</th>
                  <th className="text-right py-2">FIRE age</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity(inputs, [0.1, 0.12, 0.15]).map((s) => (
                  <tr key={s.rate} className="border-b border-border/40">
                    <td className="py-2">{(s.rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right tabular-nums">{rm(s.finalAccessible)}</td>
                    <td className="py-2 text-right">{s.fireAge ? <Badge tone="gain">age {s.fireAge}</Badge> : <Badge tone="loss">{'>'}{p.horizonAge}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted mt-2">Non-EPF accounts only; EPF keeps its own rate.</p>
          </div>
        </Card>
      </div>

      {/* Reverse solver */}
      <ReverseSolver accessibleStart={accessibleStart} p={p} />

      {/* Scenarios */}
      <Card>
        <CardHeader
          title="Scenario comparison"
          subtitle="Save the current setup and compare up to 3 side by side"
          action={<Button onClick={() => setNamingScenario(true)}><Plus size={14} /> Save current</Button>}
        />
        <ScenarioCompare
          scenarios={scenarios}
          compareIds={compareIds}
          setCompareIds={setCompareIds}
          base={p}
          onDelete={async (id) => {
            await api(`/scenarios/${id}`, { method: 'DELETE' });
            setScenarios((s) => s.filter((x) => x.id !== id));
            setCompareIds((c) => c.filter((x) => x !== id));
          }}
        />
      </Card>

      {namingScenario && <SaveScenarioModal onClose={() => setNamingScenario(false)} onSave={saveScenario} />}
    </div>
  );
}

/** Themed replacement for the old native prompt() when naming a scenario. */
function SaveScenarioModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = () => {
    if (name.trim()) onSave(name.trim());
  };
  return (
    <Modal open onClose={onClose} title="Save scenario">
      <Field label="Scenario name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder='e.g. "RM2,500/mo @12%"'
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!name.trim()}>Save</Button>
      </div>
    </Modal>
  );
}

function projectOne(a: FireAccount, inputs: FireInputs): number {
  const r = project({ ...inputs, cashStart: 0, accounts: [a] });
  return r.atTarget?.total ?? 0;
}

// ---- reverse solver ----
function ReverseSolver({ accessibleStart, p }: { accessibleStart: number; p: any }) {
  const rows = [0.1, 0.12, 0.15].map((r) => ({
    rate: r,
    req: solveContribution(accessibleStart, r, p.currentAge, p.targetRetireAge, fireNumber(p.targetIncome, p.swr)),
  }));
  return (
    <Card>
      <CardHeader
        title="Reverse solver"
        subtitle={`What monthly contribution into your accessible pool (now ${rm(accessibleStart)}) reaches the FIRE number by age ${p.targetRetireAge}?`}
      />
      <div className="p-3 grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.rate} className="rounded-lg border border-border bg-surface-2 p-3 text-center">
            <div className="text-xs text-muted">at {(r.rate * 100).toFixed(0)}% return</div>
            <div className="text-lg font-semibold mt-1">{r.req == null ? '—' : rm(r.req) + '/mo'}</div>
            {r.req != null && <div className="text-[11px] text-muted">≈ {rm(r.req * 12)}/yr</div>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted px-3 pb-3">
        Single-rate model on your accessible (non-EPF) pool to reach {rm(fireNumber(p.targetIncome, p.swr))} by age {p.targetRetireAge}.
      </p>
    </Card>
  );
}

// ---- scenario compare ----
function ScenarioCompare({ scenarios, compareIds, setCompareIds, base, onDelete }: any) {
  if (!scenarios.length) return <div className="p-4 text-sm text-muted">No saved scenarios yet. Tune the inputs above and click “Save current”.</div>;

  const selected = scenarios.filter((s: any) => compareIds.includes(s.id)).slice(0, 3);
  const computed = selected.map((s: any) => {
    const params = JSON.parse(s.params_json);
    const inp: FireInputs = { ...params, cashReturn: 0 };
    const res = project(inp);
    return { id: s.id, name: s.name, params, res };
  });

  // build overlay chart aligned by age
  const ages = computed.length ? computed[0].res.points.map((pt: any) => pt.age) : [];
  const chartData = ages.map((age: number, i: number) => {
    const row: any = { age };
    computed.forEach((c: any) => (row[c.name] = c.res.points[i]?.accessible));
    return row;
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s: any) => (
          <label key={s.id} className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer', compareIds.includes(s.id) ? 'border-accent bg-accent/10' : 'border-border')}>
            <input
              type="checkbox"
              checked={compareIds.includes(s.id)}
              onChange={(e) => setCompareIds((c: number[]) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
            />
            {s.name}
            <button
              onClick={(e) => { e.preventDefault(); onDelete(s.id); }}
              aria-label={`Delete scenario ${s.name}`}
              className="text-muted hover:text-loss p-1 -m-1 rounded"
            >
              <Trash2 size={11} />
            </button>
          </label>
        ))}
      </div>

      {computed.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                <th className="text-left py-2">Scenario</th>
                <th className="text-right py-2">Retire age (accessible)</th>
                <th className="text-right py-2">FIRE number</th>
                <th className="text-right py-2">Final NW</th>
                <th className="text-right py-2">Final accessible</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c: any, i: number) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-2 font-medium" style={{ color: SCEN_COLORS[i % SCEN_COLORS.length] }}>{c.name}</td>
                  <td className="py-2 text-right">{c.res.fireAgeAccessible ? `age ${c.res.fireAgeAccessible}` : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{rm(c.res.fireNumber)}</td>
                  <td className="py-2 text-right tabular-nums">{rm(c.res.finalTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{rm(c.res.finalAccessible)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(a) => 'age ' + a} />
              <YAxis tickFormatter={(v) => 'RM' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={56} />
              <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: any) => [rm(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {computed.map((c: any, i: number) => (
                <Line key={c.id} type="monotone" dataKey={c.name} stroke={SCEN_COLORS[i % SCEN_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted">Lines show accessible (non-EPF) net worth per scenario.</p>
        </>
      )}
    </div>
  );
}

// ---- small inputs ----
function SliderInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </div>
  );
}

function NumberField({ label, value, step, onChange, prefix, suffix }: { label: string; value: number; step: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div>
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="flex items-center rounded-lg border border-border bg-surface-2 px-2">
        {prefix && <span className="text-xs text-muted">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-1 py-1.5 text-sm outline-none tabular-nums"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function NumTd({ value, onCommit, prefix, suffix, dp = 0 }: { value: number; onCommit: (v: number) => void; prefix?: string; suffix?: string; dp?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const fmt = Number(value).toLocaleString('en-US', { maximumFractionDigits: dp });
  return (
    <td className="px-3 py-1 text-right">
      <span className="inline-flex items-center justify-end gap-0.5">
        {prefix && <span className="text-[10px] text-muted">{prefix}</span>}
        <input
          ref={ref}
          key={fmt}
          defaultValue={fmt}
          inputMode="decimal"
          onFocus={(e) => { e.currentTarget.value = String(value); requestAnimationFrame(() => e.currentTarget.select()); }}
          onBlur={(e) => { const n = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(n) && n !== value) onCommit(n); else e.target.value = fmt; }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 bg-transparent text-right tabular-nums outline-none focus:bg-accent/10 rounded px-1 py-0.5"
        />
        {suffix && <span className="text-[10px] text-muted">{suffix}</span>}
      </span>
    </td>
  );
}
