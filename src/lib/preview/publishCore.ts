// src/lib/preview/publishCore.ts
// PURE helpers for publishing a demo to a live host (verified by publishCore.verify.ts). No I/O — the
// Netlify calls + storage live in the publish-preview edge function; this is only the deterministic
// naming/validation/state logic the function (and its tests) share. Deno-safe: imported by the edge
// function, so no browser/Node APIs.

export type PreviewStatus = 'preview' | 'emailed' | 'purchased' | 'published';

/** A valid Netlify site name from a preview slug → the site is served at `<name>.netlify.app`.
 *  Netlify names allow lowercase letters, digits and hyphens (no leading/trailing hyphen), ≤63 chars.
 *  The preview slug already ends in a random nonce, so reusing it keeps the address readable AND
 *  unlikely to collide with an existing Netlify site. Junk in → a safe 'site' fallback, never ''. */
export function netlifySiteName(slug: string | null | undefined): string {
  const base = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '');
  const trimmed = base.slice(0, 63).replace(/-+$/, '');
  return trimmed.length >= 1 ? trimmed : 'site';
}

/** Normalize a client's custom domain to a bare hostname (scheme/path/port stripped, lowercased), or
 *  null when it isn't a valid domain. Never guesses — an unparseable value returns null so the caller
 *  refuses it instead of pointing the host at garbage. */
export function normalizeCustomDomain(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').trim();
  // One-or-more dot-separated labels (alnum + inner hyphens) ending in a 2+ letter TLD, ≤253 chars.
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return host;
}

/** The status after a successful publish. A SOLD demo ('purchased') stays sold — publishing or
 *  re-publishing a paid site must never downgrade it to a bare 'published'. Everything else becomes
 *  'published' (it is now live). */
export function publishStatusAfter(current: string | null | undefined): PreviewStatus {
  return current === 'purchased' ? 'purchased' : 'published';
}

/** Guard: a spec is publishable only if it actually has sections to render — never ship a blank host. */
export function isPublishableSpec(spec: unknown): boolean {
  const s = spec as { sections?: unknown[] } | null;
  return !!s && Array.isArray(s.sections) && s.sections.length > 0;
}

/** The storage path for a preview's finished index.html (project-assets bucket). Keyed by owner +
 *  preview id so the payment webhook can re-publish the exact bytes the operator rendered, with no
 *  browser in the loop. */
export function publishedHtmlPath(ownerId: string, previewSiteId: string): string {
  return `${ownerId}/published/${previewSiteId}.html`;
}
