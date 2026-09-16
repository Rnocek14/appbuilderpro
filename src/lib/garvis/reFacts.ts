// src/lib/garvis/reFacts.ts
// Client re-export of the ONE fact-gate core (supabase/functions/_shared/reFactsCore.ts), shared with
// social-publish's send-time re-check. Verified by reFacts.verify.ts.

export {
  parseFact, citationBlocker, isCitable, renderWithFacts, factGate, hasUnresolvedHole,
  type FactStatus, type FactRecord, type RenderResult,
} from '../../../supabase/functions/_shared/reFactsCore';
