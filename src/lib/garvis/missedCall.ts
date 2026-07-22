// src/lib/garvis/missedCall.ts
// PURE core of MISSED-CALL TEXT-BACK (no I/O; verified by missedCall.verify.ts). When someone calls the
// client's business line and it isn't answered, we text them back within seconds — the single
// highest-value automation for local trades (every missed call is a job walking to a competitor).
//
// The honest design: the operator's config row IS the pre-authorization. They set a fixed transactional
// template + numbers once; each missed call auto-sends that exact template to the person who JUST called
// (caller-initiated, a single reply) — a legitimate exception to per-message approval. The Twilio voice
// webhook (voice-inbound) does the I/O around these deterministic helpers.
//
// Zero runtime imports — a leaf the Deno edge function imports directly (.ts extension there).

/** Twilio <Dial> outcomes that mean the call was NOT connected — i.e. missed, so we text back. A
 *  'completed'/'answered' dial reached a human; anything here (rang out, busy, failed, caller gave up)
 *  is a lost call worth recovering. */
export const MISSED_DIAL_STATUSES = ['no-answer', 'busy', 'failed', 'canceled'] as const;

/** Was the dial a miss (should we text back)? Only an explicit missed status counts — an unknown/blank
 *  status is treated as NOT missed, so a malformed callback never triggers a stray text. */
export function dialWasMissed(dialStatus: string | null | undefined): boolean {
  const s = String(dialStatus ?? '').trim().toLowerCase();
  return (MISSED_DIAL_STATUSES as readonly string[]).includes(s);
}

/** Escape text for safe interpolation into TwiML (XML). */
export function escapeXml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** The TwiML we hand Twilio on an inbound call: ring the business's real line for `ringSeconds`, and
 *  when the dial finishes Twilio POSTs the outcome to `actionUrl` (where we decide whether to text).
 *  answerOnBridge keeps the caller hearing ringback (not silence) until the business actually picks up. */
export function buildInboundTwiml(opts: { forwardTo: string; ringSeconds: number; actionUrl: string }): string {
  const timeout = Number.isFinite(opts.ringSeconds) && opts.ringSeconds > 0 ? Math.floor(opts.ringSeconds) : 20;
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<Response><Dial timeout="${timeout}" answerOnBridge="true" action="${escapeXml(opts.actionUrl)}" method="POST">`
    + `<Number>${escapeXml(opts.forwardTo)}</Number></Dial></Response>`;
}

/** The TwiML we return after handling the dial-status callback — nothing more to do on the call. */
export function buildHangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`;
}

const E164 = /^\+[1-9]\d{7,14}$/;
export function isE164(s: string | null | undefined): boolean {
  return E164.test(String(s ?? '').trim());
}

/** Whether — and to whom — we should text back after a missed call. Fails closed: the config must be
 *  enabled, the caller's number must be a real E.164, and we never text our own Twilio number (loop
 *  guard). Returns the caller's number to text, or null to do nothing. */
export function textBackTarget(
  cfg: { enabled: boolean; twilioNumber: string }, fromNumber: string | null | undefined,
): string | null {
  if (!cfg.enabled) return null;
  const from = String(fromNumber ?? '').trim();
  if (!isE164(from)) return null;
  if (from === String(cfg.twilioNumber ?? '').trim()) return null;
  return from;
}

/** Render the missed-call text from the operator's template. {business} fills with the business name;
 *  unknown tokens are stripped (never a literal "{foo}" to a customer); whitespace is collapsed. */
export function renderMissedCallSms(template: string, vars: { business?: string | null }): string {
  const map: Record<string, string> = { business: (vars.business ?? '').toString().trim() };
  return (template ?? '')
    .replace(/\{(\w+)\}/g, (_m, k: string) => (map[k] ?? ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** The default, honest transactional auto-reply — customizable per client. No {business} in the default
 *  so an empty business name never leaves an awkward gap; operators can add it. */
export const DEFAULT_MISSED_CALL_TEMPLATE =
  'Sorry we missed your call — how can we help? Reply here and we’ll get right back to you!';

/** The Twilio request-signature base string: the full request URL followed by each POST param sorted by
 *  key, concatenated as key+value with no separators. The edge fn HMAC-SHA1s this with the auth token and
 *  base64-compares it to the X-Twilio-Signature header. This is the pure, testable half of validation —
 *  a webhook that triggers outbound texts MUST reject forged requests. */
export function twilioSignatureBaseString(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let s = url;
  for (const k of keys) s += k + params[k];
  return s;
}
