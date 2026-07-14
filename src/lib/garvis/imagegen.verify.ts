// src/lib/garvis/imagegen.verify.ts — run: npx tsx src/lib/garvis/imagegen.verify.ts
// Proves the load-bearing rule: AI images are NEVER offered as a stand-in for a specific real
// property, and every honest prompt carries the no-text / no-face / no-specific-property guardrails.

import { buildImagePrompt, canGenerateImage } from './imagegen';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

// ---- listing types are REFUSED (must use the real home photo) ----
for (const type of ['just_listed', 'just_sold', 'open_house'] as const) {
  ok(`${type}: canGenerateImage is false`, canGenerateImage(type) === false);
  const r = buildImagePrompt({ campaignType: type, area: 'Lake Geneva', highlight: 'lakefront' });
  ok(`${type}: buildImagePrompt refuses`, r.ok === false);
  if (!r.ok) ok(`${type}: refusal explains real-photo rule`, /real|actual|photo/i.test(r.reason));
}

// ---- find_sellers is allowed: a lifestyle/place prompt, guardrailed ----
const farm = buildImagePrompt({ campaignType: 'find_sellers', area: 'Lake Geneva' });
ok('find_sellers: allowed', canGenerateImage('find_sellers') === true && farm.ok === true);
if (farm.ok) {
  ok('find_sellers: prompt evokes the area', farm.prompt.includes('Lake Geneva'));
  ok('find_sellers: guardrail forbids text', /no text/i.test(farm.prompt) && /no logos/i.test(farm.prompt));
  ok('find_sellers: guardrail forbids a specific property', /specific real property/i.test(farm.prompt));
  ok('find_sellers: guardrail forbids real faces', /no recognizable real people/i.test(farm.prompt));
  ok('find_sellers: labelled as an illustration', /illustration/i.test(farm.note));
}

// ---- find_sellers with no area still produces a safe generic-town prompt (no invention of a place) ----
const farmBare = buildImagePrompt({ campaignType: 'find_sellers' });
ok('find_sellers bare: still ok + guardrailed', farmBare.ok === true && (!farmBare.ok || /no text/i.test(farmBare.prompt)));

// ---- generic business: an on-brand image, guardrailed, never a claim about a real object ----
const bakery = buildImagePrompt({ campaignType: 'announce', businessName: 'Sweet Buns Bakery', subject: 'Fresh sourdough every morning' });
ok('generic: allowed', canGenerateImage('announce') === true && bakery.ok === true);
if (bakery.ok) {
  ok('generic: prompt evokes the subject', bakery.prompt.includes('Fresh sourdough every morning'));
  ok('generic: guardrails present', /no text/i.test(bakery.prompt) && /specific real property/i.test(bakery.prompt));
}
for (const type of ['promo', 'event', 'reach'] as const) {
  ok(`generic ${type}: allowed + ok`, canGenerateImage(type) === true && buildImagePrompt({ campaignType: type, subject: 'X' }).ok === true);
}

// ---- an operator style nudge is woven in, guardrails still win ----
const styled = buildImagePrompt({ campaignType: 'reach', subject: 'Yoga studio', style: 'calm, minimalist, sage green' });
ok('style nudge included', styled.ok === true && (!styled.ok || styled.prompt.includes('calm, minimalist, sage green')));
ok('style nudge cannot strip guardrails', styled.ok === true && (!styled.ok || /no text/i.test(styled.prompt)));

console.log(`\nimagegen.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
