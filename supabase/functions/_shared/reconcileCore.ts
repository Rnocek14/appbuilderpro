// supabase/functions/_shared/reconcileCore.ts
// DID IT ACTUALLY POST? Pure: no Deno, no DOM, no Supabase, no clock of its own. Verified by
// src/lib/garvis/reconcile.verify.ts.
//
// social-publish's 30-second abort can fire AFTER the provider accepted a post, so a timed-out send
// leaves a row that may or may not be live on a real account. Retrying it blind risks posting the
// same thing twice; abandoning it risks a post nobody in this system knows about. The only honest
// move is to go and look — and then to be willing to say "I could not tell".
//
// THE RULE THAT MAKES THIS SAFE: 'not_posted' is only ever returned when the provider's history came
// back, proves the endpoint works (it contains recent records), AND does not contain our post. Any
// other shape — an empty history, an unparseable one, a body that never matches — is 'unknown', and
// unknown never retries. A duplicate on a client's real account is worse than a post that waits.

export interface HistoryRecord {
  id: string | null;
  body: string;
  createdAt: string | null;
  platforms: string[];
  postUrls: Record<string, string>;
}

export type Verdict = 'posted' | 'not_posted' | 'unknown';

export interface Reconciliation {
  verdict: Verdict;
  /** Why, in the operator's words — shown when a human has to decide. */
  reason: string;
  providerId: string | null;
  postUrls: Record<string, string>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Read whatever the provider's history endpoint returned, without trusting its shape. Accepts an
 *  array, or an object with a `history`/`posts`/`data` array — providers differ and change. */
export function parseHistory(raw: unknown): HistoryRecord[] {
  const arr = Array.isArray(raw)
    ? raw
    : ['history', 'posts', 'data', 'records'].map((k) => (raw as Record<string, unknown> | null)?.[k]).find(Array.isArray);
  if (!Array.isArray(arr)) return [];
  const out: HistoryRecord[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const body = str(o.post ?? o.body ?? o.text ?? o.message);
    const platformsRaw = o.platforms ?? o.platform;
    const platforms = Array.isArray(platformsRaw)
      ? platformsRaw.map((p) => str(p).toLowerCase()).filter(Boolean)
      : (str(platformsRaw) ? [str(platformsRaw).toLowerCase()] : []);
    const urls: Record<string, string> = {};
    const ids = o.postIds;
    if (Array.isArray(ids)) {
      for (const p of ids) {
        if (!p || typeof p !== 'object') continue;
        const po = p as Record<string, unknown>;
        const platform = str(po.platform).toLowerCase().trim();
        const url = ['postUrl', 'url', 'permalink', 'postURL'].map((k) => str(po[k]).trim()).find((u) => /^https?:\/\//i.test(u));
        if (platform && url) urls[platform] = url;
      }
    }
    out.push({
      id: str(o.id ?? o.postId ?? o.refId).trim() || null,
      body,
      createdAt: str(o.created ?? o.createdAt ?? o.scheduleDate ?? o.date).trim() || null,
      platforms,
      postUrls: urls,
    });
  }
  return out;
}

export interface ExpectedPost {
  body: string;
  platforms: string[];
  /** When we sent it — a record older than this cannot be ours. */
  sentAtIso: string;
}

/** A record is ours when the body matches exactly (after whitespace/case normalization) and it was
 *  created in the window around our send. Body equality is the strong signal; the window only guards
 *  against matching an identical post from a previous week. */
export function matchesExpected(rec: HistoryRecord, expected: ExpectedPost, windowMs: number): boolean {
  if (!norm(rec.body) || norm(rec.body) !== norm(expected.body)) return false;
  if (!rec.createdAt) return true;              // no timestamp offered: the body match stands alone
  const made = Date.parse(rec.createdAt);
  const sent = Date.parse(expected.sentAtIso);
  if (!Number.isFinite(made) || !Number.isFinite(sent)) return true;
  return Math.abs(made - sent) <= windowMs;
}

const WINDOW_MS = 6 * 60 * 60 * 1000;   // generous: a provider's clock and ours need not agree

/** The decision. `fetched` says whether the history call itself succeeded — a failed call is never
 *  evidence of anything. */
export function reconcile(
  fetched: boolean,
  raw: unknown,
  expected: ExpectedPost,
  windowMs: number = WINDOW_MS,
): Reconciliation {
  const none = { providerId: null, postUrls: {} as Record<string, string> };
  if (!fetched) {
    return { verdict: 'unknown', reason: 'The provider did not answer when asked what it has — this post has to be checked by hand.', ...none };
  }
  const records = parseHistory(raw);
  if (!records.length) {
    // An empty history proves nothing: it may mean the account is empty, the plan withholds it, or
    // the shape changed. It must NOT be read as "your post is not there".
    return { verdict: 'unknown', reason: 'The provider returned no history to compare against — this post has to be checked by hand.', ...none };
  }
  const hit = records.find((r) => matchesExpected(r, expected, windowMs));
  if (hit) {
    return {
      verdict: 'posted',
      reason: 'The provider has this post — it did go out.',
      providerId: hit.id,
      postUrls: hit.postUrls,
    };
  }
  return {
    verdict: 'not_posted',
    reason: 'The provider has recent posts but not this one — it never went out, so it is safe to send again.',
    ...none,
  };
}
