// src/lib/garvis/opportunities.verify.ts
// Standalone verification of Opportunity Detection pure helpers (run: `npm run verify:opportunities`).

import { parseOpportunities, dedupe, oppKey, buildOpportunityUser, OPPORTUNITY_SYSTEM } from './opportunities';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// 1. Parse a clean response.
const parsed = parseOpportunities('{"opportunities":[{"title":"Theory Thread feeds FableForge marketing","type":"synergy","rationale":"TT produces research content FF could repurpose","suggested_move":"Pipe TT digests into FF launch posts","related_apps":["Theory Thread","FableForge"],"confidence":0.7},{"title":"Clone hyperlocal to more cities","type":"expansion","rationale":"pattern works","suggested_move":"templatize","related_apps":["Hyperlocal"],"confidence":1.4}]}');
check('parses two opportunities', parsed.length === 2);
check('keeps the synergy type + related apps', parsed[0].type === 'synergy' && parsed[0].related_apps.length === 2);
check('clamps over-range confidence to 1', parsed[1].confidence === 1);
check('coerces expansion type', parsed[1].type === 'expansion');

// 2. Invalid type falls back to synergy; missing title/rationale dropped.
const coerced = parseOpportunities('{"opportunities":[{"title":"x","type":"nonsense","rationale":"y"},{"type":"risk","rationale":"no title"},{"title":"z"}]}');
check('invalid type => synergy', coerced[0].type === 'synergy');
check('drops opp with no title', !coerced.some((o) => o.rationale === 'no title'));
check('drops opp with no rationale (title z)', !coerced.some((o) => o.title === 'z'));

// 3. Garbage => empty, no throw.
check('garbage => empty', parseOpportunities('the model mused').length === 0);

// 4. Dedupe against known keys (case/punctuation-insensitive).
const found = parseOpportunities('{"opportunities":[{"title":"Consolidate Launch Buddy & Traction","type":"consolidation","rationale":"overlap"},{"title":"Brand-new angle","type":"positioning","rationale":"gap"}]}');
const known = new Set([oppKey('CONSOLIDATE launch buddy & traction.')]); // same words, different case/punctuation
const fresh = dedupe(found, known);
check('dedupe drops a known opportunity (normalized)', !fresh.some((o) => o.title.startsWith('Consolidate')));
check('dedupe keeps a genuinely new one', fresh.some((o) => o.title === 'Brand-new angle'));
check('dedupe also dedups within the batch', dedupe([found[1], found[1]], new Set()).length === 1);

// 5. Prompts.
check('user prompt embeds the digest', buildOpportunityUser('- App A\n- App B').includes('App A'));
check('system pushes cross-app synergy', OPPORTUNITY_SYSTEM.includes('SYNERGY') && OPPORTUNITY_SYSTEM.includes('Cross-app'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} opportunity check(s) failed`);
