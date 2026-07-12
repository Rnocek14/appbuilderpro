// src/lib/garvis/visualGrammar.verify.ts
// Standalone verification of the visual grammar (run: npx tsx src/lib/garvis/visualGrammar.verify.ts).
// Guards the honesty contract: specs without a basis/assumption-caption/sane dials are rejected BY
// NAME; the 'none' refusal path carries its reason; slots resolve or renderers refuse; the offline
// starter heuristic recognizes mechanism words and returns null (never a decorative guess) otherwise.

import {
  ARCHETYPES, REQUIRED_SLOTS, parseVisualSpec, localSpecFor, slotValue, specDefaults, clampSpecValues,
} from './visualGrammar';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const GOOD = JSON.stringify({
  archetype: 'decay',
  title: 'How fast muons vanish',
  caption: 'Each step keeps a constant fraction — the dials are assumptions to adjust, not measurements.',
  basis: 'Exponential decay: constant fractional loss per step (the half-life form).',
  params: [
    { key: 'keep', label: 'Fraction kept per step', min: 0.05, max: 0.99, step: 0.01, def: 0.5 },
    { key: 'steps', label: 'Steps', min: 4, max: 60, step: 1, def: 12 },
  ],
  slots: { start: 100, keep: 'keep', steps: 'steps' },
});

// 1. The gates — pass whole, reject thin BY NAME.
{
  const ok = parseVisualSpec(GOOD);
  check('a complete spec parses', !!ok.spec && ok.missing.length === 0);
  check('archetype/slots survive parsing', ok.spec?.archetype === 'decay' && ok.spec?.slots.keep === 'keep');

  const noBasis = parseVisualSpec(GOOD.replace(/"basis":"[^"]+"/, '"basis":"trust me"'));
  check('missing basis rejected by name', !noBasis.spec && noBasis.missing.some((m) => m.includes('basis')));

  const factCaption = parseVisualSpec(GOOD.replace(/"caption":"[^"]+"/, '"caption":"This is exactly how muons decay in nature."'));
  check('a caption that presents dials as facts is rejected', !factCaption.spec
    && factCaption.missing.some((m) => m.includes('assumptions')));

  const badArch = parseVisualSpec(GOOD.replace('"decay"', '"hologram"'));
  check('unknown archetype rejected by name', !badArch.spec && badArch.missing.some((m) => m.includes('archetype')));

  const noDials = parseVisualSpec(GOOD.replace(/"params":\[[^\]]+\]/, '"params":[]'));
  check('no sane dials → rejected', !noDials.spec && noDials.missing.some((m) => m.includes('dial')));

  const badSlot = parseVisualSpec(GOOD.replace('"keep":"keep"', '"keep":"missing_param"'));
  check('a slot bound to nothing is rejected by name', !badSlot.spec && badSlot.missing.some((m) => m.includes('slot "keep"')));

  const insaneRange = parseVisualSpec(GOOD.replace('"min":0.05,"max":0.99', '"min":5,"max":1'));
  check('min ≥ max dial dropped → rejected for having no dials on that key', !insaneRange.spec);

  check('garbage never throws', parseVisualSpec('not json').spec === null && parseVisualSpec('').missing.length > 0);
}

// 2. The honest refusal path.
{
  const none = parseVisualSpec('{"archetype":"none","reason":"the claim is qualitative — no rate, count, or limit to animate"}');
  check("'none' carries its reason", !none.spec && none.none?.reason.includes('qualitative') === true);
  const noneThin = parseVisualSpec('{"archetype":"none","reason":"no"}');
  check("a thin 'none' reason gets the default explanation", !!noneThin.none && noneThin.none.reason.length > 20);
}

// 3. Slots + clamping — renderers get numbers or nulls, never NaN.
{
  const spec = parseVisualSpec(GOOD).spec!;
  const defs = specDefaults(spec);
  check('defaults come from the dials', defs.keep === 0.5 && defs.steps === 12);
  check('constant slots resolve', slotValue(spec, 'start', defs) === 100);
  check('param slots resolve through values', slotValue(spec, 'keep', { ...defs, keep: 0.8 }) === 0.8);
  check('unknown slot → null (refuse, never zero)', slotValue(spec, 'ghost', defs) === null);
  check('clamp pins to range + fills defaults', clampSpecValues(spec, { keep: 9 }).keep === 0.99
    && clampSpecValues(spec, {}).steps === 12);
}

// 4. Every archetype declares its required slots (renderers and gates share one registry).
{
  check('all archetypes have required slots', ARCHETYPES.every((a) => REQUIRED_SLOTS[a].length >= 2));
}

// 5. The starter heuristic — mechanism words map; prose does not.
{
  check('decay words → decay', localSpecFor('customer churn each month')?.archetype === 'decay');
  check('growth words → accumulate', localSpecFor('how the audience compounds')?.archetype === 'accumulate');
  check('odds words → field', localSpecFor('response rate across cold emails')?.archetype === 'field');
  check('versus words → race', localSpecFor('electric versus gas total cost')?.archetype === 'race');
  check('runway words → flow', localSpecFor('startup runway and burn rate')?.archetype === 'flow');
  check('threshold words → threshold', localSpecFor('how close to break-even are we')?.archetype === 'threshold');
  check('plain prose → null (no decorative guess)', localSpecFor('the history of the roman senate') === null);
  const starter = localSpecFor('customer churn each month')!;
  check('every starter passes its own gates', (() => {
    const round = parseVisualSpec(JSON.stringify(starter));
    return !!round.spec && round.missing.length === 0;
  })());
  const all = ['churn', 'compounding growth', 'response rate odds', 'a versus b', 'burn rate runway', 'break-even threshold']
    .map((t) => localSpecFor(t));
  check('all six starters parse whole through the gates', all.every((s) => s && parseVisualSpec(JSON.stringify(s)).spec));
}

console.log(`\nvisualGrammar.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} visualGrammar check(s) failed`);
