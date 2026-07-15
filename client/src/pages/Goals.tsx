import { useEffect, useState } from 'react';
import { Target, Plus, Trash2, AlertTriangle, CalendarCheck, Loader2, Coins } from 'lucide-react';
import { api, useDataRefresh } from '../lib/api';
import { rm } from '../lib/format';
import { Card, CardHeader, Button, Modal, Field, TextInput, SelectInput, PageSkeleton, cn, Badge } from '../components/ui';
import { useToast } from '../components/Toast';

const GOAL_TYPES = [
  { value: 'net_worth', label: 'Net worth target (RM)' },
  { value: 'emergency_fund', label: 'Emergency fund (months × expenses)' },
  { value: 'holding_pct', label: 'Holding % of MooMoo' },
  { value: 'contribution', label: 'Monthly contribution (account)' },
  { value: 'retire_age', label: 'Retire by age' },
];

export default function Goals() {
  const [data, setData] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const load = () =>
    Promise.all([
      api('/goals'),
      api('/drift'),
      api('/reviews'),
      api('/dashboard'),
      api('/holdings'),
      api('/fire/seed'),
      api('/zakat'),
    ]).then(([goals, drift, reviews, dash, holdings, fire, zakat]) =>
      setData({ goals, drift, reviews, dash, holdings, fire, zakat }),
    );
  useEffect(() => {
    load();
  }, []);
  useDataRefresh(load);

  if (!data) return <PageSkeleton />;

  const runReview = async () => {
    setRunning(true);
    try {
      await api('/reviews', { method: 'POST', body: JSON.stringify({}) });
      toast('Monthly review saved');
      load();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Target className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold">Goals &amp; Companion</h1>
            <p className="text-sm text-muted">Progress is computed locally from your real numbers</p>
          </div>
        </div>
        <Button onClick={() => setAdding(true)}><Plus size={16} /> Add goal</Button>
      </div>

      {/* drift alerts */}
      {data.drift.alerts.length > 0 && (
        <Card className="p-4 border-loss/40">
          <div className="flex items-center gap-2 text-loss text-sm font-medium mb-2">
            <AlertTriangle size={16} /> Concentration alerts (cap {data.drift.cap}%)
          </div>
          <ul className="text-sm space-y-1">
            {data.drift.alerts.map((a: any, i: number) => (
              <li key={i} className="text-muted">• {a.msg}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Zakat calculator */}
      {data.zakat && (
        <Card className={cn('p-4 border', data.zakat.zakatable_wealth >= data.zakat.nisab ? 'border-warn' : 'border-gain/40')}>
          <div className="flex items-center gap-2 mb-3">
            <Coins size={18} className={data.zakat.zakatable_wealth >= data.zakat.nisab ? 'text-warn' : 'text-gain'} />
            <h3 className="text-sm font-semibold">Zakat Calculator</h3>
            <Badge tone={data.zakat.zakatable_wealth >= data.zakat.nisab ? 'warn' : 'gain'}>
              {data.zakat.zakatable_wealth >= data.zakat.nisab ? 'Zakat due' : 'Below nisab'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Zakatable Wealth</div>
              <div className="text-lg font-semibold tabular-nums">{rm(data.zakat.zakatable_wealth)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Nisab Threshold</div>
              <div className="text-lg font-semibold tabular-nums">{rm(data.zakat.nisab)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Zakat Due (2.5%)</div>
              <div className={cn('text-lg font-semibold tabular-nums', data.zakat.zakatable_wealth >= data.zakat.nisab ? 'text-warn' : 'text-gain')}>
                {rm(data.zakat.zakat_due)}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted">
            Breakdown: Bank ({rm(data.zakat.bank)}) + Investments ({rm(data.zakat.investments)}) − Liabilities ({rm(data.zakat.liabilities)}) − EPF ({rm(data.zakat.epf)})
          </div>
        </Card>
      )}

      {/* goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.goals.length === 0 && (
          <Card className="p-6 text-center text-muted md:col-span-2">No goals yet — add one to track progress.</Card>
        )}
        {data.goals.map((g: any) => (
          <GoalCard key={g.id} goal={g} data={data} onDelete={async () => { await api(`/goals/${g.id}`, { method: 'DELETE' }); load(); }} />
        ))}
      </div>

      {/* monthly review journal */}
      <Card>
        <CardHeader
          title="Monthly review journal"
          subtitle="A dated summary of what changed; interpreted by the assistant if a key is set"
          action={<Button onClick={runReview} disabled={running}>{running ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />} Run review</Button>}
        />
        <div className="p-4 space-y-3">
          {data.reviews.length === 0 && <p className="text-sm text-muted">No reviews yet. Click “Run review” to create one.</p>}
          {data.reviews.map((r: any) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="text-xs text-muted mb-1">{r.date}</div>
              <div className="text-sm whitespace-pre-line leading-relaxed">{r.summary}</div>
            </div>
          ))}
        </div>
      </Card>

      {adding && <AddGoal data={data} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); toast('Goal added'); load(); }} />}
    </div>
  );
}

function progressFor(goal: any, data: any) {
  const t = typeof goal.target_json === 'string' ? JSON.parse(goal.target_json) : goal.target_json;
  switch (t.type) {
    case 'net_worth':
      return { current: data.dash.netWorth, target: t.target, fmt: rm, sub: 'net worth' };
    case 'emergency_fund':
      return { current: data.dash.bank, target: (t.months || 0) * (t.monthlyExpenses || 0), fmt: rm, sub: `${t.months} mo × ${rm(t.monthlyExpenses)} · liquid cash` };
    case 'holding_pct': {
      const p = data.holdings.positions?.find((x: any) => x.symbol === t.symbol);
      return { current: p?.pct_portfolio || 0, target: t.targetPct, fmt: (n: number) => `${n.toFixed(1)}%`, sub: `${t.symbol} of MooMoo` };
    }
    case 'contribution': {
      const a = data.fire.accounts?.find((x: any) => x.name === t.account);
      return { current: a?.monthly_amount || 0, target: t.monthly, fmt: (n: number) => `${rm(n)}/mo`, sub: t.account };
    }
    case 'retire_age':
      return { current: data.fire.settings.target_retire_age, target: t.age, fmt: (n: number) => `age ${n}`, sub: 'your set target age', info: true };
    default:
      return { current: 0, target: 1, fmt: (n: number) => String(n), sub: '' };
  }
}

function GoalCard({ goal, data, onDelete }: { goal: any; data: any; onDelete: () => void }) {
  const p = progressFor(goal, data);
  const pctRaw = p.target ? (p.current / p.target) * 100 : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const done = pctRaw >= 100;
  return (
    <Card className="p-4 group">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{goal.label}</div>
          <div className="text-xs text-muted">{p.sub}</div>
        </div>
        <button
          onClick={onDelete}
          aria-label={`Delete goal: ${goal.label}`}
          className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted hover:text-loss icon-btn -m-2"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="mt-3 flex items-end justify-between text-sm">
        <span className="font-semibold tabular-nums">{p.fmt(p.current)}</span>
        <span className="text-muted text-xs">target {p.fmt(p.target)}</span>
      </div>
      {!p.info && (
        <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
          <div className={cn('h-full rounded-full', done ? 'bg-gain' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {!p.info && <div className="mt-1 text-xs text-muted">{pctRaw.toFixed(0)}% {done ? '· reached 🎉' : ''}</div>}
    </Card>
  );
}

function AddGoal({ data, onClose, onAdded }: { data: any; onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState('net_worth');
  const [label, setLabel] = useState('');
  const [fields, setFields] = useState<any>({ target: 1000000, months: 6, monthlyExpenses: 3000, symbol: 'SPUS', targetPct: 20, account: 'MooMoo', monthly: 1500, age: 45 });

  const set = (k: string, v: any) => setFields((f: any) => ({ ...f, [k]: v }));

  const build = () => {
    switch (type) {
      case 'net_worth': return { type, target: Number(fields.target) };
      case 'emergency_fund': return { type, months: Number(fields.months), monthlyExpenses: Number(fields.monthlyExpenses) };
      case 'holding_pct': return { type, symbol: fields.symbol, targetPct: Number(fields.targetPct) };
      case 'contribution': return { type, account: fields.account, monthly: Number(fields.monthly) };
      case 'retire_age': return { type, age: Number(fields.age) };
    }
  };

  const save = async () => {
    const target_json = build();
    const lbl = label || GOAL_TYPES.find((g) => g.value === type)!.label;
    await api('/goals', { method: 'POST', body: JSON.stringify({ label: lbl, target_json }) });
    onAdded();
  };

  const symbols = (data.holdings.positions || []).map((p: any) => p.symbol);
  const accounts = (data.fire.accounts || []).map((a: any) => a.name);

  return (
    <Modal open onClose={onClose} title="Add goal">
      <Field label="Type">
        <SelectInput value={type} onChange={(e) => setType(e.target.value)}>
          {GOAL_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </SelectInput>
      </Field>
      <Field label="Label (optional)">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hit RM1M by 35" />
      </Field>

      {type === 'net_worth' && (
        <Field label="Target net worth (RM)"><TextInput type="number" value={fields.target} onChange={(e) => set('target', e.target.value)} /></Field>
      )}
      {type === 'emergency_fund' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Months"><TextInput type="number" value={fields.months} onChange={(e) => set('months', e.target.value)} /></Field>
          <Field label="Monthly expenses (RM)"><TextInput type="number" value={fields.monthlyExpenses} onChange={(e) => set('monthlyExpenses', e.target.value)} /></Field>
        </div>
      )}
      {type === 'holding_pct' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol"><SelectInput value={fields.symbol} onChange={(e) => set('symbol', e.target.value)}>{symbols.map((s: string) => <option key={s}>{s}</option>)}</SelectInput></Field>
          <Field label="Target %"><TextInput type="number" value={fields.targetPct} onChange={(e) => set('targetPct', e.target.value)} /></Field>
        </div>
      )}
      {type === 'contribution' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account"><SelectInput value={fields.account} onChange={(e) => set('account', e.target.value)}>{accounts.map((s: string) => <option key={s}>{s}</option>)}</SelectInput></Field>
          <Field label="Monthly (RM)"><TextInput type="number" value={fields.monthly} onChange={(e) => set('monthly', e.target.value)} /></Field>
        </div>
      )}
      {type === 'retire_age' && (
        <Field label="Target age"><TextInput type="number" value={fields.age} onChange={(e) => set('age', e.target.value)} /></Field>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Add</Button>
      </div>
    </Modal>
  );
}
