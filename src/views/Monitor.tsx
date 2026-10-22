import { useMemo, useState, useSyncExternalStore } from 'react';
import { DateRange, FilterBar, inRange, NumberInput, SearchInput, Select, SortHeader, type Sort } from '../components/Filters';
import { AlertTriangle, Activity, Bell, BellOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { buildsIndex, canisterHealth, neuronState, refreshInfo, nnsNeuron, openWithdrawals, resetWithdrawals, wnInfo, type WRow } from '../lib/data';
import { statusReport } from '../lib/report';
import { clearLog, INTERVAL_MS, runCheck, setWatch, subscribe, watchState } from '../lib/watch';
import { cycles, date, DAY, days, humanize, icp, opt, relative } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, CardHeader, CopyButton, Empty, ErrorBox, Ext, Mono, Skeleton, Spinner, Stat } from '../components/ui';

export function Monitor() {
  const [tick, setTick] = useState(0);
  const core = useAsync(async () => {
    const info = await wnInfo();
    const id6 = opt(info.neuron_id_6m)?.id;
    const id8 = opt(info.neuron_id_8y)?.id;
    const [n6, n8, health] = await Promise.all([
      id6 !== undefined ? nnsNeuron(id6) : null,
      id8 !== undefined ? nnsNeuron(id8) : null,
      canisterHealth().catch(() => null),
    ]);
    return { info, id6, id8, n6, n8, health };
  }, [tick]);
  const wd = useAsync(() => {
    if (tick) resetWithdrawals();
    return openWithdrawals();
  }, [tick]);
  const idx = useAsync(buildsIndex, []);

  const d = core.data;
  const mainDelay = Number(d?.n6?.dissolve_delay_seconds ?? 0n);
  const frozen = wd.data?.filter((r) => r.frozen) ?? [];
  const risky = (wd.data ?? []).filter(
    (r) => r.nns && r.nns.state === 1 && Number(r.nns.dissolve_delay_seconds) > mainDelay,
  );
  const src = d?.health?.moduleHash ? idx.data?.[d.health.moduleHash] : undefined;
  const runway = d?.health && d.health.burnPerDay > 0n ? Number(d.health.cycles / d.health.burnPerDay) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Protocol monitor</h1>
          <p className="text-sm text-muted">water_neuron canister · NNS neurons · open withdrawals</p>
        </div>
        <div className="flex gap-2">
          {d && wd.data && (
            <CopyButton
              label="Copy status"
              get={() =>
                statusReport({
                  mainDelay,
                  mainState: d.n6 ? neuronState(d.n6.state) : 'unknown',
                  stake: d.info.neuron_6m_stake_e8s,
                  health: d.health,
                  source: src ? `commit ${src.commit.slice(0, 12)} (reproduced)` : undefined,
                  rows: wd.data!,
                })
              }
            />
          )}
          <Button onClick={() => setTick((t) => t + 1)} disabled={core.loading || wd.loading}>
            <RefreshCw className={`size-3.5 ${core.loading || wd.loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {core.error ? <ErrorBox error={core.error} onRetry={core.reload} /> : null}

      {d &&
        ([['8-year', d.n8], ['6-month', d.n6]] as const).map(([name, n]) => {
          const r = refreshInfo(n);
          if (!r || r.level === 'green') return null;
          return (
            <div
              key={name}
              className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${r.level === 'red' ? 'border-no/30 bg-no/[0.06]' : 'border-warn/30 bg-warn/[0.07]'}`}
            >
              <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${r.level === 'red' ? 'text-no' : 'text-warn'}`} />
              <div>
                <div className={`font-medium ${r.level === 'red' ? 'text-no' : 'text-warn'}`}>
                  {r.decaying ? `${name} neuron is losing voting power` : `${name} neuron must confirm following in ${Math.ceil(r.daysLeft)} days`}
                </div>
                <div className="mt-1 text-fg/80">
                  Last NNS confirmation {date(r.refreshedAt)} ({Math.floor(r.daysSince)} days ago). NNS requires a refresh every 6 months;
                  after that voting power and rewards drop, and after 7 months its followees are cleared
                  {r.clearedIn > 0 ? ` (in ${Math.ceil(r.clearedIn)} days)` : ' (already past)'}. The water_neuron canister needs to refresh it.
                </div>
              </div>
            </div>
          );
        })}

      {risky.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.07] p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <div className="font-medium text-warn">Main neuron delay can be raised</div>
            <div className="mt-1 text-fg/80">
              {risky.length} locked withdrawal neuron{risky.length > 1 ? 's have' : ' has'} a longer delay than the main 6-month neuron ({days(mainDelay)}).
              A successful <Mono>cancel_withdrawal</Mono> merges it back and pushes the main delay up to{' '}
              <b>{days(Math.max(...risky.map((r) => Number(r.nns!.dissolve_delay_seconds))))}</b>. Withdrawals:{' '}
              {risky.map((r) => `#${r.w.request.withdrawal_id}`).join(', ')}.
            </div>
          </div>
        </div>
      )}

      <Card className="grid grid-cols-2 divide-line max-md:divide-y md:grid-cols-4 md:divide-x">
        {!d ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))
        ) : (
          <>
            <Stat
              label="Main neuron (6m) delay"
              value={d.n6 ? days(d.n6.dissolve_delay_seconds) : '—'}
              hint={d.n6 ? neuronState(d.n6.state) : 'unavailable'}
              tone={d.n6?.state === 2 ? 'no' : mainDelay > 183 * DAY ? 'warn' : undefined}
            />
            <Stat label="6m stake" value={`${icp(d.info.neuron_6m_stake_e8s, 0)} ICP`} hint={`8y: ${icp(d.info.neuron_8y_stake_e8s, 0)} ICP`} />
            <Stat
              label="Canister cycles"
              value={d.health ? cycles(d.health.cycles) : '—'}
              hint={runway !== undefined ? `~${runway.toLocaleString()} days runway` : 'status unavailable'}
              tone={runway !== undefined && runway < 90 ? 'warn' : undefined}
            />
            <Stat
              label="Open withdrawals"
              value={wd.data ? wd.data.length : '…'}
              hint={wd.data ? `${frozen.length} frozen` : undefined}
              tone={frozen.length ? 'warn' : undefined}
            />
          </>
        )}
      </Card>

      {d && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Activity className="size-4 text-muted" /> Protocol neurons</span>} />
          <div className="divide-y divide-line text-sm">
            {[
              ['6-month', d.id6, d.n6],
              ['8-year', d.id8, d.n8],
            ].map(([name, id, n]: any) => (
              <div key={name} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
                <span className="w-16 font-medium">{name}</span>
                <Mono className="text-muted">{id !== undefined ? String(id) : '—'}</Mono>
                {n && (
                  <>
                    <Badge tone={n.state === 1 ? 'yes' : n.state === 2 ? 'no' : 'warn'}>{neuronState(n.state)}</Badge>
                    <span className="tabular text-muted">delay {days(n.dissolve_delay_seconds)}</span>
                    <span className="tabular text-muted">age {days(n.age_seconds)}</span>
                    <span className="tabular text-muted">{icp(n.stake_e8s, 0)} ICP</span>
                    {(() => {
                      const r = refreshInfo(n);
                      return r ? (
                        <Badge tone={r.level === 'red' ? 'no' : r.level === 'orange' ? 'warn' : 'yes'}>
                          {r.decaying ? 'VP decaying' : `confirm in ${Math.ceil(r.daysLeft)} d`}
                        </Badge>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            ))}
            {d.health && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
                <span className="w-16 font-medium">Module</span>
                <Mono className="break-all text-muted">{d.health.moduleHash ?? '—'}</Mono>
                <Badge>{humanize(d.health.status)}</Badge>
                {src ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="size-3.5 text-yes" />
                    <span className="text-muted">built from</span>
                    <Ext href={`https://github.com/WaterNeuron/WaterNeuron/commit/${src.commit}`}><Mono>{src.commit.slice(0, 12)}</Mono></Ext>
                  </span>
                ) : (
                  <span className="text-xs text-warn">{idx.loading ? 'checking source…' : idx.error ? 'builds index unavailable' : 'source not reproduced yet'}</span>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <Watcher />

      <Card>
        <CardHeader
          title="Open withdrawals"
          sub="WaterNeuron status vs. actual NNS neuron state. Frozen = waiting for dissolvement but NNS says locked."
          right={frozen.length ? <Badge tone="warn">{frozen.length} frozen</Badge> : <Badge tone="yes"><ShieldCheck className="size-3" /> none frozen</Badge>}
        />
        {wd.error ? (
          <div className="p-4"><ErrorBox error={wd.error} onRetry={wd.reload} /></div>
        ) : !wd.data ? (
          <div className="px-5 py-6"><Spinner label="Scanning withdrawals and NNS neurons…" /></div>
        ) : !wd.data.length ? (
          <Empty>No open withdrawals</Empty>
        ) : (
          <WTable rows={wd.data} mainDelay={mainDelay} />
        )}
      </Card>
    </div>
  );
}

type WKey = 'id' | 'icp' | 'requested' | 'delay';
const NNS_OPTS = [
  ['all', 'NNS: all'],
  ['frozen', 'Frozen'],
  ['Locked', 'Locked'],
  ['Dissolving', 'Dissolving'],
  ['Dissolved', 'Dissolved'],
  ['none', 'No neuron'],
] as const;

const reqSec = (r: WRow) => {
  const t = Number(r.w.request.timestamp);
  return t > 1e15 ? t / 1e9 : t;
};

export function WTable({ rows, mainDelay, filters = true }: { rows: WRow[]; mainDelay?: number; filters?: boolean }) {
  const [q, setQ] = useState('');
  const [wn, setWn] = useState('all');
  const [nns, setNns] = useState<(typeof NNS_OPTS)[number][0]>('all');
  const [minIcp, setMinIcp] = useState('');
  const [minDelay, setMinDelay] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<Sort<WKey>>({ key: 'id', dir: 'desc' });

  const wnOpts = useMemo(
    () => [['all', 'WaterNeuron: all'] as const, ...[...new Set(rows.map((r) => r.status))].map((s) => [s, humanize(s)] as const)],
    [rows],
  );
  const active = [q, wn !== 'all', nns !== 'all', minIcp, minDelay, from, to].filter(Boolean).length;
  const clear = () => {
    setQ(''); setWn('all'); setNns('all'); setMinIcp(''); setMinDelay(''); setFrom(''); setTo('');
  };

  const shown = useMemo(() => {
    const needle = q.trim().replace(/^#/, '');
    const out = rows.filter((r) => {
      if (needle && !String(r.w.request.withdrawal_id).includes(needle) && !String(r.neuronId ?? '').includes(needle)) return false;
      if (wn !== 'all' && r.status !== wn) return false;
      if (nns === 'frozen' && !r.frozen) return false;
      if (nns === 'none' && r.nns) return false;
      if (!['all', 'frozen', 'none'].includes(nns) && (r.frozen || !r.nns || neuronState(r.nns.state) !== nns)) return false;
      if (minIcp && Number(r.w.request.icp_due) / 1e8 < Number(minIcp)) return false;
      if (minDelay && Number(r.nns?.dissolve_delay_seconds ?? 0n) / DAY < Number(minDelay)) return false;
      if ((from || to) && !inRange(reqSec(r), from, to)) return false;
      return true;
    });
    const val = (r: WRow) =>
      sort.key === 'id' ? Number(r.w.request.withdrawal_id)
      : sort.key === 'icp' ? Number(r.w.request.icp_due)
      : sort.key === 'requested' ? reqSec(r)
      : Number(r.nns?.dissolve_delay_seconds ?? -1n);
    return out.sort((a, b) => (sort.dir === 'asc' ? val(a) - val(b) : val(b) - val(a)));
  }, [rows, q, wn, nns, minIcp, minDelay, from, to, sort]);

  const total = shown.reduce((s, r) => s + r.w.request.icp_due, 0n);

  return (
    <div>
      {filters && rows.length > 3 && (
        <div className="border-b border-line p-3">
          <FilterBar active={active} onClear={clear}>
            <SearchInput value={q} onChange={setQ} placeholder="Withdrawal # or neuron id" />
            <Select value={wn} onChange={setWn} options={wnOpts} label="WaterNeuron status" />
            <Select value={nns} onChange={setNns} options={NNS_OPTS} label="NNS state" />
            <NumberInput value={minIcp} onChange={setMinIcp} placeholder="ICP ≥" />
            <NumberInput value={minDelay} onChange={setMinDelay} placeholder="Delay ≥ days" />
            <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </FilterBar>
          <div className="mt-2 px-1 text-xs text-muted">
            {shown.length} of {rows.length} · {icp(total, 0)} ICP
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <SortHeader k="id" sort={sort} onSort={setSort} className="pr-3 pl-5">ID</SortHeader>
              <SortHeader k="requested" sort={sort} onSort={setSort} className="px-3">Requested</SortHeader>
              <SortHeader k="icp" sort={sort} onSort={setSort} className="px-3" align="right">ICP due</SortHeader>
              <th className="px-3 py-2 font-medium">WaterNeuron</th>
              <th className="px-3 py-2 font-medium">NNS</th>
              <SortHeader k="delay" sort={sort} onSort={setSort} className="px-3" align="right">Delay</SortHeader>
              <th className="px-5 py-2 font-medium">Neuron</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => {
              const delay = Number(r.nns?.dissolve_delay_seconds ?? 0n);
              const over = mainDelay !== undefined && r.nns?.state === 1 && delay > mainDelay;
              return (
                <tr key={String(r.w.request.withdrawal_id)} className={r.frozen ? 'bg-warn/[0.04]' : ''}>
                  <td className="tabular py-2 pr-3 pl-5 font-mono text-xs">#{String(r.w.request.withdrawal_id)}</td>
                  <td className="tabular px-3 py-2 text-xs whitespace-nowrap text-muted">
                    {reqSec(r) ? new Date(reqSec(r) * 1000).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{icp(r.w.request.icp_due)}</td>
                  <td className="px-3 py-2"><Badge>{humanize(r.status)}</Badge></td>
                  <td className="px-3 py-2">
                    {r.nns ? (
                      <Badge tone={r.frozen ? 'warn' : r.nns.state === 2 ? 'accent' : r.nns.state === 3 ? 'yes' : 'neutral'}>
                        {r.frozen ? 'Frozen' : neuronState(r.nns.state)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className={`tabular px-3 py-2 text-right ${over ? 'font-semibold text-warn' : ''}`}>{r.nns ? days(delay) : '—'}</td>
                  <td className="px-5 py-2 font-mono text-xs text-muted">{r.neuronId !== undefined ? String(r.neuronId) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <Empty>No withdrawals match these filters</Empty>}
      </div>
    </div>
  );
}

function Watcher() {
  const w = useSyncExternalStore(subscribe, watchState);
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {w.enabled ? <Bell className="size-4 text-accent" /> : <BellOff className="size-4 text-muted" />} Alerts
          </span>
        }
        sub={
          w.enabled
            ? `Checking every ${INTERVAL_MS / 60000} min while this page is open${w.lastRun ? ` · last ${relative(w.lastRun / 1000)}` : ''}${perm !== 'granted' ? ' · browser notifications off' : ''}`
            : 'Delay increase, frozen withdrawals, cancel risk, low cycles, NNS confirm-following, new proposals'
        }
        right={
          <div className="flex gap-2">
            {w.enabled && (
              <Button variant="ghost" onClick={runCheck} disabled={w.running}>
                <RefreshCw className={`size-3.5 ${w.running ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <Button variant={w.enabled ? 'default' : 'primary'} onClick={() => setWatch(!w.enabled)}>
              {w.enabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        }
      />
      {w.error && <div className="px-5 pt-3 text-xs text-no">{w.error}</div>}
      {w.log.length ? (
        <>
          <ul className="divide-y divide-line text-sm">
            {w.log.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2">
                <Badge tone={a.level === 'warn' ? 'warn' : 'accent'}>{a.level === 'warn' ? 'Alert' : 'Info'}</Badge>
                <span className="min-w-0 flex-1">{a.text}</span>
                <span className="shrink-0 text-xs text-muted">{date(a.at / 1000)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-5 pb-3">
            <Button variant="ghost" onClick={clearLog}>Clear</Button>
          </div>
        </>
      ) : (
        w.enabled && <Empty>No changes detected yet. The first check stores a baseline.</Empty>
      )}
    </Card>
  );
}
