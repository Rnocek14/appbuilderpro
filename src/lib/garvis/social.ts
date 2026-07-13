// src/lib/garvis/social.ts
// Client re-export of the ONE social-post core (supabase/functions/_shared/socialCore.ts), shared
// with social-publish. Impure half: socialRun.ts.

export {
  KNOWN_PLATFORMS, PLATFORM_LABEL, PLATFORM_LIMIT, MEDIA_REQUIRED,
  isPlatform, checkDraft, providerPayload, mapProviderResult,
  type Platform, type SocialDraft, type SocialCheck, type PostStatus,
} from '../../../supabase/functions/_shared/socialCore';
