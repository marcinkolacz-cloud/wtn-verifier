import { Principal } from '@icp-sdk/core/principal';
import { BUILDS_REPO, EXPLAIN_URL, IDS, nnsGov, snsGov, snsRoot, waterNeuron } from './ic';
import { hex, opt, pool, variantKey } from './format';
import type { ProposalData, NervousSystemFunction } from '../declarations/sns_governance';
import type { NeuronInfo } from '../declarations/nns_governance';
import type { WithdrawalDetails, CanisterInfo } from '../declarations/water_neuron';

/* ---------------- proposals ---------------- */

export type Fn = { id: bigint; name: string; target?: string; method?: string; validator?: string; vMethod?: string };

let fnCache: Promise<Map<bigint, Fn>> | null = null;
export const functions = () =>
  (fnCache ??= (async () => {
    const r = await (await snsGov()).list_nervous_system_functions();
    const m = new Map<bigint, Fn>();
    r.functions.forEach((f: NervousSystemFunction) => {
      const g = opt(f.function_type ?? []);
      const gen = g && 'GenericNervousSystemFunction' in g ? g.GenericNervousSystemFunction : undefined;
      m.set(f.id, {
        id: f.id,
        name: f.name,
        target: gen && opt(gen.target_canister_id)?.toText(),
        method: gen && opt(gen.target_method_name),
        validator: gen && opt(gen.validator_canister_id)?.toText(),
        vMethod: gen && opt(gen.validator_method_name),
      });
    });
    return m;
  })());

export const mirrorIds = (fns: Map<bigint, Fn>) => [...fns.values()].filter(isNnsMirror).map((f) => f.id);

export async function listProposals(before?: bigint, limit = 30, exclude: bigint[] = []) {
  const r = await (await snsGov()).list_proposals({
    limit,
    before_proposal: before === undefined ? [] : [{ id: before }],
    exclude_type: BigUint64Array.from(exclude),
    include_reward_status: new Int32Array(),
    include_status: new Int32Array(),
    include_topics: [],
  });
  return r.proposals;
}

export async function getProposal(id: bigint) {
  const r = await (await snsGov()).get_proposal({ proposal_id: [{ id }] });
  const res = opt(r.result);
  if (!res) throw new Error('Empty response');
  if ('Error' in res) throw new Error(res.Error.error_message);
  return res.Proposal;
}

export const actionKey = (p: ProposalData) => variantKey(opt(opt(p.proposal)?.action ?? [])) ?? 'Unspecified';

export const genericCall = (p: ProposalData) => {
  const a = opt(opt(p.proposal)?.action ?? []);
  return a && 'ExecuteGenericNervousSystemFunction' in a ? a.ExecuteGenericNervousSystemFunction : undefined;
};

export const upgradeCall = (p: ProposalData) => {
  const a = opt(opt(p.proposal)?.action ?? []);
  return a && 'UpgradeSnsControlledCanister' in a ? a.UpgradeSnsControlledCanister : undefined;
};

export const codeSearchUrl = (method: string) =>
  `https://github.com/search?q=${encodeURIComponent(`repo:WaterNeuron/WaterNeuron "fn ${method}"`)}&type=code`;

export const dashboardUrl = (id: bigint) =>
  `https://dashboard.internetcomputer.org/sns/${IDS.wtnRoot}/proposal/${id}`;

/* ---------------- decision rules ---------------- */

export type Status = 'Open' | 'Adopted' | 'Executed' | 'Failed' | 'Rejected';

const bp = (o: ProposalData['minimum_yes_proportion_of_total'], d: number) =>
  Number(opt(opt(o)?.basis_points ?? []) ?? d);

export function rules(p: ProposalData) {
  return { total: bp(p.minimum_yes_proportion_of_total, 300), exercised: bp(p.minimum_yes_proportion_of_exercised, 5000) };
}

/** Would the proposal pass if voting closed with this tally? */
export function wouldPass(yes: number, no: number, total: number, r: { total: number; exercised: number }) {
  if (yes + no === 0) return { ok: false, why: 'No votes cast' };
  const exOk = r.exercised === 5000 ? yes * 10000 > (yes + no) * r.exercised : yes * 10000 >= (yes + no) * r.exercised;
  if (!exOk) return { ok: false, why: `Yes below ${r.exercised / 100}% of votes cast` };
  if (yes * 10000 < total * r.total) return { ok: false, why: `Yes below ${r.total / 100}% quorum of total VP` };
  return { ok: true, why: 'Thresholds met' };
}

export function earlyDecision(yes: number, no: number, total: number, r: { exercised: number }) {
  const ex = Math.max(5000, r.exercised);
  if (ex === 5000 ? yes * 2 > total : yes * 10000 >= total * ex) return 'adopt';
  if (no * 10000 >= total * (10000 - ex)) return 'reject';
  return null;
}

export function status(p: ProposalData): Status {
  if (p.executed_timestamp_seconds > 0n) return 'Executed';
  if (p.failed_timestamp_seconds > 0n) return 'Failed';
  if (p.decided_timestamp_seconds === 0n) return 'Open';
  const t = opt(p.latest_tally);
  if (!t) return 'Rejected';
  const [y, n, tot] = [Number(t.yes), Number(t.no), Number(t.total)];
  return earlyDecision(y, n, tot, rules(p)) === 'adopt' || wouldPass(y, n, tot, rules(p)).ok ? 'Adopted' : 'Rejected';
}

export const deadline = (p: ProposalData) =>
  opt(p.wait_for_quiet_state)?.current_deadline_timestamp_seconds ??
  p.proposal_creation_timestamp_seconds + p.initial_voting_period_seconds;

/* ---------------- neurons & entities ---------------- */

export type Entity = 'DFINITY' | 'Developers' | 'Whales' | 'Community';
export const ENTITIES: Entity[] = ['DFINITY', 'Developers', 'Whales', 'Community'];

export type Label = { name: string; entity: Entity };
export const DEFAULT_LABELS: Record<string, Label> = {
  'n2xex-iyaaa-aaaar-qaaeq-cai': { name: 'DFINITY', entity: 'DFINITY' },
  '6495d26172c697cb': { name: 'Quint', entity: 'Developers' },
};

export function loadLabels(): Record<string, Label> {
  try {
    return { ...DEFAULT_LABELS, ...JSON.parse(localStorage.getItem('wtn-labels') || '{}') };
  } catch {
    return { ...DEFAULT_LABELS };
  }
}
export function userLabels(): Record<string, Label> {
  try {
    return JSON.parse(localStorage.getItem('wtn-labels') || '{}');
  } catch {
    return {};
  }
}
export function setUserLabels(l: Record<string, Label>) {
  try {
    localStorage.setItem('wtn-labels', JSON.stringify(l));
  } catch {}
}
export function saveLabel(key: string, l: Label | null) {
  try {
    const cur = JSON.parse(localStorage.getItem('wtn-labels') || '{}');
    if (l) cur[key] = l;
    else delete cur[key];
    localStorage.setItem('wtn-labels', JSON.stringify(cur));
  } catch {}
}

/** principal holding ManagePrincipals (2), else the one with most permissions */
const controllerOf = (perms: { principal: [] | [Principal]; permission_type: Int32Array }[]) => {
  const withP = perms.filter((p) => p.principal.length);
  const mgr = withP.find((p) => Array.from(p.permission_type).includes(2));
  const best = mgr ?? withP.sort((a, b) => b.permission_type.length - a.permission_type.length)[0];
  return best ? opt(best.principal)!.toText() : 'unknown';
};

let neuronCache: Promise<Map<string, string>> | null = null;
export const neuronControllers = (onProgress?: (n: number) => void) =>
  (neuronCache ??= (async () => {
    const gov = await snsGov();
    const map = new Map<string, string>();
    let start: [] | [{ id: Uint8Array }] = [];
    for (let i = 0; i < 500; i++) {
      const r = await gov.list_neurons({ limit: 100, start_page_at: start, of_principal: [] });
      r.neurons.forEach((n) => {
        const id = opt(n.id);
        if (id) map.set(hex(id.id), controllerOf(n.permissions));
      });
      onProgress?.(map.size);
      if (r.neurons.length < 100) break;
      const last = opt(r.neurons[r.neurons.length - 1].id);
      if (!last) break;
      start = [last];
    }
    return map;
  })().catch((e) => {
    neuronCache = null;
    throw e;
  }));

export type Voter = { key: string; label?: string; entity: Entity; yes: number; no: number; open: number; neurons: number };

export function breakdown(p: ProposalData, ctrl: Map<string, string>, labels: Record<string, Label>) {
  const t = opt(p.latest_tally);
  const total = Number(t?.total ?? 0n);
  const voters = new Map<string, Voter>();
  for (const [nid, b] of p.ballots) {
    const c = ctrl.get(nid) ?? `neuron:${nid.slice(0, 16)}`;
    const lab = labels[c] ?? labels[nid.slice(0, 16)];
    const key = lab && labels[nid.slice(0, 16)] && !labels[c] ? `neuron:${nid.slice(0, 16)}` : c;
    const v = voters.get(key) ?? { key, label: lab?.name, entity: lab?.entity ?? 'Community', yes: 0, no: 0, open: 0, neurons: 0 };
    const vp = Number(b.voting_power);
    if (b.vote === 1) v.yes += vp;
    else if (b.vote === 2) v.no += vp;
    else v.open += vp;
    v.neurons++;
    voters.set(key, v);
  }
  const list = [...voters.values()];
  list.forEach((v) => {
    if (v.entity === 'Community' && total > 0 && (v.yes + v.no + v.open) / total >= 0.01) v.entity = 'Whales';
  });
  list.sort((a, b) => b.yes + b.no + b.open - (a.yes + a.no + a.open));
  const groups = ENTITIES.map((e) => {
    const vs = list.filter((v) => v.entity === e);
    return {
      entity: e,
      yes: vs.reduce((s, v) => s + v.yes, 0),
      no: vs.reduce((s, v) => s + v.no, 0),
      open: vs.reduce((s, v) => s + v.open, 0),
      count: vs.length,
    };
  });
  return { total, list, groups };
}

/* ---------------- protocol ---------------- */

export type NeuronState = 'Locked' | 'Dissolving' | 'Dissolved' | 'Spawning' | 'Unknown';
export const neuronState = (s: number): NeuronState =>
  (({ 1: 'Locked', 2: 'Dissolving', 3: 'Dissolved', 4: 'Spawning' }) as Record<number, NeuronState>)[s] ?? 'Unknown';

export async function nnsNeuron(id: bigint): Promise<NeuronInfo | null> {
  try {
    const r = await (await nnsGov()).get_neuron_info(id);
    return 'Ok' in r ? r.Ok : null;
  } catch {
    return null;
  }
}

export const wnInfo = async (): Promise<CanisterInfo> => (await waterNeuron()).get_info();

export type CanRow = {
  kind: string;
  name: string;
  id: string;
  cycles?: bigint;
  burn?: bigint;
  /** burn per day measured from daily snapshots (includes message & compute costs) */
  measured?: bigint;
  measuredDays?: number;
  runway?: number;
  status: string;
  module?: string;
  memory?: bigint;
};

export const CANISTER_NAMES: Record<string, string> = {
  [IDS.waterNeuron]: 'water_neuron',
  'daijl-2yaaa-aaaar-qag3a-cai': 'boomerang',
  'buwm7-7yaaa-aaaar-qagva-cai': 'nICP ledger',
  'btxkl-saaaa-aaaar-qagvq-cai': 'nICP index',
  'n3i53-gyaaa-aaaam-acfaq-cai': 'frontend',
  'uqeyr-oaaaa-aaaar-qbyyq-cai': 'icrc_validator',
  'zftzm-qqaaa-aaaam-adxfa-cai': 'sns_module',
};
const KIND_NAMES: Record<string, string> = {
  root: 'SNS root', governance: 'SNS governance', ledger: 'WTN ledger', index: 'WTN index', swap: 'SNS swap', archive: 'Ledger archive',
};

type RawRow = { kind: string; id: string; cycles: string | null; burn: string | null; status: string; module: string | null; memory: string | null; measured?: string; measuredDays?: number };

const toRow = (r: RawRow): CanRow => {
  const cycles = r.cycles ? BigInt(r.cycles) : undefined;
  const idle = r.burn ? BigInt(r.burn) : undefined;
  const measured = r.measured ? BigInt(r.measured) : undefined;
  const burn = measured !== undefined && (idle === undefined || measured > idle) ? measured : idle;
  return {
    measured,
    measuredDays: r.measuredDays,
    kind: r.kind,
    id: r.id,
    name: CANISTER_NAMES[r.id] ?? KIND_NAMES[r.kind] ?? r.id.slice(0, 5),
    cycles,
    burn,
    runway: cycles !== undefined && burn && burn > 0n ? Number(cycles / burn) : undefined,
    status: r.status,
    module: r.module ?? undefined,
    memory: r.memory ? BigInt(r.memory) : undefined,
  };
};

/**
 * get_sns_canisters_summary is an UPDATE call that makes SNS root query every canister — it costs the DAO cycles.
 * Go through the worker (shared 15-min cache) and only fall back to a direct call without it.
 */
let canCache: { at: number; p: Promise<{ at: number; rows: CanRow[] }> } | null = null;
export const snsCanisters = (force = false) => {
  if (!force && canCache && Date.now() - canCache.at < 5 * 60_000) return canCache.p;
  const p = (async () => {
    if (EXPLAIN_URL) {
      const r = await fetch(`${EXPLAIN_URL.replace(/\/$/, '')}/cycles`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return { at: j.at as number, rows: (j.canisters as RawRow[]).map(toRow) };
    }
    const r = await (await snsRoot()).get_sns_canisters_summary({ update_canister_list: [] });
    const raw = (kind: string, c: (typeof r.dapps)[number]): RawRow => {
      const st = opt(c.status);
      return {
        kind,
        id: opt(c.canister_id)?.toText() ?? '',
        cycles: st ? String(st.cycles) : null,
        burn: st ? String(st.idle_cycles_burned_per_day) : null,
        status: st ? (variantKey(st.status) ?? 'unknown') : 'unknown',
        module: st && opt(st.module_hash) ? hex(opt(st.module_hash)!) : null,
        memory: st ? String(st.memory_size) : null,
      };
    };
    const rows: RawRow[] = [];
    (['root', 'governance', 'ledger', 'index', 'swap'] as const).forEach((k) => {
      const c = opt(r[k]);
      if (c) rows.push(raw(k, c));
    });
    r.dapps.forEach((c) => rows.push(raw('dapp', c)));
    r.archives.forEach((c) => rows.push(raw('archive', c)));
    return { at: Date.now(), rows: rows.map(toRow) };
  })();
  canCache = { at: Date.now(), p };
  p.catch(() => (canCache = null));
  return p;
};

export async function canisterHealth() {
  const { rows } = await snsCanisters();
  const w = rows.find((r) => r.id === IDS.waterNeuron);
  if (!w || w.cycles === undefined) return null;
  return { cycles: w.cycles, burnPerDay: w.burn ?? 0n, moduleHash: w.module, status: w.status, memory: w.memory ?? 0n };
}

export const cycleLevel = (r: CanRow) =>
  r.status !== 'running' ? 'red' : r.runway === undefined ? 'gray' : r.runway < 30 ? 'red' : r.runway < 90 ? 'orange' : 'green';

/* ---------- NNS periodic confirmation (refresh voting power / confirm following) ---------- */
export const REFRESH_DECAY_START = 15_778_800; // ~6 months: voting power starts to decay
export const REFRESH_FOLLOW_CLEAR = REFRESH_DECAY_START + 2_629_800; // +1 month: 0 VP, followees cleared

export function refreshInfo(n?: NeuronInfo | null) {
  const t = n && opt(n.voting_power_refreshed_timestamp_seconds);
  if (t === undefined || t === null) return undefined;
  const since = Date.now() / 1000 - Number(t);
  const left = (REFRESH_DECAY_START - since) / 86_400;
  return {
    refreshedAt: Number(t),
    daysSince: since / 86_400,
    daysLeft: left,
    level: (left < 0 ? 'red' : left < 30 ? 'orange' : 'green') as 'red' | 'orange' | 'green',
    decaying: left < 0,
    clearedIn: (REFRESH_FOLLOW_CLEAR - since) / 86_400,
  };
}

const OPEN = ['WaitingDissolvement', 'WaitingToStartDissolving', 'WaitingToSplitNeuron'];

export const withdrawalNeuron = (w: WithdrawalDetails) => {
  const s = w.status as Record<string, any>;
  const k = variantKey(s)!;
  return (s[k]?.neuron_id?.id as bigint | undefined) ?? opt(w.request.neuron_id)?.id;
};

let wCache: Promise<WithdrawalDetails[]> | null = null;
export const resetWithdrawals = () => {
  wCache = null;
};
export const allWithdrawals = () =>
  (wCache ??= (async () => {
    const wn = await waterNeuron();
    const out: WithdrawalDetails[] = [];
    for (let start = 0n; ; start += 100n) {
      const page = await wn.list_withdrawal_requests(start, 100n);
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  })().catch((e) => {
    wCache = null;
    throw e;
  }));

export type WRow = { w: WithdrawalDetails; status: string; neuronId?: bigint; nns: NeuronInfo | null; frozen: boolean };

export async function enrich(ws: WithdrawalDetails[]): Promise<WRow[]> {
  return pool(ws, 8, async (w) => {
    const status = variantKey(w.status)!;
    const neuronId = withdrawalNeuron(w);
    const nns = neuronId !== undefined && OPEN.includes(status) ? await nnsNeuron(neuronId) : null;
    const frozen = status === 'WaitingDissolvement' && nns?.state === 1;
    return { w, status, neuronId, nns, frozen };
  });
}

export async function openWithdrawals() {
  return enrich((await allWithdrawals()).filter((w) => OPEN.includes(variantKey(w.status)!)));
}

export async function withdrawalsOf(owner: string) {
  const ws = await (await waterNeuron()).get_withdrawal_requests([{ owner: Principal.fromText(owner), subaccount: [] }]);
  return enrich(ws);
}

export async function withdrawalById(id: bigint) {
  const page = await (await waterNeuron()).list_withdrawal_requests(id, 1n);
  let w = page.find((x) => x.request.withdrawal_id === id);
  if (!w) w = (await allWithdrawals()).find((x) => x.request.withdrawal_id === id);
  return w ? enrich([w]) : [];
}

/* ---------------- reproducible build (v2) ---------------- */

export type Build = { commit: string; built_at: string; run_url: string; runner: string; wasms: Record<string, string> };

export const isNnsMirror = (fn?: Fn) => !!fn && /nns proposal/i.test(fn.name);

export function summaryClaims(summary: string) {
  const commits = [...new Set(summary.match(/\b[0-9a-f]{40}\b/g) ?? [])];
  const hashes = [...new Set(summary.match(/\b[0-9a-f]{64}\b/g) ?? [])];
  return { commit: commits[0], commits, hashes };
}

export async function fetchBuild(commit: string): Promise<Build | null> {
  const r = await fetch(`https://raw.githubusercontent.com/${BUILDS_REPO}/main/builds/${commit}.json`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}

export const buildDispatchUrl = () => `https://github.com/${BUILDS_REPO}/actions/workflows/build-wtn.yml`;

export const canisterName = (id?: string) =>
  id === IDS.waterNeuron ? 'water_neuron' : id === 'daijl-2yaaa-aaaar-qag3a-cai' ? 'boomerang' : id === 'uqeyr-oaaaa-aaaar-qbyyq-cai' ? 'icrc_validator' : undefined;

/** hash -> build, from builds/index.json (written by CI) with a contents-API fallback */
let idxCache: Promise<Record<string, { commit: string; canister: string; run_url: string }>> | null = null;
export const buildsIndex = () =>
  (idxCache ??= (async () => {
    const raw = await fetch(`https://raw.githubusercontent.com/${BUILDS_REPO}/main/builds/index.json`, { cache: 'no-store' });
    if (raw.ok) return raw.json();
    const ls = await fetch(`https://api.github.com/repos/${BUILDS_REPO}/contents/builds`);
    if (!ls.ok) throw new Error(`GitHub ${ls.status}`);
    const files: { name: string }[] = await ls.json();
    const out: Record<string, { commit: string; canister: string; run_url: string }> = {};
    await pool(files.filter((f) => /^[0-9a-f]{40}\.json$/.test(f.name)), 6, async (f) => {
      const b = await fetchBuild(f.name.slice(0, 40));
      if (b) for (const [canister, h] of Object.entries(b.wasms)) out[h] = { commit: b.commit, canister, run_url: b.run_url };
    });
    return out;
  })().catch((e) => {
    idxCache = null;
    throw e;
  }));
