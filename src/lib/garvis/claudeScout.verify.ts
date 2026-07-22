// Run: npx tsx src/lib/garvis/claudeScout.verify.ts
import { buildScoutPrompt, citationHosts, groundScoutLeads, SCOUT_SYSTEM } from './claudeScout';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('claudeScout.verify');

// ── prompt ───────────────────────────────────────────────────────────────
const p = buildScoutPrompt('plumber', 'Dallas', 'TX');
check('prompt names the business type and city/state', p.includes('plumber') && p.includes('Dallas, TX'));
check('system prompt forbids inventing + demands a source', /NEVER invent/i.test(SCOUT_SYSTEM) && /source/i.test(SCOUT_SYSTEM));
check('system prompt asks for a site_verdict', SCOUT_SYSTEM.includes('site_verdict'));

// ── citation hosts ───────────────────────────────────────────────────────
const hosts = citationHosts(['Joe Plumbing — https://www.joesplumbing.com/about', 'Yelp — https://www.yelp.com/biz/x']);
check('citationHosts strips scheme/www/path to bare host', hosts.has('joesplumbing.com') && hosts.has('yelp.com'));
check('citationHosts ignores non-URL strings', citationHosts(['just some text', '']).size === 0);

const SRC = ['Joe Plumbing — https://www.joesplumbing.com', 'Yelp Dallas — https://www.yelp.com/biz/dallas'];

// ── grounding: a business on its own cited site is kept, verdict persisted ──
const own = groundScoutLeads(
  '{"businesses":[{"name":"Joe Plumbing","website":"https://joesplumbing.com","site_verdict":"outdated","source":"https://joesplumbing.com"}]}',
  SRC, 'plumber', 'Dallas', 'TX');
check('grounded-by-own-website lead is kept', own.grounded === 1 && own.leads.length === 1);
check('site verdict is persisted into category', own.leads[0].category === 'outdated');
check('has_website true when a real site is present', own.leads[0].has_website === true);
check('keyword set + city/state fall back when the row omits them', own.leads[0].keyword === 'plumber' && own.leads[0].city === 'Dallas' && own.leads[0].state === 'TX');

// ── grounding: a no-website business found on a cited directory is kept ─────
const dir = groundScoutLeads(
  '[{"name":"Acme Drains","website":null,"site_verdict":"no website","source":"https://www.yelp.com/biz/dallas","city":"Dallas","state":"TX"}]',
  SRC, 'plumber', 'Dallas', 'TX');
check('no-website lead grounded on a cited directory is kept', dir.grounded === 1);
check('no-website lead has has_website=false (best sell target)', dir.leads[0].has_website === false && dir.leads[0].website_normalized === null);

// ── the anti-hallucination floor: no citation match ⇒ DROPPED ──────────────
const ghost = groundScoutLeads(
  '{"businesses":[{"name":"Ghost Plumbing","website":"https://ghost-that-was-never-cited.com","site_verdict":"template","source":"https://also-not-cited.com"}]}',
  SRC, 'plumber', 'Dallas', 'TX');
check('a business tied to NO cited host is dropped (never persisted)', ghost.grounded === 0 && ghost.dropped === 1 && ghost.leads.length === 0);

// ── zero citations ⇒ nothing is trusted ────────────────────────────────────
const noCites = groundScoutLeads('{"businesses":[{"name":"X","website":"https://x.com","source":"https://x.com"}]}', [], 'plumber', 'Dallas', 'TX');
check('with no citations at all, every business is dropped', noCites.grounded === 0 && noCites.dropped === 1);

// ── rows missing a name are unusable ───────────────────────────────────────
const noName = groundScoutLeads('{"businesses":[{"website":"https://joesplumbing.com","source":"https://joesplumbing.com"}]}', SRC, 'plumber', 'Dallas', 'TX');
check('a row with no business name is dropped', noName.grounded === 0 && noName.dropped === 1);

// ── garbage never throws ───────────────────────────────────────────────────
const garbage = groundScoutLeads('sorry, I could not find anything useful here.', SRC, 'plumber', 'Dallas', 'TX');
check('non-JSON response yields zero leads (no throw)', garbage.leads.length === 0 && garbage.parsed === 0);
const fenced = groundScoutLeads('```json\n{"businesses":[{"name":"Joe Plumbing","website":"https://joesplumbing.com","source":"https://joesplumbing.com"}]}\n```', SRC, 'plumber', 'Dallas', 'TX');
check('fenced ```json``` is parsed', fenced.grounded === 1);

// ── "null"-as-string and blanks are treated as absent ──────────────────────
const nully = groundScoutLeads('[{"name":"Joe Plumbing","website":"null","phone":"N/A","source":"https://www.yelp.com/biz/dallas"}]', SRC, 'plumber', 'Dallas', 'TX');
check('"null"/"N/A" string values normalize to null', nully.grounded === 1 && nully.leads[0].website === null && nully.leads[0].phone === null && nully.leads[0].has_website === false);

console.log(`\nclaudeScout.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} claudeScout check(s) failed`);
