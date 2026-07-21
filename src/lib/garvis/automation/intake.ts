// src/lib/garvis/automation/intake.ts
// CUSTOM-AUTOMATION INTAKE — the prospect describes how they run their business IN THEIR OWN WORDS,
// and we tell them (honestly) which of our REAL automations would fit. It is the free-text twin of
// detect.ts: detect.ts derives manual-process signals from a scraped AUDIT; this derives them from
// what the operator LITERALLY says. Same two honesty rules, unchanged:
//   1. A signal is emitted ONLY when the text states the thing — the matched phrase IS the evidence
//      (we quote their words back). No statement → no signal; we never infer a problem they didn't
//      describe.
//   2. Proposals come from proposeFromSignals (the capability registry), so ONLY deliverable ('ga'/
//      'beta') automations are ever offered. A real need with nothing built behind it becomes a GAP —
//      surfaced to the OPERATOR as a bespoke lead, never promised to the prospect.
// Pure + deterministic (verified by intake.verify.ts) — no model call, no network, Deno-safe.
//
// .ts extension on the value import: this module is also imported by the automation-intake EDGE
// function (Deno strict resolver). The type-only imports are erased and need none.
import { proposeFromSignals, type DetectedSignal, type DetectionResult } from './detect.ts';
import type { Vertical } from '../verticals';

/** One grounded manual-process signal we can recognise in an operator's own description, with the
 *  patterns that ground it. `id` matches the registry's matchesSignals so proposeFromSignals resolves
 *  it to a capability (or a gap). Order = the priority we scan in. */
interface OperatorSignalPattern {
  id: string;
  label: string;
  res: RegExp[];
}

// Each pattern fires ONLY on a literal description of the manual/absent process — never on the mere
// mention of a topic. Negation-gated where the SIGNAL is an absence (no review asks, no reactivation)
// so "I always ask for reviews" does not misfire as "no review asks". The matched phrase becomes the
// evidence, so every proposal traces to the prospect's own sentence.
const PATTERNS: OperatorSignalPattern[] = [
  {
    id: 'manual_process:manual_intake', label: 'Manual enquiry intake',
    res: [
      /\bi\s+(?:personally\s+)?(?:answer|reply to|respond to|handle|field|deal with|manage)\b[^.!?]{0,40}\b(?:every |all |each |the )?(?:enquir|inquir|lead|email|message|contact|dm)/i,
      /\b(?:enquir\w*|inquir\w*|leads?)\b[^.!?]{0,40}\b(?:by hand|manually|myself|come (?:in )?(?:via|by|through) (?:my )?(?:email|inbox))/i,
      /\bno\s+(?:system|crm|process|way)\b[^.!?]{0,30}\b(?:lead|enquir|inquir|contact|follow)/i,
    ],
  },
  {
    id: 'manual_process:phone_only_booking', label: 'Phone-only booking',
    res: [
      /\b(?:book|booking|schedul\w*|appointment)\b[^.!?]{0,30}\b(?:over|by|on)\b[^.!?]{0,6}\b(?:the\s+)?phone\b/i,
      /\b(?:customers?|clients?|patients?|people|they|everyone)\b[^.!?]{0,24}\bcall\b[^.!?]{0,24}\b(?:to |and )?(?:book|schedul|make an appointment)/i,
      /\bphone\s+tag\b/i,
      /\b(?:take|do|handle)\b[^.!?]{0,20}\ball\b[^.!?]{0,20}\bbookings?\b[^.!?]{0,20}\bphone\b/i,
    ],
  },
  {
    id: 'manual_process:manual_invoicing', label: 'Manual invoicing',
    res: [
      /\binvoic\w*[^.!?]{0,30}\b(?:by hand|manually|myself|by myself)/i,
      /\b(?:chase|chasing|follow(?:ing)? up on|track(?:ing)?)\b[^.!?]{0,24}\b(?:unpaid |late |outstanding )?(?:invoice|payment|bill)/i,
      /\bi\s+(?:send|write|do|create|make)\b[^.!?]{0,20}\b(?:all )?(?:the )?invoice/i,
    ],
  },
  {
    id: 'manual_process:no_reactivation', label: 'No dormant-customer reactivation',
    res: [
      /\b(?:don'?t|do not|never|rarely|no|not)\b[^.!?]{0,34}\b(?:follow up|reach (?:back )?out|reconnect|win[-\s]?back|re[-\s]?engage|reach out again)\b[^.!?]{0,30}\b(?:past|old|previous|former|lapsed|dormant|inactive)?\s*(?:customer|client|patient)/i,
      /\b(?:past|old|previous|former|lapsed)\s+(?:customer|client|patient)\w*[^.!?]{0,30}\b(?:go|going|went|just|often) (?:quiet|cold|silent|away|dormant)/i,
      /\bno\s+(?:win[-\s]?back|reactivation)/i,
    ],
  },
  {
    id: 'manual_process:no_review_ask', label: 'No review requests',
    res: [
      /\b(?:don'?t|do not|never|forget to|forget about|rarely|no|not)\b[^.!?]{0,30}\b(?:ask|request|get|chase|collect)\b[^.!?]{0,18}\b(?:for )?(?:google )?review/i,
      /\b(?:ask|request|chase)\w*[^.!?]{0,20}\breview\w*[^.!?]{0,20}\b(?:by hand|manually|myself|one by one)/i,
      /\bno\s+(?:system|process|way)\b[^.!?]{0,20}\breview/i,
    ],
  },
  {
    id: 'manual_process:no_recurring_maintenance', label: 'Recurring service / recall reminders',
    res: [
      /\b(?:seasonal|annual|yearly|6[-\s]?month|six[-\s]?month|routine|recurring|regular)\b[^.!?]{0,26}\b(?:service|maintenance|check[-\s]?up|recall|reminder|tune[-\s]?up|cleaning|visit|inspection|appointment)/i,
      /\b(?:remind|recall|reminder|follow up)\w*[^.!?]{0,34}\b(?:customer|client|patient)\w*[^.!?]{0,34}\b(?:due|time|book again|come back|next (?:visit|service|appointment|check))/i,
    ],
  },
];

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Grounded manual-process signals from an operator's free-text description of how they run things.
 *  One signal per matched process; its evidence is the prospect's own quoted phrase. Deterministic:
 *  same words in, same signals out. */
export function deriveOperatorSignals(description: string | null | undefined): DetectedSignal[] {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const out: DetectedSignal[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    if (seen.has(p.id)) continue;
    for (const re of p.res) {
      const m = re.exec(text);
      if (!m) continue;
      seen.add(p.id);
      out.push({
        id: p.id, kind: 'manual_process', label: p.label,
        // Quote their words back — the honesty anchor ("you said …"). Trimmed to a clean phrase.
        evidence: `You said: “${clip(m[0].trim(), 90)}”`,
      });
      break;
    }
  }
  return out;
}

export interface IntakeResult extends DetectionResult {
  /** True when at least one grounded signal was recognised. When false the free text still goes to
   *  the operator as a bespoke lead — nothing auto-mapped, but a real person asked. */
  matched: boolean;
}

/** The full intake read: grounded signals from the prospect's description → deliverable proposals +
 *  honest gaps (via the shared registry resolver). `vertical` narrows industry-specific capabilities
 *  (health recall, home-services seasonal); pass what detectVertical returns for the business, or null. */
export function intakeAutomations(description: string | null | undefined, vertical: Vertical | null): IntakeResult {
  const signals = deriveOperatorSignals(description);
  const { proposals, gaps } = proposeFromSignals(signals, vertical);
  return { signals, proposals, gaps, matched: signals.length > 0 };
}
