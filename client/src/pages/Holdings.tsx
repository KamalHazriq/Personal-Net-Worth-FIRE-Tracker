import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Upload, ArrowRightCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { api, useDataRefresh } from '../lib/api';
import { rm, usd, pct } from '../lib/format';
import { Card, CardHeader, Stat, Badge, Button, Toggle, Modal, Field, TextInput, cn, PageSkeleton } from '../components/ui';

const COLORS = ['#4f8cff', '#2ec27e', '#f5b301', '#a06bff', '#ff8a5c', '#5bc0eb', '#f6685e', '#19b3a6', '#7aa2ff', '#e879f9'];

export default function Holdings() {
  const [h, setH] = useState<any>(null);
  const [series, setSeries] = useState<any>(null);
  const [allocMode, setAllocMode] = useState('holding');
  const [importing, setImporting] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const load = () => {
    api('/holdings').then(setH);
    api('/holdings/series').then(setSeries);
  };
  useEffect(() => {
    load();
  }, []);
  useDataRefresh(load);

  const alloc = useMemo(() => {
    if (!h?.positions) return [];
    const key = allocMode === 'class' ? 'asset_class' : allocMode === 'sector' ? 'sub_tag' : 'symbol';
    const buckets = new Map<string, number>();
    for (const p of h.positions) {
      const label = (allocMode === 'sector' ? p.sub_tag || 'Untagged' : p[key]) || p.symbol;
      buckets.set(label, (buckets.get(label) || 0) + (p.market_value || 0));
    }
    const total = [...buckets.values()].reduce((a, b) => a + b, 0);
    return [...buckets.entries()].map(([label, value]) => ({ label, value, pct: (value / total) * 100 })).sort((a, b) => b.value - a.value);
  }, [h, allocMode]);

  if (!h) return <PageSkeleton />;
  const s = h.summary;

  const pushToNetWorth = async () => {
    const r = await api('/holdings/push-to-networth', { method: 'POST', body: JSON.stringify({}) });
    setPushMsg(`Pushed ${rm(r.value)} into MooMoo for ${r.date}.`);
    setTimeout(() => setPushMsg(''), 4000);
  };

  if (!h.snapshot) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Holdings</h1>
        <Card className="p-8 text-center text-muted">
          No positions yet. <Button onClick={() => setImporting(true)} className="ml-2">Import MooMoo CSV</Button>
        </Card>
        {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Holdings · MooMoo</h1>
          <p className="text-sm text-muted mt-1">
            Snapshot {h.snapshot.import_date} · {s.count} holdings · USD/MYR {h.rate}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pushToNetWorth} title="Push latest total into the MooMoo net-worth account">
            <ArrowRightCircle size={16} /> Push to Net Worth
          </Button>
          <Button onClick={() => setImporting(true)}>
            <Upload size={16} /> Import CSV
          </Button>
        </div>
      </div>
      {pushMsg && <div className="text-xs text-gain">{pushMsg}</div>}

      {/* summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Market Value" value={rm(s.totalMV_myr)} sub={usd(s.totalMV) + ' USD'} />
        <Stat label="Unrealized P/L" value={rm(s.totalPL_myr)} tone={s.totalPL >= 0 ? 'gain' : 'loss'} sub={`${pct(s.plPct)} · ${usd(s.totalPL)}`} />
        <Stat label="ETF vs Individual" value={`${s.etfPct.toFixed(0)}% / ${s.individualPct.toFixed(0)}%`} sub="ETF / single stocks" />
        <Stat label="Holdings" value={s.count}>
          <div className="text-xs mt-1 space-y-0.5">
            <div className="flex items-center gap-1 text-gain">
              <TrendingUp size={11} /> {s.biggestWinner?.symbol} {pct(s.biggestWinner?.pct_unrealized_pl)}
            </div>
            <div className="flex items-center gap-1 text-loss">
              <TrendingDown size={11} /> {s.biggestLoser?.symbol} {pct(s.biggestLoser?.pct_unrealized_pl)}
            </div>
          </div>
        </Stat>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* allocation donut */}
        <Card>
          <CardHeader
            title="Allocation"
            action={
              <Toggle
                value={allocMode}
                onChange={setAllocMode}
                options={[
                  { label: 'Holding', value: 'holding' },
                  { label: 'Class', value: 'class' },
                  { label: 'Sector', value: 'sector' },
                ]}
              />
            }
          />
          <div className="p-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={alloc} dataKey="value" nameKey="label" innerRadius={58} outerRadius={98} paddingAngle={1.5} stroke="var(--surface)">
                  {alloc.map((a, i) => (
                    <Cell key={a.label} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => [`${rm((v as number) * h.rate)} (${((v / s.totalMV) * 100).toFixed(1)}%)`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ETF vs Individual over time */}
        <Card className="lg:col-span-2">
          <CardHeader title="ETF vs Individual over time" subtitle="Built from each dated import (grows as you import more)" />
          <div className="p-2">
            {series && series.series.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={series.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tickFormatter={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={48} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, n: any) => [usd(v), n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="ETF" stackId="1" stroke="#4f8cff" fill="#4f8cff" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="Individual" stackId="1" stroke="#2ec27e" fill="#2ec27e" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {series && series.series.length <= 1 && (
              <p className="text-xs text-muted text-center py-16">
                Only one snapshot so far. Import more dated exports to see how your ETF-vs-stock mix evolves.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* positions table */}
      <Card>
        <CardHeader title="Positions" subtitle="Edit qty / cost / price · tag ETF vs Individual and sector (persists across imports)" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                {['Symbol', 'Name', 'Qty', 'Avg Cost', 'Price', 'MV (USD)', 'MV (MYR)', 'Unrl P/L', 'P/L %', '% Port', 'Class', 'Sector'].map((h2) => (
                  <th key={h2} className={cn('px-2 py-2 font-medium whitespace-nowrap', ['Symbol', 'Name', 'Class', 'Sector'].includes(h2) ? 'text-left' : 'text-right')}>
                    {h2}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.positions.map((p: any) => (
                <PositionRow key={p.id} p={p} rate={h.rate} onChange={load} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
    </div>
  );
}

function PositionRow({ p, rate, onChange }: { p: any; rate: number; onChange: () => void }) {
  const patch = (body: any) => api(`/positions/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(onChange);
  const tag = (body: any) => api(`/symbol-tags/${p.symbol}`, { method: 'PUT', body: JSON.stringify(body) }).then(onChange);
  return (
    <tr className="border-b border-border/40 hover:bg-surface-2/30">
      <td className="px-2 py-1.5 font-medium">{p.symbol}</td>
      <td className="px-2 py-1.5 text-muted max-w-[180px] truncate" title={p.name}>{p.name}</td>
      <NumCell value={p.quantity} onCommit={(v) => patch({ quantity: v })} dp={4} />
      <NumCell value={p.avg_cost} onCommit={(v) => patch({ avg_cost: v })} />
      <NumCell value={p.current_price} onCommit={(v) => patch({ current_price: v })} />
      <td className="px-2 py-1.5 text-right tabular-nums">{usd(p.market_value)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{rm(p.market_value_myr)}</td>
      <td className={cn('px-2 py-1.5 text-right tabular-nums', p.unrealized_pl >= 0 ? 'text-gain' : 'text-loss')}>{usd(p.unrealized_pl)}</td>
      <td className="px-2 py-1.5 text-right">
        <Badge tone={p.pct_unrealized_pl >= 0 ? 'gain' : 'loss'}>{pct(p.pct_unrealized_pl)}</Badge>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted">{p.pct_portfolio?.toFixed(1)}%</td>
      <td className="px-2 py-1.5">
        <select
          value={p.asset_class}
          onChange={(e) => tag({ asset_class: e.target.value })}
          className="bg-surface-2 border border-border rounded px-1 py-0.5 text-xs outline-none"
        >
          <option>Individual</option>
          <option>ETF</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          defaultValue={p.sub_tag || ''}
          placeholder="—"
          onBlur={(e) => {
            if (e.target.value !== (p.sub_tag || '')) tag({ sub_tag: e.target.value });
          }}
          className="bg-transparent border-b border-transparent hover:border-border focus:border-accent w-20 text-xs outline-none px-1"
        />
      </td>
    </tr>
  );
}

function NumCell({ value, onCommit, dp = 2 }: { value: number; onCommit: (v: number) => void; dp?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const fmt = value == null ? '' : Number(value).toLocaleString('en-US', { maximumFractionDigits: dp });
  return (
    <td className="px-1 py-1 text-right">
      <input
        ref={ref}
        key={fmt}
        defaultValue={fmt}
        inputMode="decimal"
        onFocus={(e) => {
          e.currentTarget.value = value == null ? '' : String(value);
          requestAnimationFrame(() => e.currentTarget.select());
        }}
        onBlur={(e) => {
          const n = parseFloat(e.target.value.replace(/,/g, ''));
          if (!isNaN(n) && n !== value) onCommit(n);
          else e.target.value = fmt;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-20 bg-transparent text-right tabular-nums outline-none focus:bg-accent/10 rounded px-1 py-0.5"
      />
    </td>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    const m = file.name.match(/(\d{1,2})[_-](\d{1,2})[_-](\d{4})/);
    if (m) setDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    file.text().then(setCsv);
  };

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      await api('/positions/import', { method: 'POST', body: JSON.stringify({ csv, date }) });
      onDone();
    } catch (e: any) {
      setErr('Import failed — check the CSV format. ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Import MooMoo positions">
      <Field label="Snapshot date">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
        }}
        className="border border-dashed border-border rounded-lg p-3 mb-3 text-center text-xs text-muted"
      >
        Drag & drop a Positions_*.csv here, or
        <input type="file" accept=".csv" className="block mx-auto mt-2 text-xs" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      <Field label="…or paste CSV">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder='"Symbol","Name","Quantity",…'
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-mono outline-none focus:border-accent"
        />
      </Field>
      {err && <p className="text-loss text-xs mb-2">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !csv.trim()}>{busy ? 'Importing…' : 'Import'}</Button>
      </div>
    </Modal>
  );
}
