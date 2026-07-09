import { useEffect, useMemo, useState } from 'react';
import { api, useDataRefresh } from '../lib/api';
import { rm, pct, signedRm, monthLabel } from '../lib/format';
import { Card, CardHeader, Stat, Badge, Toggle, PageSkeleton, cn } from '../components/ui';
import { X } from 'lucide-react';
import {
  NetWorthLine,
  CategoryArea,
  AllocationDonut,
  InflowBars,
  Sparkline,
  LiquidLockedGauge,
} from '../components/charts';
import Welcome from './Welcome';

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [alloc, setAlloc] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nwMode, setNwMode] = useState('both');
  const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null); // null = all history

  const load = () =>
    Promise.all([api('/dashboard'), api('/allocation')])
      .then(([dash, a]) => {
        setD(dash);
        setAlloc(a);
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (localStorage.getItem(`dismissed_update_${currentMonth}`)) {
          setDismissedBanner(currentMonth);
        }
      })
      .catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
  }, []);
  useDataRefresh(load);

  // series shown in the time charts, clipped to the selected range
  const shownSeries = useMemo(() => {
    if (!d?.series) return [];
    if (!range) return d.series;
    return d.series.filter((s: any) => s.date >= range.from && s.date <= range.to);
  }, [d, range]);

  const inflow = useMemo(() => {
    if (!d?.series) return [];
    const out: { date: string; inflow: number }[] = [];
    for (let i = 1; i < d.series.length; i++) {
      out.push({ date: d.series[i].date, inflow: d.series[i].investment - d.series[i - 1].investment });
    }
    return range ? out.filter((x) => x.date >= range.from && x.date <= range.to) : out;
  }, [d, range]);

  const catKeys = useMemo(() => {
    if (!d?.series) return [];
    const s = new Set<string>();
    d.series.forEach((m: any) => Object.keys(m.byCategory || {}).forEach((k) => s.add(k)));
    return Array.from(s);
  }, [d]);

  if (err) return <ErrorState err={err} />;
  if (!d) return <PageSkeleton />;
  if (d.empty) return <Welcome />;

  const inv = d.invested;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthName = now.toLocaleString('default', { month: 'long' });
  const shouldShowBanner = now.getDate() > 5 && d.latestDate !== currentMonth && dismissedBanner !== currentMonth;

  return (
    <div className="space-y-6">
      {shouldShowBanner && (
        <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-500 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <span>📌</span>
            <span>You haven't updated {monthName} yet. Go to Accounts to add this month's balances.</span>
          </div>
          <button
            onClick={() => {
              setDismissedBanner(currentMonth);
              localStorage.setItem(`dismissed_update_${currentMonth}`, '1');
            }}
            className="text-yellow-600/70 hover:text-yellow-600 dark:text-yellow-500/70 dark:hover:text-yellow-500"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            As of {monthLabel(d.latestDate)} ·{' '}
            {range ? `showing ${shownSeries.length} of ${d.series.length}` : `${d.series.length}`} months tracked
          </p>
        </div>
        <RangeControl series={d.series} range={range} onChange={setRange} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Net Worth"
          value={rm(d.netWorth)}
          sub={
            <span className={d.momNetWorth >= 0 ? 'text-gain' : 'text-loss'}>
              {signedRm(d.momNetWorth)} MoM
            </span>
          }
        >
          <div className="-mb-1 mt-1">
            <Sparkline data={d.series} />
          </div>
        </Stat>

        <Stat
          label="Net Worth excl. EPF"
          value={rm(d.netWorthExEpf)}
          sub={
            <span className={d.momNetWorthExEpf >= 0 ? 'text-gain' : 'text-loss'}>
              {signedRm(d.momNetWorthExEpf)} MoM · your accessible money
            </span>
          }
        >
          <div className="-mb-1 mt-1">
            <Sparkline data={d.series.map((s: any) => ({ ...s, netWorth: s.netWorthExEpf }))} color="#2ec27e" />
          </div>
        </Stat>

        <Stat
          label="Invested Capital → Value"
          value={rm(inv?.totalValue)}
          tone={inv?.totalPL >= 0 ? 'gain' : 'loss'}
          sub={
            <span>
              cost {rm(inv?.totalCapital)} ·{' '}
              <Badge tone={inv?.totalPL >= 0 ? 'gain' : 'loss'}>
                {signedRm(inv?.totalPL)} ({pct(inv?.plPct)})
              </Badge>
            </span>
          }
        />

        <Stat
          label="Avg Monthly Growth"
          value={rm(d.avgMonthlyGrowth)}
          sub={`Avg invested ${rm(d.avgMonthlyInvested)}/mo`}
        />
      </div>

      {/* Net worth over time */}
      <Card>
        <CardHeader
          title="Net Worth over time"
          subtitle="With EPF vs your accessible (excl. EPF) money"
          action={
            <Toggle
              value={nwMode}
              onChange={setNwMode}
              options={[
                { label: 'Both', value: 'both' },
                { label: 'With EPF', value: 'with' },
                { label: 'Excl. EPF', value: 'excl' },
              ]}
            />
          }
        />
        <div className="p-2">
          <NetWorthLine data={shownSeries} mode={nwMode} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stacked area */}
        <Card className="lg:col-span-2">
          <CardHeader title="Net Worth by category" subtitle="Stacked over time" />
          <div className="p-2">
            <CategoryArea data={shownSeries} keys={catKeys} />
          </div>
        </Card>

        {/* Allocation donut */}
        <Card>
          <CardHeader title="Allocation" subtitle={alloc ? `Latest · total ${rm(alloc.total)}` : ''} />
          <div className="p-2">{alloc && <AllocationDonut items={alloc.items} />}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inflow bars */}
        <Card className="lg:col-span-2">
          <CardHeader title="Monthly investment inflow" subtitle="Change in invested balance each month" />
          <div className="p-2">
            <InflowBars data={inflow} />
          </div>
        </Card>

        {/* Liquid vs locked */}
        <Card className="p-4">
          <CardHeader title="Liquid vs Locked" subtitle="EPF is locked until age 55" />
          <div className="px-4 pb-4 pt-8">
            <LiquidLockedGauge liquid={d.liquid} locked={d.locked} />
          </div>
        </Card>
      </div>
    </div>
  );
}

// Date-range zoom for the time charts: quick presets + from/to month pickers.
function RangeControl({
  series,
  range,
  onChange,
}: {
  series: { date: string }[];
  range: { from: string; to: string } | null;
  onChange: (r: { from: string; to: string } | null) => void;
}) {
  const dates = series.map((s) => s.date);
  const last = dates[dates.length - 1];
  const preset = (n: number | 'ytd' | 'all') => {
    if (n === 'all') return onChange(null);
    if (n === 'ytd') return onChange({ from: `${last.slice(0, 4)}-01-01`, to: last });
    onChange({ from: dates[Math.max(0, dates.length - n)], to: last });
  };
  const activePreset = (n: number | 'ytd' | 'all') => {
    if (n === 'all') return !range;
    if (!range || range.to !== last) return false;
    if (n === 'ytd') return range.from === `${last.slice(0, 4)}-01-01`;
    return range.from === dates[Math.max(0, dates.length - n)];
  };
  const sel =
    'rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {([['All', 'all'], ['12M', 12], ['6M', 6], ['YTD', 'ytd']] as const).map(([label, v]) => (
          <button
            key={label}
            onClick={() => preset(v)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors',
              activePreset(v) ? 'bg-accent text-white' : 'text-muted hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <select
        value={range?.from ?? dates[0]}
        onChange={(e) => {
          const from = e.target.value;
          const to = range?.to ?? last;
          onChange({ from, to: to >= from ? to : from });
        }}
        className={sel}
        title="From month"
      >
        {dates.map((dt) => (
          <option key={dt} value={dt}>
            {monthLabel(dt)}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted">→</span>
      <select
        value={range?.to ?? last}
        onChange={(e) => {
          const to = e.target.value;
          const from = range?.from ?? dates[0];
          onChange({ from: from <= to ? from : to, to });
        }}
        className={sel}
        title="To month"
      >
        {dates.map((dt) => (
          <option key={dt} value={dt}>
            {monthLabel(dt)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ErrorState({ err }: { err: string }) {
  return (
    <Card className="p-6 text-sm">
      <p className="text-loss font-medium">Couldn't reach the API ({err}).</p>
      <p className="text-muted mt-2">
        Make sure the backend is running: <code className="bg-surface-2 px-1 rounded">npm run dev</code> from
        the project root starts both server (:8787) and client (:5173).
      </p>
    </Card>
  );
}
