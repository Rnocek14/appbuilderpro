// Run: npx tsx src/lib/garvis/masterPlan.verify.ts
// Pins the known-plays contract: strategic asks compile DETERMINISTICALLY into full-capability
// plans that survive the real parsePlan gauntlet unchanged; fuzzy reads return null (AI tier),
// missing info becomes questions, and platform limits are stated holes.
import { matchPlanShape, marketSubject } from './masterPlan';
import { parsePlan } from './orchestrator';
import { ACTION_SPECS } from './actionCatalog';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const gauntlet = (plan: NonNullable<ReturnType<typeof matchPlanShape>>['plan']) =>
  parsePlan(JSON.stringify(plan), ACTION_SPECS);

// THE MARKET PLAY — the flagship: the whole organic operation from one sentence.
{
  const withUrl = matchPlanShape('plan out how to market my stroke app mindweave (https://mindweave.app)');
  check('the market sentence compiles to the known play', withUrl?.shapeId === 'market');
  check('the play composes the FULL rail: mapped op → thesis → research → content week → CTA',
    withUrl?.plan.steps.map((s) => s.action).join(',') === 'start_app_marketing,record_thesis,research_market,start_content_week,point_channel_cta');
  check('the URL rides the CTA step, never invented elsewhere',
    withUrl?.plan.steps[4]?.params.url === 'https://mindweave.app' && withUrl.plan.questions.length === 0);
  check('content week waits on research (grounded, not blind)', withUrl?.plan.steps[3]?.after[0] === 2);
  check('paid ads are a stated HOLE', !!withUrl && withUrl.plan.holes.some((h) => /paid ads/i.test(h)));
  const noUrl = matchPlanShape('lets start marketing my moms real estate business');
  check('no URL → no CTA step and a QUESTION instead', noUrl?.shapeId === 'market'
    && noUrl.plan.steps.every((s) => s.action !== 'point_channel_cta')
    && noUrl.plan.questions.length === 1 && /land/i.test(noUrl.plan.questions[0]!));
  check('the subject reads clean ("moms real estate business")',
    noUrl?.plan.steps[0]?.params.app === 'moms real estate business');
  check('the gauntlet passes the play unchanged', (() => {
    const g = withUrl ? gauntlet(withUrl.plan) : null;
    return !!g?.plan && g.plan.steps.length === 5 && g.plan.questions.length === 0;
  })());
}

// The subject extractor's honesty — verbs only, never the noun.
{
  check('"research the market for X" is NOUN usage → null (the AI tier owns it)',
    marketSubject('Research the market for Lakefront Media and write me a deep business plan') === null);
  check('"market my stroke app mindweave" → the subject, possessive stripped',
    marketSubject('market my stroke app mindweave (https://mindweave.app)') === 'stroke app mindweave');
  check('a subject that reads dirty returns null, never a guess', marketSubject('market it') === null);
}

// THE VERTICAL EMPIRE — the counted ask reaches the same play from Orchestrate and the dock.
{
  const seven = matchPlanShape('plan seven verticals and make a structured plan');
  check('"plan seven verticals" → seven launch_vertical steps',
    seven?.shapeId === 'vertical-empire' && seven.plan.steps.length === 7 && seven.plan.steps.every((s) => s.action === 'launch_vertical'));
  const cta = matchPlanShape('plan 3 verticals funneling to https://x.app');
  check('the CTA link rides every vertical', cta?.plan.steps.every((s) => s.params.cta_url === 'https://x.app') === true);
  check('counted beats market when both words appear', matchPlanShape('plan 3 verticals to market my app')?.shapeId === 'vertical-empire');
  check('the gauntlet passes the empire unchanged', (() => { const g = seven ? gauntlet(seven.plan) : null; return !!g?.plan && g.plan.steps.length === 7; })());
}

// FOUND-BUSINESS — mirrors the pinned venture case: found + the approval-seam question.
{
  const p = matchPlanShape('Start a marketing agency for home-service companies and get it fully set up');
  check('founding compiles to found_company + the seam question',
    p?.shapeId === 'found-business' && p.plan.steps.length === 1 && p.plan.steps[0]!.action === 'found_company'
    && p.plan.questions.length === 1 && /approving/i.test(p.plan.questions[0]!));
}

// CLIENT MACHINE + WORK HUNT — acquisition asks land on the standing machines.
{
  const c = matchPlanShape('Find me web design clients — go after landscapers');
  check('"find me clients, go after landscapers" → the hunt with the niche',
    c?.shapeId === 'client-machine' && c.plan.steps[0]!.params.niche === 'landscapers');
  check('"fill the pipeline" fires without a niche (the hunt covers every local type)',
    (() => { const f = matchPlanShape('lets fill the pipeline this month'); return f?.shapeId === 'client-machine' && !('niche' in f.plan.steps[0]!.params); })());
  const w = matchPlanShape('Find all mural and custom art jobs in Wisconsin');
  check('"find all mural jobs in Wisconsin" → the opportunity hunt with focus + region',
    w?.shapeId === 'work-hunt' && w.plan.steps[0]!.params.focus === 'mural and custom art jobs' && w.plan.steps[0]!.params.region === 'Wisconsin');
}

// WEEKLY PRESENCE — the keep-it-alive ask arms both standing engines.
{
  const p = matchPlanShape("keep Northstar's socials active with 5 posts a week");
  check('"keep Northstar\'s socials active" → content week + idea stream on that world',
    p?.shapeId === 'weekly-presence' && p.plan.steps.map((s) => s.action).join(',') === 'start_content_week,start_idea_stream'
    && p.plan.steps.every((s) => s.params.world === 'Northstar'));
  check('a spoken post count rides in', p?.plan.steps[0]?.params.posts_per_week === '5');
}

// HONESTY OF THE BOUNDARY — what is NOT a known play returns null for the AI tier.
{
  for (const s of [
    'whats waiting on me today',
    'draft an episode about mortgage rates',
    'open the queue and show me approvals',
    'Research the market for Lakefront Media and write me a deep business plan',
    'never mind, all good',
  ]) check(`not a play: "${s.slice(0, 44)}…" → null`, matchPlanShape(s) === null);
}

// CONTRACT HYGIENE — every shaped plan is deterministic, explains itself, and never lies with
// empty params.
{
  const sentences = [
    'plan out how to market my stroke app mindweave (https://mindweave.app)',
    'plan seven verticals and make a structured plan',
    'Start a marketing agency for home-service companies',
    'Find me web design clients — go after landscapers',
    'Find all mural and custom art jobs in Wisconsin',
    "keep Northstar's socials active",
  ];
  check('deterministic: same sentence, same plan', sentences.every((s) => JSON.stringify(matchPlanShape(s)) === JSON.stringify(matchPlanShape(s))));
  const plans = sentences.map((s) => matchPlanShape(s)!.plan);
  check('every step says WHY (>15 chars)', plans.every((p) => p.steps.every((s) => s.why.length > 15)));
  check('no empty-string params anywhere', plans.every((p) => p.steps.every((s) => Object.values(s.params).every((v) => v.trim().length > 0))));
  check('every play survives the gauntlet with its steps intact',
    plans.every((p) => { const g = gauntlet(p); return !!g.plan && g.plan.steps.length === p.steps.length; }));
}

console.log(`\nmasterPlan.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} masterPlan check(s) failed`);
