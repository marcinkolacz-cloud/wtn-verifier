import { useEffect, useMemo, useState } from 'react';
import { DateRange, FilterBar, inRange, SearchInput, Select } from '../components/Filters';
import { fetchExplain, fetchVerdicts, verdictInfo, type Verdict } from '../lib/explain';
import { AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ProposalModal } from '../components/ProposalModal';
import { ChevronRight, Clock, Sparkles } from 'lucide-react';
import type { ProposalData } from '../declarations/sns_governance';
import { actionKey, deadline, functions, genericCall, isNnsMirror, listProposals, mirrorIds, status, type Fn, type Status } from '../lib/data';
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
  const [q, setQ] = useState('');
  const [st, setSt] = useState<'all' | Status>('all');
  const [typeF, setTypeF] = useState('all');
  const [vF, setVF] = useState<'all' | 'match' | 'partial' | 'mismatch' | 'risk'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [modal, setModal] = useState<ProposalData>();
  const [hideMirror, setHideMirror] = useState(() => {
    try {
      return localStorage.getItem('hide-mirror') !== '0';
    } catch {
      return true;
    }
  });
  const toggleMirror = () => {
    const next = !hideMirror;
    setHideMirror(next);
    try {
      localStorage.setItem('hide-mirror', next ? '1' : '0');
    } catch {}
    load(undefined, next);
  };

  const load = async (before?: bigint, hide = hideMirror) => {
    setLoading(true);
    setError(undefined);
    if (before === undefined) {
      setItems([]);
      setDone(false);
    }
    try {
      const f = await functions();
      const ps = await listProposals(before, 30, hide ? mirrorIds(f) : []);
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

  // cached AI verdicts for the visible list; auto-generate for open proposals that have none
  useEffect(() => {
    if (!items.length) return;
    let stop = false;
    (async () => {
      const ids = items.map((p) => opt(p.id)!.id);
      const v = await fetchVerdicts(ids).catch(() => ({}));
      if (stop) return;
      setVerdicts((cur) => ({ ...cur, ...v }));
      const todo = items.filter((p) => status(p) === 'Open' && !(String(opt(p.id)!.id) in v)).slice(0, 5);
      for (const p of todo) {
        const id = opt(p.id)!.id;
        const r = await fetchExplain(id).catch(() => null);
        if (stop) return;
        if (r?.data) setVerdicts((cur) => ({ ...cur, [String(id)]: { consistency: r.data.consistency, risks: r.data.risks.length } }));
      }
    })();
    return () => {
      stop = true;
    };
  }, [items]);

  const isMirror = (p: ProposalData) => {
    const g = genericCall(p);
    return !!g && isNnsMirror(fns?.get(g.function_id));
  };
  const typeOf = (p: ProposalData) => {
    const g = genericCall(p);
    return (g && fns?.get(g.function_id)?.name) || humanize(actionKey(p));
  };
  const typeOpts = useMemo(
    () => [['all', 'Type: all'] as const, ...[...new Set(items.map(typeOf))].sort().map((t) => [t, t] as const)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fns],
  );
  const active = [q, st !== 'all', typeF !== 'all', vF !== 'all', from, to].filter(Boolean).length;
  const clear = () => {
    setQ(''); setSt('all'); setTypeF('all'); setVF('all'); setFrom(''); setTo(''); setFilter('all');
  };
  const needle = q.trim().toLowerCase().replace(/^#/, '');
  const shown = items.filter((p) => {
    if (hideMirror && isMirror(p)) return false;
    const s = status(p);
    if (filter === 'open' && s !== 'Open') return false;
    if (st !== 'all' && s !== st) return false;
    if (typeF !== 'all' && typeOf(p) !== typeF) return false;
    if (needle) {
      const id = String(opt(p.id)?.id ?? '');
      const title = (opt(p.proposal)?.title ?? '').toLowerCase();
      if (!id.includes(needle) && !title.includes(needle)) return false;
    }
    if (vF !== 'all') {
      const v = verdicts[String(opt(p.id)?.id)];
      if (!v) return false;
      if (vF === 'risk' ? v.risks === 0 : v.consistency !== vF) return false;
    }
    if ((from || to) && !inRange(Number(p.proposal_creation_timestamp_seconds), from, to)) return false;
    return true;
  });
  const last = opt(items[items.length - 1]?.id ?? [])?.id;
  const oldest = Number(items[items.length - 1]?.proposal_creation_timestamp_seconds ?? 0n);

  // date filter reaching beyond what's loaded → keep loading older pages
  useEffect(() => {
    if (!from || done || loading || !items.length) return;
    if (oldest >= new Date(`${from}T00:00:00`).getTime() / 1000) load(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, oldest, done, loading]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Proposals</h1>
          <p className="text-sm text-muted">WaterNeuron SNS · read directly from governance</p>
        </div>
        <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
          <input type="checkbox" checked={hideMirror} onChange={toggleMirror} className="accent-current" />
          Hide NNS votes
        </label>
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
      </div>

      <FilterBar active={active} onClear={clear}>
        <SearchInput value={q} onChange={setQ} placeholder="Search # or title" />
        <Select
          value={st}
          onChange={setSt}
          label="Status"
          options={[['all', 'Status: all'], ['Open', 'Open'], ['Adopted', 'Adopted'], ['Executed', 'Executed'], ['Rejected', 'Rejected'], ['Failed', 'Failed']] as const}
        />
        <Select value={typeF} onChange={setTypeF} options={typeOpts} label="Type" />
        <Select
          value={vF}
          onChange={setVF}
          label="AI check"
          options={[['all', 'AI check: all'], ['match', 'Summary verified'], ['partial', 'Unconfirmed claims'], ['mismatch', 'Summary mismatch'], ['risk', 'Has risks']] as const}
        />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>
      {active > 0 && (
        <div className="-mt-2 px-1 text-xs text-muted">
          {shown.length} of {items.length} loaded{!done && ' · older proposals load on demand'}
        </div>
      )}

      {error ? <ErrorBox error={error} onRetry={() => load(items.length ? last : undefined)} /> : null}

      <Card className="divide-y divide-line overflow-hidden">
        {shown.map((p, i) => (
          <Row key={String(opt(p.id)?.id)} p={p} fns={fns} i={i} v={verdicts[String(opt(p.id)?.id)]} onOpen={() => setModal(p)} />
        ))}
        {loading &&
          Array.from({ length: items.length ? 2 : 6 }, (_, i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        {!loading && !shown.length && <div className="px-5 py-10 text-center text-sm text-muted">{active ? 'No proposals match these filters' : 'No proposals'}</div>}
      </Card>

      {!done && !loading && items.length > 0 && (
        <div className="flex justify-center">
          <Button onClick={() => load(last)}>Load older</Button>
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <ProposalModal
            key={String(opt(modal.id)?.id)}
            p={modal}
            onClose={() => setModal(undefined)}
            onOpen={() => go(`#/proposal/${opt(modal.id)?.id}`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ p, fns, i, v, onOpen }: { p: ProposalData; fns?: Map<bigint, Fn>; i: number; v?: Verdict; onOpen: () => void }) {
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
            {v && <Badge tone={verdictInfo[v.consistency]?.tone ?? 'warn'}>{verdictInfo[v.consistency]?.label ?? v.consistency}</Badge>}
            {v && v.risks > 0 && (
              <Badge tone="no">
                <AlertTriangle className="size-3" /> {v.risks} risk{v.risks > 1 ? 's' : ''}
              </Badge>
            )}
            {s === 'Open' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <Clock className="size-3" />
                {relative(deadline(p))}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <VoteBar yes={yes} no={no} total={total} marks={[50]} />
            <span className="tabular shrink-0 text-right text-[11px] text-muted sm:w-28">
              <span className="text-yes">{pct(yes, total)}</span> · <span className="text-no">{pct(no, total)}</span>
            </span>
          </div>
        </div>
        <span
          aria-hidden="true"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 self-center rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors group-hover:border-accent/40 group-hover:bg-accent/[0.06] group-hover:text-accent max-sm:px-2"
        >
          <Sparkles className="size-3.5 text-accent" />
          <span className="max-sm:hidden">Explain</span>
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </motion.button>
  );
}
