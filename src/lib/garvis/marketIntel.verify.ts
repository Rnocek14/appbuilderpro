// Run: npx tsx src/lib/garvis/marketIntel.verify.ts
import { researchPlanFor, parseSerperOrganic, parseFits } from './marketIntel';
import type { WorldDNA, BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('marketIntel.verify');

const DNA = { businessType: 'artist studio', idealCustomers: ['interior designers', 'hotels', 'municipal art programs'], revenueModel: null, valueProposition: null, salesCycle: null, brandPersonality: null, coreAssets: [], growthChannels: [], operationalLoop: null, successMetrics: [], constraints: [] } as WorldDNA;
const CTX = { business_name: 'N', principal: null, craft: 'murals', offerings: ['murals', 'sculptures'], audience: null, locale: 'Lake Geneva WI', links: {}, tone: null } as BusinessContext;

{
  const plan = researchPlanFor(DNA, CTX);
  check('one category per ideal customer, capped', plan.categories.length === 3);
  check('queries weave customer + locale + offerings', plan.categories[0].queries[1].includes('interior designers') && plan.categories[0].queries[1].includes('Lake Geneva') && plan.categories[0].queries[1].includes('murals'));
  check('same DNA → same plan (deterministic, no model)', JSON.stringify(researchPlanFor(DNA, CTX)) === JSON.stringify(plan));
  const bare = researchPlanFor(null, null);
  check('no DNA → empty plan, nothing invented', bare.categories.length === 0 && bare.trendQuestions.length === 0);
}
{
  const c = parseSerperOrganic({ organic: [
    { title: 'Studio A', link: 'https://a.com', snippet: 'boutique hotel lobby renovations' },
    { title: 'Studio A dup', link: 'https://a.com', snippet: 'dup' },
    { title: '', link: 'https://b.com' },
    { title: 'Designer B', snippet: 'no link' },
  ] });
  check('organic parses, dedupes by link, drops untitled', c.length === 2 && c[0].name === 'Studio A' && c[1].url === null);
  check('garbage in → empty out, no throw', parseSerperOrganic(null).length === 0 && parseSerperOrganic({ organic: 'x' }).length === 0);
}
{
  const f = parseFits('{"fits":[{"name":"Studio A","fit":"strong","reason":"snippet mentions lobby renovations — wall space"},{"name":"X","fit":"mega","reason":"r"},{"name":"Y","fit":"weak","reason":""}]}');
  check('valid fits parse with grounded reasons', f[0].fit === 'strong' && f[0].reason.includes('lobby'));
  check('unknown labels coerce to unknown; reasonless labeled fits are dropped', f.some((x) => x.name === 'X' && x.fit === 'unknown') && !f.some((x) => x.name === 'Y'));
  check('garbage never throws', parseFits('nope').length === 0);
}
console.log(`\nmarketIntel.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} marketIntel check(s) failed`);
