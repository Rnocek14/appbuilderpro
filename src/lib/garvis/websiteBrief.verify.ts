// src/lib/garvis/websiteBrief.verify.ts
// Run: npx tsx src/lib/garvis/websiteBrief.verify.ts

import { compileWebsiteBrief, type WebsiteBriefInput } from './websiteBrief';

let passed = 0; let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('websiteBrief.verify');

const FULL: WebsiteBriefInput = {
  worldTitle: 'Artist Brother Art Business',
  objective: 'Sell artwork, commissions, sculptures, murals.',
  dna: {
    businessType: 'Independent artist studio', revenueModel: 'originals + commissions',
    idealCustomers: ['interior designers', 'hotels'], valueProposition: 'site-specific original art',
    salesCycle: 'considered', brandPersonality: 'warm, confident, visual-first',
    coreAssets: [], growthChannels: [], operationalLoop: null, successMetrics: [], constraints: [],
  },
  ctx: {
    business_name: 'Nocek Studio', principal: 'the artist', craft: 'sculpture and murals',
    offerings: ['originals', 'murals'], audience: 'designers and hotels', locale: null, links: {}, tone: 'warm',
  },
  brand: { palette: ['#123B5C', '#C9A227'], fonts: ['Playfair Display'], tone: 'warm, gallery-calm', compliance_line: null, logo_url: null },
  photos: [
    { name: 'heron.jpg', url: 'https://x/heron.jpg', caption: 'A bronze heron mid-flight.', label: 'website' },
    { name: 'mural1.jpg', url: 'https://x/mural1.jpg', caption: 'Geometric mural, 40ft lobby wall.', label: 'website' },
    { name: 'process.jpg', url: 'https://x/process.jpg', caption: 'Welding in the studio.', label: 'social' },
  ],
};

{
  const b = compileWebsiteBrief(FULL);
  check('prompt names the business and its craft', b.prompt.includes('Nocek Studio') && b.prompt.includes('sculpture'));
  check('every photo URL is in the brief — real assets, never placeholders', FULL.photos.every((p) => b.brief.includes(p.url)));
  check('captions become alt text', b.brief.includes('bronze heron'));
  check('hero candidates come from website-labeled photos', b.heroCandidates.length === 2 && b.heroCandidates[0].name === 'heron.jpg');
  check('the no-stock rule is stated', b.brief.includes('no stock'));
  check('motion direction names the real kits', b.brief.includes('SmoothScroll') && b.brief.includes('ScrollScenes') && b.brief.includes('TextReveal'));
  check('the lead form stores and never sends', b.brief.includes('must NOT') && b.brief.includes('approval queue'));
  check('DNA drives design', b.brief.includes('interior designers'));
  check('brand palette and voice carried', b.brief.includes('#123B5C') && b.brief.includes('gallery-calm'));
}
{
  // Knowledge-into-build: the world's real findings ground the first generation, not the DNA alone.
  const withK = compileWebsiteBrief({ ...FULL, knowledge: ['Designers in the Lake Geneva corridor specify local art for hospitality projects', 'Learned: proof reels outperform static shots 3:1'] });
  check('the WHAT THIS BUSINESS HAS LEARNED section carries real findings', withK.brief.includes('HAS LEARNED') && withK.brief.includes('hospitality projects'));
  check('reflection lessons reach the brief', withK.brief.includes('proof reels outperform'));
  check('no knowledge → no learned section (never invented)', !compileWebsiteBrief(FULL).brief.includes('HAS LEARNED'));
}
{
  const bare = compileWebsiteBrief({ worldTitle: 'X', objective: null, dna: null, ctx: null, brand: null, photos: [] });
  check('a bare world omits unknown sections instead of inventing them', !bare.brief.includes('WORLD DNA') && !bare.brief.includes('BRAND:'));
  check('no photos → explicit image-slot instruction, still no stock', bare.brief.includes('none uploaded yet') && bare.brief.includes('NO stock'));
  const big = compileWebsiteBrief({ ...FULL, photos: Array.from({ length: 80 }, (_, i) => ({ name: `p${i}.jpg`, url: `https://x/p${i}.jpg`, caption: 'c'.repeat(200), label: null })) });
  check('the brief respects its byte budget', big.brief.length <= 9000);
}

console.log(`\nwebsiteBrief.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node.
if (failed > 0) throw new Error(`${failed} websiteBrief check(s) failed`);
