import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, AlertTriangle, Globe, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button, cn } from './ui';

const HELPERS = [
  'Review my current allocation vs my targets',
  'Which holdings are most concentrated or overweight?',
  'Run my monthly review — what changed and what deserves attention?',
  'Is my FIRE plan on track to retire by my target age?',
];

const BUYSELL_RE = /\b(buy|sell|trim|add to|exit|reduce|accumulate|take profit)\b/i;

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  usedWebSearch?: boolean;
  buySell?: boolean;
}

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [web, setWeb] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api('/assistant/status').then((s) => {
      setStatus(s);
      setWeb(!!s.webSearch);
    });
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api('/assistant/chat', { method: 'POST', body: JSON.stringify({ question: q, useWebSearch: web }) });
      if (r.ok) {
        setMsgs((m) => [...m, { role: 'assistant', text: r.text, usedWebSearch: r.usedWebSearch, buySell: BUYSELL_RE.test(r.text) }]);
      } else {
        setMsgs((m) => [
          ...m,
          {
            role: 'assistant',
            text:
              r.error === 'no-key'
                ? '⚠️ No API key configured. Add ANTHROPIC_API_KEY to a .env file and restart the server. The rest of the app works fully offline.'
                : 'Could not reach the model: ' + r.error,
          },
        ]);
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Request failed: ' + e.message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* guardrail banner */}
      <div className="flex items-start gap-2 bg-[#f5b301]/10 text-[#f5b301] text-xs px-3 py-2 rounded-lg mb-3 shrink-0">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>Personal finance organiser &amp; analysis — <b>not a licensed financial advisor</b>. Verify prices and Shariah compliance before acting.</span>
      </div>

      {/* messages */}
      <div className={cn('flex-1 overflow-y-auto space-y-3 min-h-0', compact ? '' : 'pr-1')}>
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Ask about your real numbers. Try:</p>
            {HELPERS.map((h) => (
              <button
                key={h}
                onClick={() => ask(h)}
                disabled={busy || !status?.hasKey}
                className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-surface-2 disabled:opacity-50"
              >
                {h}
              </button>
            ))}
            {status && !status.hasKey && (
              <p className="text-xs text-muted mt-2">No API key yet — add <code className="bg-surface-2 px-1 rounded">ANTHROPIC_API_KEY</code> to <code className="bg-surface-2 px-1 rounded">.env</code> and restart. Everything else works offline.</p>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('text-sm', m.role === 'user' ? 'text-right' : '')}>
            <div className={cn('inline-block rounded-xl px-3 py-2 max-w-[92%] text-left whitespace-pre-line', m.role === 'user' ? 'bg-accent text-white' : 'bg-surface-2')}>
              {m.text}
              {m.usedWebSearch && (
                <span className="flex items-center gap-1 text-[10px] text-muted mt-1"><Globe size={10} /> used web search</span>
              )}
            </div>
            {m.buySell && (
              <div className="mt-1 inline-block text-left bg-loss/10 border border-loss/30 rounded-lg px-3 py-2 text-xs">
                <div className="font-medium text-loss mb-1">Before acting on any buy/sell:</div>
                <label className="flex items-center gap-2"><input type="checkbox" /> Current price verified</label>
                <label className="flex items-center gap-2"><input type="checkbox" /> Shariah status verified (Zoya / Musaffa / Islamicly)</label>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> thinking…</div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="mt-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> <Globe size={12} /> web search
          </label>
          {status && <span className="text-[10px] text-muted ml-auto">{status.model}</span>}
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={2}
            placeholder={status?.hasKey ? 'Ask about your finances…' : 'Add an API key to chat'}
            disabled={!status?.hasKey || busy}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent resize-none disabled:opacity-50"
          />
          <Button onClick={() => ask(input)} disabled={!status?.hasKey || busy || !input.trim()}>
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed z-50 right-0 top-0 h-full w-full sm:w-[420px] bg-surface border-l border-border flex flex-col p-4">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <span className="font-semibold">My Finances</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18} /></button>
        </div>
        <AssistantChat compact />
      </aside>
    </>
  );
}
