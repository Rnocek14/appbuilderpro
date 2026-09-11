// supabase/functions/_shared/cronGate.ts
// One auth gate for clock-driven functions. Accepts EITHER x-cron-secret matching CRON_SECRET
// OR x-worker-secret matching WORKER_SECRET. The arm function stores ONE secret and (since
// app_0092) sends it under both headers — so setting WORKER_SECRET alone is sufficient, and a
// CRON_SECRET that drifts from it can no longer 401 four daily jobs silently into pg_net.
// Comparison is constant-time (the discipline resend-inbound already had, now shared).

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Structural request/env slices so the paired verify suite (and the mutation looking-glass,
 *  SW10.12) can exercise this gate under tsx, where Deno does not exist. Runtime callers pass a
 *  real Request and default to Deno.env — byte-identical behavior. */
export interface CronGateRequest { headers: { get(name: string): string | null } }
export interface CronGateEnv { get(name: string): string | undefined }

export function cronAuthorized(req: CronGateRequest, env?: CronGateEnv): boolean {
  // Deno reached via globalThis so this file typechecks in BOTH runtimes (the tsx-run verify
  // suite passes an explicit env; the edge runtime defaults to the real one). No env = refuse.
  const e = env ?? (globalThis as { Deno?: { env: CronGateEnv } }).Deno?.env;
  if (!e) return false;
  const pairs: Array<[string | undefined, string | null]> = [
    [e.get('CRON_SECRET'), req.headers.get('x-cron-secret')],
    [e.get('WORKER_SECRET'), req.headers.get('x-worker-secret')],
  ];
  return pairs.some(([secret, header]) => !!secret && !!header && timingSafeEqual(secret, header));
}
