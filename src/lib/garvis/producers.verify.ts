// Run: npx tsx src/lib/garvis/producers.verify.ts
import {
  researchQueries, formatSources, appendSources, parseSocialPosts, postToDetail,
  researchContext, type ResearchSource,
} from './producersCore';
import type { WorldDNA, BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('producers.verify');

const DNA: WorldDNA = {
  businessType: 'residential real estate brokerage', revenueModel: 'commission', idealCustomers: ['lakefront home sellers'],
  valueProposition: 'local expertise', salesCycle: 'long', brandPersonality: 'calm', coreAssets: [], growthChannels: [],
  operationalLoop: null, successMetrics: [], constraints: [],
};
const CTX: BusinessContext = {
  business_name: 'Nocek Realty', principal: 'Mom', craft: 'lakefront real estate', offerings: ['listings', 'valuations'],
  audience: 'lakefront owners', locale: 'Lake Geneva WI', links: {}, tone: 'warm',
};

// --- research queries: real, market-focused, deterministic --------------------------------
{
  const q = researchQueries(DNA, CTX);
  check('research queries derive from craft + locale', q.length >= 2 && q[0].includes('lakefront real estate') && q.some((x) => x.includes('Lake Geneva')));
  check('queries are deterministic', JSON.stringify(q) === JSON.stringify(researchQueries(DNA, CTX)));
  check('no DNA/ctx → no empty-string queries', researchQueries(null, null).every((x) => x.length > 3) || researchQueries(null, null).length === 0);
}
// --- sources: numbered, and the brief gets a checkable SOURCES footer ----------------------
{
  const src: ResearchSource[] = [
    { title: 'Lake Geneva market report', url: 'https://x.com/a', snippet: 'median lakefront up 8%' },
    { title: 'Local comps', url: 'https://y.com/b', snippet: 'frontage drives price' },
  ];
  const fmt = formatSources(src);
  check('sources render numbered with url', fmt.includes('[1]') && fmt.includes('https://x.com/a') && fmt.includes('[2]'));
  const brief = appendSources('LANDSCAPE: thin inventory [1].', src);
  check('brief gets a real SOURCES footer with the URLs', brief.includes('SOURCES') && brief.includes('https://y.com/b'));
  check('no sources → no footer (never a fake one)', appendSources('brief', []) === 'brief');
}
// --- social: finished posts parsed from model blocks --------------------------------------
{
  const model = `POST
caption: Your shoreline has a number. Most owners are off by six figures. DM to find yours.
visual: dawn over the water, still
tags: #LakeGeneva #lakefront #realestate

POST
caption: The best sales here happen quietly, before the sign goes up. Preparation is the game.
visual: shoot: a pier at golden hour
tags: #luxuryrealestate #LakeGenevaWI

POST
caption: too short
visual: x
tags: #a`;
  const posts = parseSocialPosts(model);
  check('parses the finished posts (real captions only)', posts.length === 2);
  check('caption is the full ready-to-post text', posts[0].caption.includes('off by six figures'));
  check('visual references a real/directed shot', posts[1].visual.includes('pier'));
  check('tags parsed, deduped, hash-prefixed', posts[0].tags.includes('#lakegeneva') && posts[0].tags.length === 3);
  check('a too-thin caption is dropped, not shipped', !posts.some((p) => p.caption === 'too short'));
  const detail = postToDetail(posts[0]);
  check('post detail is copy-paste ready (caption then tags then visual)', detail.startsWith('Your shoreline') && detail.includes('#lakegeneva') && detail.includes('VISUAL:'));
  check('garbage in → empty out, no throw', parseSocialPosts('not a post at all').length === 0);
}
// --- angle grounding --------------------------------------------------------------------
{
  const grounded = researchContext([{ title: 'Market snapshot', detail: 'inventory is thin, buyers are Chicago money' }]);
  check('angle grounds in real findings when present', grounded.includes('Market snapshot') && grounded.includes('Chicago money'));
  check('no findings → provisional, names the gap', researchContext([]).includes('provisional'));
}

console.log(`\nproducers.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} producers check(s) failed`);
