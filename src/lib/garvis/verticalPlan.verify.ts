// Run: npx tsx src/lib/garvis/verticalPlan.verify.ts
// Pins the vertical-empire contract: a structured N-channel plan, compiled into the
// orchestrator's reviewable arc, with the honesty notes intact.
import { VERTICAL_LIBRARY, buildVerticalPlan, planToArc, planNotes, verticalCount } from './verticalPlan';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// The library.
{
  check('the library holds at least SEVEN verticals (the operator\'s ask)', VERTICAL_LIBRARY.length >= 7);
  check('library ids are unique', new Set(VERTICAL_LIBRARY.map((v) => v.libId)).size === VERTICAL_LIBRARY.length);
  check('every vertical carries exactly three starter ideas', VERTICAL_LIBRARY.every((v) => v.firstIdeas.length === 3 && v.firstIdeas.every((i) => i.length > 8)));
  check('every vertical has a real persona, look, and why', VERTICAL_LIBRARY.every((v) => v.persona.length > 10 && v.visualStyle.length > 8 && v.why.length > 15));
  check('no persona language leaks (no "I am", no fake human names)', VERTICAL_LIBRARY.every((v) => !/\bi am\b|\bmy name\b/i.test(v.persona)));
}

// The plan builder.
{
  const plan = buildVerticalPlan(7, { ctaUrl: 'https://myapp.example', marketed: 'the stroke app' });
  check('seven in → seven out, each fully specified', plan.verticals.length === 7 && plan.verticals.every((v) => v.name && v.niche));
  check('the CTA rides the plan', plan.ctaUrl === 'https://myapp.example');
  check('the marketed thing names itself in the title', plan.title.includes('the stroke app'));
  check('count clamps to the library, never invents', buildVerticalPlan(99, {}).verticals.length === VERTICAL_LIBRARY.length && buildVerticalPlan(0, {}).verticals.length === 1);
  check('deterministic', JSON.stringify(buildVerticalPlan(5, {})) === JSON.stringify(buildVerticalPlan(5, {})));
}

// The compiled arc.
{
  const arc = planToArc(buildVerticalPlan(7, { ctaUrl: 'https://myapp.example' }));
  check('one launch_vertical step per channel', arc.steps.length === 7 && arc.steps.every((s) => s.action === 'launch_vertical'));
  check('steps run sequentially (paced spend, honest ordering)', arc.steps.every((s, i) => (i === 0 ? s.after.length === 0 : s.after[0] === i - 1)));
  check('every step carries its vertical, name, first topic, and the CTA',
    arc.steps.every((s) => s.params.vertical && s.params.name && s.params.first_topic && s.params.cta_url === 'https://myapp.example'));
  check('every step says WHY', arc.steps.every((s) => s.why.length > 15));
  check('the render/post limit is a stated HOLE, not a silence', arc.holes.some((h) => /Produce|Queue/.test(h)));
  const noCta = planToArc(buildVerticalPlan(3, {}));
  check('a missing CTA is a QUESTION (the funnel is the point)', noCta.questions.length === 1 && /CTA|funnel/.test(noCta.questions[0]!));
  check('…and CTA params are absent, never empty-string lies', noCta.steps.every((s) => !('cta_url' in s.params)));
}

// The notes + count extraction.
{
  const notes = planNotes(buildVerticalPlan(7, {}));
  check('notes state what implement DOES (worlds, clock, episode one)', /channel operations/.test(notes[0]!) && /draft clock/.test(notes[0]!));
  check('notes state the key honesty (no key → clock drafts later)', notes.some((n) => /no key/.test(n)));
  check('notes state the Queue gate', notes.some((n) => /Queue/.test(n)));
  check('"plan seven verticals" → 7', verticalCount('plan seven verticals and make a structured plan') === 7);
  check('"3 verticals" → 3', verticalCount('give me 3 verticals') === 3);
  check('"a few niche channels" → 3', verticalCount('a few niche channels') === 3);
  check('no count named → null (the caller picks the default)', verticalCount('lets build some followings') === null);
  check('counts clamp to the library', verticalCount('plan 40 verticals') === VERTICAL_LIBRARY.length);
}

console.log(`\nverticalPlan.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} verticalPlan check(s) failed`);
