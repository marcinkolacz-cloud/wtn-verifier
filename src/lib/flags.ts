import type { ProposalData } from '../declarations/sns_governance';
import {
  canisterName, fetchBuild, functions, genericCall, listProposals, loadLabels, mirrorIds, summaryClaims, upgradeCall,
  type Fn,
} from './data';
import { IDS } from './ic';
import { hex, icp, opt, sha256 } from './format';
import type { Verdict } from './explain';

export type Level = 'red' | 'orange' | 'green';
export type Flag = { level: Level; title: string; text: string };

let histCache: Promise<ProposalData[]> | null = null;
/** last ~100 WTN proposals (NNS mirror votes excluded) */
export const history = () =>
  (histCache ??= (async () => listProposals(undefined, 100, mirrorIds(await functions())))().catch((e) => {
    histCache = null;
    throw e;
  }));

const KNOWN = new Set<string>([IDS.waterNeuron, IDS.wtnGovernance, IDS.wtnRoot, IDS.nnsGovernance]);
const DISCUSSION = /(forum\.dfinity\.org|discord\.(gg|com)|oc\.app|openchat|x\.com|twitter\.com)/i;

const action = (p: ProposalData) => opt(opt(p.proposal)?.action ?? []) as Record<string, any> | undefined;

export async function computeFlags(p: ProposalData, verdict?: Verdict): Promise<Flag[]> {
  const flags: Flag[] = [];
  const id = opt(p.id)!.id;
  const prop = opt(p.proposal);
  const a = action(p);
  const kind = a ? Object.keys(a)[0] : 'Unspecified';
  const [fns, hist] = await Promise.all([functions(), history().catch(() => [] as ProposalData[])]);
  const earlier = hist.filter((h) => opt(h.id)!.id < id);
  const labels = loadLabels();

  /* --- what kind of action --- */
  if (kind === 'TransferSnsTreasuryFunds' || kind === 'MintSnsTokens') {
    const t = a![kind];
    const to = opt(t.to_principal as [] | [{ toText(): string }])?.toText();
    const known = to && (KNOWN.has(to) || labels[to]);
    const amount = kind === 'TransferSnsTreasuryFunds' ? (t.amount_e8s as bigint) : (opt(t.amount_e8s as [] | [bigint]) ?? 0n);
    const token = kind === 'MintSnsTokens' || t.from_treasury === 2 ? 'WTN' : 'ICP';
    const large = token === 'ICP' ? amount > 1_000n * 100_000_000n : amount > 100_000n * 100_000_000n;
    flags.push({
      level: !known || large || kind === 'MintSnsTokens' ? 'red' : 'orange',
      title: kind === 'MintSnsTokens' ? 'Mints new WTN tokens' : 'Treasury transfer',
      text: `${icp(amount, 0)} ${token} to ${known ? (labels[to!]?.name ?? 'a protocol canister') : 'an unknown principal'}${large ? ' — a large amount' : ''}. Money leaves the DAO and cannot be pulled back.`,
    });
  } else if (kind === 'UpgradeSnsControlledCanister') {
    const u = upgradeCall(p)!;
    const claims = summaryClaims(prop?.summary ?? '');
    const chunked = opt(u.chunked_canister_wasm);
    const wasm = chunked ? hex(chunked.wasm_module_hash) : u.new_canister_wasm.length ? await sha256(u.new_canister_wasm) : undefined;
    const name = canisterName(opt(u.canister_id)?.toText());
    const build = claims.commit ? await fetchBuild(claims.commit).catch(() => null) : null;
    const built = name && build?.wasms[name];
    flags.push(
      !claims.commit
        ? { level: 'red', title: 'Canister upgrade without published code', text: 'The proposal does not say which source code the new program comes from, so nobody can check what it does.' }
        : !build || !wasm
          ? { level: 'orange', title: 'Canister upgrade not verified yet', text: 'The new program has not been rebuilt independently from the published code yet.' }
          : built === wasm
            ? { level: 'green', title: 'Canister upgrade matches published code', text: 'We rebuilt the program from the public source and got exactly the same file.' }
            : { level: 'red', title: 'Upgrade does NOT match the published code', text: 'Rebuilding from the stated source gives a different program. Treat as unsafe until explained.' },
    );
  } else if (kind === 'ExecuteGenericNervousSystemFunction') {
    const g = genericCall(p)!;
    const fn: Fn | undefined = fns.get(g.function_id);
    const used = earlier.filter((h) => genericCall(h)?.function_id === g.function_id).length;
    flags.push(
      used > 0
        ? { level: 'green', title: 'Calls an existing, known function', text: `"${fn?.name ?? `#${g.function_id}`}" has been used ${used}× before. Low risk, easy to verify.` }
        : { level: 'orange', title: 'First use of this function', text: `"${fn?.name ?? `#${g.function_id}`}" has not been called in recent proposals. Read the explanation carefully.` },
    );
  } else if (kind === 'AddGenericNervousSystemFunction') {
    flags.push({ level: 'red', title: 'Adds a new power to the DAO', text: 'Registers a new function that future proposals can call. Check what it targets and who benefits.' });
  } else if (kind === 'RemoveGenericNervousSystemFunction') {
    flags.push({ level: 'orange', title: 'Removes a DAO function', text: 'Future proposals will no longer be able to call this function.' });
  } else if (kind === 'ManageNervousSystemParameters') {
    flags.push({ level: 'orange', title: 'Changes DAO rules', text: 'Alters governance settings such as voting periods, fees or neuron limits.' });
  } else if (kind === 'Motion') {
    flags.push({ level: 'green', title: 'Motion (opinion poll)', text: 'Records the community view. Nothing changes on-chain automatically.' });
  }

  /* --- who proposed it --- */
  const proposer = opt(p.proposer);
  if (proposer) {
    const ph = hex(proposer.id);
    const prev = earlier.filter((h) => opt(h.proposer) && hex(opt(h.proposer)!.id) === ph).length;
    flags.push(
      prev === 0
        ? { level: 'orange', title: 'New proposer', text: 'This neuron has not submitted any of the recent proposals.' }
        : { level: 'green', title: 'Known proposer', text: `This neuron submitted ${prev} earlier proposal${prev > 1 ? 's' : ''}.` },
    );
  }

  /* --- was it discussed --- */
  const text = `${prop?.url ?? ''}\n${prop?.summary ?? ''}`;
  flags.push(
    DISCUSSION.test(text)
      ? { level: 'green', title: 'Discussion linked', text: 'The proposal links to a forum or chat discussion.' }
      : { level: 'orange', title: 'Rushed proposal?', text: 'No forum or Discord discussion is linked.' },
  );

  /* --- does the description match --- */
  if (verdict)
    flags.push(
      verdict.consistency === 'match'
        ? { level: 'green', title: 'Description matches the action', text: 'What the proposer wrote agrees with what the proposal actually does.' }
        : verdict.consistency === 'mismatch'
          ? { level: 'red', title: 'Description contradicts the action', text: 'The text says something different from what the proposal actually does.' }
          : { level: 'orange', title: 'Some claims cannot be checked', text: 'Parts of the description are not visible in the on-chain action.' },
    );

  const order = { red: 0, orange: 1, green: 2 };
  return flags.sort((x, y) => order[x.level] - order[y.level]);
}
