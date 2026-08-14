// Run: npx tsx src/lib/garvis/dockPresence.verify.ts
// Pins where the dock is a guest. Found by using the app: Home showed the same conversation
// twice, and in a project the dock sat on the builder's chat and its "Fix with AI" button.
import { dockDeference, opensOnArrival, showsScrollback } from './dockPresence';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE COMMAND PAGE renders this exact conversation. One copy is enough.
{
  const d = dockDeference('/garvis/command');
  check('the command page owns the thread', d.ownsThread);
  check('…but it is not a second chat — the dock still opens there', !d.ownsChat);
  check('trailing slashes and case do not change the answer',
    dockDeference('/Garvis/Command/').ownsThread && dockDeference('/garvis/command/').ownsThread);
}

// A PROJECT has its own conversation about its own code.
{
  const d = dockDeference('/project/abc-123');
  check('a project workspace owns a chat', d.ownsChat);
  check('…but NOT this thread — opened there, the dock still shows the conversation', !d.ownsThread);
  check('any project id counts', dockDeference('/project/00000000-0000-4000-8000-000000000001').ownsChat);
  check('a deeper project route still counts', dockDeference('/project/p1/settings').ownsChat);
  check('the projects LIST is not a project', !dockDeference('/projects').ownsChat);
  check('a lookalike path is not a project', !dockDeference('/project').ownsChat);
}

// EVERYWHERE ELSE the dock is the only conversation — it defers to nothing.
{
  for (const p of ['/garvis/queue', '/garvis/leads', '/garvis/webs/w-mom', '/garvis/channels', '/new', '/settings', '/', '']) {
    const d = dockDeference(p);
    check(`the dock is at home on "${p || '(empty)'}"`, !d.ownsThread && !d.ownsChat);
  }
}

// ARRIVING — the operator's own choice is remembered, except where it would land them in two
// open conversations at once.
{
  check('left open, arrives open', opensOnArrival(true, dockDeference('/garvis/queue')));
  check('left closed, arrives closed', !opensOnArrival(false, dockDeference('/garvis/queue')));
  check('left open, arrives COLLAPSED in a project (the fix)',
    !opensOnArrival(true, dockDeference('/project/p1')));
  check('left open, still arrives open on the command page (only the scrollback goes)',
    opensOnArrival(true, dockDeference('/garvis/command')));
  check('left closed stays closed everywhere', !opensOnArrival(false, dockDeference('/project/p1')));

  // …unless the dock is the reason they are here. It routed them in and started a walkthrough;
  // collapsing would drop the guide mid-sentence.
  check('escorting into a project keeps the dock open (the walkthrough survives)',
    opensOnArrival(true, dockDeference('/project/p1'), true));
  check('…even if the operator had it closed — they asked for this trip',
    opensOnArrival(false, dockDeference('/project/p1'), true));
  check('escorting anywhere else is open too', opensOnArrival(false, dockDeference('/garvis/queue'), true));
  check('arriving on your own is still the deferring case',
    !opensOnArrival(true, dockDeference('/project/p1'), false));
}

// THE SCROLLBACK — never a second copy of what the page is already showing.
{
  check('a conversation renders in the corner normally', showsScrollback(4, dockDeference('/garvis/queue')));
  check('…and NOT on the page that is already showing it', !showsScrollback(4, dockDeference('/garvis/command')));
  check('…but it does render in a project (a different conversation lives there)',
    showsScrollback(4, dockDeference('/project/p1')));
  check('an empty conversation renders nothing anywhere', !showsScrollback(0, dockDeference('/garvis/queue')));
  check('…not even where the dock is at home', !showsScrollback(0, dockDeference('/')));
}

// The dock never disappears. Deference is about competing, not about leaving.
{
  for (const p of ['/garvis/command', '/project/p1', '/garvis/queue']) {
    const d = dockDeference(p);
    check(`the dock is still reachable on "${p}" (deference is never removal)`,
      typeof d.ownsChat === 'boolean' && typeof d.ownsThread === 'boolean');
  }
}

console.log(`\ndockPresence.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} dockPresence check(s) failed`);
