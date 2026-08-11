// src/lib/garvis/prospects/pitchFindings.ts
// WHICH FINDINGS GO IN THE PITCH — and the language gate that stops us saying something we can't back.
//
// The deep scan (supabase/functions/_shared/deepScan.ts) returns everything it detected, worst-first
// by severity. That order is right for a report and WRONG for an outreach email, for two reasons:
//
//   1. ORDER OF ARGUMENT. A business owner acts on "you are losing customers", not on "you have a
//      standards violation". Leading with legal exposure reads as a threat, attracts exactly the
//      anxious client you don't want, and positions a web shop as a compliance firm it is not. So
//      the pitch leads with money — a broken contact path, no booking, unusable on a phone — and
//      carries the accessibility and tracking findings as SUPPORTING evidence underneath. Same
//      findings, same truth, different order, and the second order is the one that both converts
//      better and is honest about what we actually sell.
//
//   2. WHAT WE'LL STAND BEHIND. A 'needs_review' finding is one a person hasn't confirmed. It may
//      be true, but it must never be the headline claim in an email to a stranger — if it's wrong,
//      that email is the entire first impression. So needs_review findings can appear as context,
//      never as the lead.
//
// THE LANGUAGE GATE (`claimViolations`) is the hard stop. Automated scanning of static HTML cannot
// establish conformance with WCAG or any law; overclaiming it is precisely how the website-overlay
// vendors ended up as defendants. So this module ships a deny-list of assertions — "ADA compliant",
// "you will be sued", "guaranteed", "certified accessible", "we eliminate your legal risk" — and
// any pitch body that trips it is REJECTED before it can be queued. The same discipline as
// bespokeHonest(): the lie can't ship, worst case we send the plainer sentence.
//
// Pure + deterministic (no I/O, no clock). The impure half — loading findings, writing the
// outreach_finding_refs rows that let us later ask "which finding produced replies?" — lives in
// the run module that calls these.

import type { Finding, ScanCategory } from '../../../../supabase/functions/_shared/scanTypes.ts';
import { describePages } from '../../../../supabase/functions/_shared/siteScan.ts';

/** How many findings the pitch may name. Three is the honest maximum: enough to be specific,
 *  few enough that every one can be defended on a phone call. */
export const MAX_PITCH_FINDINGS = 3;

/** Revenue-first ordering. Conversion and mobile findings are about lost customers and lead the
 *  argument; accessibility and tracking are real and material but land as supporting evidence;
 *  presence is context. This is the deliberate inversion of the report's severity-first order. */
const PITCH_CATEGORY_RANK: Record<ScanCategory, number> = {
  conversion: 0,
  mobile: 1,
  accessibility: 2,
  tracking: 3,
  presence: 4,
};

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, med: 1, low: 2 };
const CONFIDENCE_RANK: Record<Finding['confidence'], number> = { detected: 0, likely: 1, needs_review: 2 };

/** A finding chosen for the pitch, with the role it plays in the argument. */
export interface PitchFinding {
  finding: Finding;
  /** 'lead' is the headline claim; 'support' rides underneath it. Persisted as `emphasized`. */
  role: 'lead' | 'support';
}

/** True when this finding is solid enough to be the headline claim in a cold email. */
export function canLead(f: Finding): boolean {
  return f.confidence !== 'needs_review' && f.severity !== 'low';
}

/**
 * A finding whose claim is CONTAINED in another finding's claim. "No booking tool and no form" is
 * already said by "no contact path at all"; "the phone number is not tappable" is a sentence inside
 * no_contact_path's own detail. Naming both makes the email repeat itself, and a repeated claim
 * reads as padding — three bullets should be three different facts.
 */
const SUBSUMED_BY: Record<string, string[]> = {
  'conv.no_booking': ['conv.no_contact_path', 'conv.phone_only'],
  'mobile.no_click_to_call': ['conv.no_contact_path'],
};

/**
 * Choose the findings to name in an outreach message, revenue-first.
 * Returns at most MAX_PITCH_FINDINGS, the first of which is the lead (when any finding qualifies).
 * An empty or all-weak scan returns [] — we send no pitch rather than manufacture a reason.
 */
export function selectPitchFindings(findings: Finding[], max = MAX_PITCH_FINDINGS): PitchFinding[] {
  const codes = new Set(findings.map((f) => f.code));
  const distinct = findings.filter((f) => !(SUBSUMED_BY[f.code] ?? []).some((c) => codes.has(c)));
  const ordered = [...distinct].sort((a, b) =>
    PITCH_CATEGORY_RANK[a.category] - PITCH_CATEGORY_RANK[b.category] ||
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    a.code.localeCompare(b.code));

  const leadIdx = ordered.findIndex(canLead);
  if (leadIdx === -1) return [];

  const lead = ordered[leadIdx];
  const rest = ordered.filter((_, i) => i !== leadIdx).slice(0, Math.max(0, max - 1));
  return [
    { finding: lead, role: 'lead' },
    ...rest.map((finding): PitchFinding => ({ finding, role: 'support' })),
  ];
}

/**
 * One honest sentence naming a finding, for the body of a pitch. Counts are stated when we have
 * them because a number is checkable and an adjective is not — but never twice: a title that
 * already carries its number ("9 images with no alt text") does not get "(9 instances)" appended,
 * which read as a machine talking. Confidence is carried in the wording: anything not 'detected'
 * is hedged in the sentence itself, so the hedge can't be edited out downstream without also
 * removing the claim.
 */
export function findingSentence(f: Finding): string {
  const n = typeof f.count === 'number' && f.count > 0 ? f.count : null;
  const subject = n !== null && !f.title.includes(String(n))
    ? `${f.title} (${n} ${n === 1 ? 'instance' : 'instances'})`
    : f.title;
  return withHedge(`${subject} — ${f.detail}`, f.confidence);
}

function withHedge(sentence: string, confidence: Finding['confidence']): string {
  if (confidence === 'detected') return sentence;
  if (confidence === 'likely') return `${sentence} (detected from the page source; worth confirming)`;
  return `${sentence} (flagged for review, not confirmed)`;
}

/**
 * OWNER-VOICE COPY for the findings a pitch names most, keyed by code. The scanners' details are
 * written for the report — thorough, multi-sentence, every caveat inline — and dropping them into
 * a cold email made each bullet an eighty-word paragraph. A pitch bullet's job is one checkable
 * fact an owner feels: same claim, same truth, a tenth the words. Every sentence here must pass
 * the claim gate (pinned in verify) and must never say MORE than the finding it stands for — the
 * scope ("which pages") lives in the scanProvenance line underneath, not in the bullet.
 */
const PITCH_COPY: Record<string, (f: Finding) => string> = {
  'conv.no_contact_path': () =>
    'No contact form, no email link and no tappable phone number — an after-hours visitor has nothing that works at 9pm',
  'conv.phone_only': () =>
    'The phone is the only way in — anyone who can’t call right now has no second option, and nothing records the enquiry to follow up',
  'conv.no_booking': () =>
    'Nothing takes a booking or an enquiry on its own — evenings and weekends go to whoever can be booked on the spot',
  'mobile.no_viewport': () =>
    'Not set up for phones — the page loads as a shrunken desktop page a visitor has to pinch and zoom to read',
  'mobile.no_click_to_call': () =>
    'The phone number on the page can’t be tapped to dial from a phone',
  'a11y.img_missing_alt': (f) => {
    const n = typeof f.count === 'number' && f.count > 0 ? f.count : null;
    const subject = n ? `${n} image${n === 1 ? '' : 's'}` : 'Images';
    return `${subject} with no descriptions — screen readers and search engines see nothing where your photos are`;
  },
};

/**
 * The sentence a finding contributes to an EMAIL: the owner-voice copy when the code has one, and
 * the report sentence cut to its first sentence otherwise — an email stays an email even for a
 * code nobody wrote pitch copy for yet. The confidence hedge survives both paths, always.
 */
export function pitchSentence(f: Finding): string {
  const mapped = PITCH_COPY[f.code]?.(f);
  if (mapped) return withHedge(mapped, f.confidence);
  const firstSentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(f.detail)?.[0] ?? f.detail;
  return findingSentence({ ...f, detail: firstSentence });
}

// ---------------------------------------------------------------------------------------------
// The language gate.
// ---------------------------------------------------------------------------------------------

/** Assertions an automated static scan can never support. Each is paired with the honest
 *  alternative, so a rejection tells the writer what to say instead of merely saying no. */
const FORBIDDEN: { pattern: RegExp; why: string; instead: string }[] = [
  { pattern: /\b(?:ada|wcag|section\s*508)[\s-]*compliant\b/i,
    why: 'claims compliance an automated scan cannot establish',
    instead: 'say what was detected, e.g. “14 images have no alt text”' },
  { pattern: /\bnon[\s-]*compliant\b/i,
    why: 'asserts a legal status we have not established',
    instead: 'describe the specific barriers detected instead' },
  { pattern: /\bcertif(?:ied|y|ication)\b/i,
    why: 'we certify nothing',
    instead: 'drop the word — describe the observation' },
  { pattern: /\b(?:will|going to|could|might)\s+(?:be\s+)?(?:get\s+)?sued\b/i,
    why: 'predicts litigation',
    instead: 'omit; cite the public lawsuit-volume figure as context only, if at all' },
  { pattern: /\blawsuit[\s-]*proof\b|\bimmune\s+from\b/i,
    why: 'promises an outcome no vendor can promise',
    instead: 'omit entirely' },
  { pattern: /\beliminat\w*\s+(?:your\s+)?(?:legal\s+)?(?:risk|liability|exposure)\b/i,
    why: 'promises to remove legal risk',
    instead: '“reduces the barriers we detected” — describe the work, not the legal effect' },
  { pattern: /\bguarantee\w*\b/i,
    why: 'a guarantee we cannot honour',
    instead: 'state what the work does, not what it assures' },
  { pattern: /\bfully\s+accessible\b|\b100%\s+accessible\b/i,
    why: 'no automated process can establish full accessibility',
    instead: '“addresses the barriers this scan detected”' },
  { pattern: /\bviolat(?:es|ion|ing)\s+(?:the\s+)?(?:ada|law|wcag)\b/i,
    why: 'asserts a legal violation',
    instead: 'name the detected barrier and the standard it references, without the verdict' },
  { pattern: /\byou\s+are\s+(?:currently\s+)?breaking\s+the\s+law\b/i,
    why: 'asserts illegality',
    instead: 'omit entirely' },
];

export interface ClaimViolation { phrase: string; why: string; instead: string }

/**
 * Inspect any outbound copy (subject, body, report blurb) for claims we cannot support.
 * Returns [] when the text is clean. Callers MUST refuse to queue a send when this is non-empty —
 * this is a gate, not a linter.
 */
export function claimViolations(text: string): ClaimViolation[] {
  const src = typeof text === 'string' ? text : '';
  const out: ClaimViolation[] = [];
  for (const rule of FORBIDDEN) {
    const m = rule.pattern.exec(src);
    if (m) out.push({ phrase: m[0], why: rule.why, instead: rule.instead });
  }
  return out;
}

/** Convenience for the send path: true when the copy is safe to queue. */
export function claimsAreSafe(text: string): boolean {
  return claimViolations(text).length === 0;
}

/**
 * The footer that rides with any findings block in a pitch: provenance, not apology.
 *
 * This replaced a three-sentence hedge ("reads one page… cannot see JavaScript… not an audit"),
 * and the replacement is EARNED, not cosmetic: findings only reach an email after the site-level
 * corroboration gates (siteScan.ts) — held on every page read, no contact-shaped page left unread,
 * nothing on the site that could mount the missing thing after load — and after the claim gate
 * above has refused every sentence we couldn't stand behind. So the footer's remaining job is to
 * say exactly where the findings came from and offer to point at them, which is also the strongest
 * credibility move an email like this can make. The report surfaces keep their full limits
 * (deepScan.WHOLE_SCAN_LIMITS, cohort caveats); this line is for the pitch, whose every claim has
 * already been narrowed to what we verified.
 *
 * `pagesChecked` is the corroboration's provenance (homepage first). An empty list — an older
 * fetch-url deployment, or no corroboration data — honestly names the homepage alone, because
 * that is exactly what was read.
 */
export function scanProvenance(pagesChecked: string[]): string {
  const others = (Array.isArray(pagesChecked) ? pagesChecked : []).slice(1);
  const named = describePages(others);
  const where = named ? `your homepage and ${named}` : 'your homepage';
  return `Each of these comes from reading the code of ${where} directly — reply and I’ll point out exactly where every one is.`;
}
