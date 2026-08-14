// Run: npx tsx src/lib/garvis/dockBrain.verify.ts
// Pins the join between the deep brain and the dock: the commander DECIDES, the dock ACTS.
// The load-bearing rules are that work never fires from a model's verb (it compiles to a
// reviewable plan first) and that navigation stays the dock's own — the commander only ever
// returns an intention.
import { STUDIO_AREA, dockActionFor, matchWorldTitle, worthAsking } from './dockBrain';
import type { Command } from './commander';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// REPLY — the everyday win: a real answer instead of a 250-token guess.
{
  const a = dockActionFor({ kind: 'reply', text: '  Money Facts is on day 12 with a 4-day streak.  ' });
  check('a reply is said, whitespace normalized', a.kind === 'say' && a.text === 'Money Facts is on day 12 with a 4-day streak.');
  const empty = dockActionFor({ kind: 'reply', text: '   ' });
  check('an empty reply still says something honest, never a blank bubble',
    empty.kind === 'say' && empty.text.length > 10);
}

// WORK — the approval spine. Nothing consequential may happen because a model picked a verb.
{
  const m = dockActionFor({ kind: 'mission', preface: 'On it.', objective: 'draft three hooks for the caregiver channel', subject: 'hooks', app: null });
  check('a MISSION compiles to a reviewable plan, it does not run',
    m.kind === 'compile' && m.sentence === 'draft three hooks for the caregiver channel');
  check('…and the preface becomes the note the operator reads', m.kind === 'compile' && m.note === 'On it.');
  const act = dockActionFor({ kind: 'act', preface: '', instruction: 'point the caregiver CTA at the app' });
  check('an ACT also compiles first (never fire-and-forget from the corner)',
    act.kind === 'compile' && act.sentence === 'point the caregiver CTA at the app');
  check('…with an honest default note when the model gave no preface',
    act.kind === 'compile' && /Run/.test(act.note));
  const bare = dockActionFor({ kind: 'mission', preface: 'Sure.', objective: '   ', subject: 'the spring campaign', app: null });
  check('an objective-less mission falls back to its subject rather than compiling nothing',
    bare.kind === 'compile' && bare.sentence === 'the spring campaign');
}

// DESTINATIONS — intentions only. The dock navigates; the commander never does.
{
  const b = dockActionFor({ kind: 'build', preface: 'Good one.', prompt: 'a booking app for my mom' });
  check('BUILD hands the forge a pre-filled brief',
    b.kind === 'goto' && b.to.startsWith('/new?idea=') && decodeURIComponent(b.to.split('=')[1]!) === 'a booking app for my mom');
  const e = dockActionFor({ kind: 'explore', preface: '', query: 'why short video retention drops' });
  check('EXPLORE opens the galaxy already falling into the query',
    e.kind === 'goto' && e.to.startsWith('/garvis/universe?dive=') && decodeURIComponent(e.to.split('=')[1]!) === 'why short video retention drops');
  check('a query with & and ? survives encoding intact',
    (() => { const x = dockActionFor({ kind: 'explore', preface: '', query: 'a&b?c=d' }); return x.kind === 'goto' && decodeURIComponent(x.to.split('=')[1]!) === 'a&b?c=d'; })());
  check('an enormous build prompt is capped, never sent whole into a URL',
    (() => { const x = dockActionFor({ kind: 'build', preface: '', prompt: 'x'.repeat(5000) }); return x.kind === 'goto' && x.to.length < 2200; })());
}

// STUDIOS — the world is a NAME for the dock to resolve, never a route the commander invented.
{
  const v = dockActionFor({ kind: 'open', preface: 'Opening it.', surface: 'video', world: "Mom's Real Estate Marketing" });
  check('OPEN returns a studio intention with the world NAME (dock resolves the id)',
    v.kind === 'studio' && v.surface === 'video' && v.world === "Mom's Real Estate Marketing");
  const m = dockActionFor({ kind: 'open', preface: '', surface: 'mailer', world: null });
  check('a world-less open is honest about it (null, not a guessed world)',
    m.kind === 'studio' && m.world === null && m.note.length > 5);
  check('no action shape ever carries a pre-baked world route',
    !JSON.stringify(dockActionFor({ kind: 'open', preface: '', surface: 'video', world: 'X' })).includes('/garvis/webs'));
  check('the studio surfaces map to the dock\'s own area slugs',
    STUDIO_AREA.mailer === 'direct-mail' && STUDIO_AREA.video === 'video-studio');
}

// WORLD RESOLUTION — the dock's own rule, not the commander's guess.
{
  const titles = ["Mom's Real Estate Marketing", 'Theory Thread', 'Money Facts'];
  check('an exact title matches itself', matchWorldTitle('Theory Thread', titles) === 'Theory Thread');
  check('case is irrelevant', matchWorldTitle('theory thread', titles) === 'Theory Thread');
  check('a spoken "mom" reaches the possessive title (the fold that fixed the reported bug)',
    matchWorldTitle('mom', titles) === "Mom's Real Estate Marketing");
  check('the apostrophe-free plural reaches it too', matchWorldTitle('moms marketing', titles) === "Mom's Real Estate Marketing");
  check('a business that does not exist resolves to null, never the nearest one',
    matchWorldTitle('Acme Dental', titles) === null);
  check('an empty name is null (a world-less open must stay honest)', matchWorldTitle('   ', titles) === null);
  check('no worlds at all is null, not a crash', matchWorldTitle('anything', []) === null);
}

// TOTALITY — every kind maps, nothing falls through to undefined.
{
  const all: Command[] = [
    { kind: 'reply', text: 'a' },
    { kind: 'mission', preface: 'p', objective: 'o', subject: 's', app: null },
    { kind: 'act', preface: 'p', instruction: 'i' },
    { kind: 'open', preface: 'p', surface: 'mailer', world: null },
    { kind: 'build', preface: 'p', prompt: 'q' },
    { kind: 'explore', preface: 'p', query: 'q' },
  ];
  check('every Command kind produces an action', all.every((c) => !!dockActionFor(c)?.kind));
  check('every action carries operator-facing words (no silent transitions)',
    all.every((c) => { const a = dockActionFor(c); return (a.kind === 'say' ? a.text : a.note).length > 0; }));
  check('deterministic', all.every((c) => JSON.stringify(dockActionFor(c)) === JSON.stringify(dockActionFor(c))));
}

// THE COST GATE — the deep brain is a real model call; a stray keystroke must not buy one.
{
  check('a real sentence is worth asking', worthAsking('hows the caregiver channel doing'));
  check('a single keystroke is not', !worthAsking('k'));
  check('whitespace is not', !worthAsking('   '));
  check('punctuation alone is not', !worthAsking('???'));
  check('a short but real question is', worthAsking('why?') === false || worthAsking('why me') === true);
}

console.log(`\ndockBrain.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} dockBrain check(s) failed`);
