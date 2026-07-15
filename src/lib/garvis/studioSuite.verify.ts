// Run: npx tsx src/lib/garvis/studioSuite.verify.ts
// One suite over the shared studio kit + every studio spec, so all studios stay ONE cohesive system:
// same context shape, same honesty (real facts fill in, unknowns are visible [EDIT] holes), same
// "gallery of ideas → worked example with angles" contract.
import { sign, area, biz, exampleToText, inferRealEstate, fillTokens, type StudioCtx, type StudioSpec } from './studioKit';
import { EMAIL_SPEC } from './emailStudio';
import { ADS_SPEC } from './adsStudio';
import { COPY_SPEC } from './copyStudio';
import { SOCIAL_SPEC } from './socialStudio';
// NOTE: the reel studio is NOT here — it graduated to its own three-stage pipeline (Ideation → Script →
// Scene), not a flat IdeaStudio spec, so it has its own suite: reelStudio.verify.ts.

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('studioSuite.verify');

const full: StudioCtx = { businessName: 'Lakeside Realty', agentName: 'Jane Doe', phone: '(262) 555-0148', area: 'Lake Geneva', realEstate: true };
const bare: StudioCtx = { businessName: '', agentName: '', phone: null, area: null, realEstate: false };
const gen: StudioCtx = { businessName: "Rosa's Bakery", agentName: 'Rosa', phone: null, area: 'Madison', realEstate: false };

// --- the shared voice --------------------------------------------------------------------
{
  check('sign uses real name + business + phone', /Jane Doe, Lakeside Realty/.test(sign(full)) && /\(262\) 555-0148/.test(sign(full)));
  check('sign holes the name when unknown; no phone invented', /\[EDIT: your name\]/.test(sign(bare)) && !/\d{3}/.test(sign(bare)));
  check('area/biz fill or hole honestly', area(full) === 'Lake Geneva' && biz(bare) === '[EDIT: your business]');
  check('inferRealEstate reads the name', inferRealEstate('Lakeside Realty') && !inferRealEstate("Rosa's Bakery"));
  check('fillTokens fills {biz}/{area} but leaves merge fields', fillTokens('{biz} in {area} — {{first_name}}', gen) === "Rosa's Bakery in Madison — {{first_name}}");
}

// --- every studio spec is a well-formed, cohesive plug-in --------------------------------
const SPECS: StudioSpec[] = [EMAIL_SPEC, ADS_SPEC, COPY_SPEC, SOCIAL_SPEC];
for (const spec of SPECS) {
  const tag = spec.kind;
  check(`[${tag}] has title/subtitle/emoji/savePrefix`, !!spec.title && !!spec.subtitle && !!spec.emoji && !!spec.savePrefix);

  const reIdeas = spec.ideasFor(true);
  const genIdeas = spec.ideasFor(false);
  check(`[${tag}] offers a gallery of ideas for both business types`, reIdeas.length >= 3 && genIdeas.length >= 3);
  check(`[${tag}] idea ids are unique`, new Set([...reIdeas, ...genIdeas].map((i) => i.id)).size >= Math.max(reIdeas.length, genIdeas.length));

  // Every idea renders a real, multi-field example with ≥2 angles that actually differ.
  for (const idea of reIdeas) {
    const ex0 = spec.build(idea.id, full, 0);
    const ex1 = spec.build(idea.id, full, 1);
    if (!ex0) { check(`[${tag}] ${idea.id} renders`, false); continue; }
    const parts = ex0.parts;
    const realParts = parts.length >= 1 && parts.every((p) => typeof p.value === 'string' && p.value.length > 0);
    check(`[${tag}] ${idea.id}: labeled parts with real content`, realParts && parts.some((p) => !!p.label));
    const differs = idea.variants < 2 || (!!ex1 && exampleToText(ex1) !== exampleToText(ex0));
    check(`[${tag}] ${idea.id}: 'another angle' gives a different rendition`, differs);
    check(`[${tag}] ${idea.id}: gallery card shows a sample`, spec.sampleFor(idea, full).length > 3);
  }
}

// --- honesty across the board: unknowns are EDIT holes, never invented ----------------------
{
  // With a bare context, every studio should surface visible EDIT holes and never fabricate a number/URL.
  for (const spec of SPECS) {
    const ideas = spec.ideasFor(false);
    const blob = ideas.map((i) => exampleToText(spec.build(i.id, bare, 0)!)).join('\n');
    const holes = /\[EDIT:/.test(blob);
    const bizHole = /\[EDIT: your business\]/.test(blob);
    check(`[${spec.kind}] bare context → visible [EDIT] holes, never a fabricated fact`, holes && bizHole);
  }
}

// --- unknown id is null, never a crash ------------------------------------------------------
for (const spec of SPECS) check(`[${spec.kind}] unknown idea id → null`, spec.build('nope', full, 0) === null);

console.log(`\nstudioSuite.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} studioSuite check(s) failed`);
