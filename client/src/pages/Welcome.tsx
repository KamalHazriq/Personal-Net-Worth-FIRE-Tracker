import { Link } from 'react-router-dom';
import { Flame, Table2, PieChart, Settings as SettingsIcon, ArrowRight, Lock } from 'lucide-react';
import { Card } from '../components/ui';

const STEPS = [
  {
    to: '/accounts',
    icon: Table2,
    title: 'Add your accounts',
    body: 'Create your bank, investment and liability accounts, then type balances into the month cells. Net Worth and the FIRE projection fill in live.',
    cta: 'Open Accounts',
  },
  {
    to: '/holdings',
    icon: PieChart,
    title: 'Import your holdings',
    body: 'Drop in a MooMoo positions CSV (or paste it). Tag each holding as ETF or individual once — it sticks across imports.',
    cta: 'Open Holdings',
  },
  {
    to: '/settings',
    icon: SettingsIcon,
    title: 'Set your preferences',
    body: 'USD/MYR rate, your age, target retirement age, safe withdrawal rate and FIRE target income. Optionally add an API key for the assistant.',
    cta: 'Open Settings',
  },
];

export default function Welcome() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center pt-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 mb-4">
          <Flame className="text-accent" size={28} />
        </div>
        <h1 className="text-3xl font-semibold">Welcome to your FIRE Tracker</h1>
        <p className="text-muted mt-2">
          A local-first net-worth &amp; FIRE planner. Base currency MYR · Shariah-neutral · your data stays
          on your machine.
        </p>
        <p className="text-xs text-muted mt-1 inline-flex items-center gap-1">
          <Lock size={11} /> No cloud, no login required — nothing leaves this computer.
        </p>
      </div>

      <div className="grid gap-4">
        {STEPS.map((s, i) => (
          <Card key={s.to} className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-2 text-accent shrink-0">
                <s.icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Step {i + 1}</span>
                  <h3 className="font-semibold">{s.title}</h3>
                </div>
                <p className="text-sm text-muted mt-1">{s.body}</p>
              </div>
              <Link
                to={s.to}
                className="self-center shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                {s.cta} <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted">
        Once you’ve added some data, this screen becomes your Dashboard automatically.
      </p>
    </div>
  );
}
