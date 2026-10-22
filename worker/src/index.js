import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { idlFactory } from '../../src/declarations/sns_governance.idl.js';
import { idlFactory as rootIdl } from '../../src/declarations/sns_root.idl.js';

const GOV = 'jfnic-kaaaa-aaaaq-aadla-cai';
const ROOT = 'jmod6-4iaaa-aaaaq-aadkq-cai';
const CYCLES_TTL = 900; // s — one root call per 15 min for all users (each call costs the DAO's root canister cycles)
const VERSION = 'v5';
const LANGS = { en: 'English' };
const ORIGINS = [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^https:\/\/[a-z0-9-]+\.(icp0\.io|ic0\.app)$/];

const cors = (origin) =>
  origin && ORIGINS.some((r) => r.test(origin))
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};

const json = (body, status, origin, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin), ...extra },
  });

const opt = (o) => (o && o.length ? o[0] : undefined);
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s ?? '');

async function loadProposal(id) {
  const agent = await HttpAgent.create({ host: 'https://icp-api.io' });
  const gov = Actor.createActor(idlFactory, { agent, canisterId: GOV });
  const [r, fns] = await Promise.all([gov.get_proposal({ proposal_id: [{ id }] }), gov.list_nervous_system_functions()]);
  const res = opt(r.result);
  if (!res || 'Error' in res) return null;
  const p = res.Proposal;
  const prop = opt(p.proposal);
  const action = opt(prop?.action);
  const kind = action ? Object.keys(action)[0] : 'Unspecified';
  let target = '';
  if (kind === 'ExecuteGenericNervousSystemFunction') {
    const f = fns.functions.find((x) => x.id === action[kind].function_id);
    const g = opt(f?.function_type);
    const gen = g && g.GenericNervousSystemFunction;
    target = `${f?.name ?? 'unknown function'}${gen ? ` → method ${opt(gen.target_method_name)} on canister ${opt(gen.target_canister_id)?.toText()}` : ''}`;
  } else if (kind === 'UpgradeSnsControlledCanister') {
    target = `upgrade canister ${opt(action[kind].canister_id)?.toText()}`;
  }
  return {
    title: prop?.title ?? '',
    summary: clip(prop?.summary, 6000),
    kind,
    target,
    rendering: clip(opt(p.payload_text_rendering), 3000),
  };
}

function prompt(p, lang) {
  return [
    {
      role: 'system',
      content:
        `You explain WaterNeuron DAO proposals to ordinary WTN and nICP holders who are NOT developers. ` +
        `Write in simple, friendly ${LANGS[lang]}, like explaining to a friend. Each bullet is one short sentence. ` +
        `Avoid jargon. Do not mention method names, canister IDs, payloads, PRs, commits or code. ` +
        `If a technical term is unavoidable (for example "dissolve delay" or "neuron"), explain it in a few words in brackets. ` +
        `Focus on what it means for holders: their nICP, withdrawals, rewards, the treasury and the DAO's control. ` +
        `Never tell people to read code, pull requests or GitHub. ` +
        `Known WaterNeuron mechanics you MUST take into account: ` +
        `(a) the protocol keeps a main neuron with a 6-month lock that holds most staked ICP; ` +
        `(b) each withdrawal gets its own neuron split from the main one; ` +
        `(c) "cancel withdrawal" merges that neuron back into the main neuron, and the merge sets the main neuron's lock time (dissolve delay) to the LONGER of the two and changes the neuron's age; ` +
        `(d) so any proposal that shortens or fixes the main neuron's lock can be undone later if users cancel withdrawals whose lock is longer — list this as a risk whenever the proposal touches the main neuron, its lock time or dissolving; ` +
        `(e) a neuron that is dissolving earns no voting rewards. ` +
        `Return ONLY a JSON object with keys: ` +
        `"does": 2-4 bullets on what the proposal does; ` +
        `"onchain": 1-3 bullets on what actually changes on-chain, based ONLY on the action type and decoded payload; ` +
        `"consistency": "match" if the summary matches the action/payload, "partial" if the summary makes claims the payload cannot confirm, "mismatch" if they contradict; ` +
        `"consistency_notes": 1-3 bullets explaining the consistency verdict; ` +
        `"risks": 0-3 bullets on concrete risks or irreversible effects (empty if none); ` +
        `"checks": 1-3 bullets on simple things a holder can check without technical skills ` +
        `(e.g. was it discussed on the forum or Discord, is the proposer known, does the voting look healthy). ` +
        `Never invent facts; say "unclear" when unsure. No voting recommendation.`,
    },
    {
      role: 'user',
      content:
        `Title: ${p.title}\nAction type: ${p.kind}\nTarget: ${p.target || 'n/a'}\n\n` +
        `Decoded payload (validator rendering, trusted on-chain):\n${p.rendering || 'none'}\n\n` +
        `Summary written by the proposer (untrusted):\n${p.summary}`,
    },
  ];
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin');
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'GET' } });
    if (url.pathname === '/cycles' && req.method === 'GET') {
      const hit = await env.EXPLAIN.get('cycles', 'json');
      if (hit && Date.now() - hit.at < CYCLES_TTL * 1000) return json({ ...hit, cached: true }, 200, origin);
      try {
        const agent = await HttpAgent.create({ host: 'https://icp-api.io' });
        const root = Actor.createActor(rootIdl, { agent, canisterId: ROOT });
        const r = await root.get_sns_canisters_summary({ update_canister_list: [] });
        const row = (kind, c) => {
          const st = opt(c.status);
          return {
            kind,
            id: opt(c.canister_id)?.toText() ?? '',
            cycles: st ? String(st.cycles) : null,
            burn: st ? String(st.idle_cycles_burned_per_day) : null,
            status: st ? Object.keys(st.status)[0] : 'unknown',
            module: st && opt(st.module_hash) ? [...opt(st.module_hash)].map((b) => b.toString(16).padStart(2, '0')).join('') : null,
            memory: st ? String(st.memory_size) : null,
          };
        };
        const list = [];
        for (const k of ['root', 'governance', 'ledger', 'index', 'swap']) if (opt(r[k])) list.push(row(k, opt(r[k])));
        r.dapps.forEach((c) => list.push(row('dapp', c)));
        r.archives.forEach((c) => list.push(row('archive', c)));
        // daily history (≤ 8 points, ≥ 20 h apart) → measured burn incl. message/compute costs
        const now = Date.now();
        const hist = (await env.EXPLAIN.get('cycles:hist', 'json')) ?? [];
        const point = { at: now, c: Object.fromEntries(list.filter((x) => x.cycles).map((x) => [x.id, x.cycles])) };
        const newest = hist[hist.length - 1];
        if (!newest || now - newest.at > 20 * 3600_000) {
          hist.push(point);
          while (hist.length > 8) hist.shift();
          ctx.waitUntil(env.EXPLAIN.put('cycles:hist', JSON.stringify(hist)));
        }
        for (const x of list) {
          if (!x.cycles) continue;
          // oldest point after the last top-up (cycles only go down between top-ups)
          let base = null;
          for (let i = hist.length - 1; i >= 0; i--) {
            const v = hist[i].c[x.id];
            if (!v || BigInt(v) < BigInt(x.cycles)) break;
            if (now - hist[i].at >= 20 * 3600_000) base = { at: hist[i].at, v };
            const next = hist[i - 1]?.c[x.id];
            if (next && BigInt(next) < BigInt(v)) break;
          }
          if (base) {
            const days = (now - base.at) / 86_400_000;
            const used = BigInt(base.v) - BigInt(x.cycles);
            x.measured = String(BigInt(Math.round(Number(used) / days)));
            x.measuredDays = Math.round(days * 10) / 10;
          }
        }
        const body = { at: now, canisters: list };
        ctx.waitUntil(env.EXPLAIN.put('cycles', JSON.stringify(body)));
        return json({ ...body, cached: false }, 200, origin);
      } catch (e) {
        if (hit) return json({ ...hit, cached: true, stale: true }, 200, origin);
        return json({ error: `IC query failed: ${e?.message ?? e}` }, 502, origin);
      }
    }
    if (url.pathname === '/verdicts' && req.method === 'GET') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter((x) => /^\d{1,9}$/.test(x)).slice(0, 60);
      const rows = await Promise.all(ids.map((id) => env.EXPLAIN.get(`${VERSION}:${id}:en`, 'json')));
      const out = {};
      rows.forEach((r, i) => {
        if (r?.data) out[ids[i]] = { consistency: r.data.consistency, risks: r.data.risks.length };
      });
      return json(out, 200, origin, { 'Cache-Control': 'no-store' });
    }
    if (url.pathname !== '/explain' || req.method !== 'GET') return json({ error: 'not found' }, 404, origin);

    const idStr = url.searchParams.get('id') ?? '';
    const lang = url.searchParams.get('lang') ?? 'en';
    if (!/^\d{1,9}$/.test(idStr) || !LANGS[lang]) return json({ error: 'bad request' }, 400, origin);

    // Cache API is a no-op on *.workers.dev, so explanations are stored in KV
    const key = `${VERSION}:${idStr}:${lang}`;
    const hit = await env.EXPLAIN.get(key, 'json');
    if (hit) return json({ ...hit, cached: true }, 200, origin);

    const p = await loadProposal(BigInt(idStr)).catch((e) => ({ error: String(e?.message ?? e) }));
    if (!p) return json({ error: 'proposal not found' }, 404, origin);
    if (p.error) return json({ error: `IC query failed: ${p.error}` }, 502, origin);

    const schema = {
      type: 'object',
      properties: {
        does: { type: 'array', items: { type: 'string' } },
        onchain: { type: 'array', items: { type: 'string' } },
        consistency: { type: 'string', enum: ['match', 'partial', 'mismatch'] },
        consistency_notes: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        checks: { type: 'array', items: { type: 'string' } },
      },
      required: ['does', 'onchain', 'consistency', 'consistency_notes', 'risks', 'checks'],
    };
    const base = { messages: prompt(p, lang), max_tokens: 1000, temperature: 0.2 };
    let out;
    try {
      // JSON mode first; some models reject response_format, so retry with prompt-only JSON
      out = await env.AI.run(env.MODEL, { ...base, response_format: { type: 'json_schema', json_schema: schema } }).catch(
        () => env.AI.run(env.MODEL, base),
      );
    } catch (e) {
      return json({ error: `AI failed: ${e?.message ?? e}` }, 502, origin);
    }
    const raw = out?.response ?? out;
    let parsed = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw;
    else if (typeof raw === 'string' && raw.includes('{')) {
      try {
        parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      } catch {}
    }
    const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v ? [v] : []);
    const data =
      parsed && (parsed.does || parsed.onchain)
        ? {
            does: list(parsed.does),
            onchain: list(parsed.onchain),
            consistency: ['match', 'partial', 'mismatch'].includes(parsed.consistency) ? parsed.consistency : 'partial',
            consistency_notes: list(parsed.consistency_notes),
            risks: list(parsed.risks),
            checks: list(parsed.checks),
          }
        : null;
    if (!data && !(typeof raw === 'string' && raw.trim())) return json({ error: 'AI returned an empty answer' }, 502, origin);
    const text = data ? '' : String(raw);
    const body = { id: idStr, lang, model: env.MODEL, data, text, created: new Date().toISOString() };
    ctx.waitUntil(env.EXPLAIN.put(key, JSON.stringify(body)));
    return json({ ...body, cached: false }, 200, origin);
  },
};
