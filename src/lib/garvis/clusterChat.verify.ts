// src/lib/garvis/clusterChat.verify.ts
// Standalone verification of the Cluster Studio chat pure core (run: `npm run verify:clusterchat`).
// Guards: context budget + ordering, tolerant decision parsing (garbage → reply, never throw,
// nothing unsafe from malformed output), approval-kind whitelist, diff correctness.

import {
  compileStudioContext, buildStudioUser, parseStudioDecision, describeDecision, diffLines,
  PROPOSABLE_APPROVAL_KINDS, STUDIO_SYSTEM,
  type StudioContextInput, type StudioTurn,
} from './clusterChat';
import { makeCharter, toolsFor } from './workweb';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const charter = makeCharter('studio', 'direct_mail');
const baseInput: StudioContextInput = {
  webTitle: 'Mom Real Estate Marketing',
  objective: 'Win lakefront listings',
  cluster: { title: 'Creative', summary: 'Postcard concepts, copy variants, design versions.', charter },
  tools: toolsFor(charter),
  artifacts: [
    { slug: 'postcard-a', kind: 'post', title: 'Postcard A', detail: 'FRONT: Your shoreline has a number.', revision: 2 },
    { slug: 'postcard-b', kind: 'post', title: 'Postcard B', detail: 'FRONT: The buyer is already here.', revision: 1 },
  ],
  files: [{ name: 'lake-dawn.jpg', kind: 'image' }],
  brandKit: { tone: 'calm, private, zero hype', palette: ['#0C0E13', '#FF8A3D'], compliance_line: '@properties' },
  audience: { lists: 2, contacts: 140 },
  results: { sent: 5, replies: 1, pendingApprovals: 1 },
};

// 1. Context compilation: ordering, content, budget.
{
  const ctx = compileStudioContext(baseInput);
  check('context leads with the studio identity', ctx.startsWith('STUDIO: Creative — Studio (direct_mail)'));
  check('context carries brand tone', ctx.includes('calm, private, zero hype'));
  check('context lists artifacts with slug + revision', ctx.includes('[postcard-a] (post, v2)'));
  check('context carries audience + results', ctx.includes('2 list(s)') && ctx.includes('sent 5'));
  check('context includes files', ctx.includes('lake-dawn.jpg'));

  const big: StudioContextInput = {
    ...baseInput,
    artifacts: Array.from({ length: 12 }, (_, i) => ({
      slug: `a-${i}`, kind: 'doc', title: `Artifact ${i}`, detail: 'x'.repeat(5000), revision: 1,
    })),
  };
  const bounded = compileStudioContext(big, 7000);
  check('context respects the byte budget', bounded.length <= 7000);
  check('bounded context still leads with identity', bounded.startsWith('STUDIO:'));

  // The audit fix: the studio must know WHOSE business it's writing for — and what it doesn't know.
  const withBiz = compileStudioContext({
    ...baseInput,
    business: {
      name: 'Nocek Realty', principal: 'Mom', craft: 'residential real estate',
      offerings: ['listings', 'buyer representation'], audience: 'lake-area home sellers',
      locale: 'Lake Geneva WI', tone: 'warm, direct',
      dnaLines: ['value: local expertise sellers trust', 'model: commission on closed listings'],
    },
    openQuestions: ['What is the average commission split?'],
  });
  check('context carries the BUSINESS identity block', withBiz.includes('BUSINESS: name: Nocek Realty') && withBiz.includes('audience: lake-area home sellers'));
  check('context carries DNA lines', withBiz.includes('DNA — value: local expertise sellers trust'));
  check('context carries known unknowns (never to be guessed)', withBiz.includes('KNOWN UNKNOWNS') && withBiz.includes('commission split'));
  check('no business block → no invented one', !compileStudioContext(baseInput).includes('BUSINESS:'));
  check('system prompt tells the model to speak the business voice, never invent', STUDIO_SYSTEM.includes('ITS voice') && STUDIO_SYSTEM.includes('rather than inventing'));
}

// 2. buildStudioUser: history capped, message present.
{
  const history: StudioTurn[] = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'garvis' : 'user', content: `turn ${i}` }));
  const u = buildStudioUser('CTX', history, 'make it more luxury');
  check('user prompt carries the ask', u.includes('OWNER SAYS: make it more luxury'));
  check('history capped to last 6 turns', !u.includes('turn 13') && u.includes('turn 19'));
}

// 3. Decision parsing — the four kinds.
{
  const r = parseStudioDecision('{"kind":"reply","text":"Target the lakefront list first."}');
  check('parses reply', r.kind === 'reply' && r.text.includes('lakefront'));

  const c = parseStudioDecision(JSON.stringify({
    kind: 'create_artifact', note: 'made a letter',
    artifact: { slug: 'Letter One!', kind: 'doc', title: 'Seller letter', detail: 'Dear neighbor…' },
  }));
  check('parses create_artifact + normalizes slug', c.kind === 'create_artifact' && c.artifact.slug === 'letter-one');
  check('create defaults bad kind to doc', (() => {
    const x = parseStudioDecision('{"kind":"create_artifact","artifact":{"kind":"nuke","title":"T","detail":"D"}}');
    return x.kind === 'create_artifact' && x.artifact.kind === 'doc';
  })());

  const v = parseStudioDecision('{"kind":"revise_artifact","slug":"postcard-a","detail":"FRONT: Quietly, your shoreline appreciated.","note":"more luxury"}');
  check('parses revise_artifact', v.kind === 'revise_artifact' && v.slug === 'postcard-a' && v.note === 'more luxury');

  const a = parseStudioDecision('{"kind":"propose_approval","approval_kind":"crm_action","title":"Log follow-up call","preview":"Call the seller Tuesday","note":"queued"}');
  check('parses propose_approval', a.kind === 'propose_approval' && a.approval_kind === 'crm_action');
}

// 4. Safety: malformed/unsafe output degrades to reply — never throws, never acts.
{
  check('garbage prose → reply', parseStudioDecision('I think you should send it now!').kind === 'reply');
  check('unknown kind → reply', parseStudioDecision('{"kind":"send_everything_now"}').kind === 'reply');
  check('approval kind outside whitelist → reply', parseStudioDecision('{"kind":"propose_approval","approval_kind":"launch_missiles","title":"t","preview":"p"}').kind === 'reply');
  check('apply_migration is NOT proposable from chat', !(PROPOSABLE_APPROVAL_KINDS as readonly string[]).includes('apply_migration'));
  check('send_email is NOT proposable from chat (needs a constructed message)', parseStudioDecision('{"kind":"propose_approval","approval_kind":"send_email","title":"t","preview":"p"}').kind === 'reply');
  check('spend is NOT proposable from chat', !(PROPOSABLE_APPROVAL_KINDS as readonly string[]).includes('spend'));
  check('revise without detail → reply', parseStudioDecision('{"kind":"revise_artifact","slug":"postcard-a"}').kind === 'reply');
  check('create without title → reply', parseStudioDecision('{"kind":"create_artifact","artifact":{"kind":"doc","detail":"D"}}').kind === 'reply');
  check('fenced JSON still parses', parseStudioDecision('```json\n{"kind":"reply","text":"hi"}\n```').kind === 'reply');
  check('empty string → reply, never throws', parseStudioDecision('').kind === 'reply');
}

// 5. System prompt states the contract + the safety rule.
check('system prompt names all four decisions', ['"reply"', 'create_artifact', 'revise_artifact', 'propose_approval'].every((k) => STUDIO_SYSTEM.includes(k)));
check('system prompt states the cannot-send rule', STUDIO_SYSTEM.includes('cannot send') || STUDIO_SYSTEM.includes('You cannot send'));

// 6. describeDecision.
check('describeDecision summarizes approval', describeDecision({ kind: 'propose_approval', approval_kind: 'crm_action', title: 't', preview: 'p', note: 'Queued a follow-up' }).includes('Approvals'));

// 7. diffLines.
{
  const d = diffLines('a\nb\nc', 'a\nB\nc\nd');
  const shape = d.map((l) => `${l.type[0]}${l.text}`).join('|');
  check('diff marks changed + added lines', shape === 'sa|rb|aB|sc|ad', shape);
  check('diff of identical text is all same', diffLines('x\ny', 'x\ny').every((l) => l.type === 'same'));
  check('diff of empty→text is all added', diffLines('', 'x\ny').filter((l) => l.type === 'added').length === 2);
}

console.log(`\nclusterChat.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} clusterChat check(s) failed`);
