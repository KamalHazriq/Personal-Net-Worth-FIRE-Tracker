import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { monthLabel } from '../lib/format';
import { Button, Modal, Field, TextInput, SelectInput, cn, PageSkeleton } from '../components/ui';
import { useToast } from '../components/Toast';
import { badgeStyle } from '../lib/palette';

const CATEGORIES = ['Bank', 'Income', 'Liability', 'Investment'];
const SUBTYPES: Record<string, string[]> = {
  Bank: ['Bank', 'MMF', 'HYSA'],
  Income: ['Salary', 'Cashback'],
  Liability: ['CreditCard'],
  Investment: ['ASB', 'EPF', 'Wahed', 'Gold', 'Crypto', 'Stocks', 'Other'],
};

type Acct = {
  id: number;
  name: string;
  subtype: string;
  is_epf: number;
  is_liquid: number;
  currency: string;
  values: Record<string, number>;
};
type Group = { category: string; title: string; accounts: Acct[] };
type Grid = { year: number; years: number[]; opening: string; months: { date: string; opening: boolean }[]; groups: Group[] };

const numFmt = (v: number | null | undefined) =>
  v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function Accounts() {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [editAcct, setEditAcct] = useState<Acct | null>(null);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const load = (y: number) => api(`/grid?year=${y}`).then((g: Grid) => setGrid(g));
  useEffect(() => {
    load(year);
  }, [year]);

  // --- live cell update (optimistic) ---
  const setCell = (acctId: number, date: string, value: number | null) => {
    setGrid((g) => {
      if (!g) return g;
      const groups = g.groups.map((grp) => ({
        ...grp,
        accounts: grp.accounts.map((a) => {
          if (a.id !== acctId) return a;
          const values = { ...a.values };
          if (value == null) delete values[date];
          else values[date] = value;
          return { ...a, values };
        }),
      }));
      return { ...g, groups };
    });
    api('/snapshots', { method: 'PUT', body: JSON.stringify({ account_id: acctId, date, value }) })
      .then(() => {
        setSaved(true);
        clearTimeout((window as any).__savedT);
        (window as any).__savedT = setTimeout(() => setSaved(false), 1200);
      })
      .catch(() => load(year));
  };

  const months = grid?.months ?? [];
  const sums = useMemo(() => computeTotals(grid), [grid]);
  const flatIds = useMemo(() => (grid ? grid.groups.flatMap((g) => g.accounts.map((a) => a.id)) : []), [grid]);

  // --- horizontal scroll helpers (one month column ≈ 116px) ---
  const scrollerRef = useRef<HTMLDivElement>(null);
  const COL_W = 116;
  // Instant (non-smooth) jumps: reliable in every browser, and spreadsheet-like.
  const scrollByMonths = (n: number) => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft += n * COL_W;
  };
  const scrollToLatest = () => {
    const el = scrollerRef.current;
    if (!el || !grid) return;
    let last = -1;
    grid.months.forEach((m, i) => {
      if (grid.groups.some((g) => g.accounts.some((a) => a.values[m.date] != null))) last = i;
    });
    if (last < 0) return;
    // place the latest data column near the right edge (180px sticky name col)
    el.scrollLeft = Math.max(0, 180 + (last + 1) * COL_W - el.clientWidth + 24);
  };
  // jump to the newest month with data when the year view (re)loads — not on cell edits
  useEffect(() => {
    const t = setTimeout(scrollToLatest, 200);
    return () => clearTimeout(t);
  }, [grid?.year]);

  // arrow-key / Enter navigation between editable cells
  const moveCell = (id: number, col: number, dir: 'up' | 'down' | 'left' | 'right') => {
    let ri = flatIds.indexOf(id);
    let tc = col;
    if (dir === 'left') tc--;
    else if (dir === 'right') tc++;
    else if (dir === 'up') ri--;
    else if (dir === 'down') ri++;
    tc = Math.max(0, Math.min(months.length - 1, tc));
    if (ri < 0 || ri >= flatIds.length) return;
    const target = document.querySelector<HTMLInputElement>(`input[data-cell="${flatIds[ri]}:${tc}"]`);
    target?.focus();
  };

  if (!grid) return <PageSkeleton />;

  // Always include the current/selected year and one year ahead, even on an empty DB.
  const knownYears = grid.years.length ? grid.years : [grid.year];
  const yearTabs = Array.from(new Set([...knownYears, grid.year, Math.max(...knownYears, grid.year) + 1])).sort();
  const isEmpty = grid.groups.every((g) => g.accounts.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted mt-1">
            Excel-like grid · arrow keys to move · totals compute live
            <span className={cn('ml-2 text-gain transition-opacity', saved ? 'opacity-100' : 'opacity-0')}>Saved ✓</span>
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Add account
        </Button>
      </div>

      {/* Year tabs + scroll controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {yearTabs.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm',
                y === grid.year ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-surface-2',
              )}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollByMonths(-3)}
            className="p-1.5 rounded-lg border border-border bg-surface-2 text-muted hover:text-text"
            title="Scroll 3 months back (or Shift+mouse-wheel on the grid)"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scrollByMonths(3)}
            className="p-1.5 rounded-lg border border-border bg-surface-2 text-muted hover:text-text"
            title="Scroll 3 months forward"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={scrollToLatest}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-muted hover:text-text"
            title="Jump to the latest month with data"
          >
            Latest ⇥
          </button>
        </div>
      </div>

      {isEmpty && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No accounts yet. Click <span className="text-text font-medium">“Add account”</span> to create
          your first one, then type a balance into a month cell — Net Worth and the FIRE projection
          start filling in immediately.
        </div>
      )}

      {/* Grid */}
      <div ref={scrollerRef} className="rounded-xl border border-border overflow-auto">
        <table className="text-sm border-collapse min-w-max">
          <thead>
            <tr className="bg-surface-2">
              <th className="sticky left-0 z-20 bg-surface-2 text-left font-medium px-3 py-2 min-w-[180px] border-b border-border">
                Account
              </th>
              {months.map((m) => (
                <th
                  key={m.date}
                  className="px-3 py-2 text-right font-medium text-muted whitespace-nowrap border-b border-border min-w-[116px]"
                >
                  {monthLabel(m.date)}
                  {m.opening && <span className="block text-[9px] text-muted/70">opening</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.groups.map((grp) => (
              <GroupRows
                key={grp.category}
                grp={grp}
                months={months}
                subtotals={sums.subtotals[grp.category]}
                onCell={setCell}
                onEdit={setEditAcct}
                onMove={moveCell}
              />
            ))}

            {/* TOTAL block */}
            <tr className="bg-surface-2">
              <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-semibold border-t-2 border-border">
                Net Worth
              </td>
              {months.map((m) => (
                <Cell key={m.date} className="font-semibold border-t-2 border-border">
                  {numFmt(sums.netWorth[m.date])}
                </Cell>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-semibold text-locked">
                Net Worth w/o EPF
              </td>
              {months.map((m) => (
                <Cell key={m.date} className="font-semibold text-locked">
                  {numFmt(sums.netWorthExEpf[m.date])}
                </Cell>
              ))}
            </tr>
            <DeltaRow label="Δ Net Worth (MoM)" months={months} series={sums.netWorth} />
            <DeltaRow label="Δ excl. EPF (MoM)" months={months} series={sums.netWorthExEpf} />
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Tip: click any cell to edit. Empty a cell to clear that month. Subtotals, Net Worth and the
        MoM deltas recompute instantly and save to your local database.
      </p>

      {editAcct && (
        <AccountEditor
          acct={editAcct}
          onClose={() => setEditAcct(null)}
          onSaved={() => {
            setEditAcct(null);
            load(year);
            toast('Account updated');
          }}
        />
      )}
      {adding && (
        <AddAccount
          onClose={() => setAdding(false)}
          onAdded={(a) => {
            setAdding(false);
            toast('Account added');
            // inject locally so it shows even before any value is entered
            setGrid((g) =>
              g
                ? {
                    ...g,
                    groups: g.groups.map((grp) =>
                      grp.category === a.category
                        ? { ...grp, accounts: [...grp.accounts, { ...a, values: {} }] }
                        : grp,
                    ),
                  }
                : g,
            );
          }}
        />
      )}
    </div>
  );
}

// ---- group rows ----
function GroupRows({
  grp,
  months,
  subtotals,
  onCell,
  onEdit,
  onMove,
}: {
  grp: Group;
  months: { date: string; opening: boolean }[];
  subtotals: Record<string, number>;
  onCell: (id: number, date: string, v: number | null) => void;
  onEdit: (a: Acct) => void;
  onMove: (id: number, col: number, dir: 'up' | 'down' | 'left' | 'right') => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={months.length + 1}
          className="sticky left-0 bg-surface px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-muted font-semibold"
        >
          {grp.title}
        </td>
      </tr>
      {grp.accounts.map((a) => (
        <tr key={a.id} className="group hover:bg-surface-2">
          <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1.5 whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              {a.is_epf ? <Lock size={12} className="text-locked" /> : null}
              <span>{a.name}</span>
              <span
                className="text-[10px] font-medium rounded-md px-1.5 py-0.5 uppercase tracking-wide"
                style={badgeStyle(a.subtype)}
              >
                {a.subtype}
              </span>
              <button
                onClick={() => onEdit(a)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent ml-auto"
                title="Edit account"
              >
                <Pencil size={12} />
              </button>
            </div>
          </td>
          {months.map((m, mi) => (
            <td key={m.date} className="p-0">
              <EditableCell
                value={a.values[m.date]}
                onCommit={(v) => onCell(a.id, m.date, v)}
                cellId={`${a.id}:${mi}`}
                onMove={(dir) => onMove(a.id, mi, dir)}
              />
            </td>
          ))}
        </tr>
      ))}
      <tr className="bg-surface-2">
        <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
          Subtotal — {grp.title}
        </td>
        {months.map((m) => (
          <Cell key={m.date} className="font-medium text-muted">
            {numFmt(subtotals[m.date])}
          </Cell>
        ))}
      </tr>
    </>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-1.5 text-right tabular-nums whitespace-nowrap', className)}>{children}</td>;
}

function DeltaRow({
  label,
  months,
  series,
}: {
  label: string;
  months: { date: string }[];
  series: Record<string, number>;
}) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs text-muted">{label}</td>
      {months.map((m, i) => {
        const prev = i > 0 ? series[months[i - 1].date] : undefined;
        const cur = series[m.date];
        const d = prev != null && cur != null ? cur - prev : null;
        return (
          <Cell key={m.date} className={cn('text-xs', d == null ? 'text-muted' : d >= 0 ? 'text-gain' : 'text-loss')}>
            {d == null ? '' : (d >= 0 ? '+' : '') + numFmt(d)}
          </Cell>
        );
      })}
    </tr>
  );
}

// ---- editable cell ----
// Uncontrolled while editing: the DOM input holds the value during typing and we
// commit from it on blur. This avoids React reverting the value mid-edit and is
// robust to any input method. `key={fmt}` remounts the cell when the underlying
// value changes (e.g. after commit or year switch) so the display re-formats.
function EditableCell({
  value,
  onCommit,
  cellId,
  onMove,
}: {
  value?: number;
  onCommit: (v: number | null) => void;
  cellId?: string;
  onMove?: (dir: 'up' | 'down' | 'left' | 'right') => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const fmt = numFmt(value);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const t = el.value.replace(/,/g, '').trim();
    if (t === '') {
      if (value != null) onCommit(null);
      else el.value = '';
    } else {
      const n = parseFloat(t);
      if (!isNaN(n) && n !== value) onCommit(n);
      else el.value = fmt; // unchanged → restore formatting
    }
  };

  return (
    <input
      ref={ref}
      key={fmt}
      data-cell={cellId}
      defaultValue={fmt}
      inputMode="decimal"
      onFocus={(e) => {
        e.currentTarget.value = value == null ? '' : String(value);
        requestAnimationFrame(() => e.currentTarget.select());
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          onMove?.('down');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onMove?.('up');
        } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length) {
          e.preventDefault();
          onMove?.('right');
        } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
          e.preventDefault();
          onMove?.('left');
        } else if (e.key === 'Escape') {
          el.value = fmt;
          el.blur();
        }
      }}
      className="w-[104px] m-1.5 rounded-lg border border-border bg-surface-2 text-text px-2.5 py-1.5 text-right tabular-nums outline-none transition-colors hover:border-muted focus:border-accent focus:shadow-[0_0_0_3px_rgba(79,140,255,0.18)]"
    />
  );
}

// ---- account editor / add ----
function AccountEditor({ acct, onClose, onSaved }: { acct: Acct; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(acct.name);
  const [subtype, setSubtype] = useState(acct.subtype);
  const [isEpf, setIsEpf] = useState(!!acct.is_epf);
  const [isLiquid, setIsLiquid] = useState(!!acct.is_liquid);

  const save = async () => {
    await api(`/accounts/${acct.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, subtype, is_epf: isEpf, is_liquid: isLiquid }),
    });
    onSaved();
  };
  const del = async () => {
    if (!confirm(`Delete "${acct.name}" and all its history? This cannot be undone.`)) return;
    await api(`/accounts/${acct.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${acct.name}`}>
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Subtype">
        <SelectInput value={subtype} onChange={(e) => setSubtype(e.target.value)}>
          {(SUBTYPES[catOf(acct)] || ['Other']).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectInput>
      </Field>
      <div className="flex gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isEpf} onChange={(e) => setIsEpf(e.target.checked)} /> EPF (locked)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isLiquid} onChange={(e) => setIsLiquid(e.target.checked)} /> Liquid
        </label>
      </div>
      <div className="flex justify-between">
        <Button variant="danger" onClick={del}>
          <Trash2 size={14} /> Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function catOf(_a: Acct) {
  // subtype list is keyed by category; we infer from subtype membership
  for (const [cat, subs] of Object.entries(SUBTYPES)) if (subs.includes(_a.subtype)) return cat;
  return 'Investment';
}

function AddAccount({ onClose, onAdded }: { onClose: () => void; onAdded: (a: any) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Bank');
  const [subtype, setSubtype] = useState('Bank');
  const subs = SUBTYPES[category] || ['Other'];

  const add = async () => {
    if (!name.trim()) return;
    const isEpf = subtype === 'EPF';
    const a = await api('/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), category, subtype, is_epf: isEpf, is_liquid: !isEpf }),
    });
    onAdded(a);
  };

  return (
    <Modal open onClose={onClose} title="Add account">
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Touch 'n Go" autoFocus />
      </Field>
      <Field label="Category">
        <SelectInput
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSubtype((SUBTYPES[e.target.value] || ['Other'])[0]);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Subtype">
        <SelectInput value={subtype} onChange={(e) => setSubtype(e.target.value)}>
          {subs.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectInput>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={add}>Add</Button>
      </div>
    </Modal>
  );
}

// ---- totals computation (client-side, live) ----
function computeTotals(grid: Grid | null) {
  const subtotals: Record<string, Record<string, number>> = {
    Bank: {},
    Income: {},
    Liability: {},
    Investment: {},
  };
  const netWorth: Record<string, number> = {};
  const netWorthExEpf: Record<string, number> = {};
  if (!grid) return { subtotals, netWorth, netWorthExEpf };

  for (const m of grid.months) {
    const d = m.date;
    let bank = 0,
      inv = 0,
      liab = 0,
      income = 0,
      epf = 0;
    let hasAny = false;
    for (const grp of grid.groups) {
      let st = 0;
      for (const a of grp.accounts) {
        const v = a.values[d];
        if (v == null) continue;
        hasAny = true;
        st += v;
        if (grp.category === 'Bank') bank += v;
        else if (grp.category === 'Investment') {
          inv += v;
          if (a.is_epf) epf += v;
        } else if (grp.category === 'Liability') liab += v;
        else if (grp.category === 'Income') income += v;
      }
      subtotals[grp.category][d] = st;
    }
    if (hasAny) {
      netWorth[d] = bank + inv - liab;
      netWorthExEpf[d] = bank + inv - liab - epf;
    }
  }
  return { subtotals, netWorth, netWorthExEpf };
}
