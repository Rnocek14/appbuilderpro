// src/lib/garvis/reconcile.ts
// Client re-export of the ONE reconciliation core (supabase/functions/_shared/reconcileCore.ts),
// used by the standing worker's in-flight sweep. Verified by reconcile.verify.ts.

export {
  parseHistory, matchesExpected, reconcile,
  type HistoryRecord, type ExpectedPost, type Reconciliation, type Verdict,
} from '../../../supabase/functions/_shared/reconcileCore';
