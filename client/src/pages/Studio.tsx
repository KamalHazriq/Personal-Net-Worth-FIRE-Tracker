import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Download, Copy } from 'lucide-react';
import { api, useDataRefresh } from '../lib/api';
import { rm } from '../lib/format';
import { Card, CardHeader, Button, Field, TextInput, Toggle, PageSkeleton, PageHeader, cn } from '../components/ui';
import { useToast } from '../components/Toast';

/**
 * Studio — renders shareable 1080×1080 social cards (Threads/IG) from live data.
 * Everything renders locally on <canvas>; nothing identifying is stored in code:
 * the @handle lives in localStorage only (this repo is public).
 */

const SIZE = 1080;

interface Theme {
  bgTop: string;
  bgBottom: string;
  ink: string;
  dim: string;
  accent: string; // sprout / positive
  coin: string; // coin gold
  panel: string; // translucent panel base (hex, alpha applied in code)
}

const PRESETS: { name: string; t: Theme }[] = [
  {
    name: 'Rookie mint',
    t: { bgTop: '#8fc7b6', bgBottom: '#dcefe4', ink: '#17322c', dim: '#4e6e66', accent: '#1f9d76', coin: '#e8b84b', panel: '#ffffff' },
  },
  {
    name: 'Warm paper',
    t: { bgTop: '#f4e5d3', bgBottom: '#efd7bd', ink: '#4a2e24', dim: '#8a6a58', accent: '#0f766e', coin: '#b4632e', panel: '#fffaf3' },
  },
  {
    name: 'Dark fintech',
    t: { bgTop: '#10151f', bgBottom: '#0b0f17', ink: '#f2f5f9', dim: '#8b93a3', accent: '#2dd4a7', coin: '#e8c547', panel: '#161b26' },
  },
  {
    name: 'Sunset',
    t: { bgTop: '#fdd9a0', bgBottom: '#f7b2a4', ink: '#3d1f2b', dim: '#7c4a56', accent: '#c2417c', coin: '#f59e0b', panel: '#fff4ec' },
  },
];

const rmFmt = (n: number) => 'RM ' + Math.round(n).toLocaleString('en-MY');
const pctFmt = (n: number, dp = 1) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%';

export default function Studio() {
  const [dash, setDash] = useState<any>(null);
  const [alloc, setAlloc] = useState<any>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const s = localStorage.getItem('studio_theme');
      if (s) return JSON.parse(s);
    } catch {}
    return PRESETS[0].t;
  });
  const [handle, setHandle] = useState(() => localStorage.getItem('studio_handle') || '@yourhandle');
  const [mode, setMode] = useState<'rm' | 'pct'>((localStorage.getItem('studio_mode') as any) || 'rm');
  const [title, setTitle] = useState('');
  const toast = useToast();

  const load = () =>
    Promise.all([api('/dashboard'), api('/allocation')]).then(([d, a]) => {
      setDash(d);
      setAlloc(a);
      setTitle((t) => t || monthFull(d.latestDate));
    });
  useEffect(() => {
    load();
  }, []);
  useDataRefresh(load);

  useEffect(() => {
    localStorage.setItem('studio_theme', JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('studio_handle', handle);
  }, [handle]);
  useEffect(() => {
    localStorage.setItem('studio_mode', mode);
  }, [mode]);

  const data = useMemo(() => {
    if (!dash || !alloc) return null;
    // per-asset breakdown with month-over-month change (from the series' byCategory)
    const s = dash.series;
    // Net of any borrowing. These cards get posted publicly next to a net-worth
    // figure, and gross slices beside a net number describe a bigger portfolio
    // than the one you have — a financed asset would read as if you owned it
    // outright. Netting is also the more private option: the card simply shows
    // your equity, with no need to disclose the financing at all.
    return {
      title,
      netWorth: dash.netWorth,
      mom: dash.momNetWorth,
      momPct: dash.series.length > 1 ? (dash.momNetWorth / (dash.netWorth - dash.momNetWorth)) * 100 : 0,
      exEpf: dash.netWorthExEpf,
      exEpfPct: dash.netWorth ? (dash.netWorthExEpf / dash.netWorth) * 100 : 0,
      alloc: (alloc.netItems ?? alloc.items) as { label: string; value: number; pct: number }[],
      allocTotal: alloc.netTotal ?? alloc.total,
      debtNetted: alloc.totalDebt ?? 0,
      handle,
      mode,
    };
  }, [dash, alloc, title, handle, mode]);

  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Palette}
        title="Studio"
        subtitle="Two 1080×1080 cards from your live numbers — download or copy, then post. Your handle & theme stay on this machine."
      />

      {/* Controls */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Card title (month)">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Your handle (saved locally)">
            <TextInput value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" />
          </Field>
          <Field label="Numbers">
            <Toggle
              value={mode}
              onChange={(v) => setMode(v as any)}
              options={[
                { label: 'Exact RM', value: 'rm' },
                { label: '% only', value: 'pct' },
              ]}
            />
          </Field>
          <Field label="Theme presets">
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  title={p.name}
                  aria-label={`Use ${p.name} theme`}
                  onClick={() => setTheme(p.t)}
                  className="w-7 h-7 rounded-lg border border-border"
                  style={{ background: `linear-gradient(135deg, ${p.t.bgTop}, ${p.t.bgBottom})` }}
                />
              ))}
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 mt-2">
          {(
            [
              ['bgTop', 'Background top'],
              ['bgBottom', 'Background bottom'],
              ['ink', 'Text'],
              ['accent', 'Accent'],
              ['coin', 'Coin'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-muted cursor-pointer">
              <input
                type="color"
                value={(theme as any)[k]}
                onChange={(e) => setTheme((t) => ({ ...t, [k]: e.target.value }))}
                className="w-8 h-8 rounded border border-border bg-transparent cursor-pointer"
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        <StudioCard id="net-worth" draw={(x) => drawCover(x, data, theme)} deps={[data, theme]} toast={toast} title={data.title} />
        <StudioCard id="allocation" draw={(x) => drawDonut(x, data, theme)} deps={[data, theme]} toast={toast} title={data.title} />
      </div>

      <p className="text-xs text-muted">
        Reminder: share what you <i>did</i>, never what others should buy. Cards say “personal journal · not financial
        advice” for a reason.
      </p>
      {data.debtNetted > 0 && (
        <p className="text-xs text-muted">
          The allocation card shows your <strong className="text-text">equity</strong> — each
          borrowing is subtracted from the asset it funded, so the slices add up to the net-worth figure
          on the cards ({rm(data.allocTotal)}). A financed asset shown gross would read as though you
          owned it outright, which is the one thing a shared card must not do. It also means you need
          not disclose the {rm(data.debtNetted)} of financing at all.
        </p>
      )}
    </div>
  );
}

function monthFull(date: string) {
  const [y, m] = date.split('-');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[Number(m) - 1]} ${y}`;
}

// ---------- card shell ----------
function StudioCard({
  id,
  title,
  draw,
  deps,
  toast,
}: {
  id: string;
  title: string;
  draw: (x: CanvasRenderingContext2D) => void;
  deps: any[];
  toast: (m: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    if (!x) return;
    x.clearRect(0, 0, SIZE, SIZE);
    draw(x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const download = () => {
    const c = ref.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `${title.replace(/\s+/g, '-')}-${id}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };
  const copy = async () => {
    const c = ref.current;
    if (!c) return;
    try {
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Copied — paste into Threads/IG');
    } catch {
      toast('Copy not supported here — use Download');
    }
  };

  return (
    <Card className="p-3">
      <canvas ref={ref} width={SIZE} height={SIZE} className="w-full rounded-lg border border-border" />
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={download}>
          <Download size={14} /> PNG
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy size={14} /> Copy
        </Button>
      </div>
    </Card>
  );
}

// ---------- shared drawing helpers ----------
type Ctx = CanvasRenderingContext2D;
const F = (w: number, s: number) => `${w} ${s}px 'Segoe UI', 'Arial Rounded MT Bold', Arial, sans-serif`;

/** Outer margin. Everything lines up on this, so the two cards feel like a set. */
const M = 96;

function hexA(hex: string, a: number): string {
  const n = hex.replace('#', '');
  const v = (i: number) => parseInt(n.slice(i, i + 2), 16);
  return `rgba(${v(0)},${v(2)},${v(4)},${a})`;
}

function shade(hex: string, amt: number): string {
  const n = hex.replace('#', '');
  const v = (i: number) => Math.max(0, Math.min(255, parseInt(n.slice(i, i + 2), 16) + amt));
  return `rgb(${v(0)},${v(2)},${v(4)})`;
}

function roundRect(x: Ctx, a: number, b: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

/**
 * Shrink until it fits. Net worth is the whole point of the card, so it must
 * never be clipped or wrap — and it gains a digit every so often.
 */
function fitText(x: Ctx, txt: string, maxW: number, weight: number, start: number, min = 56): number {
  let s = start;
  for (;;) {
    x.font = F(weight, s);
    if (x.measureText(txt).width <= maxW || s <= min) break;
    s -= 4;
  }
  return s;
}

/** Letter-spaced small caps, for the one line above the month. */
function kicker(x: Ctx, t: Theme, txt: string, y: number) {
  x.save();
  x.fillStyle = hexA(t.dim, 0.95);
  x.font = F(700, 30);
  let px = M;
  for (const ch of txt.toUpperCase()) {
    x.fillText(ch, px, y);
    px += x.measureText(ch).width + 4.5;
  }
  x.restore();
}

function rule(x: Ctx, t: Theme, y: number) {
  x.save();
  x.strokeStyle = hexA(t.ink, 0.14);
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(M, y);
  x.lineTo(SIZE - M, y);
  x.stroke();
  x.restore();
}

/**
 * The background wash, as a fill style. Defined over the whole canvas rather
 * than relative to a shape, so filling any shape with it lands exactly the
 * colour the background has at that spot - which is how the donut hole is cut.
 */
function bgGradient(x: Ctx, t: Theme): CanvasGradient {
  const g = x.createLinearGradient(0, 0, 0, SIZE);
  g.addColorStop(0, t.bgTop);
  g.addColorStop(1, t.bgBottom);
  return g;
}

function bgBase(x: Ctx, t: Theme) {
  // A plain vertical wash. The old version stamped faint coin watermarks over
  // this; at feed size they read as smudges rather than as texture.
  x.fillStyle = bgGradient(x, t);
  x.fillRect(0, 0, SIZE, SIZE);
}

function header(x: Ctx, t: Theme, eyebrow: string, month: string) {
  x.textAlign = 'left';
  kicker(x, t, eyebrow, 150);
  x.fillStyle = t.ink;
  const s = fitText(x, month, SIZE - M * 2, 800, 64, 40);
  x.fillText(month, M, 150 + s + 14);
  rule(x, t, 150 + s + 56);
}

function footer(x: Ctx, t: Theme, handle: string) {
  const y = SIZE - 86;
  rule(x, t, y - 48);
  sproutCoin(x, M + 17, y - 9, 17, t);
  x.textAlign = 'left';
  x.fillStyle = hexA(t.dim, 0.9);
  x.font = F(600, 24);
  x.fillText('personal journal · not financial advice', M + 48, y);
  x.textAlign = 'right';
  x.fillStyle = t.ink;
  x.font = F(800, 30);
  x.fillText(handle, SIZE - M, y);
  x.textAlign = 'left';
}

/** Original brand mark: a coin with a two-leaf sprout. */
function sproutCoin(x: Ctx, cx: number, cy: number, r: number, t: Theme) {
  x.save();
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = t.coin;
  x.fill();
  x.lineWidth = Math.max(2, r * 0.09);
  x.strokeStyle = shade(t.coin, -30);
  x.stroke();
  x.fillStyle = shade(t.coin, -45);
  x.font = F(800, Math.round(r * 0.72));
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('RM', cx, cy + r * 0.06);
  x.textBaseline = 'alphabetic';
  const sy = cy - r;
  x.strokeStyle = t.accent;
  x.lineWidth = Math.max(3, r * 0.14);
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(cx, sy + r * 0.12);
  x.quadraticCurveTo(cx + r * 0.05, sy - r * 0.22, cx, sy - r * 0.4);
  x.stroke();
  leaf(x, cx, sy - r * 0.38, r * 0.4, -1, t.accent);
  leaf(x, cx, sy - r * 0.38, r * 0.4, 1, shade(t.accent, 18));
  x.restore();
  x.textAlign = 'left';
}

function leaf(x: Ctx, px: number, py: number, s: number, dir: number, col: string) {
  x.beginPath();
  x.moveTo(px, py);
  x.quadraticCurveTo(px + dir * s, py - s * 0.35, px + dir * s * 1.15, py - s * 0.95);
  x.quadraticCurveTo(px + dir * s * 0.25, py - s * 0.8, px, py);
  x.closePath();
  x.fillStyle = col;
  x.fill();
}

function donutPalette(t: Theme, n: number): string[] {
  const base = [t.accent, t.coin, '#5b8cff', '#a06bff', '#ff8a5c', '#e05c7a', '#54b8d0', '#8b97ab'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

// ---------- Card 1: the number ----------
function drawCover(x: Ctx, d: any, t: Theme) {
  bgBase(x, t);
  header(x, t, 'net worth update', d.title);

  const up = d.mom >= 0;
  const pctMode = d.mode !== 'rm';

  x.fillStyle = hexA(t.dim, 0.95);
  x.font = F(600, 34);
  x.fillText(pctMode ? 'Net worth growth' : 'Net worth', M, 400);

  // The hero figure, sized to the space rather than to a fixed number, so one
  // more digit never pushes it off the card.
  const big = pctMode ? pctFmt(d.momPct, 1) : rmFmt(d.netWorth);
  x.fillStyle = t.ink;
  const bs = fitText(x, big, SIZE - M * 2, 800, 170, 90);
  x.fillText(big, M, 400 + bs * 0.78 + 36);

  const pillY = 400 + bs * 0.78 + 92;
  const arrow = up ? '▲' : '▼';
  const deltaTxt = pctMode
    ? `${arrow} vs last month`
    : `${arrow} ${rmFmt(Math.abs(d.mom)).slice(3)}  ·  ${pctFmt(d.momPct, 1)} vs last month`;
  x.font = F(700, 38);
  const tw = x.measureText(deltaTxt).width;
  roundRect(x, M, pillY, tw + 64, 76, 38);
  x.fillStyle = up ? t.accent : '#d64550';
  x.fill();
  x.fillStyle = '#ffffff';
  x.fillText(deltaTxt, M + 32, pillY + 50);

  // The figure that actually matters before 55, EPF being locked until then.
  rule(x, t, 806);
  x.fillStyle = hexA(t.dim, 0.95);
  x.font = F(600, 30);
  x.fillText('FIRE-usable  ·  excludes EPF', M, 866);
  x.fillStyle = t.ink;
  x.font = F(800, 58);
  x.fillText(pctMode ? `${d.exEpfPct.toFixed(0)}%` : rmFmt(d.exEpf), M, 928);
  if (!pctMode) {
    x.fillStyle = hexA(t.dim, 0.9);
    x.font = F(700, 30);
    x.textAlign = 'right';
    x.fillText(`${d.exEpfPct.toFixed(0)}% of net worth`, SIZE - M, 928);
    x.textAlign = 'left';
  }

  footer(x, t, d.handle);
}

// ---------- Card 2: allocation ----------
function drawDonut(x: Ctx, d: any, t: Theme) {
  bgBase(x, t);
  header(x, t, 'where it sits', d.title);

  const items = d.alloc.filter((i: any) => i.value > 0);
  const total = items.reduce((s: number, i: any) => s + i.value, 0) || 1;
  const palette = donutPalette(t, items.length);
  const pctMode = d.mode !== 'rm';

  const cx = 330;
  const cy = 620;
  const R = 196;
  const r = 122;

  let ang = -Math.PI / 2;
  items.forEach((it: any, i: number) => {
    const sw = (it.value / total) * Math.PI * 2;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, R, ang, ang + sw);
    x.closePath();
    x.fillStyle = palette[i];
    x.fill();
    ang += sw;
  });

  // Fill the hole with the background rather than erasing to transparent:
  // destination-out leaves a see-through disc in the exported PNG, and dark
  // centre text then sits on whatever happens to be behind it.
  x.fillStyle = bgGradient(x, t);
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();

  x.textAlign = 'center';
  if (pctMode) {
    x.fillStyle = t.ink;
    x.font = F(800, 42);
    x.fillText('allocation', cx, cy + 14);
  } else {
    x.fillStyle = t.ink;
    const s = fitText(x, rmFmt(d.netWorth), r * 1.75, 800, 46, 26);
    x.fillText(rmFmt(d.netWorth), cx, cy + 2);
    x.fillStyle = hexA(t.dim, 0.95);
    x.font = F(600, 24);
    x.fillText('net worth', cx, cy + s * 0.6 + 22);
  }
  x.textAlign = 'left';

  // A legend, not leader lines. Six labels with elbows around a pie turn into
  // noise once the card is scaled down to a phone feed; a list stays readable
  // and leaves room for the ringgit figure as well.
  const lx = 608;
  const pitch = Math.min(74, Math.floor(430 / Math.max(items.length, 1)));
  let ly = cy - ((items.length - 1) * pitch) / 2 - 10;
  items.forEach((it: any, i: number) => {
    const name = it.label === 'Cash/Bank' ? 'Cash' : it.label;
    roundRect(x, lx, ly - 22, 26, 26, 8);
    x.fillStyle = palette[i];
    x.fill();

    x.fillStyle = t.ink;
    x.font = F(700, 34);
    x.fillText(name, lx + 44, ly);

    x.textAlign = 'right';
    x.font = F(800, 34);
    x.fillText(it.pct.toFixed(1) + '%', SIZE - M, ly);
    if (!pctMode) {
      x.fillStyle = hexA(t.dim, 0.9);
      x.font = F(600, 24);
      x.fillText(rmFmt(it.value), SIZE - M, ly + 28);
    }
    x.textAlign = 'left';
    ly += pitch;
  });

  footer(x, t, d.handle);
}
