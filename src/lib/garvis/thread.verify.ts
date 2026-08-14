// Run: npx tsx src/lib/garvis/thread.verify.ts
// Pins the one-conversation record: what earns a place in it, what stays live-only, how a
// surface's optimistic turn reconciles with the durable row, and how thin the corner stays.
import {
  BRAIN_WINDOW, DOCK_SCROLLBACK, THREAD_WINDOW,
  appendTurn, dockScrollback, mergeThread, recentForBrain, unseenTurns, worthKeeping, type ThreadTurn,
} from './thread';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const turn = (id: string, role: 'user' | 'garvis', text: string): ThreadTurn => ({ id, role, text });

// STATUS IS NOT CONVERSATION — the corner prints it, means it, and forgets it.
{
  check('a real answer is kept', worthKeeping('Money Facts is on day 12 with a 4-day streak.'));
  check('an honest refusal is kept (the record must show what it could not do)',
    worthKeeping("I don't see a business named “Acme Dental” — yours are: Money Facts."));
  check('"Thinking…" never reaches the record', !worthKeeping('Thinking…'));
  check('"Compiling the plan…" never reaches the record', !worthKeeping('Compiling the plan…'));
  check('"Revising the plan…" never reaches the record', !worthKeeping('Revising the plan…'));
  check('"Counting…" never reaches the record', !worthKeeping('Counting…'));
  check('a pick-list prompt is live UI, not a said thing', !worthKeeping('Closest matches — tap one:'));
  check('blank is never kept', !worthKeeping('   '));
  check('null is never kept, and does not throw', !worthKeeping(null));
}

// APPEND — bounded, and never stutters the same line twice in a row.
{
  let t: ThreadTurn[] = [];
  t = appendTurn(t, turn('1', 'user', 'hows the caregiver channel doing'));
  t = appendTurn(t, turn('2', 'garvis', 'Day 12, four-day streak.'));
  check('turns accumulate in order', t.length === 2 && t[0]!.role === 'user' && t[1]!.role === 'garvis');
  t = appendTurn(t, turn('3', 'garvis', 'Day 12, four-day streak.'));
  check('the same line twice running is one line', t.length === 2);
  t = appendTurn(t, turn('4', 'garvis', 'Day 12,   four-day   streak.'));
  check('…even when the whitespace differs', t.length === 2);
  t = appendTurn(t, turn('5', 'user', 'hows the caregiver channel doing'));
  check('but the operator asking the same thing again IS a new turn', t.length === 3);

  let big: ThreadTurn[] = [];
  for (let i = 0; i < THREAD_WINDOW + 20; i++) big = appendTurn(big, turn(`b${i}`, 'user', `ask ${i}`));
  check('the window is bounded', big.length === THREAD_WINDOW);
  check('…and it is the RECENT end that survives', big[big.length - 1]!.text === `ask ${THREAD_WINDOW + 19}`);
  check('a caller can hold a tighter window', appendTurn([turn('x', 'user', 'a')], turn('y', 'user', 'b'), 1).length === 1);
}

// MERGE — a round-trip is not a repeat, but a genuine repeat is not a round-trip.
{
  const remote = [turn('r1', 'user', 'draft the episode'), turn('r2', 'garvis', 'Drafted.')];
  const local = [turn('local-uuid', 'garvis', 'Drafted.')];
  check('a turn that round-tripped through the database appears once',
    mergeThread(remote, local).length === 2);
  check('a turn the record has not seen yet survives',
    mergeThread(remote, [turn('l2', 'user', 'now do the postcard')]).length === 3);
  check('…and lands at the end, where it was said',
    mergeThread(remote, [turn('l2', 'user', 'now do the postcard')])[2]!.text === 'now do the postcard');
  check('the same id is never duplicated',
    mergeThread(remote, [turn('r1', 'user', 'draft the episode')]).length === 2);
  const long = Array.from({ length: 30 }, (_, i) => turn(`r${i}`, 'user', `ask ${i}`));
  check('a genuine repeat of something said long ago is kept (only the tail dedupes)',
    mergeThread(long, [turn('new', 'user', 'ask 0')]).length === 31);
  check('an empty record just takes the local turns', mergeThread([], local).length === 1);
}

// CROSS-SURFACE CATCH-UP — a line said in the corner reaches the command page, additively.
{
  const remote = [
    turn('r1', 'user', 'draft the episode'),
    turn('r2', 'garvis', 'Drafted.'),
    turn('r3', 'user', 'now the postcard'),
  ];
  const shown = [{ role: 'user' as const, text: 'draft the episode' }, { role: 'garvis' as const, text: 'Drafted.' }];
  const fresh = unseenTurns(remote, shown);
  check('only the line this surface has not shown comes back', fresh.length === 1 && fresh[0]!.text === 'now the postcard');
  check('a surface showing nothing catches up on everything', unseenTurns(remote, []).length === 3);
  check('a surface already current gets nothing (no flicker, no rewrite)',
    unseenTurns(remote, remote.map((t) => ({ role: t.role, text: t.text }))).length === 0);
  check('matching ignores whitespace drift', unseenTurns(remote, [{ role: 'garvis', text: '  Drafted.  ' }]).length === 2);
  check('role matters — the same words from the other speaker are a different turn',
    unseenTurns([turn('x', 'garvis', 'again')], [{ role: 'user', text: 'again' }]).length === 1);
  check('an empty record catches nobody up', unseenTurns([], shown).length === 0);
}

// THE CORNER STAYS THIN — work first, chrome collapsed.
{
  const many = Array.from({ length: 30 }, (_, i) => turn(`t${i}`, i % 2 ? 'garvis' : 'user', `line ${i}`));
  const back = dockScrollback(many);
  check('the corner shows a short tail, not the whole history', back.length === DOCK_SCROLLBACK);
  check('…ending on the newest thing said', back[back.length - 1]!.text === 'line 29');
  check('a short conversation shows entirely', dockScrollback(many.slice(0, 3)).length === 3);
  check('an empty conversation renders nothing', dockScrollback([]).length === 0);
  check('asking for none is honoured (no accidental full history)', dockScrollback(many, 0).length === 0);
}

// THE BRAIN'S HISTORY — the same record, in the shape the commander already reads.
{
  const many = Array.from({ length: 20 }, (_, i) => turn(`t${i}`, i % 2 ? 'garvis' : 'user', `line ${i}`));
  const recent = recentForBrain(many);
  check('the brain gets the recent turns', recent.length === BRAIN_WINDOW);
  check('…newest last, the way a transcript reads', recent[recent.length - 1]!.text === 'line 19');
  check('…carrying only role and text (no ids leak into a prompt)',
    recent.every((r) => Object.keys(r).sort().join(',') === 'role,text'));
  check('the brain window is smaller than the corner record', BRAIN_WINDOW <= THREAD_WINDOW);
}

console.log(`\nthread.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} thread check(s) failed`);
