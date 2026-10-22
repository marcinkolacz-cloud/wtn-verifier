export const E8S = 100_000_000;
export const DAY = 86_400;

export const icp = (e8s: bigint | number, d = 2) =>
  (Number(e8s) / E8S).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const compact = (e8s: bigint | number) =>
  (Number(e8s) / E8S).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export const pct = (a: bigint | number, b: bigint | number, d = 1) =>
  Number(b) === 0 ? '0%' : `${((Number(a) / Number(b)) * 100).toFixed(d)}%`;

export const days = (sec: bigint | number) => `${(Number(sec) / DAY).toFixed(1)} d`;

export const hex = (b: Uint8Array | number[]) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const short = (s: string, n = 5) => (s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

export const date = (sec: bigint | number) =>
  Number(sec) === 0
    ? '—'
    : new Date(Number(sec) * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const relative = (sec: bigint | number) => {
  const diff = Number(sec) - Date.now() / 1000;
  const abs = Math.abs(diff);
  const v = abs > DAY ? `${(abs / DAY).toFixed(1)}d` : abs > 3600 ? `${(abs / 3600).toFixed(1)}h` : `${Math.round(abs / 60)}m`;
  return diff >= 0 ? `in ${v}` : `${v} ago`;
};

export const cycles = (c: bigint | number) => `${(Number(c) / 1e12).toFixed(2)} T`;

export const opt = <T>(o: [] | [T]): T | undefined => (o.length ? o[0] : undefined);

export const variantKey = (v: object | undefined | null) => (v ? Object.keys(v)[0] : undefined);

export const humanize = (k?: string) => (k ? k.replace(/([a-z0-9])([A-Z])/g, '$1 $2') : '—');

export async function sha256(bytes: Uint8Array) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
}

export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}
