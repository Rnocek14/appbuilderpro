// supabase/functions/_shared/socialCore.ts
// ONE implementation of the social-post core, shared by social-publish (edge) and the client studio
// (the batchCore/esignCore precedent). Pure: no Deno, no DOM, no Supabase. Verified by
// src/lib/garvis/social.verify.ts.
//
// Publishing runs through a provider that connects the client's real accounts once (Ayrshare on the
// free tier: 1 profile, 50 image posts/mo, scheduling included). Honesty rules: a post that a
// platform will reject (Instagram/TikTok with no image, an X post over its limit, a schedule time in
// the past) is REFUSED or flagged HERE — before it's queued — never silently mangled. Nothing posts
// without an approval; the edge function re-checks everything server-side.

export const KNOWN_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'gmb', 'twitter', 'youtube', 'tiktok', 'pinterest', 'reddit'] as const;
export type Platform = typeof KNOWN_PLATFORMS[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', gmb: 'Google Business',
  twitter: 'X / Twitter', youtube: 'YouTube', tiktok: 'TikTok', pinterest: 'Pinterest', reddit: 'Reddit',
};

// Character caps worth warning about (others are effectively unlimited for a normal post).
export const PLATFORM_LIMIT: Partial<Record<Platform, number>> = {
  twitter: 280, gmb: 1500, pinterest: 500,
};

// Platforms that CANNOT post text alone — they need an image or video attached.
export const MEDIA_REQUIRED: Platform[] = ['instagram', 'tiktok', 'youtube', 'pinterest'];

export interface SocialDraft {
  text: string;
  platforms: string[];
  mediaUrls?: string[];
  scheduleAt?: string | null;   // ISO-8601; null/absent = post now
}

export interface SocialCheck { ok: boolean; reason: string | null; warnings: string[] }

export function isPlatform(p: string): p is Platform {
  return (KNOWN_PLATFORMS as readonly string[]).includes(p);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** The refusal gate — re-checked SERVER-SIDE before anything is sent to the provider. `now` is
 *  injected (determinism); pass the real current ISO at call time. */
export function checkDraft(d: SocialDraft, nowIso: string): SocialCheck {
  const warnings: string[] = [];
  const text = (d.text ?? '').trim();
  const media = (d.mediaUrls ?? []).filter((u) => typeof u === 'string' && u.trim());

  if (d.platforms.length === 0) return { ok: false, reason: 'Pick at least one platform.', warnings };
  const bad = d.platforms.filter((p) => !isPlatform(p));
  if (bad.length) return { ok: false, reason: `Not a supported platform: ${bad.join(', ')}.`, warnings };
  const platforms = d.platforms as Platform[];

  if (!text && media.length === 0) return { ok: false, reason: 'Write the post (or attach media).', warnings };

  // Media-required platforms refuse a text-only post.
  const needMedia = platforms.filter((p) => MEDIA_REQUIRED.includes(p));
  if (needMedia.length && media.length === 0) {
    return { ok: false, reason: `${needMedia.map((p) => PLATFORM_LABEL[p]).join(', ')} need${needMedia.length === 1 ? 's' : ''} an image or video — attach one or drop the platform.`, warnings };
  }

  if (d.scheduleAt) {
    if (!ISO_RE.test(d.scheduleAt)) return { ok: false, reason: 'The schedule time is not a valid date.', warnings };
    if (new Date(d.scheduleAt).getTime() <= new Date(nowIso).getTime()) {
      return { ok: false, reason: 'The schedule time is in the past — pick a future time or post now.', warnings };
    }
  }

  // Non-blocking honesty: per-platform length overflow is a warning, not a refusal (the operator
  // may accept truncation), but it must be VISIBLE before approving.
  for (const p of platforms) {
    const lim = PLATFORM_LIMIT[p];
    if (lim && text.length > lim) warnings.push(`${PLATFORM_LABEL[p]}: ${text.length}/${lim} chars — it will be cut.`);
  }
  // Video note: the provider's free tier is images-only; a video URL there fails. We can't see the
  // plan, so flag it rather than pretend.
  if (media.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u))) {
    warnings.push('Video detected — that needs a paid provider tier (the free tier posts images only).');
  }

  return { ok: true, reason: null, warnings };
}

/** Build the provider (Ayrshare) request body. Only included fields the API expects. */
export function providerPayload(d: SocialDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    post: (d.text ?? '').trim(),
    platforms: d.platforms,
  };
  const media = (d.mediaUrls ?? []).filter((u) => typeof u === 'string' && u.trim());
  if (media.length) body.mediaUrls = media;
  if (d.scheduleAt) body.scheduleDate = d.scheduleAt;
  return body;
}

export type PostStatus = 'posted' | 'scheduled' | 'failed';

/** Map a provider response to our status. Scheduled posts come back with a scheduled marker; a
 *  live post lists per-platform results — any error → failed, else posted. Unknown shape → failed
 *  (never a false "posted"). */
export function mapProviderResult(res: { status?: string; postIds?: { status?: string }[]; errors?: unknown[] }, scheduled: boolean): PostStatus {
  if (scheduled) return 'scheduled';
  const s = (res.status ?? '').toLowerCase();
  if (s === 'error') return 'failed';
  if (Array.isArray(res.errors) && res.errors.length > 0) return 'failed';
  const ids = res.postIds ?? [];
  if (ids.length > 0) {
    return ids.every((i) => (i.status ?? 'success').toLowerCase() !== 'error') ? 'posted' : 'failed';
  }
  return s === 'success' ? 'posted' : 'failed';
}
