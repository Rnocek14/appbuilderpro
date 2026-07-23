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

// ---------------------------------------------------------------------------
// Image RE-HOSTING (durability) — a demo hotlinks the prospect's scraped photos; a SOLD, published
// site must not. These pure helpers pick which image URLs to pull onto our own storage and rewrite
// the HTML to point at the copies. The download/upload I/O lives in publish-preview; this is the
// deterministic half (verified by publishCore.verify.ts). Only runs at PUBLISH, so we pay the storage
// cost for sites that actually sell — demos stay cheap hotlinks.

/** Hosts we never re-host: our own storage (already durable) + the font CDNs the export relies on. */
const REHOST_SKIP_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

export interface RehostCandidate { raw: string; url: string }

/** Every external image URL in the exported HTML worth re-hosting — from `src`, `srcset`, and CSS
 *  `url(...)`. `raw` is the exact substring as it appears in the HTML (so the caller can string-replace
 *  it); `url` is the fetchable form (HTML entities decoded). Skips data: URIs, our own `selfHost`
 *  (AI images + the screenshot already live there), and the font CDNs. Deduped, capped, deterministic. */
export function extractRehostableImages(html: string, selfHost: string, maxN = 24): RehostCandidate[] {
  const self = (selfHost ?? '').toLowerCase();
  const out = new Map<string, RehostCandidate>();
  const consider = (rawIn: string) => {
    const raw = rawIn.trim();
    if (!raw || out.has(raw) || !/^https?:\/\//i.test(raw)) return;
    const url = raw.replace(/&amp;/g, '&');
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return; }
    if (!host || host === self || REHOST_SKIP_HOSTS.has(host)) return;
    out.set(raw, { raw, url });
  };
  for (const m of html.matchAll(/\bsrc=["']([^"']+)["']/gi)) consider(m[1]);
  for (const m of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const part of m[1].split(',')) consider(part.trim().split(/\s+/)[0] ?? '');
  }
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) consider(m[1]);
  return [...out.values()].slice(0, Math.max(0, maxN));
}

/** Rewrite the HTML, replacing each original image URL string with its re-hosted copy. A mapping whose
 *  target is empty/unchanged is skipped (fail-soft: an image we couldn't pull keeps its original URL). */
export function rewriteImageUrls(html: string, map: Record<string, string>): string {
  let out = html;
  for (const [oldRaw, next] of Object.entries(map)) {
    if (!next || next === oldRaw) continue;
    out = out.split(oldRaw).join(next);
  }
  return out;
}

/** File extension for a re-hosted image, from its content-type (preferred) or the URL as a fallback. */
export function imageExtFor(contentType: string | null | undefined, url: string): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('avif')) return 'avif';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('svg')) return 'svg';
  const m = /\.(jpe?g|png|webp|avif|gif|svg)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'img';
}

/** Storage path for one re-hosted image, keyed by a content hash so identical photos de-dupe and a
 *  re-publish overwrites in place. */
export function rehostedImagePath(ownerId: string, previewSiteId: string, contentKey: string, ext: string): string {
  return `${ownerId}/published/${previewSiteId}/img/${contentKey}.${ext}`;
}
