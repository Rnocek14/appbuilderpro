// Run: npx tsx src/lib/garvis/mailer.verify.ts
import { compileMailer, mailerToDetail, parseMailerDetail, type MailerInput } from './mailer';
import type { BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('mailer.verify');

const CTX: BusinessContext = {
  business_name: 'Nocek Studio', principal: 'the artist', craft: 'hand-built murals',
  offerings: ['murals', 'sculptures'], audience: 'designers and hotels', locale: 'Lake Geneva WI',
  links: { site: 'https://nocek.studio/work' }, tone: 'warm',
};
const BASE: MailerInput = {
  ctx: CTX, brand: { palette: ['#B98CE0'], compliance_line: 'Nocek Studio LLC · Lake Geneva WI' },
  concept: 'proof', imageUrl: 'https://cdn.example.com/mural.jpg', imageAlt: 'lobby mural',
  offer: 'First consult free — see 3 concepts for your space.', linkUrl: null,
};

{
  const s = compileMailer(BASE);
  check('deterministic: same input, same card', JSON.stringify(s) === JSON.stringify(compileMailer(BASE)));
  check('front headline fits arm\'s-length reading (≤48 chars)', s.front.headline.length <= 48 && s.front.headline.includes('hand-built murals'));
  check('the real photo carries the front', s.front.imageUrl === BASE.imageUrl && s.front.imageAlt === 'lobby mural');
  check('the ONE offer reaches the back', s.back.body.includes('First consult free'));
  check('link resolves from ctx.links when not given, and becomes the CTA', s.back.linkUrl === 'https://nocek.studio/work' && s.back.cta.includes('nocek.studio/work'));
  check('compliance line carried from the brand kit', s.back.complianceLine === 'Nocek Studio LLC · Lake Geneva WI');
  check('brand primary becomes the accent', s.accent === '#B98CE0');
  check('USPS geometry encoded (6x9, bleed, safe zone, address zone)',
    s.meta.sizeIn[0] === 9 && s.meta.bleedIn === 0.125 && s.meta.safeIn === 0.25 && s.meta.addressZoneIn[0] === 4);
}
{
  // Holes are VISIBLE, never papered over.
  const bare = compileMailer({
    ctx: { business_name: 'X Co', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null },
    concept: 'local_authority', imageUrl: null, offer: '', brand: null,
  });
  check('missing offer → visible EDIT prompt, not an invented one', bare.back.offer.startsWith('[EDIT:'));
  check('missing response route → visible EDIT prompt, never an invented phone/URL', bare.back.cta.startsWith('[EDIT:'));
  check('no brand → house ember accent', bare.accent === '#FF8A3D');
  const ba = compileMailer({ ...BASE, concept: 'before_after' });
  check('before/after asks for the real before/after lines instead of faking them', ba.back.body.includes('[EDIT:'));
}
{
  const s = compileMailer(BASE);
  const detail = mailerToDetail(s);
  check('artifact detail is human-readable copy first', detail.startsWith('POSTCARD (6×9') && detail.includes('FRONT — headline:'));
  const back = parseMailerDetail(detail);
  check('design round-trips through the artifact exactly', JSON.stringify(back) === JSON.stringify(s));
  check('garbage detail → null, never a throw', parseMailerDetail('just some notes') === null && parseMailerDetail(null) === null);
}

console.log(`\nmailer.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} mailer check(s) failed`);
