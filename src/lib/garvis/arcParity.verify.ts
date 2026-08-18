// Static contract proof for the ORCHESTRATOR action surface: every action the standing worker
// claims to execute server-side is a real catalog action, and every catalog action is either
// server-executable or pinned on the explicit client-only allowlist below with its reason.
// A new action that silently joins the blocked-on-creative set is a CI failure, and every
// porting PR shrinks the allowlist under this suite's eye (see docs/garvis-best-in-class-plan.md
// SW6 — the target end state is build_app + template_document only, as honest browser handoffs).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_SPECS } from './actionCatalog';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// The actions the worker cannot yet advance, each with the one-line reason it is still
// client-bound. Porting an action server-side means deleting its row here in the same PR.
// build_app/template_document are PERMANENT residents: a browser is genuinely required, so the
// worker stages them as honest handoffs (kind 'handoff' + link) instead of executing them —
// pinned below, never silent.
const CLIENT_ONLY: Record<string, string> = {
  build_app: 'browser genuinely required (the forge) — the worker stages an honest handoff with the link',
  template_document: 'browser genuinely required (Paperwork studio) — the worker stages an honest handoff with the link',
};

const here = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(join(here, '../../../supabase/functions/standing-worker/index.ts'), 'utf8');

const setMatch = worker.match(/const SERVER_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
check('standing-worker declares SERVER_ACTIONS', !!setMatch);
const serverActions = setMatch
  ? [...setMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

const catalogIds = ACTION_SPECS.map((s) => s.id);

check('catalog has no duplicate action ids', new Set(catalogIds).size === catalogIds.length);
check('SERVER_ACTIONS has no duplicates', new Set(serverActions).size === serverActions.length);
check('every SERVER_ACTIONS member is a real catalog action',
  serverActions.every((id) => catalogIds.includes(id)),
  serverActions.filter((id) => !catalogIds.includes(id)).join(', '));
check('no action is both server-side and client-only',
  serverActions.every((id) => !(id in CLIENT_ONLY)),
  serverActions.filter((id) => id in CLIENT_ONLY).join(', '));
check('every client-only entry is a real catalog action',
  Object.keys(CLIENT_ONLY).every((id) => catalogIds.includes(id)),
  Object.keys(CLIENT_ONLY).filter((id) => !catalogIds.includes(id)).join(', '));
check('every catalog action is server-side or pinned client-only with a reason',
  catalogIds.every((id) => serverActions.includes(id) || id in CLIENT_ONLY),
  catalogIds.filter((id) => !serverActions.includes(id) && !(id in CLIENT_ONLY)).join(', '));
check('every client-only reason is a real sentence',
  Object.values(CLIENT_ONLY).every((why) => why.trim().length >= 12));

// ---- SW6.1 contract pins: the ported creative actions stay draft-only, and the browser
// ---- handoffs stay honest. These read the worker source the way workerParity does — the
// ---- shape of the code IS the contract.

// The handoff surface: exactly the two browser-required actions, staged as 'handoff' with links,
// checked BEFORE the blocked-on-creative fallback so they can never silently stall an arc.
const handoffBlock = worker.match(/const HANDOFF_ACTIONS[\s\S]*?\n\};/)?.[0] ?? '';
check('the worker declares HANDOFF_ACTIONS for exactly build_app + template_document',
  /build_app:/.test(handoffBlock) && /template_document:/.test(handoffBlock)
  && [...handoffBlock.matchAll(/^  \w+:/gm)].length === 2);
check('both handoffs carry kind handoff and a link',
  [...handoffBlock.matchAll(/kind: 'handoff'/g)].length === 2 && [...handoffBlock.matchAll(/link:/g)].length === 2);
check('…and say they wait for the visit (honest about what the worker cannot do)',
  [...handoffBlock.matchAll(/waiting for your visit/g)].length === 2);
check('the advance loop stages handoffs before the blocked-on-creative fallback',
  worker.indexOf('HANDOFF_ACTIONS[steps[i].action]') > 0
  && worker.indexOf('HANDOFF_ACTIONS[steps[i].action]') < worker.indexOf('blockedOnCreative = true; continue;'));

// The ported executors: every outward outcome is a PENDING APPROVAL through the payload-hash
// spine — the worker gained work, never the right to send.
const portedBlock = worker.slice(worker.indexOf('SW6.1: the mechanical creative actions'), worker.indexOf('\n    default:'));
check('the ported block exists in execServerAction', portedBlock.length > 200);
check('queue_social_post validates with the shared core and stages a publish_post approval',
  portedBlock.includes('checkDraft({ text, platforms')
  && portedBlock.includes("kind: 'publish_post'"));
check('email_segment refuses unknown merge tokens and stages a send_batch approval',
  portedBlock.includes('unknownTokens(') && portedBlock.includes("kind: 'send_batch'")
  && portedBlock.includes('composeBatchRecipients('));
check('every approval the ported block stages is hash-bound with a decision window',
  [...portedBlock.matchAll(/payload_hash: await hashPayload\(payload\)/g)].length === 2
  && [...portedBlock.matchAll(/expires_at: expiresAtFor\(/g)].length === 2);
// The shared episode path (draft_episode + launch_vertical's episode one) lives in one helper.
const epHelper = worker.slice(worker.indexOf('async function draftEpisodeSrv'), worker.indexOf('/** One mechanical step, server-side.'));
check('the episode path gates credits BEFORE the model call and records the spend after',
  epHelper.indexOf("checkCredits(admin, ownerId, 'short_script')") > 0
  && epHelper.indexOf("checkCredits(admin, ownerId, 'short_script')") < epHelper.indexOf('await complete([')
  && epHelper.includes('await spendCredits(admin, ownerId,'));
check('the episode path saves only a parseFactScript-validated script',
  epHelper.includes('parseFactScript(rawScript)') && epHelper.includes('if (!parsed.ok) throw new Error(parsed.reason)'));
check('template instantiation goes through the real library, not ad-hoc worlds',
  worker.includes('async function instantiateTemplateSrv') && worker.includes('templateById(templateId)') && worker.includes('flattenTemplate(t)')
  && portedBlock.includes("instantiateTemplateSrv(admin, ownerId, 'app-marketing'"));
check('a missing channel PARKS the step waiting (a seam, not a failure)',
  [...portedBlock.matchAll(/throw \{ waiting: 'No content channel exists yet/g)].length === 2);
check('the ported block never touches a send path — approvals are its only outward edge',
  !/api\.twilio\.com|resend\.com|functions\.invoke\('send-|social-publish/.test(portedBlock));

// The spend wall parks, never kills: a 402 (kill switch, caps, empty balance) leaves the step
// waiting for the operator, and the wake sweep resumes it.
check('a 402 spend wall parks the arc step as waiting',
  worker.includes(".status === 402") && /spendWall\s*\?\s*\{ kind: 'waiting'/.test(worker.replace(/\n\s*/g, ' ')));

// ---- SW6.2 field-level parity: the server producer trio vs the client path. Not spot-checks —
// ---- the exact artifact identities, grounding markers, honesty seams, and persistence rules
// ---- must appear in BOTH implementations, or the port has drifted.
const srv = readFileSync(join(here, '../../../supabase/functions/_shared/producersSrv.ts'), 'utf8');
const producers = readFileSync(join(here, 'producers.ts'), 'utf8');
const marketingRun = readFileSync(join(here, 'marketingRun.ts'), 'utf8');
const registry = readFileSync(join(here, 'actionRegistry.ts'), 'utf8');
const both = (name: string, needle: string | RegExp) => {
  const has = (s: string) => typeof needle === 'string' ? s.includes(needle) : needle.test(s);
  check(name, has(srv) && has(producers));
};

// Research: same artifact identity, same citation marker, same sources block, same degrade.
both('research artifact identity matches (slug + kind)', "slug: 'market-research-brief', kind: 'research'");
both('both gate the grounded label on real [n] citations', '/\\[\\d+\\]/.test(brief)');
both('both attach the numbered sources block', 'appendSources(brief, sources.slice(0, 10))');
both('both name the SERPER_API_KEY setup step when search is missing', 'Add SERPER_API_KEY for live research');
both('both fall to the expertise floor, never a stub', 'expertiseFloor(charter, m)');

// Plan: same identity, same anti-thin gate, same red-team → refine loop, same unknowable rule.
both('plan artifact identity matches (slug + kind)', "slug: 'business-plan', kind: 'doc'");
both("plan title matches (operator's 90-day edition)", "operator's 90-day edition");
both('both reject thin plans BY NAME', 'was too thin in');
both('both red-team then refine only when the critique demands it', 'needsRefine(critique)');
both('both ship the refined text only if it re-passes the gate', 'parsePlan(revised).ok');
both('both keep unknowables as [YOU FILL], never invented', '[YOU FILL');

// Campaign: same staged compiler, same verified draft assets, same honest status flips.
const bothMkt = (name: string, needle: string) => check(name, srv.includes(needle) && marketingRun.includes(needle));
bothMkt('campaign assets carry the verify stamp', 'verify: verifyAsset(');
bothMkt("campaign assets land as drafts, never live", "status: 'draft'");
bothMkt('the strategy stage grounds in research capped the same way', 'research.slice(0, 5000)');
bothMkt("a finished campaign flips to 'review' (a human decides)", "status: 'review'");
bothMkt("a failed campaign says 'failed', never half-done", "status: 'failed'");
for (const kind of ['strategy', 'calendar', 'social_post', 'email', 'landing_page']) {
  bothMkt(`both write the ${kind} asset`, `insertAsset('${kind}'`);
}

// Both paths PERSIST the produced work with the same rules (the arc path used to drop it).
check('the worker persists through the shared seam (grounded versions, floors as seed)',
  srv.includes("r.grounded ? 'garvis' : SEED_SOURCE") && srv.includes('versionCreativeSlugsSrv'));
check('the client arc executors persist too — work lands, on both paths',
  [...registry.matchAll(/persistProduced\(area\.clusterId, res\)/g)].length === 2);

// The worker credit-gates BEFORE each producer runs (the SW1.5 precondition for this port).
for (const [gate, action] of [
  ["checkCredits(admin, ownerId, 'research')", 'research_market'],
  ["checkCredits(admin, ownerId, 'plan')", 'business_plan + marketing_campaign + genesis'],
] as const) {
  check(`the worker gates ${action} with ${gate.match(/'([a-z_]+)'/)![1]} credits`, worker.includes(gate));
}

// ---- SW6.3: the genesis composites — and the END STATE this whole sub-wave was driving at.
check('END STATE: the client-only allowlist is exactly the two browser handoffs, forever',
  Object.keys(CLIENT_ONLY).sort().join() === 'build_app,template_document');

const genSrv = readFileSync(join(here, '../../../supabase/functions/_shared/genesisSrv.ts'), 'utf8');
const genRun = readFileSync(join(here, 'genesisRun.ts'), 'utf8');
const bothGen = (name: string, needle: string) => check(name, genSrv.includes(needle) && genRun.includes(needle));
bothGen('both genesis paths run the same two-stage parse (DNA), one bounded retry each', 'if (!dna) dna = parseDNA(await reason(');
bothGen('…and the same web synthesis parse with the same retry seam', 'if (second.draft) parsed = second;');
bothGen('…with the identical JSON-only reminder on both sides', 'Return ONLY the complete JSON object');
bothGen('both persist ONLY a draft row', "status: 'draft'");
bothGen("both mark the row 'generated'", "source: 'generated'");
bothGen('both refuse a too-short intent with the same words', 'Say a little more about the business');
check('the server genesis path NEVER touches worlds — approval stays the client ceremony',
  !genSrv.includes("from('knowledge_worlds')"));

check('found_company gates plan credits before drafting, and the outcome is review-only',
  portedBlock.indexOf("case 'found_company'") > 0
  && /case 'found_company': \{\s*\n\s*await checkCredits\(admin, ownerId, 'plan'\)/.test(portedBlock)
  && portedBlock.includes('approve to instantiate'));
// The client's onboard flow lives in clientEngagementRun; the channel clock in channelsRun.
const engagementRun = readFileSync(join(here, 'clientEngagementRun.ts'), 'utf8');
const channelsRun = readFileSync(join(here, 'channelsRun.ts'), 'utf8');
const bothEng = (name: string, needle: string) => check(name, portedBlock.includes(needle) && engagementRun.includes(needle));
bothEng('onboard_client derives the same intake checklist', 'intakeFor(');
bothEng("…opens the engagement as 'prospect'", "status: 'prospect'");
bothEng('…and keeps the draft best-effort (a failed draft never loses the client)', 'The world draft could not be created.');
check('onboard_client opens the engagement BEFORE attempting the draft',
  portedBlock.indexOf("from('client_engagements')") < portedBlock.indexOf('clientWorldIntent('));
const bothReg = (name: string, needle: string) => check(name, portedBlock.includes(needle) && registry.includes(needle));
bothReg('launch_vertical speaks with the same library persona default', "lib?.persona ?? 'clear, cited, no hype'");
check('launch_vertical arms the daily episode clock (the same order kind the studio arms)',
  portedBlock.includes("kind: 'episode_draft'") && channelsRun.includes("kind: 'episode_draft'"));
bothReg('…and tells the truth when episode one cannot draft yet', 'Episode one waits (');
check('launch_vertical instantiates the content-channel pattern with the studio wired',
  portedBlock.includes("instantiateTemplateSrv(admin, ownerId, 'content-channel'")
  && portedBlock.includes("clusterIdBySlug.get('growth-studio')"));

console.log(`\narcParity.verify: ${passed} passed, ${failed} failed`
  + ` (server: ${serverActions.length}, client-only: ${Object.keys(CLIENT_ONLY).length}, catalog: ${catalogIds.length})`);
if (failed) throw new Error(`${failed} arc parity check(s) failed`);
