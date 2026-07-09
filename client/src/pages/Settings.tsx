import { useEffect, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText, KeyRound, CheckCircle2, XCircle, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import { api, setToken, clearToken } from '../lib/api';
import { Card, CardHeader, Field, TextInput, SelectInput, Button } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Settings() {
  const [s, setS] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api('/settings').then(setS);
    api('/assistant/status').then(setStatus);
  }, []);

  const update = (patch: any) => {
    setS((prev: any) => ({ ...prev, ...patch }));
    api('/settings', { method: 'PUT', body: JSON.stringify(patch) }).then((r) => {
      setS(r);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const syncRate = async () => {
    setSyncing(true);
    try {
      const res = await api('/settings/sync-rate', { method: 'POST' });
      if (res.rate) {
        setS((prev: any) => ({ ...prev, usd_myr_rate: res.rate }));
        toast(`Rate updated to ${res.rate}`);
      }
    } catch {
      toast('Failed to sync rate');
    } finally {
      setSyncing(false);
    }
  };

  if (!s) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted mt-1">Everything is stored locally. {saved && <span className="text-gain">Saved ✓</span>}</p>
      </div>

      <Card className="p-5">
        <CardHeader title="General" />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="USD → MYR rate">
            <div className="flex gap-2">
              <TextInput type="number" step="0.01" value={s.usd_myr_rate} onChange={(e) => update({ usd_myr_rate: Number(e.target.value) })} />
              <Button variant="outline" onClick={syncRate} disabled={syncing} title="Sync from open.er-api.com">
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              </Button>
            </div>
          </Field>
          <Field label="Current age">
            <TextInput type="number" value={s.current_age} onChange={(e) => update({ current_age: Number(e.target.value) })} />
          </Field>
          <Field label="Target retirement age">
            <TextInput type="number" value={s.target_retire_age} onChange={(e) => update({ target_retire_age: Number(e.target.value) })} />
          </Field>
          <Field label="EPF unlock age">
            <TextInput type="number" value={s.epf_unlock_age} onChange={(e) => update({ epf_unlock_age: Number(e.target.value) })} />
          </Field>
          <Field label="FIRE target income (RM/mo)">
            <TextInput type="number" step="500" value={s.fire_target_monthly_income} onChange={(e) => update({ fire_target_monthly_income: Number(e.target.value) })} />
          </Field>
          <Field label="Safe withdrawal rate (%)">
            <TextInput type="number" step="0.1" value={(s.swr * 100).toFixed(1)} onChange={(e) => update({ swr: Number(e.target.value) / 100 })} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="AI Assistant" subtitle="Optional. Key read by the local backend only — never sent to the browser." />
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound size={16} className="text-muted" />
            {status?.hasKey ? (
              <span className="flex items-center gap-1 text-gain"><CheckCircle2 size={15} /> API key detected — Assistant enabled</span>
            ) : (
              <span className="flex items-center gap-1 text-muted"><XCircle size={15} /> No key. Add <code className="bg-surface-2 px-1 rounded mx-1">ANTHROPIC_API_KEY</code> to a <code className="bg-surface-2 px-1 rounded mx-1">.env</code> file and restart.</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Model">
              <SelectInput value={s.assistant_model} onChange={(e) => update({ assistant_model: e.target.value })}>
                <option value="claude-opus-4-8">claude-opus-4-8</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
              </SelectInput>
            </Field>
            <Field label="Web search (for current prices / Shariah lookups)">
              <SelectInput value={s.web_search_enabled ? '1' : '0'} onChange={(e) => update({ web_search_enabled: Number(e.target.value) })}>
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </SelectInput>
            </Field>
          </div>
        </div>
      </Card>

      <SecurityCard passcodeSet={!!s.passcode_set} onChanged={() => api('/settings').then(setS)} />

      <Card className="p-5">
        <CardHeader title="Export" subtitle="Download your data — open the xlsx in Excel, the json is a full backup." />
        <div className="flex flex-wrap gap-3 mt-4">
          <a href="/api/export/xlsx" download>
            <Button variant="outline"><FileSpreadsheet size={16} /> Export .xlsx</Button>
          </a>
          <a href="/api/export/csv" download>
            <Button variant="outline"><FileText size={16} /> Export .csv</Button>
          </a>
          <a href="/api/export/json" download>
            <Button variant="outline"><FileJson size={16} /> Export .json</Button>
          </a>
        </div>
        <p className="text-xs text-muted mt-3 flex items-center gap-1">
          <Download size={12} /> Re-import: drop a MooMoo CSV on the Holdings page; the full workbook reloads from <code className="bg-surface-2 px-1 rounded mx-1">Net Worth.xlsx</code> on a fresh database.
        </p>
      </Card>
    </div>
  );
}

function SecurityCard({ passcodeSet, onChanged }: { passcodeSet: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [pass, setPass] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');

  const wrap = (fn: () => Promise<any>) => async () => {
    setErr('');
    try {
      await fn();
    } catch (e: any) {
      setErr(e.message || 'Failed');
    }
  };

  const setup = wrap(async () => {
    const r = await api('/auth/setup', { method: 'POST', body: JSON.stringify({ passcode: pass }) });
    setToken(r.token);
    setPass('');
    toast('Passcode set');
    onChanged();
  });
  const change = wrap(async () => {
    const r = await api('/auth/change', { method: 'POST', body: JSON.stringify({ current, next }) });
    setToken(r.token);
    setCurrent('');
    setNext('');
    toast('Passcode changed');
    onChanged();
  });
  const remove = wrap(async () => {
    await api('/auth/remove', { method: 'POST', body: JSON.stringify({ current }) });
    clearToken();
    setCurrent('');
    toast('Passcode removed');
    onChanged();
  });
  const lockNow = () => {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:required'));
  };

  return (
    <Card className="p-5">
      <CardHeader
        title="Security — local passcode"
        subtitle="Optional. Locks the app and the API on this machine. The app is already only reachable from localhost."
      />
      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {passcodeSet ? (
            <span className="flex items-center gap-1 text-gain"><ShieldCheck size={15} /> Passcode is set — the app locks when reopened</span>
          ) : (
            <span className="flex items-center gap-1 text-muted"><Lock size={15} /> No passcode — anyone on this computer can open the app</span>
          )}
        </div>

        {!passcodeSet ? (
          <div className="flex items-end gap-2">
            <Field label="Set a passcode (min 4 chars)">
              <TextInput type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••" />
            </Field>
            <Button onClick={setup}>Set passcode</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current passcode">
                <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
              <Field label="New passcode">
                <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={change}>Change</Button>
              <Button variant="danger" onClick={remove}>Remove passcode</Button>
              <Button variant="outline" onClick={lockNow} className="ml-auto"><Lock size={14} /> Lock now</Button>
            </div>
          </>
        )}
        {err && <p className="text-loss text-xs">{err}</p>}
      </div>
    </Card>
  );
}
