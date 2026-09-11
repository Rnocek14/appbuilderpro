// Run: npx tsx src/lib/garvis/emailPlacement.verify.ts
// Inbox placement's contract: promo shape is NAMED before it costs deliverability, a personal
// market note lints perfectly clean (our best-converting shape must never be punished), link
// shorteners are the one fail-closed refusal, and contacts who ignore five straight sends stop
// being enrolled. Plus the wiring pins: send-email gates, the sweep sunsets, the editor advises.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUNSET_MIN_SENDS, findShortenedLinks, placementLint, placementLine, sunsetContacts,
} from './email/placement';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- the classic agent promo: every planted defect surfaces, by name ----
{
  const findings = placementLint(
    'FREE Home Valuation – LIMITED Time Offer!',
    'Act now — this exclusive offer expires soon! Click here: https://bit.ly/3xYz. Don\'t miss out!!',
    '<table><tr><td><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"></td></tr></table>',
  );
  const by = (code: string) => findings.find((f) => f.code === code);
  check('a shortened link is an ERROR', by('promo.link_shortener')?.severity === 'error');
  check('stacked promo phrasing is an ERROR at 3+ hits', by('promo.trigger_phrases')?.severity === 'error');
  check('repeated exclamation marks are an ERROR', by('promo.spammy_punctuation')?.severity === 'error');
  check('three images are an ERROR', by('promo.image_heavy')?.severity === 'error');
  check('designed-template HTML is called out', !!by('promo.html_designed'));
  check('an all-caps subject word is called out', !!by('promo.caps_subject'));
  check('every finding says WHY in plain words', findings.every((f) => f.detail.length > 20));
  check('the line counts, never adjectivizes', /^Inbox placement: \d+ to fix/.test(placementLine(findings)));
}

// ---- the personal market note: our best-converting shape lints CLEAN ----
{
  const findings = placementLint(
    'Maple St just sold — thought of you',
    'Hi Sarah,\n\n412 Maple St closed at $520k last week — about 6% over what similar homes in '
    + 'your neighborhood went for last spring. If you ever want a fresh read on what yours would '
    + 'bring, happy to run one. Feel free to reply here.\n\n— Dana',
  );
  check('a plain personal note produces ZERO findings', findings.length === 0);
  check('a clean lint produces no line at all', placementLine(findings) === '');
  check('"feel free to reply" never trips the free trigger',
    placementLint('Quick note', 'Feel free to reply anytime.').length === 0);
  check('a price like $520k never reads as money spam',
    placementLint('Market update', 'It sold for $520k.').length === 0);
  check('MLS/FSBO/HOA stay legitimately upper-case',
    placementLint('New MLS data for your HOA', 'A FSBO two doors down just listed.')
      .every((f) => f.code !== 'promo.caps_subject'));
}

// ---- graded severities: one promo word advises, it does not convict ----
{
  const one = placementLint('A discount on staging', 'One promo word here, nothing else.');
  check('a single trigger phrase is an ADVISORY, not an error',
    one.length === 1 && one[0].code === 'promo.trigger_phrases' && one[0].severity === 'advisory');
  const links = placementLint('s', 'https://a.com/1 https://b.com/2 https://c.com/3');
  check('three links advise; link-dense mail errors',
    links.find((f) => f.code === 'promo.link_count')?.severity === 'advisory'
    && placementLint('s', 'https://a.com/1 https://b.com/2 https://c.com/3 https://d.com/4 https://e.com/5')
      .find((f) => f.code === 'promo.link_count')?.severity === 'error');
  check('one image advises (a designed shape signal, not a conviction)',
    placementLint('s', 'hello', '<img src="x.jpg">').find((f) => f.code === 'promo.image_heavy')?.severity === 'advisory');
}

// ---- the shortener finder (the fail-closed gate's edge) ----
{
  check('finds shorteners by host, subdomains included',
    findShortenedLinks('see https://bit.ly/abc and https://www.tinyurl.com/x').length === 2);
  check('never flags a full URL that merely mentions a shortener name',
    findShortenedLinks('our post about bit.ly at https://example.com/bit.ly-review').length === 0);
}

// ---- the sunset rule ----
{
  const delivered = (id: string, n: number) => Array.from({ length: n }, () => ({ contact_id: id, kind: 'delivered' }));
  check(`${SUNSET_MIN_SENDS} ignored deliveries → asleep`,
    sunsetContacts(delivered('a', SUNSET_MIN_SENDS)).has('a'));
  check('one real engagement keeps a heavily-mailed contact awake',
    !sunsetContacts([...delivered('a', 9), { contact_id: 'a', kind: 'opened' }]).has('a'));
  check('four ignored deliveries stay enrolled (the rule is 5, not eager)',
    !sunsetContacts(delivered('a', SUNSET_MIN_SENDS - 1)).has('a'));
  check('a reply counts as engagement like opens and clicks do',
    !sunsetContacts([...delivered('b', 7), { contact_id: 'b', kind: 'replied' }]).has('b'));
}

// ---- wiring pins (textual proof against the real sources) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
{
  const sendEmail = read('supabase/functions/send-email/index.ts');
  check('send-email fail-closes on shortened links, by name',
    sendEmail.includes('findShortenedLinks(composed)') && sendEmail.includes('shortened links get email junked'));
  check('the gate sits with the placeholder gate — before the claim, protecting every caller',
    sendEmail.indexOf('findShortenedLinks(composed)') < sendEmail.indexOf('send_claimed_at'));
  const worker = read('supabase/functions/standing-worker/index.ts');
  check('the flow sweep filters enrollment through the sunset rule',
    worker.includes('sunsetContacts(evRows ?? [])') && worker.includes('!asleep.has(cid)'));
  const panel = read('src/components/garvis/EmailFlowsPanel.tsx');
  check('the flow editor shows live findings while the operator writes — advice, never a block',
    panel.includes('placementLint(s.subject, s.body)') && panel.includes('placementLine(found)'));
  check('one implementation everywhere: editor and servers import the same core',
    read('src/lib/garvis/email/placement.ts').includes("supabase/functions/_shared/emailPlacementCore"));
}

console.log(`\nemailPlacement.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} placement check(s) failed`);
