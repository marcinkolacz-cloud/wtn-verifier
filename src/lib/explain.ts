import { EXPLAIN_URL } from './ic';

export type Verdict = { consistency: 'match' | 'partial' | 'mismatch'; risks: number };

const base = () => EXPLAIN_URL?.replace(/\/$/, '');

export async function fetchExplain(id: bigint) {
  const r = await fetch(`${base()}/explain?id=${id}&lang=en`);
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export async function fetchVerdicts(ids: bigint[]): Promise<Record<string, Verdict>> {
  if (!base() || !ids.length) return {};
  const r = await fetch(`${base()}/verdicts?ids=${ids.join(',')}`);
  return r.ok ? r.json() : {};
}

export const verdictInfo = {
  match: { tone: 'yes', label: 'Summary verified' },
  partial: { tone: 'warn', label: 'Unconfirmed claims' },
  mismatch: { tone: 'no', label: 'Summary mismatch' },
} as const;
