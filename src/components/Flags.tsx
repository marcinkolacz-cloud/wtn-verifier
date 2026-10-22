import { CheckCircle2, CircleAlert, OctagonAlert } from 'lucide-react';
import type { ProposalData } from '../declarations/sns_governance';
import { computeFlags, type Flag } from '../lib/flags';
import type { Verdict } from '../lib/explain';
import { useAsync } from '../lib/useAsync';
import { Skeleton, cx } from './ui';

const style = {
  red: { dot: 'bg-no', icon: OctagonAlert, text: 'text-no', ring: 'border-no/25 bg-no/[0.05]' },
  orange: { dot: 'bg-warn', icon: CircleAlert, text: 'text-warn', ring: 'border-warn/30 bg-warn/[0.06]' },
  green: { dot: 'bg-yes', icon: CheckCircle2, text: 'text-yes', ring: 'border-yes/25 bg-yes/[0.05]' },
} as const;

export function FlagList({ flags }: { flags: Flag[] }) {
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => {
        const s = style[f.level];
        const Icon = s.icon;
        return (
          <li key={i} className={cx('flex items-start gap-3 rounded-lg border px-3.5 py-2.5', s.ring)}>
            <Icon className={cx('mt-0.5 size-4 shrink-0', s.text)} />
            <div className="min-w-0 text-sm leading-relaxed">
              <span className="font-semibold">{f.title}</span>
              <span className="text-fg/75"> — {f.text}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Flags({ p, verdict }: { p: ProposalData; verdict?: Verdict }) {
  const { data, error } = useAsync(() => computeFlags(p, verdict), [p, verdict?.consistency]);
  if (error) return null;
  if (!data)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  return <FlagList flags={data} />;
}

export function FlagDots({ flags }: { flags: Flag[] }) {
  const n = (l: Flag['level']) => flags.filter((f) => f.level === l).length;
  return (
    <span className="inline-flex items-center gap-1.5">
      {(['red', 'orange', 'green'] as const).map((l) =>
        n(l) ? (
          <span key={l} className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className={cx('size-2 rounded-full', style[l].dot)} />
            {n(l)}
          </span>
        ) : null,
      )}
    </span>
  );
}
