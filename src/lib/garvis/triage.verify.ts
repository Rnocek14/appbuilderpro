// src/lib/garvis/triage.verify.ts
// Standalone verification of the triage pure helpers (run: `npm run verify:triage`).
// No DB, no model, no test framework (matches the other garvis verify suites).

import { buildTriageUser, parseTriageResponse, groupVerdicts, applyStrategicGuard } from './triage';
import type { TriageAppInput, TriageVerdict } from './triage';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const apps: TriageAppInput[] = [
  { id: 'a1', name: 'LaunchBuddy', stage: 'launched', deployUrl: 'https://lb.app', monthlyRevenue: 0, lastActivity: '2026-06-20T00:00:00Z', liveness: 'live', profile: { purpose: 'Stripe plumbing', blocker: 'no users', next_milestone: 'get first user' } },
  { id: 'a2', name: 'DeadExperiment', stage: 'building', deployUrl: null, monthlyRevenue: 0, lastActivity: '2025-01-01T00:00:00Z', liveness: 'not_deployed', profile: null },
];

// 1. Prompt build folds in evidence + goals.
const prompt = buildTriageUser({ apps, goals: ['Reach $1k MRR — metric: MRR'] });
check('prompt includes app ids (so the model can return them)', prompt.includes('id: a1') && prompt.includes('id: a2'));
check('prompt includes the active goal', prompt.includes('Reach $1k MRR'));
check('prompt includes liveness', prompt.includes('liveness: live') && prompt.includes('liveness: not_deployed'));
check('prompt includes profile blocker when present', prompt.includes('no users'));
const noGoals = buildTriageUser({ apps, goals: [] });
check('prompt notes when no goals are set', noGoals.includes('none set'));

// 2. Tolerant parse of a clean response.
const clean = parseTriageResponse(
  '{"summary":"Mostly dead.","focus_app_id":"a1","verdicts":[{"app_id":"a1","verdict":"keep","reason":"live, has a path","confidence":0.8},{"app_id":"a2","verdict":"archive","reason":"dead 18mo","confidence":0.9}]}',
);
check('parses summary', clean.summary === 'Mostly dead.');
check('parses focus app', clean.focusAppId === 'a1');
check('parses both verdicts', clean.verdicts.length === 2);
check('keeps the keep verdict', clean.verdicts[0].verdict === 'keep' && clean.verdicts[0].appId === 'a1');
check('clamps confidence', clean.verdicts[1].confidence === 0.9);

// 3. Fenced JSON + prose around it.
const fenced = parseTriageResponse('Here:\n```json\n{"summary":"x","verdicts":[{"app_id":"a1","verdict":"reconsider","reason":"unclear"}]}\n```');
check('parses fenced verdicts', fenced.verdicts.length === 1 && fenced.verdicts[0].verdict === 'reconsider');
check('missing confidence becomes null', fenced.verdicts[0].confidence === null);

// 4. Garbage never throws.
const garbage = parseTriageResponse('the model wrote an essay');
check('garbage parse returns empty report (no throw)', garbage.verdicts.length === 0 && garbage.focusAppId === null);

// 5. Hallucinated ids + unknown verdicts are dropped when a known-id set is supplied.
const guarded = parseTriageResponse(
  '{"summary":"s","focus_app_id":"ghost","verdicts":[{"app_id":"a1","verdict":"keep","reason":"r"},{"app_id":"ghost","verdict":"archive","reason":"r"},{"app_id":"a2","verdict":"nuke","reason":"r"}]}',
  new Set(['a1', 'a2']),
);
check('drops verdict for an unknown app id', !guarded.verdicts.some((v) => v.appId === 'ghost'));
check('drops verdict with an invalid verdict value', !guarded.verdicts.some((v) => v.appId === 'a2'));
check('keeps the valid verdict', guarded.verdicts.length === 1 && guarded.verdicts[0].appId === 'a1');
check('nulls out a hallucinated focus id', guarded.focusAppId === null);

// 6. Grouping.
const grouped = groupVerdicts(clean.verdicts);
check('groups keep + archive into their buckets', grouped.keep.length === 1 && grouped.archive.length === 1 && grouped.reconsider.length === 0);

// 7. suggested_importance parses only valid enums, only matters when set.
const sugg = parseTriageResponse('{"verdicts":[{"app_id":"a1","verdict":"archive","reason":"r","suggested_importance":"supporting"},{"app_id":"a2","verdict":"keep","reason":"r","suggested_importance":"nonsense"}]}');
check('parses a valid suggested_importance', sugg.verdicts[0].suggestedImportance === 'supporting');
check('drops an invalid suggested_importance to null', sugg.verdicts[1].suggestedImportance === null);

// 8. The strategic guard (code-level defense-in-depth) overrides the model.
const raw: TriageVerdict[] = [
  { appId: 'core1', verdict: 'archive', reason: 'looks idle', confidence: 0.9 },
  { appId: 'sup1', verdict: 'archive', reason: 'no traffic', confidence: 0.8 },
  { appId: 'exp1', verdict: 'archive', reason: 'dead', confidence: 0.9 },
  { appId: 'core2', verdict: 'keep', reason: 'fine', confidence: 0.7 },
];
const guardedVerdicts = applyStrategicGuard(raw, { core1: 'core', sup1: 'supporting', exp1: 'experimental', core2: 'core' });
check('core app can NEVER be archived (forced to keep)', guardedVerdicts[0].verdict === 'keep' && guardedVerdicts[0].guarded === true);
check('supporting app archive is softened to reconsider', guardedVerdicts[1].verdict === 'reconsider' && guardedVerdicts[1].guarded === true);
check('experimental app archive is left untouched', guardedVerdicts[2].verdict === 'archive' && !guardedVerdicts[2].guarded);
check('already-keep core app is not flagged as guarded', guardedVerdicts[3].verdict === 'keep' && !guardedVerdicts[3].guarded);

// 9. The strategic lens shows up in the prompt.
const stratPrompt = buildTriageUser({
  apps: [{ id: 'a1', name: 'TheoryThread', stage: 'building', deployUrl: null, monthlyRevenue: 0, lastActivity: null, liveness: 'not_deployed', importance: 'core', strategicRole: 'future intelligence layer' }],
  goals: [],
});
check('prompt surfaces strategic importance', stratPrompt.includes('STRATEGIC IMPORTANCE: core'));
check('prompt surfaces strategic role', stratPrompt.includes('future intelligence layer'));
check('prompt marks unset importance', buildTriageUser({ apps: [{ id: 'a2', name: 'X', stage: 'building', deployUrl: null, monthlyRevenue: 0, lastActivity: null, liveness: 'unknown' }], goals: [] }).includes('STRATEGIC IMPORTANCE: UNSET'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} triage check(s) failed`);
