// src/lib/garvis/payloadHash.ts
// Client re-export of the ONE approval-payload hash (supabase/functions/_shared/payloadHash.ts),
// shared with send-email / docusign-send. Impure callers: execution.ts (enqueue).

export {
  stableStringify, hashPayload, payloadMatches,
} from '../../../supabase/functions/_shared/payloadHash';
