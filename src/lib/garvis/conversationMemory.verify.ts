// Run: npx tsx src/lib/garvis/conversationMemory.verify.ts
// Pins the conversational-memory contract: unmistakable follow-ups resolve against the
// remembered ask; everything else falls through; nothing is ever fabricated.
import { parseFollowupAsk, applyFollowupAsk, type AskMemory } from './conversationMemory';
import { matchPlanShape } from './masterPlan';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const mem: AskMemory = { sentence: 'plan out how to market my stroke app mindweave', subject: 'stroke app mindweave' };

// The forms.
{
  check('"again" repeats', parseFollowupAsk('again')?.kind === 'again');
  check('"do that again" repeats', parseFollowupAsk('Do that again!')?.kind === 'again');
  check('"same but for X" swaps', (() => { const f = parseFollowupAsk('same but for the pet supplies app'); return f?.kind === 'swap' && f.target === 'the pet supplies app'; })());
  check('"do that for X" swaps', (() => { const f = parseFollowupAsk('do that for moms real estate'); return f?.kind === 'swap' && f.target === 'moms real estate'; })());
  check('"now do it for X" swaps', parseFollowupAsk('now do it for the wardrobe tool')?.kind === 'swap');
}

// Conservative boundaries — real asks NEVER read as follow-ups.
{
  for (const s of [
    'do the postcard for mom',
    'make a reel for the lake house',
    'plan out how to market my app',
    'draft an episode about rates',
    'same old story',
    'do that thing we discussed',
    'now for something completely different',
    'now for the record lets talk numbers',
  ]) check(`falls through: "${s.slice(0, 40)}"`, parseFollowupAsk(s) === null);
  check('pronoun targets are refused ("do that for me")', parseFollowupAsk('do that for me') === null);
}

// Applying against memory.
{
  const swapped = applyFollowupAsk({ kind: 'swap', target: 'the pet supplies app' }, mem);
  check('the subject swaps in cleanly (no "my the")', swapped === 'plan out how to market my pet supplies app');
  check('the swapped sentence still compiles as a play', matchPlanShape(swapped!)?.shapeId === 'market');
  check('"again" returns the remembered sentence verbatim', applyFollowupAsk({ kind: 'again' }, mem) === mem.sentence);
  check('no memory → null, never a fabricated ask', applyFollowupAsk({ kind: 'again' }, null) === null);
  check('swap with no subject → null', applyFollowupAsk({ kind: 'swap', target: 'x-co' }, { sentence: 'open the queue', subject: null }) === null);
  check('swap when the subject vanished from the sentence → null',
    applyFollowupAsk({ kind: 'swap', target: 'x' }, { sentence: 'open the queue', subject: 'stroke app' }) === null);
  check('subject match is case-insensitive', applyFollowupAsk({ kind: 'swap', target: 'Y Co' },
    { sentence: "keep Northstar's socials active", subject: 'northstar' }) === "keep Y Co's socials active");
}

// The memory seam: plays expose their swappable subject.
{
  check('the market play exposes its subject', matchPlanShape('plan out how to market my stroke app mindweave')?.subject === 'stroke app mindweave');
  check('weekly presence exposes the world', matchPlanShape("keep Northstar's socials active")?.subject === 'Northstar');
  check('the work hunt exposes the focus', matchPlanShape('find all mural and custom art jobs in Wisconsin')?.subject === 'mural and custom art jobs');
  check('founding exposes none (nothing to swap)', matchPlanShape('start a marketing agency for realtors')?.subject === null);
}

console.log(`\nconversationMemory.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} conversationMemory check(s) failed`);
