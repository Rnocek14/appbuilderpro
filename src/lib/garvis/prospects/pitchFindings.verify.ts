// src/lib/garvis/prospects/pitchFindings.verify.ts — pitch selection + the claim gate (npm run verify:pitchfindings).

import {
  selectPitchFindings, canLead, findingSentence, pitchSentence, claimViolations, claimsAreSafe,
  MAX_PITCH_FINDINGS, scanProvenance,
} from './pitchFindings';
import type { Finding } from '../../../../supabase/functions/_shared/scanTypes.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const f = (over: Partial<Finding> & Pick<Finding, 'code' | 'category'>): Finding => ({
  severity: 'high', confidence: 'detected', title: 'T', detail: 'D', ...over,
});

const noContact = f({ code: 'conv.no_contact_path', category: 'conversion' });
const noViewport = f({ code: 'mobile.no_viewport', category: 'mobile' });
const altText = f({ code: 'a11y.img_missing_alt', category: 'accessibility', count: 14 });
const trackers = f({ code: 'track.no_consent_mechanism', category: 'tracking', confidence: 'likely' });
const canonical = f({ code: 'pres.no_canonical', category: 'presence', severity: 'low' });
const shaky = f({ code: 'conv.form_no_action', category: 'conversion', confidence: 'needs_review' });

// ── revenue-first ordering ────────────────────────────────────────────────
const picked = selectPitchFindings([canonical, altText, trackers, noViewport, noContact]);
check('leads with a conversion finding, not the accessibility one', picked[0].finding.code === 'conv.no_contact_path');
check('the lead is marked as the lead', picked[0].role === 'lead');
check('everything after the lead is support', picked.slice(1).every((p) => p.role === 'support'));
check('mobile outranks accessibility in the pitch order', picked[1].finding.code === 'mobile.no_viewport');
check('caps at MAX_PITCH_FINDINGS', picked.length === MAX_PITCH_FINDINGS);
check('report order is NOT reused — severity-first would have led with a11y or tracking', picked[0].finding.category === 'conversion');

// ── what may lead ─────────────────────────────────────────────────────────
check('a detected high finding may lead', canLead(noContact));
check('a needs_review finding may NOT lead', !canLead(shaky));
check('a low-severity finding may NOT lead', !canLead(canonical));
check('a likely+high finding may lead', canLead(trackers));

const onlyShaky = selectPitchFindings([shaky, canonical]);
check('no qualifying lead ⇒ no pitch at all (we do not manufacture a reason)', onlyShaky.length === 0);
check('empty scan ⇒ empty selection', selectPitchFindings([]).length === 0);

const shakySupports = selectPitchFindings([noContact, shaky]);
check('a needs_review finding may still ride as support', shakySupports.some((p) => p.finding.code === 'conv.form_no_action' && p.role === 'support'));

// ── subsumed claims never repeat ──────────────────────────────────────────
const noBooking = f({ code: 'conv.no_booking', category: 'conversion', severity: 'med' });
const noTap = f({ code: 'mobile.no_click_to_call', category: 'mobile', severity: 'med' });
const withBoth = selectPitchFindings([noContact, noBooking, noTap, altText]);
check('no_booking is dropped when no_contact_path already says it', !withBoth.some((p) => p.finding.code === 'conv.no_booking'));
check('an untappable phone is dropped when no_contact_path already says it', !withBoth.some((p) => p.finding.code === 'mobile.no_click_to_call'));
check('the freed slots go to genuinely different facts', withBoth.some((p) => p.finding.code === 'a11y.img_missing_alt'));
check('no_booking still stands on its own when nothing subsumes it', selectPitchFindings([noBooking, altText]).some((p) => p.finding.code === 'conv.no_booking'));

// ── determinism ───────────────────────────────────────────────────────────
const a = selectPitchFindings([canonical, altText, trackers, noViewport, noContact]);
const b = selectPitchFindings([noContact, trackers, canonical, noViewport, altText]);
check('selection is order-independent and deterministic', JSON.stringify(a) === JSON.stringify(b));

// ── sentences carry the hedge ─────────────────────────────────────────────
check('a counted finding states the number', /14 instances/.test(findingSentence(altText)));
check('a single instance reads singular', /1 instance\b/.test(findingSentence(f({ code: 'x.y', category: 'mobile', count: 1 }))));
check('an uncounted finding omits the count', !/instance/.test(findingSentence(noContact)));
check('a likely finding is hedged in the sentence itself', /worth confirming/.test(findingSentence(trackers)));
check('a needs_review finding says it is unconfirmed', /not confirmed/.test(findingSentence(shaky)));
check('a detected finding is stated plainly', !/confirm/.test(findingSentence(noContact)));
check('a title that already carries its number is not double-counted',
  !/instance/.test(findingSentence(f({ code: 'a11y.img_missing_alt', category: 'accessibility', title: '9 images with no alt text', count: 9 }))));

// ── pitch copy: owner-voice, short, gated ─────────────────────────────────
// The report keeps the scanners' thorough multi-sentence details; the EMAIL gets one checkable
// fact per bullet. Mapped copy must pass the claim gate and keep every confidence hedge.
const mappedCodes = ['conv.no_contact_path', 'conv.phone_only', 'conv.no_booking', 'mobile.no_viewport', 'mobile.no_click_to_call'];
for (const code of mappedCodes) {
  const sentence = pitchSentence(f({ code, category: 'conversion' }));
  check(`pitch copy for ${code} passes the claim gate`, claimsAreSafe(sentence));
  check(`pitch copy for ${code} reads like an email, not a report`, sentence.length < 160);
}
const altPitch = pitchSentence(f({ code: 'a11y.img_missing_alt', category: 'accessibility', title: '9 images with no alt text', count: 9 }));
check('a counted pitch bullet leads with its number, once', /^9 images/.test(altPitch) && !/instance/.test(altPitch));
check('a likely finding keeps its hedge through the pitch copy',
  /worth confirming/.test(pitchSentence(f({ code: 'conv.no_booking', category: 'conversion', confidence: 'likely' }))));
const unmapped = f({ code: 'pres.no_structured_data', category: 'presence',
  title: 'No structured data', detail: 'First sentence of the report detail. Second sentence that belongs in the report, not an email.' });
check('an unmapped code falls back to its first report sentence', pitchSentence(unmapped).includes('First sentence') && !pitchSentence(unmapped).includes('Second sentence'));

// ── THE CLAIM GATE — every one of these must be refused ───────────────────
const BAD = [
  'Your site is not ADA compliant.',
  'We will make you fully accessible.',
  'This makes your website WCAG compliant.',
  'You could get sued for this.',
  'Our fix is lawsuit-proof.',
  'We eliminate your legal risk entirely.',
  'Certified accessible by our team.',
  'This is 100% accessible.',
  'Your site violates the ADA.',
  'You are currently breaking the law.',
  'We guarantee results.',
  'Your website is non-compliant.',
  'This eliminates your liability.',
  'Section 508 compliant after our work.',
];
for (const bad of BAD) {
  check(`gate refuses: "${bad.slice(0, 44)}"`, claimViolations(bad).length > 0);
}
check('every refusal explains why', claimViolations(BAD[0])[0].why.length > 0);
check('every refusal offers the honest alternative', claimViolations(BAD[0])[0].instead.length > 0);

// ── and must NOT block honest copy ────────────────────────────────────────
const GOOD = [
  'We detected 14 images with no alt text on your home page.',
  'Three tracking scripts load and we did not detect a consent mechanism.',
  'Your contact form posts over an unencrypted connection.',
  'There is no way to book outside business hours — every after-hours enquiry goes to voicemail.',
  'Over 5,000 website accessibility lawsuits were filed in 2025; 64% targeted businesses under $25M revenue.',
  'We rebuilt your home page — here is a working version.',
  'This addresses the barriers this scan detected.',
  'Accessibility improvements also widen who can buy from you.',
  scanProvenance(['/', '/contact']),
];
for (const good of GOOD) {
  check(`gate allows: "${good.slice(0, 44)}"`, claimsAreSafe(good));
}

// ── gate robustness ───────────────────────────────────────────────────────
check('gate is case-insensitive', claimViolations('YOUR SITE IS NOT ADA COMPLIANT').length > 0);
check('gate catches a hyphenated variant', claimViolations('fully ADA-compliant today').length > 0);
check('gate handles empty input', claimsAreSafe(''));
check('gate handles non-string input', claimsAreSafe(undefined as unknown as string));
check('gate scans the whole body, not just the opening', claimsAreSafe(`${'padding. '.repeat(200)}we guarantee results`) === false);

// ── the provenance line — earned confidence, not apology ──────────────────
// This replaced the old three-sentence disclosure. The hedging moved UPSTREAM into the siteScan
// corroboration gates (an absence only ships when it held on every page read, nothing was left
// unread, and nothing could mount it after load), so the footer's job is provenance: which pages
// were read, and an offer to point at every finding.
check('provenance is itself safe to send', claimsAreSafe(scanProvenance(['/', '/contact'])));
check('provenance names the pages that were read', /your homepage and your contact page/.test(scanProvenance(['/', '/contact.html'])));
check('provenance with no corroboration honestly names the homepage alone', /your homepage directly/.test(scanProvenance([])) && !/homepage and /.test(scanProvenance([])));
check('provenance offers to point at the findings', /point out exactly where/.test(scanProvenance([])));
check('provenance does not hedge — the gates upstream did that job', !/cannot|not an audit|outside what it checks/i.test(scanProvenance(['/', '/contact'])));
check('provenance handles garbage input', typeof scanProvenance(undefined as unknown as string[]) === 'string');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} pitch-findings check(s) failed`);
