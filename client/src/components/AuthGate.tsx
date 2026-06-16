import { ReactNode, useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { api, setToken, clearToken } from '../lib/api';

type State = 'loading' | 'open' | 'locked';

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading');

  const check = async () => {
    try {
      const s = await api('/auth/status');
      if (!s.enabled) return setState('open');
      setState(s.unlocked ? 'open' : 'locked');
    } catch {
      // API unreachable — let the app render and surface its own error
      setState('open');
    }
  };

  useEffect(() => {
    check();
    const onRequired = () => {
      clearToken();
      setState('locked');
    };
    window.addEventListener('auth:required', onRequired);
    return () => window.removeEventListener('auth:required', onRequired);
  }, []);

  if (state === 'loading')
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (state === 'locked') return <Unlock onUnlocked={() => setState('open')} />;
  return <>{children}</>;
}

function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ passcode: pass }) });
      setToken(r.token);
      setPass('');
      onUnlocked();
    } catch (e: any) {
      setErr(e.message === 'wrong passcode' ? 'Wrong passcode' : 'Could not unlock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xs rounded-xl border border-border bg-surface p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/15 mb-3">
          <Lock className="text-accent" size={22} />
        </div>
        <h1 className="font-semibold">Locked</h1>
        <p className="text-xs text-muted mt-1 mb-4">Enter your passcode to open the tracker.</p>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoFocus
          placeholder="Passcode"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-center outline-none focus:border-accent"
        />
        {err && <p className="text-loss text-xs mt-2">{err}</p>}
        <button
          type="submit"
          disabled={busy || !pass}
          className="mt-4 w-full rounded-lg bg-accent text-white py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
