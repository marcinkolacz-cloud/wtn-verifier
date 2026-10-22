import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, Code2, FileCode, Hash, Scale, ShieldCheck, XCircle } from 'lucide-react';
import type { ProposalData } from '../declarations/sns_governance';
import {
  actionKey, breakdown, buildDispatchUrl, buildsIndex, canisterHealth, canisterName, fetchBuild, summaryClaims, codeSearchUrl, dashboardUrl, deadline, earlyDecision, ENTITIES, functions,
  genericCall, getProposal, loadLabels, neuronControllers, rules, saveLabel, status, upgradeCall, wouldPass,
  type Entity, type Fn,
} from '../lib/data';
import { compact, date, hex, humanize, icp, opt, pct, relative, sha256, short, variantKey } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, CardHeader, CopyButton, Empty, ErrorBox, Ext, Mono, Skeleton, Spinner, VoteBar } from '../components/ui';
import { proposalReport } from '../lib/report';
import { Explain, useExplain, verdictOf } from '../components/Explain';
import { Flags } from '../components/Flags';
import { statusTone } from './Proposals';

export function ProposalDetail({ id, go }: { id: bigint; go: (h: string) => void }) {
  const { data: p, error, loading, reload } = useAsync(() => getProposal(id), [id]);
  const { data: fns } = useAsync(functions, []);

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => go('#/')} className="-ml-2">
        <ArrowLeft className="size-3.5" /> Proposals
      </Button>
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      {loading && !p && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </Card>
      )}
      {p && <Body p={p} fns={fns} />}
    </div>
  );
}

function Body({ p, fns }: { p: ProposalData; fns?: Map<bigint, Fn> }) {
  const id = opt(p.id)!.id;
  const s = status(p);
  const prop = opt(p.proposal);
  const topic = variantKey(opt(p.topic));
  const proposer = opt(p.proposer);
  const ex = useExplain(id);

  return (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="order-last ml-auto"><CopyButton get={() => proposalReport(p)} /></div>
          <Mono className="text-muted">#{String(id)}</Mono>
          <Badge tone={statusTone(s)}>{s}</Badge>
          {topic && <Badge>{humanize(topic)}</Badge>}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{prop?.title || 'Untitled'}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Created {date(p.proposal_creation_timestamp_seconds)}</span>
          <span>
            {s === 'Open' ? 'Closes' : 'Deadline'} {date(deadline(p))}
            {s === 'Open' && ` (${relative(deadline(p))})`}
          </span>
          {proposer && <span>Proposer <Mono>{short(hex(proposer.id), 6)}</Mono></span>}
          <Ext href={dashboardUrl(id)}>Dashboard</Ext>
          {prop?.url && <Ext href={prop.url}>Link</Ext>}
        </div>
      </div>

      <Card>
        <CardHeader title="At a glance" sub="Automatic checks — red needs attention, orange be careful, green looks fine" />
        <div className="px-5 py-4">
          <Flags p={p} verdict={verdictOf(ex)} />
        </div>
      </Card>
      <Explain st={ex} />
      <ActionPanel p={p} fns={fns} />
      <Voting p={p} />

      {prop?.summary && (
        <Card>
          <CardHeader title="Summary" sub="As submitted by the proposer — not verified" />
          <div className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-sm leading-relaxed text-fg/85">
            {prop.summary}
          </div>
        </Card>
      )}
    </>
  );
}

/* ---------------- action ---------------- */

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-sm max-sm:grid-cols-1 max-sm:gap-0.5">
      <div className="text-muted">{k}</div>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

function ActionPanel({ p, fns }: { p: ProposalData; fns?: Map<bigint, Fn> }) {
  const g = genericCall(p);
  const u = upgradeCall(p);
  const fn = g && fns?.get(g.function_id);
  const rendering = opt(p.payload_text_rendering);
  const [payloadHash, setPayloadHash] = useState<string>();
  const [wasmHash, setWasmHash] = useState<string>();
  const { data: health } = useAsync(async () => (u ? canisterHealth() : null), [p]);

  useEffect(() => {
    if (g) sha256(g.payload).then(setPayloadHash);
    if (u) {
      const chunked = opt(u.chunked_canister_wasm);
      if (chunked) setWasmHash(hex(chunked.wasm_module_hash));
      else if (u.new_canister_wasm.length) sha256(u.new_canister_wasm).then(setWasmHash);
    }
  }, [p]);

  const target = u && opt(u.canister_id)?.toText();
  const arg = u && opt(u.canister_upgrade_arg);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Code2 className="size-4 text-muted" />
            {fn ? fn.name : humanize(actionKey(p))}
          </span>
        }
        sub={g ? `Generic function #${String(g.function_id)}` : u ? 'Canister upgrade' : 'Native action'}
      />
      <div className="divide-y divide-line px-5">
        {g && (
          <>
            <KV k="Target">
              <Mono>{fn?.target ?? '—'}</Mono>
            </KV>
            <KV k="Method">
              {fn?.method ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Mono>{fn.method}</Mono>
                  <Ext href={codeSearchUrl(fn.method)}>
                    <FileCode className="size-3" /> code
                  </Ext>
                </span>
              ) : (
                '—'
              )}
            </KV>
            <KV k="Validator">
              <Mono>{fn?.validator ? `${short(fn.validator, 5)} · ${fn.vMethod}` : '—'}</Mono>
            </KV>
            <KV k="Payload">
              <Mono className="text-muted">
                {g.payload.length} bytes · sha256 {payloadHash ? short(payloadHash, 8) : '…'}
              </Mono>
            </KV>
          </>
        )}
        {u && (
          <>
            <KV k="Canister">
              <Mono>{target ?? '—'}</Mono>
            </KV>
            <KV k="Mode">{['Install', 'Reinstall', 'Upgrade'][(opt(u.mode) ?? 3) - 1] ?? `#${opt(u.mode)}`}</KV>
            <KV k="New wasm sha256">
              <span className="inline-flex items-center gap-1.5">
                <Hash className="size-3 text-muted" />
                <Mono>{wasmHash ?? 'not included in response'}</Mono>
              </span>
            </KV>
            <KV k="Running sha256">
              <Mono className="text-muted">{health?.moduleHash ?? '—'}</Mono>
            </KV>
            <KV k="Upgrade arg">
              <Mono className="text-muted">{arg ? `${arg.length} bytes · ${short(hex(arg), 12)}` : 'none'}</Mono>
            </KV>
          </>
        )}
      </div>
      {u && <UpgradeVerify p={p} wasmHash={wasmHash} target={target} arg={arg} running={health?.moduleHash} />}
      {rendering && (
        <div className="border-t border-line px-5 py-4">
          <div className="mb-2 text-xs text-muted">Decoded payload (validator rendering)</div>
          <pre className="max-h-80 overflow-auto rounded-lg bg-fg/[0.04] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all">
            {rendering}
          </pre>
        </div>
      )}
    </Card>
  );
}

/* ---------------- reproducible build ---------------- */

type Check = { label: string; state: 'ok' | 'fail' | 'na'; detail: React.ReactNode };

function UpgradeVerify({
  p, wasmHash, target, arg, running,
}: { p: ProposalData; wasmHash?: string; target?: string; arg?: Uint8Array; running?: string }) {
  const summary = opt(p.proposal)?.summary ?? '';
  const claims = useMemo(() => summaryClaims(summary), [summary]);
  const name = canisterName(target);
  const [argHash, setArgHash] = useState<string>();
  const { data: build, error, loading, reload } = useAsync(
    async () => (claims.commit ? fetchBuild(claims.commit) : null),
    [claims.commit],
  );

  useEffect(() => {
    if (arg?.length) sha256(arg).then(setArgHash);
  }, [arg]);

  const built = name && build ? build.wasms[name] : undefined;
  const { data: idx } = useAsync(buildsIndex, []);
  const from = running ? idx?.[running]?.commit : undefined;
  const repoUrl = 'https://github.com/WaterNeuron/WaterNeuron';
  const checks: Check[] = [
    {
      label: 'Source commit in summary',
      state: claims.commit ? 'ok' : 'fail',
      detail: claims.commit ? (
        <Ext href={`https://github.com/WaterNeuron/WaterNeuron/commit/${claims.commit}`}>
          <Mono>{claims.commit.slice(0, 12)}</Mono>
        </Ext>
      ) : (
        'No 40-char commit found — wasm cannot be traced to source'
      ),
    },
    {
      label: 'Independent Nix build',
      state: !wasmHash || !claims.commit || !name ? 'na' : !build ? 'na' : built === wasmHash ? 'ok' : 'fail',
      detail: !name ? (
        'Unknown target canister'
      ) : !claims.commit ? (
        '—'
      ) : loading ? (
        'Checking…'
      ) : error ? (
        <span>Fetch failed · <button className="underline" onClick={reload}>retry</button></span>
      ) : !build ? (
        <span>
          Not built yet · <Ext href={buildDispatchUrl()}>run workflow</Ext> with commit <Mono>{claims.commit.slice(0, 12)}</Mono>
        </span>
      ) : (
        <span>
          <Mono>{built ? short(built, 10) : `no ${name} artifact`}</Mono> · <Ext href={build.run_url}>CI run</Ext>
        </span>
      ),
    },
    {
      label: 'Hash stated in summary',
      state: !wasmHash ? 'na' : claims.hashes.includes(wasmHash) ? 'ok' : 'fail',
      detail: !wasmHash ? 'On-chain wasm not available' : claims.hashes.includes(wasmHash) ? 'Matches on-chain wasm' : 'Summary does not mention the on-chain wasm hash',
    },
    {
      label: 'Upgrade arg hash',
      state: !argHash ? 'na' : claims.hashes.includes(argHash) ? 'ok' : 'fail',
      detail: !arg?.length ? 'No upgrade arg' : <Mono>{argHash ? short(argHash, 10) : '…'}</Mono>,
    },
    {
      label: 'Code changes',
      state: claims.commit && from ? 'ok' : 'na',
      detail: !claims.commit ? (
        '—'
      ) : from === claims.commit ? (
        'Same commit as the running module'
      ) : from ? (
        <span>
          <Ext href={`${repoUrl}/compare/${from}...${claims.commit}`}>
            diff <Mono>{from.slice(0, 7)}…{claims.commit.slice(0, 7)}</Mono>
          </Ext>{' '}
          · running → proposed
        </span>
      ) : (
        <span>
          Running module source unknown ·{' '}
          <Ext href={`${repoUrl}/commits/${claims.commit}`}>history up to proposed commit</Ext>
        </span>
      ),
    },
    {
      label: 'Running module',
      state: !running || !wasmHash ? 'na' : running === wasmHash ? 'ok' : 'na',
      detail: !running || !wasmHash ? '—' : running === wasmHash ? 'Canister already runs this wasm' : 'Differs (expected before execution)',
    },
  ];

  const icon = (s: Check['state']) =>
    s === 'ok' ? <CheckCircle2 className="size-4 text-yes" /> : s === 'fail' ? <XCircle className="size-4 text-no" /> : <CircleDashed className="size-4 text-muted" />;
  const verified = checks[1].state === 'ok';

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex items-center gap-2 text-xs">
        <ShieldCheck className={`size-4 ${verified ? 'text-yes' : 'text-muted'}`} />
        <span className="font-medium">{verified ? 'Wasm reproduced from source' : 'Build verification'}</span>
      </div>
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5">{icon(c.state)}</span>
            <span className="w-44 shrink-0 text-muted max-sm:w-32">{c.label}</span>
            <span className="min-w-0 break-all">{c.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- voting ---------------- */

function Voting({ p }: { p: ProposalData }) {
  const t = opt(p.latest_tally);
  const yes = Number(t?.yes ?? 0n);
  const no = Number(t?.no ?? 0n);
  const total = Number(t?.total ?? 0n);
  const r = rules(p);
  const s = status(p);
  const open = total - yes - no;
  const early = earlyDecision(yes, no, total, r);
  const now = wouldPass(yes, no, total, r);
  const allNo = wouldPass(yes, no + open, total, r);
  const allYes = wouldPass(yes + open, no, total, r);

  const [progress, setProgress] = useState(0);
  const { data: ctrl, error, reload } = useAsync(() => neuronControllers(setProgress), []);
  const [labelsV, setLabelsV] = useState(0);
  const labels = useMemo(loadLabels, [labelsV]);
  const bd = useMemo(() => (ctrl ? breakdown(p, ctrl, labels) : null), [p, ctrl, labels]);

  const dfx = bd?.groups.find((g) => g.entity === 'DFINITY');

  const verdict =
    s !== 'Open'
      ? { ok: s === 'Adopted' || s === 'Executed', text: `Decided: ${s}` }
      : early
        ? { ok: early === 'adopt', text: early === 'adopt' ? 'Already adopted by absolute majority' : 'Already rejected' }
        : allNo.ok
          ? { ok: true, text: 'Will pass even if every remaining neuron votes No' }
          : !allYes.ok
            ? { ok: false, text: 'Cannot pass anymore' }
            : { ok: now.ok, text: `If voting closed now: ${now.ok ? 'Adopted' : 'Rejected'} — ${now.why}` };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Scale className="size-4 text-muted" /> Voting
          </span>
        }
        sub={`Thresholds: yes > ${r.exercised / 100}% of cast · yes ≥ ${r.total / 100}% of total VP`}
      />
      <div className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Num label="Yes" v={yes} total={total} cls="text-yes" />
          <Num label="No" v={no} total={total} cls="text-no" />
          <Num label="Not voted" v={open} total={total} cls="text-muted" />
        </div>
        <VoteBar yes={yes} no={no} total={total} marks={[r.exercised / 100, r.total / 100]} />
        <div
          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${verdict.ok ? 'bg-yes/[0.08] text-yes' : 'bg-no/[0.08] text-no'}`}
        >
          {verdict.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
          <span>{verdict.text}</span>
        </div>
        {s === 'Open' && dfx && dfx.open > 0 && (
          <p className="text-xs text-muted">
            DFINITY has {compact(dfx.open)} WTN not yet voted ({pct(dfx.open, total)}). Yes → {wouldPass(yes + dfx.open, no, total, r).ok ? 'passes' : 'still fails'} · No →{' '}
            {wouldPass(yes, no + dfx.open, total, r).ok ? 'still passes' : 'fails'} (rest abstaining).
          </p>
        )}
      </div>

      <div className="border-t border-line">
        {error ? (
          <div className="p-4">
            <ErrorBox error={error} onRetry={reload} />
          </div>
        ) : !bd ? (
          <div className="px-5 py-6">
            <Spinner label={`Resolving neuron controllers… ${progress} neurons`} />
          </div>
        ) : !bd.list.length ? (
          <Empty>No ballots</Empty>
        ) : (
          <>
            <div className="divide-y divide-line">
              {bd.groups.map((g) => (
                <div key={g.entity} className="grid grid-cols-[110px_1fr_auto] items-center gap-4 px-5 py-3 text-sm max-sm:grid-cols-[90px_1fr]">
                  <div>
                    <div className="font-medium">{g.entity}</div>
                    <div className="text-[11px] text-muted">{g.count} voters</div>
                  </div>
                  <VoteBar yes={g.yes} no={g.no} total={g.yes + g.no + g.open} />
                  <div className="tabular text-right text-xs text-muted max-sm:col-span-2 max-sm:text-left">
                    <span className="text-yes">{compact(g.yes)}</span> / <span className="text-no">{compact(g.no)}</span> /{' '}
                    {compact(g.open)} · {pct(g.yes + g.no + g.open, bd.total)}
                  </div>
                </div>
              ))}
            </div>
            <Voters bd={bd} onLabel={() => setLabelsV((v) => v + 1)} />
          </>
        )}
      </div>
    </Card>
  );
}

function Num({ label, v, total, cls }: { label: string; v: number; total: number; cls: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular mt-0.5 font-semibold ${cls}`}>{pct(v, total, 2)}</div>
      <div className="tabular text-[11px] text-muted">{icp(v, 0)} VP</div>
    </div>
  );
}

function Voters({ bd, onLabel }: { bd: NonNullable<ReturnType<typeof breakdown>>; onLabel: () => void }) {
  const [n, setN] = useState(12);
  const tag = (key: string, e: Entity | '') => {
    saveLabel(key, e ? { name: e === 'Developers' ? 'Dev' : e, entity: e } : null);
    onLabel();
  };
  return (
    <div className="border-t border-line">
      <div className="px-5 pt-4 pb-2 text-xs font-medium text-muted">Largest voters (grouped by controller)</div>
      <div className="divide-y divide-line">
        {bd.list.slice(0, n).map((v) => {
          const vp = v.yes + v.no + v.open;
          const vote = v.yes && !v.no && !v.open ? 'Yes' : v.no && !v.yes && !v.open ? 'No' : !v.yes && !v.no ? '—' : 'Mixed';
          return (
            <div key={v.key} className="flex items-center gap-3 px-5 py-2 text-sm">
              <Mono className="min-w-0 flex-1 truncate" >
                {v.label && <span className="mr-2 font-sans font-medium">{v.label}</span>}
                <span className="text-muted">{short(v.key, 6)}</span>
              </Mono>
              <Badge tone={vote === 'Yes' ? 'yes' : vote === 'No' ? 'no' : 'neutral'}>{vote}</Badge>
              <span className="tabular w-20 text-right text-xs text-muted">{pct(vp, bd.total, 2)}</span>
              <select
                aria-label="Entity"
                value={v.entity}
                onChange={(e) => tag(v.key, e.target.value === 'Community' ? '' : (e.target.value as Entity))}
                className="h-7 rounded-md border border-line bg-panel px-1.5 text-xs text-muted"
              >
                {ENTITIES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {n < bd.list.length && (
        <div className="flex justify-center p-3">
          <Button variant="ghost" onClick={() => setN((x) => x + 25)}>
            Show more ({bd.list.length - n})
          </Button>
        </div>
      )}
    </div>
  );
}
