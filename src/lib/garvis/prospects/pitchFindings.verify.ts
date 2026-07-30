// src/lib/garvis/prospects/pitchFindings.verify.ts — pitch selection + the claim gate (npm run verify:pitchfindings).

import {
  selectPitchFindings, canLead, findingSentence, claimViolations, claimsAreSafe,
  MAX_PITCH_FINDINGS, SCAN_DISCLOSURE,
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
  SCAN_DISCLOSURE,
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
check('disclosure text is itself safe to send', claimsAreSafe(SCAN_DISCLOSURE));
check('disclosure states it is not an audit', /not an audit/i.test(SCAN_DISCLOSURE));
check('disclosure disclaims compliance', /compliance/i.test(SCAN_DISCLOSURE));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} pitch-findings check(s) failed`);
