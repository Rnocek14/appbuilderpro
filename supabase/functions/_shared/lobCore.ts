// supabase/functions/_shared/lobCore.ts
// Direct mail's pure core (verified by src/lib/garvis/lobVerify.verify.ts) — shared by the
// lob-verify edge function and the farm UI so the cost the operator sees BEFORE clicking is the
// same arithmetic the function enforces. Grows the MailerSpec → Lob HTML compiler in SW10.3.
//
// HONESTY: mapDeliverability only ever returns 'verified' or 'undeliverable' for answers Lob
// actually gave; anything else — an error, an empty response, a deliverability string we don't
// recognize — maps to 'unverified' (we looked and could not tell; never a guess). The unit price
// is a NAMED ESTIMATE (Lob's published US-verification list price); the UI renders it with '≈'
// and the operator can true it up against their own Lob contract.

/** Per-invocation row ceiling — no un-ceilinged third-party spend button (doctrine review). */
export const VERIFY_RUN_CAP = 100;

/** Lob US-verification list price, USD per lookup. An estimate for the preview line, not a bill. */
export const VERIFY_UNIT_USD = 0.025;

/** Gap between Lob calls — polite pacing well under Lob's rate limits. */
export const VERIFY_THROTTLE_MS = 150;

/** The cost the operator sees BEFORE the run: "N lookups × $unit ≈ $X". '' when nothing to do. */
export function verifyCostLine(n: number): string {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return '';
  const capped = Math.min(count, VERIFY_RUN_CAP);
  const est = (capped * VERIFY_UNIT_USD).toFixed(2);
  const capNote = count > VERIFY_RUN_CAP ? ` (first ${VERIFY_RUN_CAP} of ${count.toLocaleString('en-US')} this run)` : '';
  return `${capped.toLocaleString('en-US')} lookup${capped === 1 ? '' : 's'} × $${VERIFY_UNIT_USD} ≈ $${est}${capNote}`;
}

export interface VerifyMapping {
  status: 'verified' | 'undeliverable' | 'unverified';
  detail: string | null;
}

/**
 * Map Lob's `deliverability` answer to our recipient status. The deliverable_* variants are
 * verified WITH the caveat carried in detail (USPS will deliver, but the unit line has an issue
 * worth seeing); undeliverable is Lob's own verdict; everything else is honestly unverified.
 */
export function mapDeliverability(deliverability: unknown): VerifyMapping {
  if (typeof deliverability !== 'string' || !deliverability) return { status: 'unverified', detail: null };
  const d = deliverability.toLowerCase();
  if (d === 'deliverable') return { status: 'verified', detail: null };
  if (d === 'deliverable_missing_unit' || d === 'deliverable_incorrect_unit' || d === 'deliverable_unnecessary_unit') {
    return { status: 'verified', detail: d.replace(/_/g, ' ') };
  }
  if (d === 'undeliverable') return { status: 'undeliverable', detail: 'USPS data says this address cannot receive mail' };
  return { status: 'unverified', detail: null };
}
