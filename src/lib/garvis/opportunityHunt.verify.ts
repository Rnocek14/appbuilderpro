// src/lib/garvis/opportunityHunt.verify.ts
// Verifies the Opportunity Hunt's pure core (run: `npm run verify:opportunityhunt`). Pure asserts,
// no DB. The extraction gauntlet is the trust boundary between the model and the feed — the
// allowlist rule (no hallucinated links) and the never-guess field rules are proven here.

import { buildQueries, parseOpportunities, dedupeKey, huntLine, MAX_QUERIES, MAX_FOUND_PER_RUN, QUERY_VARIANTS, DRY_RUNS_BEFORE_ROTATE } from './opportunityHunt';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ---- buildQueries ----
const qs = buildQueries('mural and custom art jobs', 'Wisconsin');
check(`queries are capped at ${MAX_QUERIES} and deduped`, qs.length <= MAX_QUERIES && new Set(qs).size === qs.length);
check('queries carry the focus and the region', qs.every((q) => q.includes('mural and custom art jobs')) && qs.some((q) => q.includes('Wisconsin')));
check('region is optional', buildQueries('grants').every((q) => !q.includes('undefined') && !q.includes('null')));

// ---- self-tuning rotation (holy-grail gap 5) ----
const v0 = buildQueries('mural jobs', 'Wisconsin', 0);
const v1 = buildQueries('mural jobs', 'Wisconsin', 1);
const v2 = buildQueries('mural jobs', 'Wisconsin', 2);
check(`${QUERY_VARIANTS} distinct query vocabularies exist`, QUERY_VARIANTS >= 3);
check('each variant is a genuinely different vocabulary', v0.join('|') !== v1.join('|') && v1.join('|') !== v2.join('|') && v0.join('|') !== v2.join('|'));
check('every variant still carries the focus', [v0, v1, v2].every((set) => set.every((q) => q.includes('mural jobs'))));
check('every variant still carries the region somewhere', [v0, v1, v2].every((set) => set.some((q) => q.includes('Wisconsin'))));
check('variants wrap deterministically', buildQueries('mural jobs', null, QUERY_VARIANTS).join('|') === buildQueries('mural jobs', null, 0).join('|'));
check('default variant is the original phrasing', buildQueries('mural jobs', 'Wisconsin').join('|') === v0.join('|'));
check(`rotation waits for ${DRY_RUNS_BEFORE_ROTATE} dry runs`, DRY_RUNS_BEFORE_ROTATE >= 2);

// ---- parseOpportunities: the gauntlet ----
const PAGES = ['https://city.example.gov/public-art/rfps', 'https://calls.example.org/open'];
const good = parseOpportunities(JSON.stringify([
  { title: 'Riverfront mural commission', source_url: PAGES[0], summary: 'City seeks a muralist for the riverfront underpass.', kind: 'mural', location: 'Madison, WI', budget_text: '$18,000', deadline_text: 'Aug 14, 2026' },
  { title: 'Emerging artist grant', source_url: PAGES[1], summary: 'Annual grant for emerging visual artists.', kind: 'grant', location: null, budget_text: null, deadline_text: null },
]), PAGES);
check('valid items parse with fields intact', good.length === 2 && good[0].budget_text === '$18,000' && good[1].kind === 'grant');
check('null fields stay null (never guessed)', good[1].location === null && good[1].budget_text === null);

const hallucinated = parseOpportunities(JSON.stringify([
  { title: 'Fake deep link', source_url: 'https://city.example.gov/apply/form-7', summary: 'A link the model constructed itself.', kind: 'mural' },
  { title: 'Real one', source_url: PAGES[1], summary: 'From a page we actually fetched.', kind: 'job' },
]), PAGES);
check('items pointing off the fetched allowlist are dropped', hallucinated.length === 1 && hallucinated[0].source_url === PAGES[1]);

check('garbage returns [] (a failed extraction finds nothing)', parseOpportunities('not json', PAGES).length === 0);
check('a non-array returns []', parseOpportunities(JSON.stringify({ title: 'x' }), PAGES).length === 0);
check('fenced output parses', parseOpportunities('```json\n[]\n```', PAGES).length === 0);
check('unknown kind coerces to other', parseOpportunities(JSON.stringify([{ title: 'T', source_url: PAGES[0], summary: 'A real summary of the item.', kind: 'sculpture-thing' }]), PAGES)[0].kind === 'other');
const flood = parseOpportunities(JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ title: `Op ${i}`, source_url: PAGES[0], summary: 'A real enough summary here.', kind: 'job' }))), PAGES);
check(`found items are capped at ${MAX_FOUND_PER_RUN}`, flood.length === MAX_FOUND_PER_RUN);
const dupes = parseOpportunities(JSON.stringify([
  { title: 'Same Op', source_url: PAGES[0], summary: 'First sighting of the item.', kind: 'job' },
  { title: 'same  op', source_url: PAGES[0] + '?utm=x', summary: 'Second sighting, tracking params.', kind: 'job' },
]), [PAGES[0], PAGES[0] + '?utm=x']);
check('in-batch dupes collapse (case/query/slash-insensitive identity)', dupes.length === 1);

// ---- dedupeKey ----
check('dedupeKey strips query, hash, trailing slash and case', dedupeKey('https://A.example.com/jobs/?q=1#top', 'Mural  Op') === dedupeKey('https://a.example.com/jobs', 'mural op'));
check('dedupeKey survives an unparseable url', dedupeKey('not-a-url', 'T').includes('::t'));

// ---- huntLine ----
check('found line points at the feed and reports unreadable pages', huntLine('murals', 3, 5, 2, 1).includes('review them in the feed') && huntLine('murals', 3, 5, 2, 1).includes('unreadable'));
check('empty line is honest about zero', huntLine('murals', 4, 6, 0, 0).includes('nothing new'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} opportunityHunt check(s) failed`);
