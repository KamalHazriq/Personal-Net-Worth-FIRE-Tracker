import { useEffect, useMemo, useState } from 'react';
import { api, useDataRefresh } from '../lib/api';
import { rm, pct, signedRm, monthLabel } from '../lib/format';
import { Card, CardHeader, Stat, Badge, Toggle, PageSkeleton } from '../components/ui';
import {
  NetWorthLine,
  CategoryArea,
  AllocationDonut,
  InflowBars,
  Sparkline,
  LiquidLockedGauge,
} from '../components/charts';

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [alloc, setAlloc] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nwMode, setNwMode] = useState('both');

  const load = () =>
    Promise.all([api('/dashboard'), api('/allocation')])
      .then(([dash, a]) => {
        setD(dash);
        setAlloc(a);
      })
      .catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
  }, []);
  useDataRefresh(load);

  const inflow = useMemo(() => {
    if (!d?.series) return [];
    const out: { date: string; inflow: number }[] = [];
    for (let i = 1; i < d.series.length; i++) {
      out.push({ date: d.series[i].date, inflow: d.series[i].investment - d.series[i - 1].investment });
    }
    return out;
  }, [d]);

  const catKeys = useMemo(() => {
    if (!d?.series) return [];
    const s = new Set<string>();
    d.series.forEach((m: any) => Object.keys(m.byCategory || {}).forEach((k) => s.add(k)));
    return Array.from(s);
  }, [d]);

  if (err) return <ErrorState err={err} />;
  if (!d) return <PageSkeleton />;
  if (d.empty) return <div className="text-muted">No data yet — run the importer.</div>;

  const inv = d.invested;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            As of {monthLabel(d.latestDate)} · {d.series.length} months tracked
          </p>
        </div>
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
          <NetWorthLine data={d.series} mode={nwMode} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stacked area */}
        <Card className="lg:col-span-2">
          <CardHeader title="Net Worth by category" subtitle="Stacked over time" />
          <div className="p-2">
            <CategoryArea data={d.series} keys={catKeys} />
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
