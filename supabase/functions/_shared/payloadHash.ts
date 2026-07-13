// supabase/functions/_shared/payloadHash.ts
// ONE implementation of the approval payload hash, shared by enqueue (client) and the executors
// (edge) — the batchCore/esignCore precedent. Pure: no Deno, no DOM, no Supabase. Verified by
// src/lib/garvis/payloadHash.verify.ts.
//
// Why: an approval records a human decision about a SPECIFIC payload. Binding the approval to a
// deterministic hash of that payload gives tamper-evidence — an executor recomputes the hash from
// the payload it's about to act on and refuses if it no longer matches what was approved. This is
// defense-in-depth (RLS already scopes every approval to its owner), and it is null-grandfathered:
// approvals minted without a hash (older rows, worker-minted batch sends) skip the check, so it can
// only ADD a refusal when a hash is present AND the payload was changed after approval.

/** Deterministic JSON: object keys sorted recursively, so key order never changes the hash. */
export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** SHA-256 hex of the stable stringification. crypto.subtle exists in both browsers and Deno. */
export async function hashPayload(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(payload ?? {}));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verify a stored hash against a payload. Missing/empty stored hash → true (grandfathered). */
export async function payloadMatches(payload: unknown, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash) return true;
  return (await hashPayload(payload)) === storedHash;
}
