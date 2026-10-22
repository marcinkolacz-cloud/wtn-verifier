import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2 } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = 'neutral' | 'yes' | 'no' | 'warn' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-fg/5 text-muted',
  yes: 'bg-yes/10 text-yes',
  no: 'bg-no/10 text-no',
  warn: 'bg-warn/10 text-warn',
  accent: 'bg-accent/10 text-accent',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'ghost' | 'primary';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50',
        variant === 'primary' && 'bg-fg text-bg hover:bg-fg/90',
        variant === 'default' && 'border border-line bg-panel hover:bg-fg/5',
        variant === 'ghost' && 'text-muted hover:bg-fg/5 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cx(
          'tabular mt-1 text-xl font-semibold tracking-tight',
          tone === 'no' && 'text-no',
          tone === 'warn' && 'text-warn',
          tone === 'yes' && 'text-yes',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-fg/5', className)} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted" role="status">
      <Loader2 className="size-3.5 animate-spin" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-no/30 bg-no/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-no" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-no">Query failed</div>
        <div className="mt-1 break-words font-mono text-xs text-muted">{String((error as Error)?.message ?? error)}</div>
      </div>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Ext({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cx('inline-flex items-center gap-1 text-accent hover:underline', className)}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px]', className)}>{children}</span>;
}

/** Yes / No / not-voted bar, values in any unit */
export function VoteBar({ yes, no, total, marks = [] }: { yes: number; no: number; total: number; marks?: number[] }) {
  const y = total ? (yes / total) * 100 : 0;
  const n = total ? (no / total) * 100 : 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-fg/[0.07]">
      <div className="absolute inset-y-0 left-0 bg-yes" style={{ width: `${y}%` }} />
      <div className="absolute inset-y-0 right-0 bg-no" style={{ width: `${n}%` }} />
      {marks.map((m) => (
        <div key={m} className="absolute inset-y-0 w-px bg-fg/40" style={{ left: `${m}%` }} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted">{children}</div>;
}

export function CopyButton({ get, label = 'Copy for Discord' }: { get: () => Promise<string> | string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const run = async () => {
    setState('busy');
    try {
      await navigator.clipboard.writeText(await get());
      setState('done');
    } catch {
      setState('err');
    }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <Button onClick={run} disabled={state === 'busy'}>
      {state === 'done' ? <Check className="size-3.5 text-yes" /> : state === 'busy' ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
      {state === 'done' ? 'Copied' : state === 'err' ? 'Copy failed' : label}
    </Button>
  );
}
