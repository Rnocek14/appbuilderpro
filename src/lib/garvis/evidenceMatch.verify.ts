// Run: npx tsx src/lib/garvis/evidenceMatch.verify.ts
// Pins the citation matcher: a belief's evidence count moves ONLY on citations a human could
// re-check against real rows — verbatim or dropped, never guessed — and the nightly wiring
// keeps quiet owners free.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCitation, verifyNominations, type BeliefRef, type EventRef } from './evidenceMatch';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const BELIEFS: BeliefRef[] = [
  { id: 'b1', statement: 'Cold pitches with a live demo link get replies' },
  { id: 'b2', statement: 'Tuesday sends outperform Friday sends' },
];
const EVENTS: EventRef[] = [
  { id: 'e1', subject: 'Sent "Your site audit" to kim@acme.com' },
  { id: 'e2', subject: 'A reply arrived from kim@acme.com' },
  { id: 'e3', subject: null },
];
const nom = (belief: unknown, stance: unknown, events: unknown) => ({ belief, stance, events });

// VERBATIM SURVIVES — with exactly the tolerance a model plausibly needs (spacing, case).
{
  const [link] = verifyNominations([nom('Cold pitches with a live demo link get replies', 'supports', ['Sent "Your site audit" to kim@acme.com', 'A reply arrived from kim@acme.com'])], BELIEFS, EVENTS);
  check('a fully-verbatim nomination links belief + both events', !!link && link.beliefId === 'b1' && link.eventIds.join() === 'e1,e2' && link.stance === 'supports');
  const [spaced] = verifyNominations([nom('  cold pitches with a live   demo link get replies ', 'contradicts', ['a reply arrived from KIM@acme.com'])], BELIEFS, EVENTS);
  check('spacing/case wobble still matches (that is the WHOLE tolerance)', !!spaced && spaced.beliefId === 'b1' && spaced.stance === 'contradicts');
  check('normalizeCitation is the one rule both sides use', normalizeCitation('  A   B ') === 'a b');
}

// EVERYTHING ELSE DROPS — fabricated citations never move an evidence count.
{
  check('a paraphrased belief drops the whole nomination',
    verifyNominations([nom('Demo-link pitches tend to get replies', 'supports', ['A reply arrived from kim@acme.com'])], BELIEFS, EVENTS).length === 0);
  const [partial] = verifyNominations([nom('Tuesday sends outperform Friday sends', 'supports', ['A reply arrived from kim@acme.com', 'An event that never happened'])], BELIEFS, EVENTS);
  check('a fabricated EVENT citation drops — the real one still files', !!partial && partial.eventIds.join() === 'e2');
  check('all-fabricated events → nothing filed',
    verifyNominations([nom('Tuesday sends outperform Friday sends', 'supports', ['Invented one', 'Invented two'])], BELIEFS, EVENTS).length === 0);
  check('an invalid stance drops the nomination',
    verifyNominations([nom(BELIEFS[0].statement, 'proves', [EVENTS[0].subject])], BELIEFS, EVENTS).length === 0);
  check('non-string garbage is safe everywhere',
    verifyNominations([nom(42, 'supports', 'not-an-array'), nom(null, null, null)], BELIEFS, EVENTS).length === 0);
  check('a null-subject event can never be cited', verifyNominations([nom(BELIEFS[0].statement, 'supports', [''])], BELIEFS, EVENTS).length === 0);
  check('duplicate citations collapse to one id',
    verifyNominations([nom(BELIEFS[0].statement, 'supports', [EVENTS[0].subject, EVENTS[0].subject])], BELIEFS, EVENTS)[0]!.eventIds.length === 1);
  check('the per-run cap holds', verifyNominations(
    Array.from({ length: 10 }, () => nom(BELIEFS[0].statement, 'supports', [EVENTS[0].subject])), BELIEFS, EVENTS, 3).length === 3);
  check('empty inputs are a clean empty result', verifyNominations([], [], []).length === 0);
}

// ---- the nightly wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const consolidate = readFileSync(join(here, '../../../supabase/functions/garvis-consolidate/index.ts'), 'utf8');
const migration = readFileSync(join(here, '../../../supabase/migrations/app_0147_consolidate_nightly.sql'), 'utf8');
const control = readFileSync(join(here, 'systemControl.ts'), 'utf8');
{
  check('MIN_EVENTS stays 15 — the quiet-owner floor', consolidate.includes('const MIN_EVENTS = 15;'));
  // The seeded-quiet-owner claim, verified structurally: the thin-skip fires BEFORE the credit
  // gate and BEFORE any model call, so a quiet owner's nightly run costs exactly zero.
  const ownerLoop = consolidate.slice(consolidate.indexOf('for (const ownerId of owners)'));
  check('a thin night skips BEFORE the credit gate and the model call (quiet owners stay free)',
    ownerLoop.indexOf('skippedThin++') < ownerLoop.indexOf('checkCredits(')
    && ownerLoop.indexOf('skippedThin++') < ownerLoop.indexOf('await complete('));
  check('nominations go through the strict matcher, never straight to the belief',
    consolidate.includes('verifyNominations(nominations, beliefs,'));
  check('links file through the same pure reducer the Memory page uses',
    consolidate.includes('attachEvidence(next, eid, link.stance)'));
  check('the prompt demands verbatim citations and warns of the matcher',
    consolidate.includes('strict matcher discards any belief or event you paraphrase'));
  check('only ACTIVE beliefs are nominated against', consolidate.includes(".eq('status', 'active')"));
  check('the marker records what was linked', consolidate.includes('as belief evidence'));

  check('the migration schedules nightly at 03:00 UTC',
    migration.includes("'garvis-consolidate-nightly', '0 3 * * *'"));
  check('…and retires the weekly job inside the arm (guarded)',
    migration.includes("cron.unschedule('garvis-consolidate-weekly'); exception when others then null;"));
  check('the master switch expects the nightly job, not the weekly one',
    control.includes("'garvis-consolidate-nightly'") && !control.includes("'garvis-consolidate-weekly'"));
}

console.log(`\nevidenceMatch.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} evidence match check(s) failed`);
