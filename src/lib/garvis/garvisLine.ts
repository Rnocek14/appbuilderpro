// src/lib/garvis/garvisLine.ts
// THE GARVIS LINE's binding state machine — pure core (verified by garvisLine.verify.ts),
// imported by the garvis-line edge function (the sms.ts precedent: Deno-neutral, no browser
// globals). The contract the whole texting surface stands on: a number is only ever trusted
// after a code texted TO that number was confirmed in-app, codes expire, guesses are counted
// and locked, and starts are rate-limited so the function can never be used to spray SMS.

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_STARTS_PER_HOUR = 3;

export interface LineRow {
  phone_e164: string;
  verify_code_hash: string | null;
  code_expires_at: string | null;
  code_attempts: number;
  last_start_at: string | null;
  starts_in_hour: number;
  verified_at: string | null;
  proactive_enabled: boolean;
}

export type BindingState = 'unbound' | 'pending_code' | 'code_expired' | 'locked' | 'verified';

/** Where a binding stands. Total and ordered: verified beats everything (a verified line never
 *  regresses because a later code lapsed); a locked line stays locked until a fresh start. */
export function bindingState(row: Pick<LineRow, 'verify_code_hash' | 'code_expires_at' | 'code_attempts' | 'verified_at'> | null, nowIso: string): BindingState {
  if (!row) return 'unbound';
  if (row.verified_at) return 'verified';
  if (!row.verify_code_hash) return 'unbound';
  if (row.code_attempts >= MAX_CODE_ATTEMPTS) return 'locked';
  const exp = Date.parse(row.code_expires_at ?? '');
  if (Number.isNaN(exp) || exp <= Date.parse(nowIso)) return 'code_expired';
  return 'pending_code';
}

export function codeFormatOk(code: string | null | undefined): boolean {
  return typeof code === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());
}

/** Peppered hash: sha-256 of `pepper:owner:code`. The pepper lives ONLY in function secrets, so
 *  a 6-digit code space (10^6) cannot be brute-forced from a read of the stored hash — not even
 *  by the row's own owner, which is exactly the bind-someone-else's-phone attack. */
export async function hashCode(code: string, ownerId: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${ownerId}:${code.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** May another code be started now? Hourly window, MAX_STARTS_PER_HOUR inside it. */
export function startAllowed(lastStartAt: string | null, startsInHour: number, nowIso: string): boolean {
  const last = Date.parse(lastStartAt ?? '');
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || now - last >= 3_600_000) return true;   // fresh window
  return startsInHour < MAX_STARTS_PER_HOUR;
}

/** The counters to store with a granted start. */
export function nextStartCounters(lastStartAt: string | null, startsInHour: number, nowIso: string): { last_start_at: string; starts_in_hour: number } {
  const last = Date.parse(lastStartAt ?? '');
  const now = Date.parse(nowIso);
  const freshWindow = Number.isNaN(last) || now - last >= 3_600_000;
  return { last_start_at: nowIso, starts_in_hour: freshWindow ? 1 : startsInHour + 1 };
}

export function codeExpiryFrom(nowIso: string): string {
  return new Date(Date.parse(nowIso) + CODE_TTL_MINUTES * 60_000).toISOString();
}

/** Display form: never render the full number back out of the trust boundary. */
export function maskPhone(e164: string): string {
  return e164.length > 4 ? `…${e164.slice(-4)}` : e164;
}
