// src/lib/garvis/evidenceMatch.ts
// Client re-export of the ONE citation matcher (_shared/evidenceMatch.ts), shared with
// garvis-consolidate so the verify suite exercises the exact code the nightly run uses.

export {
  normalizeCitation, verifyNominations,
  type EvidenceNomination, type BeliefRef, type EventRef, type VerifiedLink,
} from '../../../supabase/functions/_shared/evidenceMatch.ts';
