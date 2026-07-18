// src/lib/garvis/clientEngagement.verify.ts
// Verifies the client-engagement pure core (run: `npm run verify:clientengagement`). Pure asserts,
// no DB. The intake checklist is deterministic domain knowledge — prove each scope pillar adds
// its real prerequisites and unknown scopes still get a workable floor.

import { intakeFor, clientWorldIntent, engagementLine } from './clientEngagement';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const items = (scope: string) => intakeFor(scope).map((i) => i.item.toLowerCase());

// ---- intakeFor ----
const marketing = items('marketing');
check('every engagement starts with terms + point of contact', marketing.some((i) => i.includes('terms')) && marketing.some((i) => i.includes('point of contact')));
check('marketing scope collects brand assets and channel access', marketing.some((i) => i.includes('brand assets')) && marketing.some((i) => i.includes('channel')));
const paper = items('listing paperwork and DocuSign');
check('paperwork scope collects document samples, fill list, signers', paper.some((i) => i.includes('recurring document')) && paper.some((i) => i.includes('vary per')) && paper.some((i) => i.includes('signer')));
const combo = items('marketing + listing paperwork');
check('combined scope gets both pillars, deduped', combo.some((i) => i.includes('brand assets')) && combo.some((i) => i.includes('signer')) && new Set(combo).size === combo.length);
const web = items('website and seo');
check('web scope collects domain + content', web.some((i) => i.includes('domain')) && web.some((i) => i.includes('site content')));
const leads = items('lead generation');
check('lead scope collects the list + their definition of qualified', leads.some((i) => i.includes('csv')) && leads.some((i) => i.includes('qualified')));
const weird = intakeFor('quantum vibes consulting');
check('unknown scope still gets the floor, all unreceived', weird.length >= 2 && weird.every((i) => i.received === false));

// ---- clientWorldIntent ----
const intent = clientWorldIntent('Jane Smith', 'residential realty in Madison', 'marketing');
check('client intent frames the business as THEIRS with the operator as provider', intent.includes("Jane Smith's business") && intent.includes('marketing provider'));

// ---- engagementLine ----
const line = engagementLine({ status: 'active', world_id: null, intake: [{ item: 'a', received: true }, { item: 'b', received: false }] });
check('line reports status, intake progress, and the unlinked world honestly', line.includes('active') && line.includes('intake 1/2') && line.includes('not linked'));
check('linked world reads as linked', engagementLine({ status: 'prospect', world_id: 'w1', intake: [] }).includes('world linked'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} clientEngagement check(s) failed`);
