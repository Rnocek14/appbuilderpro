// src/lib/garvis/smsConcierge.ts
// TEXT GARVIS, GARVIS ANSWERS — pure core (verified by smsConcierge.verify.ts), imported by
// sms-inbound (the sms.ts precedent: Deno-neutral). The rule that makes a texting Garvis safe
// is enforced HERE, in a total function, not by convention in the webhook:
//
//   STRICTLY READ-ONLY. Only a 'reply' Command answers directly. Every other kind — mission,
//   act, build, open, explore — degrades to a sentence naming what Garvis WOULD do plus "open
//   the app". No approval is ever created, decided, or executable by text: Twilio signature
//   validation authenticates the WEBHOOK, not the human, and From-spoofing is cheap — so a
//   text can read state and nothing else. (Any future "APPROVE by text" needs per-approval
//   one-time codes and its own adversarial review — see the plan's SW4 risks.)

import type { Command } from './commander';

/** Replies per number per hour — a loop with another bot must throttle itself, not the operator. */
export const MAX_REPLIES_PER_HOUR = 12;
/** SMS reply cap in characters (~8 segments) — a texted answer is a summary, not an essay. */
export const SMS_REPLY_CAP = 1_100;

const clip = (s: string, cap = SMS_REPLY_CAP): string =>
  (s.length <= cap ? s : `${s.slice(0, cap - 1).trimEnd()}…`);

const OPEN_THE_APP = 'Nothing starts from a text — open the app and I\'ll run it.';

/**
 * The read-only gate, total over every Command kind. The commander may CLASSIFY work from a
 * text; this function guarantees classification never becomes execution.
 */
export function smsAnswerFor(cmd: Command): string {
  switch (cmd.kind) {
    case 'reply': return clip(cmd.text.trim() || 'I didn\'t catch that — try rephrasing?');
    case 'mission': return clip(`I'd run that as a mission: ${cmd.objective}. ${OPEN_THE_APP}`);
    case 'act': return clip(`I'd get to work: ${cmd.instruction}. ${OPEN_THE_APP}`);
    case 'build': return clip(`I'd take that to the forge: ${cmd.prompt}. ${OPEN_THE_APP}`);
    case 'open': return clip(`That's the ${cmd.surface === 'mailer' ? 'postcard' : 'video'} studio. ${OPEN_THE_APP}`);
    case 'explore': return clip(`Worth a dig: ${cmd.query}. ${OPEN_THE_APP}`);
  }
}

/** May Garvis reply to this number again right now? Hourly window (garvisLine's start pattern). */
export function replyAllowed(lastReplyAt: string | null, repliesInHour: number, nowIso: string): boolean {
  const last = Date.parse(lastReplyAt ?? '');
  const now = Date.parse(nowIso);
  if (Number.isNaN(last) || now - last >= 3_600_000) return true;
  return repliesInHour < MAX_REPLIES_PER_HOUR;
}

export function nextReplyCounters(lastReplyAt: string | null, repliesInHour: number, nowIso: string): { last_reply_at: string; replies_in_hour: number } {
  const last = Date.parse(lastReplyAt ?? '');
  const now = Date.parse(nowIso);
  const fresh = Number.isNaN(last) || now - last >= 3_600_000;
  return { last_reply_at: nowIso, replies_in_hour: fresh ? 1 : repliesInHour + 1 };
}

/** The no-model floor: what a text gets when credits are out. Fixed wording, zero spend. */
export const OUT_OF_CREDITS_REPLY =
  'I\'m out of thinking credits for now — top up on Subscription in the app and text me again.';
