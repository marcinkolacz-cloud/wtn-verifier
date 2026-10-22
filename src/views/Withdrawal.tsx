import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Principal } from '@icp-sdk/core/principal';
import { withdrawalById, withdrawalsOf, type WRow } from '../lib/data';
import { Button, Card, CardHeader, Empty, ErrorBox, Spinner } from '../components/ui';
import { WTable } from './Monitor';

export function Withdrawal() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<WRow[]>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    const isId = /^\d+$/.test(v);
    if (!isId) {
      try {
        Principal.fromText(v);
      } catch {
        setInvalid(true);
        return;
      }
    }
    setInvalid(false);
    setLoading(true);
    setError(undefined);
    setRows(undefined);
    try {
      setRows(isId ? await withdrawalById(BigInt(v)) : await withdrawalsOf(v));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Check a withdrawal</h1>
        <p className="text-sm text-muted">Enter the principal that receives the ICP, or a withdrawal ID.</p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="q">Principal or withdrawal ID</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="xxxxx-xxxxx-…-cai  or  1616"
            aria-invalid={invalid}
            className={`h-10 w-full rounded-lg border bg-panel pr-3 pl-9 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/30 ${invalid ? 'border-no' : 'border-line focus:border-accent'}`}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!q.trim() || loading} className="h-10 px-4">
          Check
        </Button>
      </form>
      {invalid && <p className="text-xs text-no">Not a valid principal or number.</p>}

      {error ? <ErrorBox error={error} /> : null}
      {loading && <Spinner label="Querying WaterNeuron and NNS…" />}
      {rows && (
        <Card>
          <CardHeader title={`${rows.length} withdrawal${rows.length === 1 ? '' : 's'}`} sub="Delay and state are read live from NNS governance" />
          {rows.length ? <WTable rows={rows} /> : <Empty>No withdrawals found</Empty>}
        </Card>
      )}
    </div>
  );
}
