import { Fragment, ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Table2,
  TrendingUp,
  PieChart,
  Flame,
  Target,
  BookOpen,
  Sparkles,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  MessageCircle,
  Repeat,
  Palette,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useUiVersion } from '../lib/uiVersion';
import { cn } from './ui';
import { AssistantPanel } from './Assistant';

// Grouped for "New UI" (Settings → Appearance) — classic mode renders the same
// items flat, ungrouped, exactly as before. Settings is pinned separately below.
const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: any; end?: boolean }[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Track',
    items: [
      { to: '/accounts', label: 'Accounts', icon: Table2 },
      { to: '/investments', label: 'Investments', icon: TrendingUp },
      { to: '/holdings', label: 'Holdings', icon: PieChart },
      { to: '/recurring', label: 'Recurring', icon: Repeat },
    ],
  },
  {
    label: 'Plan',
    items: [
      { to: '/fire', label: 'FIRE', icon: Flame },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/playbook', label: 'Playbook', icon: BookOpen },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/studio', label: 'Studio', icon: Palette },
      { to: '/assistant', label: 'Assistant', icon: Sparkles },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { version } = useUiVersion();
  const isNew = version === 'new';
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
      isNew && isActive && 'border-l-2 border-accent -ml-0.5 pl-[11px]',
      isActive ? 'bg-accent/15 text-accent font-medium' : 'text-muted hover:text-text hover:bg-surface-2',
    );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed z-40 inset-y-0 left-0 w-60 border-r border-border bg-surface flex flex-col transition-transform md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
          <Flame className="text-accent" size={20} />
          <div className="font-semibold text-sm leading-tight">
            FIRE Tracker
            <div className="text-[10px] text-muted font-normal">MYR · Shariah</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = group.items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={navLinkClass}>
                <n.icon size={18} />
                {n.label}
              </NavLink>
            ));
            // Classic: a Fragment keeps NavLinks as direct <nav> children so the
            // existing space-y-0.5 rhythm is untouched — pixel-identical to before.
            if (!isNew) return <Fragment key={group.label}>{items}</Fragment>;
            return (
              <div key={group.label} className="mb-3">
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                  {group.label}
                </div>
                {items}
              </div>
            );
          })}
        </nav>
        {/* Settings pinned separately from the scrollable content groups */}
        <div className="border-t border-border p-2 space-y-0.5">
          <NavLink to="/settings" onClick={() => setOpen(false)} className={navLinkClass}>
            <Settings size={18} />
            Settings
          </NavLink>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-2"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 md:ml-60 min-w-0">
        <header className="h-14 md:hidden flex items-center gap-3 px-4 border-b border-border bg-surface sticky top-0 z-20">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={open}
            className="text-muted icon-btn -ml-2"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-semibold text-sm">FIRE Tracker</span>
        </header>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">{children}</main>
      </div>

      {/* Always-available assistant */}
      <button
        onClick={() => setAssistantOpen(true)}
        className="fixed z-30 bottom-5 right-5 flex items-center gap-2 rounded-full bg-accent text-white px-4 py-3 shadow-lg hover:opacity-90"
        title="My Finances assistant"
        aria-label="Open My Finances assistant"
      >
        <MessageCircle size={18} />
        <span className="text-sm font-medium hidden sm:inline">My Finances</span>
      </button>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
