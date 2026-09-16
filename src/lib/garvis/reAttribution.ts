// src/lib/garvis/reAttribution.ts
// Client re-export of the ONE attribution core (supabase/functions/_shared/reAttributionCore.ts),
// shared with the lead-capture rail. Verified by reAttribution.verify.ts.

export {
  srcForPost, srcForCampaign, taggedLink, parseSrc, attributionLevel, attributionFields,
  type SrcKind, type AttributionLevel, type ParsedSrc, type AttributionInput, type AttributionFields,
} from '../../../supabase/functions/_shared/reAttributionCore';
