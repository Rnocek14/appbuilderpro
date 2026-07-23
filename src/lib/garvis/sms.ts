// src/lib/garvis/sms.ts
// PURE core of the SMS channel (no network; verified by sms.verify.ts). SMS is the second delivery
// channel alongside email — the unlock for text reminders, review-requests, and missed-call text-back,
// which convert far better than email for local trades. This module is the deterministic half:
// normalize a phone to E.164, render + size an SMS, and gate on TCPA consent + opt-outs. The send-sms
// edge function does the metered Twilio call around these.
//
// Zero runtime imports — a leaf the Deno edge function imports directly (.ts extension there).

/** Normalize a phone to E.164 (+15551234567). US-default: a bare 10-digit number gets +1; an
 *  11-digit starting with 1 gets a +. Returns null for anything too short or ambiguously
 *  international (no +) — never a malformed number Twilio would just reject. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Choose the FROM number for an automation text: the client's OWN number when they've connected one
 *  (normalized to E.164), otherwise the operator's shared number. A client value that doesn't normalize
 *  is ignored — we never hand Twilio a malformed sender; the global number carries the send instead.
 *  Returns null only when neither is usable (the caller then refuses the send rather than guess). */
export function resolveSmsFrom(clientNumber: string | null | undefined, globalNumber: string | null | undefined): string | null {
  const client = toE164(clientNumber);
  if (client) return client;
  const global = (globalNumber ?? '').trim();
  return global || null;
}

/** GSM-7 vs UCS-2 segment count (each segment is billed). Any non-ASCII char forces 70/67-char
 *  UCS-2 segments; plain text gets 160/153. Used to warn on cost before a blast. */
export function smsSegments(body: string | null | undefined): number {
  const b = body ?? '';
  if (!b) return 0;
  const unicode = /[^\x00-\x7F]/.test(b);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return b.length <= single ? 1 : Math.ceil(b.length / multi);
}

/** Render an SMS body from a template — {first_name}/{name}/{business}/{link} fills; unknown tokens
 *  are stripped (never a literal "{foo}" shipped to a customer), whitespace collapsed. */
export function renderSms(template: string, vars: Record<string, string | null | undefined>): string {
  return (template ?? '')
    .replace(/\{(\w+)\}/g, (_m, k: string) => (vars[k] ?? '').toString())
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export type SmsConsent = 'express_written' | 'warm_transactional' | 'none' | null | undefined;

/** TCPA gate. Marketing SMS needs express written consent; transactional messages (a reply to the
 *  customer's own inbound, a reminder for an appointment they booked) may go on warm_transactional.
 *  Never on 'none'/absent — the send path fails closed. */
export function smsConsentOk(consent: SmsConsent, kind: 'marketing' | 'transactional'): boolean {
  if (consent === 'express_written') return true;
  if (kind === 'transactional' && consent === 'warm_transactional') return true;
  return false;
}

/** A body is sendable if it's non-empty and within Twilio's 1600-char hard limit. */
export function validSmsBody(body: string | null | undefined): boolean {
  const b = (body ?? '').trim();
  return b.length > 0 && b.length <= 1600;
}

/** Carrier-compliance opt-out/opt-in detection on an inbound message, so we honor STOP/START
 *  ourselves and never re-text someone who opted out. */
export function optOutKeyword(inbound: string | null | undefined): 'stop' | 'start' | null {
  const t = (inbound ?? '').trim().toLowerCase();
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)\b/.test(t)) return 'stop';
  if (/^(start|unstop|yes)\b/.test(t)) return 'start';
  return null;
}
