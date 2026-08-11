// Run: npx tsx src/lib/garvis/suggestionDeck.verify.ts
// Pins the tap-to-do suggestion contract: right moves for the surface's state, never a wrong
// channel, never a riff at an empty board, research chip only when research exists.
import { nextMoves } from './suggestionDeck';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// The operator's own examples are the acceptance tests.
{
  const postcard = nextMoves('postcard', { hasPieces: true });
  check('postcard board with pieces offers "Add a hook up top"', postcard.some((s) => s.label === 'Add a hook up top'));
  check('…and "Try a scenic photo" / "Add a local stat"',
    postcard.some((s) => s.label === 'Try a scenic photo') && postcard.some((s) => s.label === 'Add a local stat'));
  check('improve-moves are RIFFS (they act on the pointed-at piece)', postcard.every((s) => s.cmd.kind === 'riff'));
  const merch = nextMoves('merch', { hasPieces: true });
  check('the t-shirt deck offers "Small logo on front pocket"', merch.some((s) => s.label === 'Small logo on front pocket'));
  const builder = nextMoves('builder', { hasPieces: true });
  check('the builder deck offers the custom automation', builder.some((s) => s.label === 'Automate new-lead follow-up'));
  check('builder moves are INSTRUCT (straight to the chat, diff-gated there)', builder.every((s) => s.cmd.kind === 'instruct'));
}

// State gating.
{
  const empty = nextMoves('postcard', { hasPieces: false });
  check('an empty board never offers a riff (nothing to point at)', empty.length > 0 && empty.every((s) => s.cmd.kind === 'make'));
  const builderEmpty = nextMoves('builder', { hasPieces: false });
  check('the builder (no start deck) falls back to improve-moves', builderEmpty.length > 0);
  check('research chip only when research exists',
    !nextMoves('postcard', { hasPieces: true }).some((s) => s.label.startsWith('Use the research'))
    && nextMoves('postcard', { hasPieces: true, researchTitles: ['Luxury mailer teardown'] })[0]?.label === 'Use the research: Luxury mailer teardown');
  check('…and the research chip NAMES the note in its instruction',
    nextMoves('postcard', { hasPieces: true, researchTitles: ['Luxury mailer teardown'] })[0]?.cmd.text.includes('"Luxury mailer teardown"'));
}

// Contract hygiene.
{
  check('an unknown channel gets nothing — never a wrong-channel move', nextMoves('videos', { hasPieces: true }).length === 0);
  check('capped at 4 chips', ['postcard', 'social', 'email', 'brand', 'merch', 'builder'].every((c) => nextMoves(c, { hasPieces: true, researchTitles: ['x'] }).length <= 4));
  check('labels read at a glance (≤ 40 chars)', ['postcard', 'social', 'email', 'brand', 'merch', 'builder']
    .every((c) => [...nextMoves(c, { hasPieces: true }), ...nextMoves(c, { hasPieces: false })].every((s) => s.label.length <= 40)));
  check('every cmd carries a real instruction', ['postcard', 'social', 'email', 'brand', 'merch', 'builder']
    .every((c) => [...nextMoves(c, { hasPieces: true }), ...nextMoves(c, { hasPieces: false })].every((s) => s.cmd.text.length > 10)));
  check('deterministic', JSON.stringify(nextMoves('postcard', { hasPieces: true })) === JSON.stringify(nextMoves('postcard', { hasPieces: true })));
}

console.log(`\nsuggestionDeck.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} suggestionDeck check(s) failed`);
