// supabase/functions/_shared/reAttributionCore.ts
// WHICH POST CAUSED THIS INQUIRY — and the discipline to say "nobody knows" when nobody knows.
// Pure: no Deno, no DOM, no Supabase. Verified by src/lib/garvis/reAttribution.verify.ts.
//
// Before this, leads carried a free-text `source` ('website | postcard-qr | social | …') and no
// reference to anything — nothing in the schema could answer "which published post produced this
// inquiry". app_0141 added the foreign keys; this decides what may be written into them.
//
// THE RULE THAT KEEPS THE NUMBERS HONEST: attribution has three levels and the weakest is a real
// answer, not a failure.
//   stated   — the prospect said so, in their own words. The only strong evidence there is.
//   inferred — a tracking tag we minted came back with them. Good, and still circumstantial.
//   unknown  — we do not know. Most inquiries, most of the time, and that is fine.
// A system that forces a guess gets lied to, and every later cost-per-lead figure inherits the lie.
// So nothing here ever falls back to "the most recent campaign".
//
// The tag format follows app_0124's src convention (src=gc_<channel>), made explicit about WHAT it
// points at so a future kind cannot be mistaken for a post: re_p_<uuid> / re_c_<uuid>.

export type SrcKind = 'post' | 'campaign' | 'other';
export type AttributionLevel = 'stated' | 'inferred' | 'unknown';

export interface ParsedSrc {
  kind: SrcKind;
  /** The id this tag points at, or null when the tag is not ours. */
  id: string | null;
  /** Always the raw value, so an untagged source (e.g. 'postcard-qr') survives as first/last source. */
  raw: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function srcForPost(postId: string): string { return `re_p_${postId}`; }
export function srcForCampaign(campaignId: string): string { return `re_c_${campaignId}`; }

/** Append the tag to a link the operator is putting in a post. Idempotent, and it never mangles an
 *  existing query string or fragment — a broken link is worse than an untracked one. */
export function taggedLink(url: string, src: string): string {
  const raw = (url ?? '').trim();
  if (!raw || !src.trim()) return raw;
  const hashAt = raw.indexOf('#');
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const base = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  if (new RegExp(`[?&]src=${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(&|$)`).test(base)) return raw;
  return `${base}${base.includes('?') ? '&' : '?'}src=${encodeURIComponent(src)}${hash}`;
}

/** Read a ?src= value without trusting it. Anything that is not one of ours is 'other' — kept
 *  verbatim, never coerced into an id. */
export function parseSrc(raw: unknown): ParsedSrc {
  const s = (typeof raw === 'string' ? raw : '').trim();
  if (!s) return { kind: 'other', id: null, raw: '' };
  const post = /^re_p_(.+)$/i.exec(s);
  if (post && UUID_RE.test(post[1])) return { kind: 'post', id: post[1].toLowerCase(), raw: s };
  const campaign = /^re_c_(.+)$/i.exec(s);
  if (campaign && UUID_RE.test(campaign[1])) return { kind: 'campaign', id: campaign[1].toLowerCase(), raw: s };
  return { kind: 'other', id: null, raw: s };
}

export interface AttributionInput {
  /** The ?src= value that arrived with the inquiry, if any. */
  src?: string | null;
  /** What the prospect SAID influenced them, verbatim. The only strong evidence. */
  statedInfluence?: string | null;
  /** Whether the tag actually resolved to a row we own — an id that matches nothing proves nothing. */
  resolved?: boolean;
}

/** The level, decided once, everywhere. */
export function attributionLevel(input: AttributionInput): AttributionLevel {
  if ((input.statedInfluence ?? '').trim()) return 'stated';
  if (input.resolved && parseSrc(input.src).kind !== 'other') return 'inferred';
  return 'unknown';
}

export interface AttributionFields {
  post_id?: string;
  campaign_id?: string;
  first_source?: string;
  last_source?: string;
  stated_influence?: string;
}

/** What to write onto the lead row. Only keys we actually know are included — a column left out is
 *  honestly empty, where a column written with a guess would be permanently wrong. */
export function attributionFields(input: {
  src?: string | null;
  statedInfluence?: string | null;
  /** Filled in by the caller after looking the tag up; absent means it did not resolve. */
  resolvedPostId?: string | null;
  resolvedCampaignId?: string | null;
  /** An existing lead's first source, when this is a returning person. */
  existingFirstSource?: string | null;
}): AttributionFields {
  const parsed = parseSrc(input.src);
  const out: AttributionFields = {};
  if (input.resolvedPostId) out.post_id = input.resolvedPostId;
  if (input.resolvedCampaignId) out.campaign_id = input.resolvedCampaignId;

  const source = parsed.raw;
  if (source) {
    // First touch is written once and never overwritten; last touch is always the newest.
    out.first_source = (input.existingFirstSource ?? '').trim() || source;
    out.last_source = source;
  }
  const stated = (input.statedInfluence ?? '').trim();
  if (stated) out.stated_influence = stated;
  return out;
}
