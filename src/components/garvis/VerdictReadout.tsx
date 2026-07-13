// src/components/garvis/VerdictReadout.tsx
// The ledger's REAL kept-vs-rewritten line — counted from verdict rows, phrased by the verified
// core (no fake 0%, no percentage theater on tiny samples).

import { useEffect, useState } from 'react';
import { verdictLine, type VerdictCounts } from '../../lib/garvis/verdicts';
import { countVerdicts } from '../../lib/garvis/verdictsRun';

export function VerdictReadout({ worldId, kind }: { worldId: string; kind: 'assist' | 'deliver' }) {
  const [counts, setCounts] = useState<VerdictCounts | null>(null);

  useEffect(() => {
    let live = true;
    void countVerdicts(worldId, kind).then((c) => { if (live) setCounts(c); }).catch(() => { /* line stays absent */ });
    return () => { live = false; };
  }, [worldId, kind]);

  if (!counts) return null;
  return <p className="mt-2 text-xs text-forge-ink/90">{verdictLine(kind, counts)}</p>;
}
