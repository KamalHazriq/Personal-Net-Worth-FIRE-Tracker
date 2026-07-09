import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { rm, monthLabel } from '../lib/format';
import { ACCENT, LOCKED, GAIN, LOSS, colorFor, STACK_ORDER } from '../lib/palette';

const axis = { fontSize: 11, fill: 'var(--muted)' };
const grid = 'var(--border)';

function kFmt(v: number) {
  if (Math.abs(v) >= 1000) return 'RM ' + (v / 1000).toFixed(0) + 'k';
  return 'RM ' + v;
}

function ThemedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border-2 border-accent/70 bg-surface px-3.5 py-2.5 text-xs tooltip-shadow min-w-[170px]">
      <div className="font-semibold text-sm mb-1.5 text-accent">
        {typeof label === 'string' && label.includes('-') ? monthLabel(label) : label}
      </div>
      {payload
        .filter((p: any) => p.value != null && p.value !== 0)
        .map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.fill }} />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums">{rm(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

export function NetWorthLine({ data, mode }: { data: any[]; mode: string }) {
  return (
    <ResponsiveContainer width="100%" height={290}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={{ stroke: grid }} interval={0} angle={-45} textAnchor="end" height={44} />
        <YAxis tickFormatter={kFmt} tick={axis} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<ThemedTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {(mode === 'both' || mode === 'with') && (
          <Line type="monotone" dataKey="netWorth" name="With EPF" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        )}
        {(mode === 'both' || mode === 'excl') && (
          <Line type="monotone" dataKey="netWorthExEpf" name="Excl. EPF" stroke={GAIN} strokeWidth={2} dot={{ r: 3, fill: GAIN, strokeWidth: 0 }} activeDot={{ r: 5 }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryArea({ data, keys }: { data: any[]; keys: string[] }) {
  const ordered = STACK_ORDER.filter((k) => keys.includes(k)).concat(
    keys.filter((k) => !STACK_ORDER.includes(k)),
  );
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={{ stroke: grid }} interval={0} angle={-45} textAnchor="end" height={44} />
        <YAxis tickFormatter={kFmt} tick={axis} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<ThemedTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {ordered.map((k) => (
          <Area
            key={k}
            type="monotone"
            dataKey={(d) => d.byCategory?.[k] || 0}
            name={k}
            stackId="1"
            stroke={colorFor(k)}
            fill={colorFor(k)}
            fillOpacity={0.65}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AllocationDonut({ items }: { items: { label: string; value: number; pct: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={items}
          dataKey="value"
          nameKey="label"
          innerRadius={64}
          outerRadius={104}
          paddingAngle={1.5}
          stroke="var(--surface)"
        >
          {items.map((it) => (
            <Cell key={it.label} fill={colorFor(it.label)} />
          ))}
        </Pie>
        <Tooltip content={<ThemedTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function InflowBars({ data }: { data: { date: string; inflow: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ ...axis, fontSize: 10 }} tickLine={false} axisLine={{ stroke: grid }} interval={0} angle={-45} textAnchor="end" height={44} />
        <YAxis tickFormatter={kFmt} tick={axis} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="inflow" name="Inflow" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.date} fill={d.inflow >= 0 ? GAIN : LOSS} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ data, color = ACCENT }: { data: any[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="netWorth" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LiquidLockedGauge({ liquid, locked }: { liquid: number; locked: number }) {
  const total = liquid + locked || 1;
  const lp = (liquid / total) * 100;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full" style={{ width: `${lp}%`, background: ACCENT }} />
        <div className="h-full" style={{ width: `${100 - lp}%`, background: LOCKED }} />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-accent">Liquid {rm(liquid)} · {lp.toFixed(0)}%</span>
        <span className="text-locked">Locked (EPF) {rm(locked)}</span>
      </div>
    </div>
  );
}
