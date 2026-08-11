// src/lib/garvis/prospects/pitchCraft.verify.ts — the cold pitch's creative layer
// (npm run verify:pitchcraft). Two contracts under test: subject variants stay honest and
// deterministic, and the opener acceptance gate rejects every way a model draft could make the
// email worse than the template it replaces.

import {
  subjectVariants, pickSubjectVariant, seedHash, MAX_SUBJECT_CHARS,
  openerSystemPrompt, openerUserPrompt, acceptPitchOpener, groundingTokens,
} from './pitchCraft.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── subject variants ─────────────────────────────────────────────────────
const vs = subjectVariants({ businessName: 'Acme Roofing', industry: 'Roofing', hasFindings: true });
check('control is first and byte-identical to the pre-variant subject',
  vs[0].id === 'control' && vs[0].subject === 'A new website for Acme Roofing');
check('multiple angles are offered', vs.length >= 3);
check('the question angle appears only with findings',
  vs.some((v) => v.id === 'question') &&
  !subjectVariants({ businessName: 'Acme Roofing', hasFindings: false }).some((v) => v.id === 'question'));
check('every offered subject respects the length ceiling (control exempt)',
  vs.filter((v) => v.id !== 'control').every((v) => v.subject.length <= MAX_SUBJECT_CHARS));
const longName = 'The Extremely Long Business Name Of Lake Geneva Roofing And Exteriors LLC';
const longVs = subjectVariants({ businessName: longName, hasFindings: true });
check('a long business name still gets the control', longVs.length >= 1 && longVs[0].id === 'control');
check('over-length variants are dropped, not truncated',
  longVs.filter((v) => v.id !== 'control').every((v) => v.subject.length <= MAX_SUBJECT_CHARS));

// ── deterministic pick ───────────────────────────────────────────────────
check('the same seed always picks the same variant',
  pickSubjectVariant(vs, 'owner@acmeroofing.com').id === pickSubjectVariant(vs, 'owner@acmeroofing.com').id &&
  pickSubjectVariant(vs, 'owner@acmeroofing.com').subject === pickSubjectVariant(vs, 'owner@acmeroofing.com').subject);
const seeds = Array.from({ length: 40 }, (_, i) => `owner${i}@biz${i}.com`);
const pickedIds = new Set(seeds.map((s) => pickSubjectVariant(vs, s).id));
check('different seeds spread across more than one angle', pickedIds.size > 1);
check('seedHash is stable', seedHash('a@b.com') === seedHash('a@b.com') && seedHash('a@b.com') !== seedHash('c@d.com'));
check('an empty variant list yields a safe control shell', pickSubjectVariant([], 'x').id === 'control');

// ── prompts ──────────────────────────────────────────────────────────────
check('the system prompt bans links, greetings, and invention',
  /no links or urls/i.test(openerSystemPrompt()) && /no greeting/i.test(openerSystemPrompt()) &&
  /never invent/i.test(openerSystemPrompt()));
check('the system prompt sets up the bridge line', /built you a new one/.test(openerSystemPrompt()));
check('the user prompt is the profile json, nothing else',
  openerUserPrompt({ a: 1 }) === 'PROSPECT: {"a":1}' && openerUserPrompt(null) === 'PROSPECT: {}');

// ── the acceptance gate ──────────────────────────────────────────────────
const ctx = { businessName: 'Acme Roofing', industry: 'Roofing' };
const good = 'Acme Roofing has served Walworth County since 1987, but your website makes finding that history harder than it should be — on a phone, the contact number never appears.';
check('a grounded, clean opener is accepted', acceptPitchOpener(good, ctx) === good);
check('wrapping quotes and code fences are stripped',
  acceptPitchOpener(`"${good}"`, ctx) === good && acceptPitchOpener('```\n' + good + '\n```', ctx) === good);
check('a leading greeting line is dropped, not fatal',
  acceptPitchOpener(`Hi Acme team,\n${good}`, ctx) === good);
check('empty → null', acceptPitchOpener('', ctx) === null && acceptPitchOpener('   ', ctx) === null);
check('a URL is rejected (the demo link comes later, once)',
  acceptPitchOpener('Acme Roofing should visit https://example.com to see why your site struggles.', ctx) === null);
check('www counts as a URL', acceptPitchOpener('I looked at www.acmeroofing.com and your roofing site loads slowly on phones today.', ctx) === null);
check('placeholders are rejected', acceptPitchOpener('Acme Roofing, your roofing website is missing [EDIT: the thing] customers need most.', ctx) === null);
check('merge tokens are rejected', acceptPitchOpener('{{first_name}}, your Acme Roofing website buries the phone number customers look for first.', ctx) === null);
check('hype adjectives are rejected', acceptPitchOpener('Acme Roofing deserves an amazing cutting-edge website that matches your incredible roofing work.', ctx) === null);
check('unsafe claims are rejected (the language gate holds)',
  acceptPitchOpener('Acme Roofing, your roofing website is not ADA compliant and you will be sued.', ctx) === null);
check('a sign-off leaking in is rejected', acceptPitchOpener('Your Acme Roofing website hides your phone number on mobile. Regards, a web designer who noticed.', ctx) === null);
check('too short is rejected', acceptPitchOpener('Nice roofing site.', ctx) === null);
check('too long is rejected', acceptPitchOpener(('Your Acme Roofing site could work harder. ').repeat(12), ctx) === null);
check('an ungrounded opener is rejected (fits-any-business is the failure)',
  acceptPitchOpener('I looked at your website this week and noticed several things that could work much better for you.', ctx) === null);
check('grounding via the trade word alone is enough',
  acceptPitchOpener('Most roofing sites around here bury their phone number; yours does too, three taps deep on mobile.', ctx) !== null);
check('grounding tokens skip short words', groundingTokens({ businessName: 'A B Co', industry: 'HVAC' }).length === 1);
check('no grounding tokens (all-short name, no trade) accepts rather than rejecting everything',
  acceptPitchOpener('I spent some time on your site this week and noticed the contact form fails on a phone screen.', { businessName: 'A B C' }) !== null);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} pitch-craft check(s) failed`);
