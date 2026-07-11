// Run: npx tsx src/lib/garvis/expertise.verify.ts
import { expertiseFor } from './expertise';
import { ARCHETYPES, FLAVORS, type Archetype } from './workweb';
import { mergeTokens, type BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('expertise.verify');

const CTX: BusinessContext = { business_name: 'Nocek Studio', principal: 'the artist', craft: 'murals', offerings: ['murals', 'sculptures'], audience: 'designers and hotels', locale: 'Lake Geneva WI', links: {}, tone: 'warm' };

{
  let all = true; let labeled = true; let substantive = true;
  for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
    for (const f of FLAVORS) {
      const pack = expertiseFor(a, f);
      if (!pack.length) all = false;
      for (const s of pack) {
        if (!s.detail.includes('Framework')) labeled = false;      // honesty label present
        if (s.detail.length < 300) substantive = false;            // real playbooks, not stubs
      }
    }
  }
  check('EVERY archetype x flavor has a non-empty expert pack', all);
  check('every seed is labeled a framework (never claims measured data)', labeled);
  check('every seed is substantive (300+ chars of real structure)', substantive);
}
{
  const dm = expertiseFor('launch', 'direct_mail');
  check('direct mail arrives with a campaign plan AND postcard concepts', dm.some((s) => s.slug === 'direct-mail-campaign-plan') && dm.some((s) => s.slug === 'postcard-concepts'));
  const social = expertiseFor('studio', 'social');
  check('social arrives with a 30-day plan', social.some((s) => s.slug === 'social-30-day-plan'));
  const intel = expertiseFor('intel', 'market');
  check('intel arrives with a market comparison framework', intel.some((s) => s.slug === 'market-comparison-framework'));
  check('frameworks defer data to scans/records instead of inventing it', intel[0].detail.includes('fill via Lead Finder') || intel[0].detail.includes('real price points'));
}
{
  const merged = mergeTokens(expertiseFor('studio', 'social')[0].detail, CTX);
  check('packs speak the world\'s own voice after token merge', merged.includes('Nocek Studio') && merged.includes('designers and hotels') && !merged.includes('{{business_name}}'));
}
console.log(`\nexpertise.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} expertise check(s) failed`);
