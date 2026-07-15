// Run: npx tsx src/lib/garvis/emailStudio.verify.ts
import {
  EMAIL_CONCEPTS, conceptsFor, conceptById, buildEmailExample, conceptSample, type EmailCtx,
} from './emailStudio';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('emailStudio.verify');

const full: EmailCtx = { businessName: 'Lakeside Realty', agentName: 'Jane Doe', phone: '(262) 555-0148', area: 'Lake Geneva', realEstate: true };
const bare: EmailCtx = { businessName: '', agentName: '', phone: null, area: null, realEstate: true };
const generalCtx: EmailCtx = { businessName: "Rosa's Bakery", agentName: 'Rosa', phone: null, area: null, realEstate: false };

// --- the catalog is a real studio's worth of ideas ------------------------------------------
{
  check('a substantial catalog of email ideas', EMAIL_CONCEPTS.length >= 12);
  check('every concept has name, blurb, sample, a render fn, ≥2 angles', EMAIL_CONCEPTS.every((k) => !!k.name && !!k.blurb && !!k.sample && typeof k.render === 'function' && k.variants >= 2));
  check('ids are unique', new Set(EMAIL_CONCEPTS.map((k) => k.id)).size === EMAIL_CONCEPTS.length);
  const re = conceptsFor(true); const gen = conceptsFor(false);
  check('real-estate businesses get real-estate ideas', re.length >= 6 && re.some((k) => k.id === 're_home_value') && !re.some((k) => k.id === 'gen_offer'));
  check('general businesses get general ideas', gen.length >= 5 && gen.some((k) => k.id === 'gen_offer') && !gen.some((k) => k.id === 're_just_sold'));
}

// --- every idea renders a real, editable example --------------------------------------------
{
  for (const k of EMAIL_CONCEPTS) {
    const ctx = k.audience === 'general' ? generalCtx : full;
    const ex = buildEmailExample(k.id, ctx, 0);
    if (!ex) { check(`${k.id} renders`, false); continue; }
    const ok = ex.subject.trim().length > 3 && ex.body.length > 60 && /\{\{first_name\}\}/.test(ex.body);
    check(`${k.id}: real subject + body + a merge field`, ok);
  }
}

// --- "another angle" gives a genuinely different rendition -----------------------------------
{
  const a = buildEmailExample('re_home_value', full, 0)!;
  const b = buildEmailExample('re_home_value', full, 1)!;
  check('variant 1 differs from variant 0 (a real second angle)', a.body !== b.body || a.subject !== b.subject);
  check('variant index wraps (another-angle never crashes)', !!buildEmailExample('re_home_value', full, 99));
}

// --- honesty: our real facts fill in; unknowns are visible [EDIT] holes, never invented ------
{
  const ex = buildEmailExample('re_new_listing', full, 0)!;
  check('known facts fill in (area, sign-off with name + business + phone)', /Lake Geneva/.test(ex.subject + ex.body) && /Jane Doe, Lakeside Realty/.test(ex.body) && /\(262\) 555-0148/.test(ex.body));
  check('unknown specifics are visible EDIT holes (price/address never invented)', /\[EDIT:/.test(ex.body));

  const bareEx = buildEmailExample('re_new_listing', bare, 0)!;
  check('with no facts, area + name + business all become EDIT holes (nothing fabricated)', /\[EDIT: your area\]/.test(bareEx.subject + bareEx.body) && /\[EDIT: your name\]/.test(bareEx.body));
  check('no phone → no phone line invented', !/\d{3}[.)\-]/.test(bareEx.body));
}

// --- gallery cards show an example subject up front (studio is full on open) -----------------
{
  const k = conceptById('gen_offer')!;
  check('a concept sample renders with tokens filled', conceptSample(k, generalCtx).length > 3 && !/\{biz\}|\{area\}/.test(conceptSample(k, generalCtx)));
}

// --- unknown id is null, never a crash ------------------------------------------------------
check('unknown concept id → null', buildEmailExample('nope', full, 0) === null && conceptById('nope') === null);

console.log(`\nemailStudio.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} emailStudio check(s) failed`);
