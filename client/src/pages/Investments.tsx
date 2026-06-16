import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api, useDataRefresh } from '../lib/api';
import { rm, pct, monthLabel, signedRm } from '../lib/format';
import { Card, CardHeader, Stat, Badge, cn, PageSkeleton } from '../components/ui';
import { colorFor } from '../lib/palette';

const SERIES_COLORS = ['#4f8cff', '#2ec27e', '#f5b301', '#a06bff', '#ff8a5c', '#5bc0eb', '#f6685e'];
const mLabel = (m: string) => monthLabel(m.length === 10 && m.endsWith('-01') ? m.slice(0, 8) + '28' : m);

export default function Investments() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [inv, setInv] = useState<any>(null);
  const [crypto, setCrypto] = useState<any>(null);
  const [month, setMonth] = useState<string>('');

  const loadInv = () =>
    api(`/investments?year=${year}`).then((d) => {
      setInv(d);
      const good = [...d.months].reverse().find((m: string) => d.platforms.filter((p: string) => d.byPlatform[p][m]).length >= 2);
      setMonth(good || d.months[d.months.length - 1] || '');
    });
  useEffect(() => {
    loadInv();
  }, [year]);
  useEffect(() => {
    api('/crypto').then(setCrypto);
  }, []);
  useDataRefresh(() => {
    loadInv();
    api('/crypto').then(setCrypto);
  });

  const plSeries = useMemo(() => {
    if (!inv) return [];
    return inv.months.map((m: string) => {
      const o: any = { month: m };
      for (const p of inv.platforms) o[p] = inv.byPlatform[p][m]?.plPct ?? null;
      return o;
    });
  }, [inv]);

  if (!inv) return <PageSkeleton />;
  const t = month ? inv.totals[month] : null;
  const yearTabs = inv.years.length ? inv.years : [year];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investments P/L</h1>
        <p className="text-sm text-muted mt-1">Per-platform capital, profit/loss and returns · plus crypto breakdown</p>
      </div>

      <div className="flex gap-1">
        {yearTabs.map((y: number) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={cn('px-3 py-1.5 rounded-lg text-sm', y === inv.year ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-surface-2')}
          >
            {y}
          </button>
        ))}
      </div>

      {/* aggregate cards for selected month */}
      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Capital invested" value={rm(t.capital)} sub={mLabel(month)} />
          <Stat label="Current balance" value={rm(t.balance)} />
          <Stat label="Profit / Loss" value={signedRm(t.profit_loss)} tone={t.profit_loss >= 0 ? 'gain' : 'loss'} />
          <Stat label="Aggregate P/L %" value={pct(t.plPct)} tone={t.plPct >= 0 ? 'gain' : 'loss'} />
        </div>
      )}

      {/* per-platform table */}
      <Card>
        <CardHeader
          title="Per-platform P/L"
          subtitle="Select a month"
          action={
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none"
            >
              {inv.months.map((m: string) => (
                <option key={m} value={m}>
                  {mLabel(m)}
                </option>
              ))}
            </select>
          }
        />
        <div className="overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-border">
                <th className="text-left font-medium px-3 py-2">Platform</th>
                <th className="text-right font-medium px-3 py-2">Capital</th>
                <th className="text-right font-medium px-3 py-2">Profit / Loss</th>
                <th className="text-right font-medium px-3 py-2">Balance</th>
                <th className="text-right font-medium px-3 py-2">P/L %</th>
              </tr>
            </thead>
            <tbody>
              {inv.platforms.map((p: string) => {
                const c = month ? inv.byPlatform[p][month] : null;
                if (!c) return null;
                return (
                  <tr key={p} className="border-b border-border/50">
                    <td className="px-3 py-2">{p}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rm(c.capital)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', c.profit_loss >= 0 ? 'text-gain' : 'text-loss')}>
                      {signedRm(c.profit_loss)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{rm(c.balance ?? c.capital + c.profit_loss)}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge tone={c.plPct >= 0 ? 'gain' : 'loss'}>{pct(c.plPct)}</Badge>
                    </td>
                  </tr>
                );
              })}
              {t && (
                <tr className="font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rm(t.capital)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', t.profit_loss >= 0 ? 'text-gain' : 'text-loss')}>
                    {signedRm(t.profit_loss)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{rm(t.balance)}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge tone={t.plPct >= 0 ? 'gain' : 'loss'}>{pct(t.plPct)}</Badge>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* P/L% per platform over time */}
      {plSeries.length > 1 && (
        <Card>
          <CardHeader title="P/L % per platform over time" />
          <div className="p-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={plSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickFormatter={mLabel} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tickFormatter={(v) => v + '%'} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={44} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => (v == null ? '—' : v + '%')}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {inv.platforms.map((p: string, i: number) => (
                  <Line key={p} type="monotone" dataKey={p} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Crypto breakdown */}
      {crypto && <CryptoBreakdown crypto={crypto} />}
    </div>
  );
}

function CryptoBreakdown({ crypto }: { crypto: any }) {
  const latest = crypto.latestComposition as { coin: string; value: number }[];
  const total = latest.reduce((s, c) => s + c.value, 0);
  // stacked area: top 6 coins + Other
  const top = latest.slice(0, 6).map((c) => c.coin);
  const stack = crypto.byMonth.map((row: any) => {
    const o: any = { month: row.month };
    let other = 0;
    for (const coin of crypto.coins) {
      const v = row[coin] || 0;
      if (top.includes(coin)) o[coin] = v;
      else other += v;
    }
    o.Other = other;
    return o;
  });
  const keys = [...top, 'Other'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader title="Crypto by coin (Luno)" subtitle={`${mLabel(crypto.latest)} · total ${rm(total)}`} />
        <div className="p-2">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={latest} dataKey="value" nameKey="coin" innerRadius={50} outerRadius={90} paddingAngle={1.5} stroke="var(--surface)">
                {latest.map((c, i) => (
                  <Cell key={c.coin} fill={SERIES_COLORS[i % SERIES_COLORS.length] || colorFor('Crypto')} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => [rm(v), n]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="px-4 pb-4 max-h-40 overflow-y-auto">
          {latest.map((c) => (
            <div key={c.coin} className="flex justify-between text-xs py-0.5">
              <span className="text-muted">{c.coin}</span>
              <span className="tabular-nums">
                {rm(c.value)} · {((c.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Crypto value over time" subtitle="Stacked by coin (top 6 + other)" />
        <div className="p-2">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stack} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickFormatter={mLabel} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={20} />
              <YAxis tickFormatter={(v) => 'RM' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={50} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => [rm(v), n]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {keys.map((k, i) => (
                <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} fill={SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.6} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
