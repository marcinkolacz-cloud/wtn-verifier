import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { idlFactory } from '../../src/declarations/sns_governance.idl.js';

const GOV = 'jfnic-kaaaa-aaaaq-aadla-cai';
const VERSION = 'v2';
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
        `You explain WaterNeuron SNS DAO governance proposals to token holders who are not developers. ` +
        `Answer in ${LANGS[lang]}. Be concise and factual; each bullet one short sentence. ` +
        `Return ONLY a JSON object with keys: ` +
        `"does": 2-4 bullets on what the proposal does; ` +
        `"onchain": 1-3 bullets on what actually changes on-chain, based ONLY on the action type and decoded payload; ` +
        `"consistency": "match" if the summary matches the action/payload, "partial" if the summary makes claims the payload cannot confirm, "mismatch" if they contradict; ` +
        `"consistency_notes": 1-3 bullets explaining the consistency verdict; ` +
        `"risks": 0-3 bullets on concrete risks or irreversible effects (empty if none); ` +
        `"checks": 1-3 bullets on what to verify before voting. ` +
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

    let out;
    try {
      out = await env.AI.run(env.MODEL, {
        messages: prompt(p, lang),
        max_tokens: 900,
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
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
          },
        },
      });
    } catch (e) {
      return json({ error: `AI failed: ${e?.message ?? e}` }, 502, origin);
    }
    const raw = out?.response ?? out;
    let data = null;
    if (raw && typeof raw === 'object') data = raw;
    else if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      } catch {}
    }
    const text = data ? '' : String(raw ?? '');
    const body = { id: idStr, lang, model: env.MODEL, data, text, created: new Date().toISOString() };
    ctx.waitUntil(env.EXPLAIN.put(key, JSON.stringify(body)));
    return json({ ...body, cached: false }, 200, origin);
  },
};
