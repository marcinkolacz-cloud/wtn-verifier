import { functions, mirrorIds, listProposals, nnsNeuron, openWithdrawals, resetWithdrawals, wnInfo } from './data';
import { DAY, opt } from './format';

export const INTERVAL_MS = 5 * 60_000;

type Snap = { mainDelay: number; mainState: number; frozen: string[]; risky: string[]; lastProposal: string; at: number };
export type Alert = { at: number; text: string; level: 'warn' | 'info' };
type State = { enabled: boolean; running: boolean; lastRun?: number; error?: string; log: Alert[] };

const ls = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

let state: State = { enabled: ls.get('wtn-watch', false), running: false, log: ls.get<Alert[]>('wtn-alerts', []) };
const subs = new Set<() => void>();
const emit = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const watchState = () => state;
export const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

function notify(a: Alert) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('WTN Verifier', { body: a.text, tag: a.text });
  } catch {}
}

async function snapshot(): Promise<Snap> {
  resetWithdrawals();
  const fns = await functions();
  const [info, ps] = await Promise.all([wnInfo(), listProposals(undefined, 1, mirrorIds(fns))]);
  const id6 = opt(info.neuron_id_6m)?.id;
  const [n6, rows] = await Promise.all([id6 !== undefined ? nnsNeuron(id6) : null, openWithdrawals()]);
  const mainDelay = Number(n6?.dissolve_delay_seconds ?? 0n);
  const latest = ps[0];
  return {
    mainDelay,
    mainState: n6?.state ?? 0,
    frozen: rows.filter((r) => r.frozen).map((r) => String(r.w.request.withdrawal_id)),
    risky: rows
      .filter((r) => r.nns?.state === 1 && Number(r.nns.dissolve_delay_seconds) > mainDelay)
      .map((r) => String(r.w.request.withdrawal_id)),
    lastProposal: String(opt(latest?.id ?? [])?.id ?? 0n),
    at: Date.now(),
  };
}

function diff(prev: Snap | null, cur: Snap): Alert[] {
  if (!prev) return [];
  const out: Alert[] = [];
  const at = Date.now();
  const d = (s: number) => (s / DAY).toFixed(1);
  if (cur.mainDelay - prev.mainDelay > DAY)
    out.push({ at, level: 'warn', text: `Main neuron delay rose ${d(prev.mainDelay)} → ${d(cur.mainDelay)} days` });
  if (cur.mainState === 2 && prev.mainState !== 2) out.push({ at, level: 'warn', text: 'Main neuron started dissolving' });
  const newFrozen = cur.frozen.filter((x) => !prev.frozen.includes(x));
  if (newFrozen.length) out.push({ at, level: 'warn', text: `New frozen withdrawal: #${newFrozen.join(', #')}` });
  const newRisky = cur.risky.filter((x) => !prev.risky.includes(x));
  if (newRisky.length) out.push({ at, level: 'warn', text: `Cancel could raise main delay: #${newRisky.join(', #')}` });
  if (BigInt(cur.lastProposal) > BigInt(prev.lastProposal))
    out.push({ at, level: 'info', text: `New proposal #${cur.lastProposal}` });
  return out;
}

export async function runCheck() {
  if (state.running) return;
  emit({ running: true, error: undefined });
  try {
    const cur = await snapshot();
    const alerts = diff(ls.get<Snap | null>('wtn-snap', null), cur);
    ls.set('wtn-snap', cur);
    alerts.forEach(notify);
    const log = [...alerts.reverse(), ...state.log].slice(0, 30);
    ls.set('wtn-alerts', log);
    emit({ running: false, lastRun: Date.now(), log });
  } catch (e) {
    emit({ running: false, lastRun: Date.now(), error: String((e as Error)?.message ?? e) });
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
function schedule() {
  clearInterval(timer);
  timer = undefined;
  if (state.enabled) {
    runCheck();
    timer = setInterval(runCheck, INTERVAL_MS);
  }
}

export async function setWatch(on: boolean) {
  if (on && 'Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {}
  }
  ls.set('wtn-watch', on);
  emit({ enabled: on });
  schedule();
}

export const clearLog = () => {
  ls.set('wtn-alerts', []);
  emit({ log: [] });
};

export const startWatcher = () => schedule();
