// Run: npx tsx src/lib/garvis/editPlan.verify.ts
import { lineSignals, planEmphasis } from './editPlan';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('editPlan.verify');

{
  check('a number is the strongest signal (specificity wins)', lineSignals('Stroke recovery continues for 2 years.').score >= 2
    && lineSignals('Stroke recovery continues for 2 years.').reasons.includes('number'));
  check('spelled numbers count too', lineSignals('It takes twice as long as doctors once said.').reasons.includes('number'));
  check('turn words mark story turns (the but/so rule)', lineSignals('But the timeline is not what you think.').reasons.includes('turn'));
  check('absolutes mark claim lines', lineSignals('Most families never hear this.').reasons.includes('absolute'));
  check('questions set up reveals', lineSignals('So what actually restarts progress?').reasons.includes('question'));
  check('a plain narrative line scores zero', lineSignals('She sat by the window that morning.').score === 0);
  check('empty text scores zero, no throw', lineSignals('').score === 0 && lineSignals('   ').score === 0);
}
{
  const scenes = [
    { voiceover: 'The 6pm meltdown is not random.', durationS: 5 },            // hook — excluded
    { voiceover: 'She sat by the window that morning.', durationS: 5 },        // plain
    { voiceover: 'But 70% of caregivers never learn the real trigger.', durationS: 5 },  // number+turn+absolute
    { voiceover: 'Light is the lever, not arguing.', durationS: 5 },           // plain-ish
    { voiceover: 'It takes only 10 minutes of morning light.', durationS: 5 }, // number+absolute
    { voiceover: 'Follow for the evening routine.', durationS: 5 },            // CTA — excluded
  ];
  const plan = planEmphasis(scenes);
  check('emphasis lands on the strongest lines, never the hook or the CTA',
    plan.includes(2) && plan.includes(4) && !plan.includes(0) && !plan.includes(5));
  check('runtime budget: 30s of scenes → at most 2 emphasis slots', plan.length <= 2);
  check('deterministic', JSON.stringify(planEmphasis(scenes)) === JSON.stringify(plan));
}
{
  // Adjacency: two strong lines back-to-back → only one wins (uniform punch reads as noise).
  const adjacent = [
    { voiceover: 'hook', durationS: 5 },
    { voiceover: 'The number is 90%.', durationS: 5 },
    { voiceover: 'But only 3 in 100 act on it.', durationS: 5 },
    { voiceover: 'plain line here.', durationS: 5 },
    { voiceover: 'cta', durationS: 5 },
  ];
  const plan = planEmphasis(adjacent);
  check('adjacent strong scenes: only the stronger one is picked', plan.length === 1 && plan[0] === 2);
  check('a video with no strong lines gets NO forced emphasis (honest restraint)',
    planEmphasis([
      { voiceover: 'hook', durationS: 5 }, { voiceover: 'a calm line.', durationS: 5 },
      { voiceover: 'another calm line.', durationS: 5 }, { voiceover: 'cta', durationS: 5 },
    ]).length === 0);
  check('tiny boards (<3 scenes) plan nothing', planEmphasis([{ voiceover: 'a 5x claim', durationS: 5 }, { voiceover: 'b', durationS: 5 }]).length === 0);
  check('a long video earns more slots but caps at 4',
    planEmphasis(Array.from({ length: 14 }, (_, i) => ({ voiceover: i % 2 === 1 ? `Point ${i}: ${i * 7}% of people never check.` : 'a plain connective line here.', durationS: 6 }))).length <= 4);
}

console.log(`\neditPlan.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} editPlan check(s) failed`);
