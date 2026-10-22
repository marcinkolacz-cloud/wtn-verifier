import { Principal } from '@icp-sdk/core/principal';
import { IDS, nnsGov, snsGov, snsRoot, waterNeuron } from './ic';
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

export async function listProposals(before?: bigint, limit = 30) {
  const r = await (await snsGov()).list_proposals({
    limit,
    before_proposal: before === undefined ? [] : [{ id: before }],
    exclude_type: new BigUint64Array(),
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

type Label = { name: string; entity: Entity };
const DEFAULT_LABELS: Record<string, Label> = {
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

export async function canisterHealth() {
  const r = await (await snsRoot()).get_sns_canisters_summary({ update_canister_list: [] });
  const s = r.dapps.find((d) => opt(d.canister_id)?.toText() === IDS.waterNeuron);
  const st = s && opt(s.status);
  if (!st) return null;
  return {
    cycles: st.cycles,
    burnPerDay: st.idle_cycles_burned_per_day,
    moduleHash: opt(st.module_hash) ? hex(opt(st.module_hash)!) : undefined,
    status: variantKey(st.status) ?? '—',
    memory: st.memory_size,
  };
}

const OPEN = ['WaitingDissolvement', 'WaitingToStartDissolving', 'WaitingToSplitNeuron'];

export const withdrawalNeuron = (w: WithdrawalDetails) => {
  const s = w.status as Record<string, any>;
  const k = variantKey(s)!;
  return (s[k]?.neuron_id?.id as bigint | undefined) ?? opt(w.request.neuron_id)?.id;
};

let wCache: Promise<WithdrawalDetails[]> | null = null;
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
