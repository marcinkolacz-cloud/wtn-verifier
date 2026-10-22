import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { cx } from './ui';

const field =
  'h-8 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20';

export function FilterBar({ children, onClear, active }: { children: ReactNode; onClear: () => void; active: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-2">
      {children}
      {active > 0 && (
        <button
          onClick={onClear}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-fg/5 hover:text-fg"
        >
          <X className="size-3.5" /> Clear ({active})
        </button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cx('relative min-w-40 flex-1', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(field, 'w-full pl-8')}
      />
    </div>
  );
}

export function Select<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className={cx(field, 'pr-7', value && value !== 'all' ? 'border-accent/50 text-accent' : '')}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function DateRange({
  from, to, onFrom, onTo,
}: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} aria-label="From date" className={cx(field, 'w-[8.5rem]', from && 'border-accent/50')} />
      <span className="text-xs text-muted">–</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} aria-label="To date" className={cx(field, 'w-[8.5rem]', to && 'border-accent/50')} />
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cx(field, 'w-28', value && 'border-accent/50')}
    />
  );
}

/** seconds (or nanoseconds) → is inside [from, to] (YYYY-MM-DD, local days, inclusive) */
export function inRange(ts: number, from: string, to: string) {
  const sec = ts > 1e15 ? ts / 1e9 : ts;
  if (from && sec < new Date(`${from}T00:00:00`).getTime() / 1000) return false;
  if (to && sec >= new Date(`${to}T00:00:00`).getTime() / 1000 + 86_400) return false;
  return true;
}

export type Sort<K extends string> = { key: K; dir: 'asc' | 'desc' };

export function SortHeader<K extends string>({
  k, sort, onSort, children, align = 'left', className,
}: { k: K; sort: Sort<K>; onSort: (s: Sort<K>) => void; children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  const on = sort.key === k;
  const Icon = !on ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cx('py-2 font-medium', align === 'right' && 'text-right', className)} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        onClick={() => onSort({ key: k, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })}
        className={cx('inline-flex items-center gap-1 hover:text-fg', on && 'text-fg', align === 'right' && 'flex-row-reverse')}
      >
        {children}
        <Icon className={cx('size-3', !on && 'opacity-40')} />
      </button>
    </th>
  );
}
