// src/lib/garvis/marketing.verify.ts
// Standalone verification of the Marketing Worker pure helpers (run: `npm run verify:marketing`).
// Focus: tolerant parsing + the Verifier acceptance gate. No DB, no model, no framework.

import { parseStrategy, parsePosts, parseAssets, verifyAsset, buildStrategyUser, buildPostsUser } from './marketing';
import { buildShareUrl, postText, copyText } from './channels';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// 1. Strategy parse (clean + fenced).
const strat = parseStrategy('```json\n{"summary":"Sell to locals","strategy":{"positioning":"the friendly agent","audience":"Lake Geneva buyers","channels":["Instagram","Email"],"key_messages":["local expert"]},"calendar":[{"when":"Week 1","channel":"IG","theme":"intro"}]}\n```');
check('parses strategy summary', strat?.summary === 'Sell to locals');
check('parses positioning + audience', strat?.strategy.positioning === 'the friendly agent' && strat?.strategy.audience.includes('Lake Geneva'));
check('parses channels array', (strat?.strategy.channels.length ?? 0) === 2);
check('parses calendar entries', strat !== null && strat.calendar.length === 1 && strat.calendar[0].theme === 'intro');
check('garbage strategy => null (no throw)', parseStrategy('no json here') === null);

// 2. Posts parse — drops empties.
const posts = parsePosts('{"posts":[{"platform":"X","hook":"Stop scrolling","body":"We sell homes","cta":"DM us","hashtags":["#realestate"]},{"platform":"IG"}]}');
check('parses valid posts', posts.length === 1 && posts[0].hook === 'Stop scrolling');
check('drops a post with no hook/body', !posts.some((p) => p.platform === 'IG' && !p.hook));

// 3. Assets parse.
const assets = parseAssets('{"email":{"subject":"Find your home","body":"...","cta":"Book a call"},"landing":{"headline":"Your Lake Geneva home","subhead":"local expertise","sections":[{"heading":"A","body":"x"},{"heading":"B","body":"y"}],"cta":"Get started"}}');
check('parses email subject + cta', assets?.email.subject === 'Find your home' && assets?.email.cta === 'Book a call');
check('parses landing headline + sections', assets !== null && assets.landing.headline.includes('Lake Geneva') && assets.landing.sections.length === 2);

// 4. Verifier — passing cases.
check('a complete post passes', verifyAsset('social_post', { platform: 'IG', hook: 'h', body: 'b', cta: 'c', hashtags: ['#x'] }).ok);
check('a complete email passes', verifyAsset('email', { subject: 's', body: 'b', cta: 'c' }).ok);
check('a complete landing passes', verifyAsset('landing_page', { headline: 'h', subhead: 'sh', cta: 'c', sections: [{ heading: 'a', body: 'b' }, { heading: 'c', body: 'd' }] }).ok);
check('a complete strategy passes', verifyAsset('strategy', { positioning: 'p', audience: 'a', channels: ['x'], key_messages: ['m'] }).ok);

// 5. Verifier — catches the failures that matter.
const noCta = verifyAsset('social_post', { hook: 'h', body: 'b', hashtags: [] });
check('post without CTA fails', !noCta.ok && noCta.issues.some((i) => i.includes('call to action')));
check('post without hashtags warns (not fails)', verifyAsset('social_post', { hook: 'h', body: 'b', cta: 'c', hashtags: [] }).warnings.some((w) => w.includes('hashtags')));
const thinLanding = verifyAsset('landing_page', { headline: 'h', cta: 'c', sections: [{ heading: 'a', body: 'b' }] });
check('landing with <2 sections fails', !thinLanding.ok && thinLanding.issues.some((i) => i.includes('2 sections')));
check('email without subject fails', !verifyAsset('email', { body: 'b', cta: 'c' }).ok);
check('empty calendar fails', !verifyAsset('calendar', { entries: [] }).ok);
const longX = verifyAsset('social_post', { platform: 'x', hook: 'h', body: 'z'.repeat(300), cta: 'c', hashtags: ['#a'] });
check('over-long X post warns but still passes', longX.ok && longX.warnings.some((w) => w.includes('280')));

// 6. Prompt builders fold in the brief.
check('strategy prompt includes the subject', buildStrategyUser("mom's real-estate business", 'grow listings').includes("mom's real-estate business"));
check('strategy prompt includes the brief', buildStrategyUser('X', 'grow listings').includes('grow listings'));
check('posts prompt includes the count', buildPostsUser('{}', 7).includes('7 posts'));

// 7. Publish channels — prefilled composer URLs (the honest one-click).
const post = { platform: 'X', hook: 'Stop scrolling', body: 'We sell Lake Geneva homes', cta: 'DM us', hashtags: ['#realestate'] };
const xUrl = buildShareUrl('x', 'social_post', post);
check('X channel builds a prefilled intent URL', !!xUrl && xUrl.startsWith('https://twitter.com/intent/tweet?text='));
check('X intent text is URL-encoded + includes the hook', !!xUrl && xUrl.includes(encodeURIComponent('Stop scrolling')));
const mail = buildShareUrl('email', 'email', { subject: 'Find your home', body: 'Hi', cta: 'Book a call' });
check('email channel builds a mailto with subject', !!mail && mail.startsWith('mailto:?subject=') && mail.includes(encodeURIComponent('Find your home')));
check('manual channel has no prefill URL (copy instead)', buildShareUrl('manual', 'social_post', post) === null);
check('linkedin has no reliable prefill URL', buildShareUrl('linkedin', 'social_post', post) === null);
check('postText joins hook/body/cta/hashtags', postText(post).includes('Stop scrolling') && postText(post).includes('#realestate'));
check('copyText renders an email block', copyText('email', { subject: 'S', body: 'B', cta: 'C' }).includes('Subject: S'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} marketing check(s) failed`);
