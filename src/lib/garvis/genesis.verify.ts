// src/lib/garvis/genesis.verify.ts
// Run: npx tsx src/lib/garvis/genesis.verify.ts
// Verifies the genesis pure core: DNA parsing never invents, the synthesis gauntlet (archetype
// vocabulary, coverage repair, slug de-collision, rationale + omission discipline, the zero-AI
// floor on every play step), token merging that shows holes instead of hiding them, and — the
// contamination assertion — nothing genesis produces ever speaks another world's copy.

import { parseDNA, parseGenesis, mergeTokens, type DnaDraft } from './genesis';
import { flattenTemplate } from './workweb';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('genesis.verify');

// --- fixtures: the artist-brother golden path ---

const DNA_RAW = JSON.stringify({
  title: 'Artist Brother Art Business',
  objective: 'Sell artwork, commissions, sculptures, murals, and custom installations.',
  dna: {
    businessType: 'Independent artist studio',
    revenueModel: 'Direct sales of originals plus commissioned murals and installations',
    idealCustomers: ['interior designers', 'luxury homeowners', 'hotels', 'restaurants', 'municipal art programs'],
    valueProposition: 'Original, site-specific art with a single accountable artist',
    salesCycle: 'considered — commissions take weeks and rest on trust and portfolio',
    brandPersonality: 'warm, confident, visual-first',
    coreAssets: ['artwork photos', 'artist story', 'past commissions'],
    growthChannels: ['instagram', 'website portfolio', 'direct outreach', 'referrals'],
    operationalLoop: 'show work → inquiry → proposal → commission → photograph → show work',
    successMetrics: ['inquiries per month', 'commissions booked', 'average piece price'],
    constraints: ['one artist, limited production capacity'],
  },
  businessContext: {
    business_name: 'Artist Brother Art Business', principal: 'the artist',
    craft: 'sculpture, murals, and custom artwork', offerings: ['originals', 'commissions', 'murals', 'installations'],
    audience: 'designers, hotels, collectors, municipalities', locale: null, links: {}, tone: 'warm, confident, visual-first',
  },
  questions: ['What is his price range?', 'Does he have an existing portfolio site or Instagram?'],
});

const GEN_RAW = JSON.stringify({
  template: {
    nodes: [
      { slug: 'brand', title: 'Brand & Identity', summary: 'Voice, logo, story.', archetype: 'vault', flavor: 'brand' },
      { slug: 'artwork-library', title: 'Artwork Library', summary: 'The photo corpus.', archetype: 'vault', flavor: 'generic' },
      { slug: 'market-intel', title: 'Market & Buyers', summary: 'Who buys murals and why.', archetype: 'intel', flavor: 'market' },
      { slug: 'website', title: 'Website & Portfolio', summary: 'The motion portfolio.', archetype: 'studio', flavor: 'landing' },
      { slug: 'buyers', title: 'Buyer Audience', summary: 'Reachable contacts.', archetype: 'audience', flavor: 'lists' },
      {
        slug: 'outreach', title: 'Outreach', summary: 'Approval-gated pitches.', archetype: 'launch', flavor: 'email',
        children: [{ slug: 'follow-up', title: 'Follow-Up', summary: 'Curated touches.', archetype: 'loop', flavor: 'email' }],
      },
      { slug: 'social', title: 'Social Content', summary: 'Posts from the work.', archetype: 'studio', flavor: 'social' },
      { slug: 'results', title: 'Results & Sales', summary: 'Inquiries to commissions.', archetype: 'ledger', flavor: 'generic' },
    ],
  },
  rationale: {
    clusters: {
      brand: 'A visual business lives or dies on coherent identity.',
      'artwork-library': 'The photos ARE the product evidence — everything downstream uses them.',
      'market-intel': 'Commission buyers are researchable segments, not walk-ins.',
      website: 'A considered sales cycle needs a portfolio that closes trust.',
      buyers: 'Direct outreach is a stated growth channel.',
      outreach: 'Designers and hotels respond to direct, personal pitches.',
      'follow-up': 'Considered cycles are won in the follow-up.',
      social: 'Instagram is a stated growth channel for visual work.',
      results: 'Commissions and piece prices are the stated success metrics.',
    },
    omissions: [{ what: 'Direct mail', why: 'The business is visual and relationship-driven; postcards add cost without portfolio depth.' }],
  },
  play: {
    title: 'Portfolio-to-pipeline opening play',
    objective: 'Turn the existing work into a pitchable portfolio and first outreach drafts.',
    steps: [
      {
        targetSlug: 'market-intel',
        artifact: { slug: 'buyer-brief', kind: 'doc', title: 'Who buys murals here' },
        draft: 'A working brief for {{business_name}}: the likeliest commission buyers are {{audience}}. Start by listing ten local interior design firms and five boutique hotels; note recent renovations and blank-wall spaces.',
        aiPrompt: 'Deepen with typical commission budgets and decision-makers for these segments.',
      },
      {
        targetSlug: 'social',
        artifact: { slug: 'caption-set', kind: 'doc', title: 'First caption set' },
        draft: 'Nine caption starters in a {{tone}} voice for {{principal}}: 1) the story behind the newest piece… 2) process shot: from sketch to wall… 3) what a commission actually costs and why…',
        aiPrompt: null,
      },
    ],
    emails: [
      { step: 0, subject: 'Original work for your next project', body: 'Hi {{first_name}} — I am {{principal}} at {{business_name}}. I make {{craft}} for spaces like yours. If you have a project that needs a signature piece, my portfolio is one click away. Worth a look?' },
      { step: 1, subject: 'One piece worth seeing', body: 'Hi {{first_name}} — following up with one piece that fits the kind of spaces you design. No pressure; happy to send the full portfolio.' },
    ],
  },
  intakeRequests: ['photos of finished pieces', 'artist bio and statement', 'past commission photos'],
  firstMoves: ['Upload his artwork photos', 'Save the brand kit', 'Run the opening play'],
});

const dna = parseDNA(DNA_RAW);

// 1 — DNA parsing
check('DNA parses with title + objective', !!dna && dna.title === 'Artist Brother Art Business' && !!dna.objective);
check('DNA keeps concrete customer segments', !!dna && dna.dna.idealCustomers.length === 5);
check('DNA carries the unknowns as questions, never inventions', !!dna && dna.questions.length === 2 && dna.businessContext.locale === null);
check('garbage in → null out, no throw', parseDNA('the model rambled with no json') === null);
check('DNA arrays are capped at 8', (() => {
  const big = parseDNA(JSON.stringify({ title: 'X', dna: { idealCustomers: Array.from({ length: 20 }, (_, i) => `c${i}`) }, businessContext: {}, questions: [] }));
  return !!big && big.dna.idealCustomers.length === 8;
})());

// 2 — the golden path
{
  const r = parseGenesis(GEN_RAW, dna as DnaDraft);
  check('artist web parses into a valid draft', !!r.draft && r.problems.length === 0);
  const flat = r.draft ? flattenTemplate(r.draft.template) : [];
  check('all nine areas survive, child attached to parent', flat.length === 9 && flat.some((n) => n.slug === 'follow-up' && n.parentSlug === 'outreach'));
  check('every area carries a rationale', !!r.draft && flat.every((n) => (r.draft!.rationale.clusters[n.slug] ?? '').length > 0));
  check('at least one omission with its why', !!r.draft && r.draft.rationale.omissions[0].what === 'Direct mail');
  check('play survives with both steps and both emails', !!r.draft?.play && r.draft.play.steps.length === 2 && r.draft.play.emails.length === 2);
  check('template id is generated and playIds is empty (data play rides beside)', !!r.draft && r.draft.template.id.startsWith('gen-') && r.draft.template.playIds.length === 0);
  check('intake requests + first moves carried', !!r.draft && r.draft.intakeRequests.length === 3 && r.draft.firstMoves.length === 3);
  const everything = JSON.stringify(r.draft);
  check('CONTAMINATION GUARD: nothing in the draft speaks Lake Geneva', !everything.includes('Lake Geneva') && !everything.includes('lakefront'));
}

// 3 — the gauntlet: bad structure is repaired loudly or rejected
{
  const bad = JSON.parse(GEN_RAW) as Record<string, any>;
  bad.template.nodes[0].archetype = 'warehouse';                    // unknown archetype → dropped
  bad.template.nodes[1].archetype = 'studio';                       // the OTHER vault leaves too…
  bad.template.nodes[1].flavor = 'impressionist';                   // …and its flavor is unknown
  bad.template.nodes[2].slug = 'website';                           // collision with node 4
  const r = parseGenesis(JSON.stringify(bad), dna as DnaDraft);
  check('unknown archetype drops the node — with a warning, not silence', !!r.draft && r.warnings.some((w) => w.includes('warehouse')));
  check('unknown flavor coerces to generic — stated', r.warnings.some((w) => w.includes('impressionist')));
  check('slug collision is de-collided deterministically', !!r.draft && flattenTemplate(r.draft.template).filter((n) => n.slug.startsWith('website')).length === 2);
  check('coverage repair: losing every vault re-adds a Brand vault, stated', !!r.draft && flattenTemplate(r.draft.template).some((n) => n.charter.archetype === 'vault') && r.warnings.some((w) => w.includes('Brand vault')));
}
{
  const thin = parseGenesis(JSON.stringify({ template: { nodes: [
    { slug: 'a', title: 'A', summary: '', archetype: 'intel', flavor: 'generic' },
    { slug: 'b', title: 'B', summary: '', archetype: 'vault', flavor: 'generic' },
  ] }, rationale: { clusters: {}, omissions: [] } }), dna as DnaDraft);
  check('a too-thin web is REJECTED, not padded into something fake', thin.draft === null && thin.problems.length > 0);
}
{
  const noAud = JSON.parse(GEN_RAW) as Record<string, any>;
  noAud.template.nodes = noAud.template.nodes.filter((n: any) => n.slug !== 'buyers');
  const r = parseGenesis(JSON.stringify(noAud), dna as DnaDraft);
  check('launch without audience → audience auto-added, stated', !!r.draft && flattenTemplate(r.draft.template).some((n) => n.charter.archetype === 'audience') && r.warnings.some((w) => w.includes('Audience')));
}

// 4 — the zero-AI floor on play steps
{
  const weak = JSON.parse(GEN_RAW) as Record<string, any>;
  weak.play.steps[0].draft = 'TODO';                                 // fails the floor
  weak.play.steps[1].targetSlug = 'nonexistent-area';                // unknown target
  const r = parseGenesis(JSON.stringify(weak), dna as DnaDraft);
  check('a draft that fails the zero-AI floor is dropped, stated', r.warnings.some((w) => w.includes('zero-AI floor')));
  check('a step targeting an unknown area is dropped, stated', r.warnings.some((w) => w.includes('nonexistent-area')));
  check('with no surviving steps the play is null, never a hollow shell', !!r.draft && r.draft.play === null);
}

// 5 — rationale discipline
{
  const mute = JSON.parse(GEN_RAW) as Record<string, any>;
  mute.rationale = { clusters: {}, omissions: [] };
  const r = parseGenesis(JSON.stringify(mute), dna as DnaDraft);
  check('missing rationales are flagged per area', r.warnings.filter((w) => w.includes('no rationale')).length > 0);
  check('missing omissions are called out', r.warnings.some((w) => w.includes('omission')));
  check('unexplained areas read "(no reason given)" — visible, not hidden', !!r.draft && Object.values(r.draft.rationale.clusters).some((v) => v === '(no reason given)'));
}

// 6 — token merge: the world's voice, holes visible
{
  const ctx = (dna as DnaDraft).businessContext;
  const merged = mergeTokens('Hi {{first_name}} — I am {{principal}} at {{business_name}}, and I make {{craft}}. Budget: {{budget}}.', ctx, { first_name: 'Dana' });
  check('known tokens merge to the world\'s own facts', merged.includes('the artist') && merged.includes('Artist Brother Art Business') && merged.includes('Dana'));
  check('unknown tokens stay VISIBLE — a hole is shown, never papered over', merged.includes('{{budget}}'));
  const noPrincipal = mergeTokens('From {{principal}}.', { ...ctx, principal: null });
  check('a null fact leaves its token visible too', noPrincipal.includes('{{principal}}'));
}

console.log(`\ngenesis.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node.
if (failed > 0) throw new Error(`${failed} genesis check(s) failed`);
