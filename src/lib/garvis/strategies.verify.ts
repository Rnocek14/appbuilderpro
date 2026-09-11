// Run: npx tsx src/lib/garvis/strategies.verify.ts
// Pins SW9.2 around the fuzz-covered parser: the propose engine is credits-gated and
// grounded-by-construction, the world disclosure adds NO new primary action, nothing in the
// spine can send, and only ADOPTED strategies reach the waking moment.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAdoptedStrategies } from './nextMove';
import { parseStrategies } from './strategies';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE WAKING MOMENT — adopted rows speak; the cap holds; identity is stable.
{
  const rows = [
    { id: 's1', title: 'Push Tuesday sends', world_id: 'w1', created_at: '2026-08-15T08:00:00Z' },
    { id: 's2', title: 'Channel-first growth', world_id: null, created_at: '2026-08-14T08:00:00Z' },
    { id: 's3', title: 'Third strategy', world_id: 'w3', created_at: '2026-08-13T08:00:00Z' },
  ];
  const moves = collectAdoptedStrategies(rows);
  check('adopted strategies surface as moves, capped at two', moves.length === 2);
  check('the key is stable identity (dedupe/dismissal works)', moves[0]!.key === 'strategy:s1');
  check('the action routes to the strategy\'s own business', moves[0]!.action.route === '/garvis/webs/w1');
  check('…and to the businesses page when unscoped', moves[1]!.action.route === '/garvis/webs');
  check('the honesty tag is structural — the operator adopted it, nothing is inferred',
    moves.every((m) => m.expected?.basis === 'structural'));
  check('no rows, no moves', collectAdoptedStrategies([]).length === 0);
}

// A bare world's proposals are heuristic BY CONSTRUCTION (the empty-facts path).
{
  const bare = parseStrategies(JSON.stringify([
    { title: 'A', rationale: 'r', basis: 'measured', evidence: [] },
    { title: 'B', rationale: 'r', basis: 'measured', evidence: ['anything at all'] },
  ]), []);
  check('with zero facts, every claimed-measured proposal relabels heuristic',
    bare.length === 2 && bare.every((d) => d.basis === 'heuristic' && d.evidence.length === 0));
}

// ---- the wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const fn = readFileSync(join(root, 'supabase/functions/propose-strategies/index.ts'), 'utf8');
const panel = readFileSync(join(root, 'src/components/garvis/StrategiesPanel.tsx'), 'utf8');
const workweb = readFileSync(join(root, 'src/pages/WorkWeb.tsx'), 'utf8');
const run = readFileSync(join(here, 'strategiesRun.ts'), 'utf8');
const moveRun = readFileSync(join(here, 'nextMoveRun.ts'), 'utf8');
{
  check('the engine parses through the fuzz-covered gauntlet, never its own regex',
    fn.includes('parseStrategies(res.text, facts)'));
  check('proposals land PROPOSED — adoption is the operator\'s act alone', fn.includes("status: 'proposed'"));
  check('credits gate BEFORE the model call, spend recorded after',
    fn.indexOf("checkCredits(admin, ownerId, 'plan')") > 0
    && fn.indexOf("checkCredits(admin, ownerId, 'plan')") < fn.indexOf('await complete([')
    && fn.includes('spendCredits(admin, ownerId,'));
  check('frontier tier through the plan-gated seam', fn.includes('brainModelForPlan(await getUserPlan('));
  check('the world lookup is owner-scoped', fn.includes(".eq('id', body.world_id).eq('owner_id', ownerId)"));
  check('the prompt rides the quarantine', fn.includes('quarantineExternal('));
  check('thin proposals refuse honestly instead of filing filler', fn.includes('too thin to file'));
  check('the engine touches no send path', !/send-email|send-sms|social-publish|api\.twilio|resend\.com/.test(fn));

  check('the disclosure lives in the chip strip, closed by default',
    workweb.includes("['strategies', 'Strategies']") && workweb.includes("preamble === 'strategies'"));
  check('NO new orange button — the panel\'s propose action is a plain bordered button',
    !panel.includes('variant="primary"') && !panel.includes('bg-forge-ember/10 px-2.5'));
  check('the empty state names the one next step and says nothing sends',
    panel.includes('Nothing sends'));
  check('a heuristic chip says what it is, never fake confidence',
    panel.includes('No measured rows behind this yet'));
  check('adopt/retire are the only mutations the client can make',
    run.includes("setStrategyStatus(id: string, status: 'adopted' | 'retired')") && !run.includes(".insert("));
  check('the waking moment fetches ADOPTED rows only, fail-soft',
    moveRun.includes(".eq('status', 'adopted')") && moveRun.includes('() => []'));
}

console.log(`\nstrategies.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} strategies check(s) failed`);
