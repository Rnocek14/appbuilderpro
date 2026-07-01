// src/lib/garvis/knowledge.verify.ts
// Standalone verification of the knowledge-layer invariants (run: `npm run verify:knowledge`).
// No DB, no test framework — pure-function asserts, matching this repo's qaCheck verification pattern.
//   1. Unapproved knowledge never enters memory.
//   2. Approved knowledge is retrieved into future context.
//   3. A generated short is always marked script-only (the model cannot override honesty).

import { selectApproved, buildKnowledgeDigest, normalizeShortScript } from './knowledge';
import type { GarvisKnowledge, KnowledgeStatus } from '../../types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

function row(status: KnowledgeStatus, over: Partial<GarvisKnowledge> = {}): GarvisKnowledge {
  return {
    id: `id-${status}-${over.title ?? 'x'}`,
    owner_id: 'owner',
    app_id: null,
    run_id: null,
    kind: 'lesson',
    title: over.title ?? 'Title',
    body: over.body ?? 'Body',
    source: 'run',
    confidence: 0.8,
    status,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    approved_at: null,
    approved_by: null,
    ...over,
  };
}

// 1. Unapproved knowledge does not enter memory.
const mixed = [
  row('proposed', { title: 'ProposedItem', body: 'proposed-body' }),
  row('approved', { title: 'ApprovedItem', body: 'approved-body' }),
  row('rejected', { title: 'RejectedItem', body: 'rejected-body' }),
];
const approvedOnly = selectApproved(mixed);
check('selectApproved returns only approved rows', approvedOnly.length === 1 && approvedOnly[0].title === 'ApprovedItem');
check('digest of proposed-only knowledge is empty',
  buildKnowledgeDigest([row('proposed'), row('rejected')]) === '');
const mixedDigest = buildKnowledgeDigest(mixed);
check('digest excludes the proposed/rejected items',
  !mixedDigest.includes('ProposedItem') && !mixedDigest.includes('RejectedItem')
  && !mixedDigest.includes('proposed-body') && !mixedDigest.includes('rejected-body'));

// 2. Approved lesson is retrieved into future context.
const digest = buildKnowledgeDigest([row('approved', { title: 'Onboarding matters', body: 'Add a guided first run' })]);
check('digest contains the approved lesson title', digest.includes('Onboarding matters'));
check('digest contains the approved lesson body', digest.includes('Add a guided first run'));

// 3. Generated short is always script-only (model cannot lie).
const dishonest = normalizeShortScript({
  hook: 'h', script: 's', caption: 'c', cta: 'go',
  fidelity: 'full_video', required_approval: false, // model tries to claim a finished video
});
check('normalizeShortScript forces fidelity script_only', dishonest.fidelity === 'script_only');
check('normalizeShortScript forces required_approval true', dishonest.required_approval === true);
check('normalizeShortScript preserves script content', dishonest.script === 's' && dishonest.hook === 'h');

console.log(`\n${passed}/${passed + failed} passed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} knowledge check(s) failed`);
