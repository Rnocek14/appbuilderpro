// Run: npx tsx src/lib/garvis/marketingReadiness.verify.ts
import { marketingReadiness, type MarketingAreaState } from './marketingReadiness';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const A = (slug: string, title: string, artifacts: number): MarketingAreaState => ({ slug, title, artifacts });
const FRESH = [
  A('mkt-plan', 'The Plan', 0), A('competitor-intel', 'Competitor Intel', 0), A('seo-articles', 'SEO Articles', 0),
  A('social-posts', 'Social Posts', 0), A('video-ideas', 'Video Ideas', 0), A('mkt-results', 'Results', 0),
];

{
  const r = marketingReadiness({ areas: FRESH, ctaSet: null });
  check('a fresh operation is honestly 0%', r.pct === 0);
  check('every workable area gets exactly one next step', r.next.length === 5);
  check('Results never counts against completeness before anything ships', !r.next.some((n) => n.includes('Results fills itself')) || r.next.length === 5);
  check('nothing is claimed done', r.done.length === 0);
}
{
  const some = FRESH.map((a) => (a.slug === 'competitor-intel' ? { ...a, artifacts: 3 } : a.slug === 'social-posts' ? { ...a, artifacts: 5 } : a));
  const r = marketingReadiness({ areas: some, ctaSet: false });
  check('worked areas count, empty ones do not (2 of 5 areas + failed CTA check = 33%)', r.pct === 33);
  check('done speaks in real counts', r.done.some((d) => d.includes('3 items')) && r.done.some((d) => d.includes('5 items')));
  check('the unset CTA has a next step', r.next.some((n) => n.includes('Point a channel')));
}
{
  const all = FRESH.map((a) => ({ ...a, artifacts: 2 }));
  const r = marketingReadiness({ areas: all, ctaSet: true });
  check('a fully worked operation with a routed CTA is 100%', r.pct === 100);
  check('nothing is left as next', r.next.length === 0);
}
{
  const r1 = marketingReadiness({ areas: FRESH, ctaSet: null });
  check('no channel = the CTA check is OMITTED, not failed', !r1.next.some((n) => n.includes('Point a channel')));
  const r2 = marketingReadiness({ areas: [], ctaSet: null });
  check('no areas at all is 0%, never NaN', r2.pct === 0);
  check('deterministic', JSON.stringify(marketingReadiness({ areas: FRESH, ctaSet: false })) === JSON.stringify(marketingReadiness({ areas: FRESH, ctaSet: false })));
  const custom = marketingReadiness({ areas: [A('hand-added', 'Hand Added', 0)], ctaSet: null });
  check('hand-added areas get a serviceable next step, never a crash', custom.next[0] === 'Start the first item in Hand Added');
}

console.log(`\nmarketingReadiness.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} marketingReadiness check(s) failed`);
