// Run: npx tsx src/lib/garvis/field.verify.ts
// The Field's contract (SW10.8): every input combination maps to exactly ONE orb state under a
// total, explicit precedence (warn > ember > green > dim); lines count instead of adjectivize;
// the whisper carries the queue's whole truth; and the door is an explicit chip on Command.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orbState, orbLine, composeField, approvalsWhisper, type OrbInput } from './field';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- EVERY combination → exactly one state (the full 2×2×2 truth table) ----
const combos: { input: OrbInput; want: string }[] = [
  { input: { working: false, needsYou: 0, news: 0 }, want: 'dim' },
  { input: { working: false, needsYou: 0, news: 3 }, want: 'green' },
  { input: { working: false, needsYou: 2, news: 0 }, want: 'warn' },
  { input: { working: false, needsYou: 2, news: 3 }, want: 'warn' },
  { input: { working: true, needsYou: 0, news: 0 }, want: 'ember' },
  { input: { working: true, needsYou: 0, news: 3 }, want: 'ember' },
  { input: { working: true, needsYou: 2, news: 0 }, want: 'warn' },
  { input: { working: true, needsYou: 2, news: 3 }, want: 'warn' },
];
for (const c of combos) {
  check(`{working:${c.input.working}, needsYou:${c.input.needsYou}, news:${c.input.news}} → ${c.want}`,
    orbState(c.input) === c.want);
}
check('the precedence is total: a decision outranks work outranks news outranks quiet',
  orbState({ working: true, needsYou: 1, news: 9 }) === 'warn'
  && orbState({ working: true, needsYou: 0, news: 9 }) === 'ember');

// ---- lines: counts, never adjectives ----
check('warn counts its decisions', orbLine({ working: true, needsYou: 2, news: 0 }) === '2 decisions waiting');
check('singular grammar holds', orbLine({ working: false, needsYou: 1, news: 0 }) === '1 decision waiting');
check('quiet says quiet', orbLine({ working: false, needsYou: 0, news: 0 }) === 'quiet');
check('news counts', orbLine({ working: false, needsYou: 0, news: 1 }) === '1 new thing since yesterday');

// ---- composition ----
{
  const field = composeField(
    [{ id: 'a', title: 'Bakery' }, { id: 'b', title: 'Realty' }, { id: 'c', title: 'SaaS' }],
    new Set(['a']),
    new Map([['b', 3]]),
    new Map([['c', 1]]),
  );
  check('each world derives its own state from its own rows',
    field.map((w) => w.state).join() === 'ember,warn,green');
  check('a world with no rows is honestly dim',
    composeField([{ id: 'x', title: 'New' }], new Set(), new Map(), new Map())[0].state === 'dim');
  check('order is preserved (the caller ranks by recency)', field.map((w) => w.id).join() === 'a,b,c');
}
check('the whisper carries the total, singular and plural',
  approvalsWhisper(1) === '1 decision waiting in the Queue' && approvalsWhisper(4).startsWith('4 decisions'));
check('nothing waiting, no whisper (no empty chrome)', approvalsWhisper(0) === '');

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const run = readFileSync(join(here, 'fieldRun.ts'), 'utf8');
const page = readFileSync(join(root, 'src/pages/Field.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const command = readFileSync(join(root, 'src/pages/Command.tsx'), 'utf8');
{
  check('the loader composes through the pure core, not a private copy',
    run.includes('composeField(worlds, working, approvalsByWorld, newsByWorld)'));
  check('the whisper includes decisions with NO world attribution (the queue\'s whole truth)',
    run.includes('totalPending = rows.length'));
  check('signals are independent and fail-soft (a broken source never fakes a state)',
    (run.match(/catch \{ \/\* no /g) ?? []).length >= 3);
  check('the route exists', app.includes('path="/garvis/field"'));
  check('the door is an explicit chip on Command, removable at the checkpoint',
    command.includes("navigate('/garvis/field')") && command.includes('The Field (preview)'));
  check('a load failure renders as a load failure, never as a quiet field',
    page.includes('a load error, not a quiet day'));
  check('the fresh account gets the ONE next step',
    page.includes('Start your first business'));
  check('orbs are real buttons that step into the world',
    page.includes('onClick={() => navigate(`/garvis/webs/${w.id}`)}'));
  check('the whisper links the one place decisions happen', page.includes("navigate('/garvis/queue')"));
}

console.log(`\nfield.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} field check(s) failed`);
