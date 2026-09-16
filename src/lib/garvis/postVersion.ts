// src/lib/garvis/postVersion.ts
// Client re-export of the ONE post-version core (supabase/functions/_shared/postVersionCore.ts),
// shared with social-publish's send-time binding check (the socialCore/mediaProvenance precedent).
// Verified by postVersion.verify.ts. The impure caller is socialRun.ts (queue time).

export {
  VERSION_FIELDS, parseVersionContent, canonicalVersion, versionHash, versionsDiffer, bytesDigest,
  describeChange, boundPayload, readBoundPayload,
  type PostVersionContent, type VersionField, type BoundPublishPayload,
} from '../../../supabase/functions/_shared/postVersionCore';
