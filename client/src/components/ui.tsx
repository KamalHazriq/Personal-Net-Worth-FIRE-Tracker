import { ReactNode, useEffect, useId, useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import { useUiVersion } from '../lib/uiVersion';

export function cn(...a: any[]) {
  return twMerge(clsx(a));
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface card-shadow', className)}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-2', className)} />;
}

/** Default page loading state: a few shimmering blocks. */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/**
 * Standard page-level heading: title + subtitle + trailing actions. Renders
 * identically to the hand-written `<h1>` block every page used to have — under
 * "New UI" (Settings → Appearance) it escalates to a larger title and an
 * optional icon badge, matching the refined nav/card tokens.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: any;
}) {
  const { version } = useUiVersion();
  const isNew = version !== 'classic'; // 'new' and 'v3' both get the escalated header
  return (
    <div className={cn('flex items-end flex-wrap gap-3', actions && 'justify-between')}>
      <div className={cn('flex items-center', isNew && Icon ? 'gap-3' : '')}>
        {Icon && isNew && (
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className={cn('font-semibold', isNew ? 'text-3xl tracking-tight' : 'text-2xl')}>{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between px-4 pt-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'gain' | 'loss' | 'locked';
  children?: ReactNode;
}) {
  const { version } = useUiVersion();
  const toneClass =
    tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : tone === 'locked' ? 'text-locked' : 'text-text';
  return (
    <Card className={cn('flex flex-col gap-1', version === 'v3' ? 'p-5' : 'p-4')}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('font-semibold tabular-nums', version === 'v3' ? 'text-2xl tracking-tight' : 'text-xl', toneClass)}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {children}
    </Card>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'gain' | 'loss' | 'warn' | 'neutral' }) {
  const c =
    tone === 'gain'
      ? 'bg-gain/15 text-gain'
      : tone === 'loss'
        ? 'bg-loss/15 text-loss'
        : tone === 'warn'
          ? 'bg-warn-soft text-warn'
          : 'bg-surface-2 text-muted';
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', c)}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  disabled,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const v =
    variant === 'default'
      ? 'bg-accent text-white hover:opacity-90'
      : variant === 'danger'
        ? 'bg-loss/15 text-loss hover:bg-loss/25'
        : variant === 'outline'
          ? 'border border-border text-text hover:bg-surface-2'
          : 'text-muted hover:text-text hover:bg-surface-2';
  const s = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      className={cn('inline-flex items-center gap-1.5 control-radius font-medium transition-colors disabled:opacity-50', v, s, className)}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ESC-to-close, initial focus, and focus restore on close — runs whenever
  // `open` toggles; hooks must stay unconditional even though we render null below.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      (first ?? dialogRef.current)?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md border border-border bg-surface card-radius card-shadow p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold mb-4">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full control-radius border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent',
        props.className,
      )}
    />
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full control-radius border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent',
        props.className,
      )}
    />
  );
}

export function Toggle({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex control-radius border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors',
            value === o.value ? 'bg-accent text-white' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
