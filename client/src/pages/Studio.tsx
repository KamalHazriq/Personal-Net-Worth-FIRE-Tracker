import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Download, Copy, RefreshCw } from 'lucide-react';
import { api, useDataRefresh } from '../lib/api';
import { monthLabel } from '../lib/format';
import { Card, CardHeader, Button, Field, TextInput, Toggle, PageSkeleton, cn } from '../components/ui';
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
    const series = dash.series.slice(-13); // last ~12 months + start point
    return {
      title,
      netWorth: dash.netWorth,
      mom: dash.momNetWorth,
      momPct: dash.series.length > 1 ? (dash.momNetWorth / (dash.netWorth - dash.momNetWorth)) * 100 : 0,
      exEpf: dash.netWorthExEpf,
      exEpfPct: dash.netWorth ? (dash.netWorthExEpf / dash.netWorth) * 100 : 0,
      alloc: alloc.items as { label: string; value: number; pct: number }[],
      allocTotal: alloc.total,
      series,
      handle,
      mode,
    };
  }, [dash, alloc, title, handle, mode]);

  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Palette className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">Studio</h1>
          <p className="text-sm text-muted">
            1080×1080 cards from your live numbers — download or copy, then post. Your handle & theme stay on this
            machine.
          </p>
        </div>
      </div>

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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <StudioCard id="1-number" draw={(x) => drawCover(x, data, theme)} deps={[data, theme]} toast={toast} title={data.title} />
        <StudioCard id="2-allocation" draw={(x) => drawDonut(x, data, theme)} deps={[data, theme]} toast={toast} title={data.title} />
        <StudioCard id="3-trend" draw={(x) => drawTrend(x, data, theme)} deps={[data, theme]} toast={toast} title={data.title} />
      </div>

      <p className="text-xs text-muted">
        Reminder: share what you <i>did</i>, never what others should buy. Cards say “personal journal · not financial
        advice” for a reason.
      </p>
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

function bgBase(x: Ctx, t: Theme) {
  const g = x.createLinearGradient(0, 0, 0, SIZE);
  g.addColorStop(0, t.bgTop);
  g.addColorStop(1, t.bgBottom);
  x.fillStyle = g;
  x.fillRect(0, 0, SIZE, SIZE);
  // faint background sprout-coins for texture
  x.save();
  x.globalAlpha = 0.08;
  sproutCoin(x, 920, 180, 130, t);
  sproutCoin(x, 140, 900, 90, t);
  x.restore();
}

function header(x: Ctx, t: Theme, kicker: string, big: string) {
  x.textAlign = 'left';
  x.fillStyle = t.dim;
  x.font = F(700, 38);
  x.fillText(kicker.toUpperCase(), 84, 122);
  x.fillStyle = t.ink;
  x.font = F(800, 68);
  x.fillText(big, 84, 205);
  // underline squiggle
  x.strokeStyle = t.accent;
  x.lineWidth = 8;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(88, 235);
  x.quadraticCurveTo(160, 255, 240, 235);
  x.stroke();
}

function footer(x: Ctx, t: Theme, handle: string) {
  sproutCoin(x, 100, SIZE - 84, 20, t);
  x.textAlign = 'left';
  x.fillStyle = t.dim;
  x.font = F(500, 22);
  x.fillText('personal journal · not financial advice', 136, SIZE - 76);
  x.textAlign = 'right';
  x.fillStyle = t.ink;
  x.font = F(800, 28);
  x.fillText(handle, SIZE - 84, SIZE - 76);
  x.textAlign = 'left';
}

/** Original brand mark: a coin with a two-leaf sprout. */
function sproutCoin(x: Ctx, cx: number, cy: number, r: number, t: Theme) {
  x.save();
  // coin
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = t.coin;
  x.fill();
  x.lineWidth = Math.max(3, r * 0.09);
  x.strokeStyle = shade(t.coin, -30);
  x.stroke();
  // inner rim
  x.beginPath();
  x.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  x.strokeStyle = shade(t.coin, -18);
  x.lineWidth = Math.max(2, r * 0.05);
  x.stroke();
  // RM letters
  x.fillStyle = shade(t.coin, -45);
  x.font = F(800, Math.round(r * 0.62));
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('RM', cx, cy + r * 0.05);
  x.textBaseline = 'alphabetic';
  // sprout stem
  const sy = cy - r;
  x.strokeStyle = t.accent;
  x.lineWidth = Math.max(4, r * 0.12);
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(cx, sy + r * 0.1);
  x.quadraticCurveTo(cx + r * 0.05, sy - r * 0.25, cx, sy - r * 0.45);
  x.stroke();
  // leaves
  leaf(x, cx, sy - r * 0.42, r * 0.42, -1, t.accent);
  leaf(x, cx, sy - r * 0.42, r * 0.42, 1, shade(t.accent, 18));
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

function panel(x: Ctx, t: Theme, px: number, py: number, w: number, h: number, alpha = 0.55) {
  x.save();
  x.globalAlpha = alpha;
  roundRect(x, px, py, w, h, 36);
  x.fillStyle = t.panel;
  x.fill();
  x.restore();
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

function shade(hex: string, amt: number): string {
  const n = hex.replace('#', '');
  const v = (i: number) => Math.max(0, Math.min(255, parseInt(n.slice(i, i + 2), 16) + amt));
  return `rgb(${v(0)},${v(2)},${v(4)})`;
}

// ---------- Card 1: the number ----------
function drawCover(x: Ctx, d: any, t: Theme) {
  bgBase(x, t);
  header(x, t, 'net worth update', d.title);

  const up = d.mom >= 0;
  panel(x, t, 84, 320, SIZE - 168, 430);

  x.fillStyle = t.dim;
  x.font = F(700, 40);
  x.fillText(d.mode === 'rm' ? 'Net worth' : 'Net worth growth', 140, 420);

  x.fillStyle = t.ink;
  if (d.mode === 'rm') {
    x.font = F(800, 128);
    x.fillText(rmFmt(d.netWorth), 132, 560);
  } else {
    x.font = F(800, 168);
    x.fillText(pctFmt(d.momPct, 1), 132, 580);
  }

  // delta pill
  const deltaTxt = d.mode === 'rm' ? `${up ? '▲' : '▼'} ${rmFmt(Math.abs(d.mom)).slice(3)} vs last month  (${pctFmt(d.momPct, 1)})` : `${up ? '▲' : '▼'} vs last month`;
  x.font = F(700, 44);
  const tw = x.measureText(deltaTxt).width;
  roundRect(x, 132, 620, tw + 72, 84, 42);
  x.fillStyle = up ? t.accent : '#d64550';
  x.fill();
  x.fillStyle = '#ffffff';
  x.fillText(deltaTxt, 168, 676);

  // accessible line
  x.fillStyle = t.dim;
  x.font = F(600, 40);
  const exTxt =
    d.mode === 'rm'
      ? `FIRE-usable (ex-EPF): ${rmFmt(d.exEpf)}`
      : `FIRE-usable (ex-EPF): ${d.exEpfPct.toFixed(0)}% of net worth`;
  x.fillText(exTxt, 132, 800);

  footer(x, t, d.handle);
}

// ---------- Card 2: allocation donut ----------
function drawDonut(x: Ctx, d: any, t: Theme) {
  bgBase(x, t);
  header(x, t, 'where it sits', d.title);

  const items = d.alloc;
  const total = items.reduce((s: number, i: any) => s + i.value, 0) || 1;
  const palette = donutPalette(t, items.length);

  const cx = SIZE / 2;
  const cy = 600;
  const R = 265;
  const r = 158;

  // slices + collect label positions (name + %, no legend)
  let ang = -Math.PI / 2;
  const labels: { mid: number; text: string; color: string }[] = [];
  items.forEach((it: any, i: number) => {
    const sw = (it.value / total) * Math.PI * 2;
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, R, ang, ang + sw);
    x.closePath();
    x.fillStyle = palette[i];
    x.fill();
    if (it.value / total >= 0.015) {
      const name = it.label === 'Cash/Bank' ? 'Cash' : it.label;
      labels.push({ mid: ang + sw / 2, text: `${name} ${it.pct.toFixed(1)}%`, color: palette[i] });
    }
    ang += sw;
  });

  // hole
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  const g = x.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, t.bgTop);
  g.addColorStop(1, t.bgBottom);
  x.fillStyle = g;
  x.fill();
  x.textAlign = 'center';
  x.fillStyle = t.ink;
  if (d.mode === 'rm') {
    x.font = F(800, 54);
    x.fillText(rmFmt(total), cx, cy);
    x.font = F(600, 30);
    x.fillStyle = t.dim;
    x.fillText('total assets', cx, cy + 46);
  } else {
    x.font = F(800, 50);
    x.fillText('allocation', cx, cy + 8);
  }
  x.textAlign = 'left';

  // labels around the pie with leader lines; stacked per side so they never overlap
  const MIN = 48;
  const layoutSide = (side: typeof labels, sign: 1 | -1) => {
    const pts = side
      .map((l) => ({ ...l, y: cy + Math.sin(l.mid) * (R + 58) }))
      .sort((a, b) => a.y - b.y);
    for (const p of pts) p.y = Math.max(280, p.y); // keep clear of the header
    for (let i = 1; i < pts.length; i++) if (pts[i].y - pts[i - 1].y < MIN) pts[i].y = pts[i - 1].y + MIN;
    pts.forEach((p) => {
      const sx = cx + Math.cos(p.mid) * (R + 6);
      const sy = cy + Math.sin(p.mid) * (R + 6);
      const elbow = cx + sign * (R + 44);
      x.strokeStyle = p.color;
      x.lineWidth = 5;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(elbow, p.y - 10);
      x.lineTo(elbow + sign * 18, p.y - 10);
      x.stroke();
      x.fillStyle = t.ink;
      x.font = F(700, 31);
      x.textAlign = sign > 0 ? 'left' : 'right';
      x.fillText(p.text, elbow + sign * 30, p.y);
    });
  };
  layoutSide(labels.filter((l) => Math.cos(l.mid) >= 0), 1);
  layoutSide(labels.filter((l) => Math.cos(l.mid) < 0), -1);
  x.textAlign = 'left';

  footer(x, t, d.handle);
}

function donutPalette(t: Theme, n: number): string[] {
  const base = [t.accent, t.coin, '#5b8cff', '#a06bff', '#ff8a5c', '#e05c7a', '#54b8d0', '#8b97ab'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

// ---------- Card 3: trend ----------
function drawTrend(x: Ctx, d: any, t: Theme) {
  bgBase(x, t);
  header(x, t, 'the climb', d.title);

  const pts = d.series.map((s: any) => ({ label: monthLabel(s.date), v: s.netWorth }));
  if (pts.length < 2) return footer(x, t, d.handle);
  const vals = pts.map((p: any) => p.v);
  const lo = Math.min(...vals) * 0.96;
  const hi = Math.max(...vals) * 1.04;
  const X0 = 120, X1 = SIZE - 100, Y0 = 780, Y1 = 320;
  const px = (i: number) => X0 + ((X1 - X0) * i) / (pts.length - 1);
  const py = (v: number) => Y0 - ((Y0 - Y1) * (v - lo)) / (hi - lo);

  // area fill
  x.beginPath();
  x.moveTo(px(0), Y0);
  pts.forEach((p: any, i: number) => x.lineTo(px(i), py(p.v)));
  x.lineTo(px(pts.length - 1), Y0);
  x.closePath();
  const g = x.createLinearGradient(0, Y1, 0, Y0);
  g.addColorStop(0, hexA(t.accent, 0.45));
  g.addColorStop(1, hexA(t.accent, 0));
  x.fillStyle = g;
  x.fill();

  // line
  x.beginPath();
  pts.forEach((p: any, i: number) => (i ? x.lineTo(px(i), py(p.v)) : x.moveTo(px(i), py(p.v))));
  x.strokeStyle = t.accent;
  x.lineWidth = 10;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.stroke();

  // dots + sparse labels
  pts.forEach((p: any, i: number) => {
    x.beginPath();
    x.arc(px(i), py(p.v), 11, 0, Math.PI * 2);
    x.fillStyle = t.accent;
    x.fill();
    x.beginPath();
    x.arc(px(i), py(p.v), 5, 0, Math.PI * 2);
    x.fillStyle = '#ffffff';
    x.fill();
    if (i % Math.ceil(pts.length / 6) === 0 || i === pts.length - 1) {
      x.fillStyle = t.dim;
      x.font = F(600, 26);
      x.textAlign = 'center';
      x.fillText(p.label, px(i), Y0 + 46);
      x.textAlign = 'left';
    }
  });
  // first/last value labels
  const first = vals[0], last = vals[vals.length - 1];
  x.textAlign = 'center';
  x.fillStyle = t.ink;
  x.font = F(800, 40);
  if (d.mode === 'rm') {
    x.fillText((first / 1000).toFixed(0) + 'k', px(0), py(first) - 34);
    x.fillText((last / 1000).toFixed(0) + 'k', px(pts.length - 1), py(last) - 34);
  }
  x.textAlign = 'left';

  // caption — kept well below the month-label row
  const growth = ((last - first) / first) * 100;
  x.fillStyle = t.ink;
  x.font = F(800, 46);
  const cap =
    d.mode === 'rm'
      ? `+${rmFmt(last - first).slice(3)} in ${pts.length - 1} months (${pctFmt(growth, 0)})`
      : `${pctFmt(growth, 0)} in ${pts.length - 1} months`;
  x.fillText(cap, 120, 910);

  footer(x, t, d.handle);
}

function hexA(hex: string, a: number): string {
  const n = hex.replace('#', '');
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
}
