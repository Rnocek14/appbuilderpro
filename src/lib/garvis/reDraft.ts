// src/lib/garvis/reDraft.ts
// Client re-export of the ONE neighborhood-draft composer
// (supabase/functions/_shared/reDraftCore.ts). Verified by reDraft.verify.ts.

export {
  DRAFT_KINDS, draft,
  type DraftKind, type DraftKindMeta, type DraftFact, type DraftInput, type DraftOutput,
} from '../../../supabase/functions/_shared/reDraftCore';
