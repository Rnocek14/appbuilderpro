// src/lib/garvis/outreachBatch.ts
// Client-side re-export of the ONE batch-core implementation (supabase/functions/_shared/batchCore.ts),
// shared with the standing worker's drain — the adsWatchCore/standingCore precedent. Impure half:
// outreachBatchRun.ts.

export {
  composeBatchRecipients, mergeTemplate, unknownTokens, batchProgress, pickNextPending,
  TEMPLATE_TOKENS,
  type BatchRecipient, type ContactLike,
} from '../../../supabase/functions/_shared/batchCore';
