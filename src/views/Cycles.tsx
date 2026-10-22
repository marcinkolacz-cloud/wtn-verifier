import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CyclesCard } from '../components/Cycles';
import { Button } from '../components/ui';

export function Cycles() {
  const [tick, setTick] = useState(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Cycles</h1>
          <p className="text-sm text-muted">Fuel left in every canister run by the WaterNeuron DAO</p>
        </div>
        <Button onClick={() => setTick((t) => t + 1)}>
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>
      <CyclesCard tick={tick} />
    </div>
  );
}
