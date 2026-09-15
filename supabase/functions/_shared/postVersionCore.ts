// supabase/functions/_shared/postVersionCore.ts
// THE BINDING: one canonical shape for "what the human approved", and one hash over it. Shared by
// socialRun (client, at queue time) and social-publish (edge, at send time) — the
// socialCore/payloadHash precedent. Pure: no Deno, no DOM, no Supabase. Verified by
// src/lib/garvis/postVersion.verify.ts.
//
// WHY: a publish_post approval used to carry only { post_row_id }, and the publisher re-read the
// body, platforms, media and schedule from the mutable social_posts row — so an edit after approval
// changed what went out, invisibly. The house already solved this for content weeks (the approval
// carries a pieces_hash; the drain re-hashes before executing and refuses on mismatch). This is that
// pattern for posts.
//
// THE RULE: the hash covers everything a human would want to re-approve if it changed — the words,
// the destinations, the media (by BYTES, not just URL), the moment, the facts relied on, and the
// brokerage line. Change any of them and the old approval stops matching. That is the whole point.

import { hashPayload, stableStringify } from './payloadHash.ts';

export interface PostVersionContent {
  body: string;
  platforms: string[];
  mediaUrls: string[];
  /** url -> sha256 of the bytes at approval time. Two generators upload with upsert:true to a
   *  deterministic path, so the bytes behind a live URL can change without the URL changing. */
  mediaDigests: Record<string, string>;
  /** The instant (ISO-8601), or null for "post on approval". */
  scheduledFor: string | null;
  /** 'YYYY-MM-DDTHH:mm' exactly as the operator typed it — intent, not just the resolved instant. */
  scheduledLocal: string | null;
  scheduleTz: string;
  factIds: string[];
  complianceLine: string | null;
}

/** Field names in the order a human would read them. Used for the change message. */
export const VERSION_FIELDS = [
  'body', 'platforms', 'mediaUrls', 'mediaDigests',
  'scheduledFor', 'scheduledLocal', 'scheduleTz', 'factIds', 'complianceLine',
] as const;
export type VersionField = typeof VERSION_FIELDS[number];

const LABEL: Record<VersionField, string> = {
  body: 'the text', platforms: 'the destinations', mediaUrls: 'the media',
  mediaDigests: 'the media file itself', scheduledFor: 'the scheduled time',
  scheduledLocal: 'the scheduled time', scheduleTz: 'the time zone',
  factIds: 'the facts it relies on', complianceLine: 'the brokerage line',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x).trim()).filter(Boolean);

/** SHA-256 of raw bytes — the media half of the binding. crypto.subtle exists in both the browser
 *  and Deno, exactly as payloadHash relies on. Hashing the BYTES (rather than trusting a column a
 *  generator might forget to write) means the check cannot quietly become a no-op. */
export async function bytesDigest(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tolerant reader — never trust a stored or wire shape blindly (the parseCharter precedent). */
export function parseVersionContent(raw: unknown): PostVersionContent {
  const o = (raw ?? {}) as Record<string, unknown>;
  const digests: Record<string, string> = {};
  const d = o.mediaDigests ?? o.media_digests;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (str(k).trim() && str(v).trim()) digests[str(k).trim()] = str(v).trim();
    }
  }
  const sched = o.scheduledFor ?? o.scheduled_for;
  const local = o.scheduledLocal ?? o.scheduled_local;
  const tz = str(o.scheduleTz ?? o.schedule_tz).trim();
  const compliance = o.complianceLine ?? o.compliance_line;
  return {
    body: str(o.body),
    platforms: list(o.platforms),
    mediaUrls: list(o.mediaUrls ?? o.media_urls),
    mediaDigests: digests,
    scheduledFor: str(sched).trim() || null,
    scheduledLocal: str(local).trim() || null,
    scheduleTz: tz || 'America/Chicago',
    factIds: list(o.factIds ?? o.fact_ids),
    complianceLine: str(compliance).trim() || null,
  };
}

/** The canonical shape the hash is taken over. Deterministic: same content → same object, whatever
 *  order it arrived in. Platforms and fact ids are sets (order carries no meaning); media order is
 *  PRESERVED, because reordering a carousel changes the post. */
export function canonicalVersion(v: PostVersionContent): Record<string, unknown> {
  const uniqSorted = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort();
  const media = v.mediaUrls.map((u) => u.trim()).filter(Boolean);
  const digests: Record<string, string> = {};
  // Only digests for media actually attached — a leftover digest must not change the hash.
  for (const u of media) if (v.mediaDigests[u]) digests[u] = v.mediaDigests[u];
  return {
    body: (v.body ?? '').trim(),
    platforms: uniqSorted(v.platforms.map((p) => p.toLowerCase())),
    mediaUrls: media,
    mediaDigests: digests,
    scheduledFor: v.scheduledFor ?? null,
    scheduledLocal: v.scheduledLocal ?? null,
    scheduleTz: (v.scheduleTz || 'America/Chicago').trim(),
    factIds: uniqSorted(v.factIds),
    complianceLine: (v.complianceLine ?? '').trim() || null,
  };
}

/** SHA-256 of the canonical version. Same in the browser and in Deno. */
export function versionHash(v: PostVersionContent): Promise<string> {
  return hashPayload(canonicalVersion(v));
}

/** Which fields differ — named, so a refusal can say WHAT changed instead of "hash mismatch". */
export function versionsDiffer(a: PostVersionContent, b: PostVersionContent): VersionField[] {
  const ca = canonicalVersion(a) as Record<string, unknown>;
  const cb = canonicalVersion(b) as Record<string, unknown>;
  return VERSION_FIELDS.filter((f) => stableStringify(ca[f]) !== stableStringify(cb[f]));
}

/** One honest line for the Queue: what changed since the decision. */
export function describeChange(fields: VersionField[]): string {
  const seen: string[] = [];
  for (const f of fields) {
    const l = LABEL[f];
    if (l && !seen.includes(l)) seen.push(l);
  }
  if (!seen.length) return 'Nothing changed.';
  const last = seen.pop() as string;
  const joined = seen.length ? `${seen.join(', ')} and ${last}` : last;
  return `${joined} changed after this was approved — approve the new version to publish it.`;
}

/** The approval payload for a bound publish_post. Kept small: the hash is the binding, the version
 *  row is the record. post_row_id stays for backward compatibility with every existing executor. */
export interface BoundPublishPayload {
  post_row_id: string;
  version_id: string;
  content_hash: string;
}

export function boundPayload(postId: string, versionId: string, contentHash: string): BoundPublishPayload {
  return { post_row_id: postId, version_id: versionId, content_hash: contentHash };
}

/** Read a payload without trusting it. Returns nulls for a legacy { post_row_id } payload. */
export function readBoundPayload(raw: unknown): { postRowId: string | null; versionId: string | null; contentHash: string | null } {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    postRowId: str(o.post_row_id).trim() || null,
    versionId: str(o.version_id).trim() || null,
    contentHash: str(o.content_hash).trim() || null,
  };
}
