// src/lib/garvis/mediaProvenance.ts
// Client re-export of the ONE AI-provenance core (supabase/functions/_shared/mediaProvenanceCore.ts),
// shared with the social-publish executor's fail-closed disclosure gate (the socialCore precedent).
// Verified by mediaProvenance.verify.ts. The impure callers (generate-image, tts-voiceover, the
// fact-channel studio, the social publisher) stamp at generation time and disclose at publish time.

export {
  AI_DISCLOSURE, AI_DISCLOSURE_TAG,
  aiProvenance, stampProvenance, requiresDisclosure, hasDisclosure, withDisclosure, disclosureGate,
  parseProvenance,
  type MediaKind, type AiProvenance,
} from '../../../supabase/functions/_shared/mediaProvenanceCore';
