import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Clock } from 'lucide-react';
import type { ProposalData } from '../declarations/sns_governance';
import { actionKey, deadline, functions, genericCall, listProposals, status, type Fn, type Status } from '../lib/data';
import { humanize, opt, pct, relative } from '../lib/format';
import { Badge, Button, Card, ErrorBox, Skeleton, VoteBar } from '../components/ui';

export const statusTone = (s: Status) =>
  s === 'Open' ? 'accent' : s === 'Executed' || s === 'Adopted' ? 'yes' : s === 'Failed' ? 'warn' : 'no';

export function Proposals({ go }: { go: (h: string) => void }) {
  const [items, setItems] = useState<ProposalData[]>([]);
  const [fns, setFns] = useState<Map<bigint, Fn>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open'>('all');

  const load = async (before?: bigint) => {
    setLoading(true);
    setError(undefined);
    try {
      const [ps, f] = await Promise.all([listProposals(before), functions()]);
      setFns(f);
      setItems((cur) => (before === undefined ? ps : [...cur, ...ps]));
      if (ps.length < 30) setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shown = items.filter((p) => filter === 'all' || status(p) === 'Open');
  const last = opt(items[items.length - 1]?.id ?? [])?.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Proposals</h1>
          <p className="text-sm text-muted">WaterNeuron SNS · read directly from governance</p>
        </div>
        <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
          {(['all', 'open'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${filter === f ? 'bg-fg/[0.07] text-fg' : 'text-muted'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorBox error={error} onRetry={() => load(items.length ? last : undefined)} /> : null}

      <Card className="divide-y divide-line overflow-hidden">
        {shown.map((p, i) => (
          <Row key={String(opt(p.id)?.id)} p={p} fns={fns} i={i} onOpen={() => go(`#/proposal/${opt(p.id)?.id}`)} />
        ))}
        {loading &&
          Array.from({ length: items.length ? 2 : 6 }, (_, i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        {!loading && !shown.length && <div className="px-5 py-10 text-center text-sm text-muted">No proposals</div>}
      </Card>

      {!done && !loading && items.length > 0 && (
        <div className="flex justify-center">
          <Button onClick={() => load(last)}>Load older</Button>
        </div>
      )}
    </div>
  );
}

function Row({ p, fns, i, onOpen }: { p: ProposalData; fns?: Map<bigint, Fn>; i: number; onOpen: () => void }) {
  const id = opt(p.id)?.id;
  const s = status(p);
  const t = opt(p.latest_tally);
  const g = genericCall(p);
  const fn = g && fns?.get(g.function_id);
  const yes = Number(t?.yes ?? 0n);
  const no = Number(t?.no ?? 0n);
  const total = Number(t?.total ?? 0n);

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 10) * 0.02 }}
      onClick={onOpen}
      className="group block w-full px-5 py-4 text-left transition-colors hover:bg-fg/[0.025] focus-visible:bg-fg/[0.04] focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <span className="tabular w-12 shrink-0 pt-px font-mono text-xs text-muted">#{String(id)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{opt(p.proposal)?.title || 'Untitled'}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(s)}>{s}</Badge>
            <Badge>{fn ? fn.name : humanize(actionKey(p))}</Badge>
            {fn?.method && <Badge className="font-mono">{fn.method}</Badge>}
            {s === 'Open' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <Clock className="size-3" />
                {relative(deadline(p))}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <VoteBar yes={yes} no={no} total={total} marks={[50]} />
            <span className="tabular w-28 shrink-0 text-right text-[11px] text-muted">
              <span className="text-yes">{pct(yes, total)}</span> · <span className="text-no">{pct(no, total)}</span>
            </span>
          </div>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.button>
  );
}
