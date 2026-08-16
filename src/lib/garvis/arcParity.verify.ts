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
  found_company: 'genesis draft flow runs through client-side genesisRun',
  onboard_client: 'engagement + intake checklist built by client-side clientEngagementRun',
  research_market: 'producer pipeline (grounded research) runs client-side',
  business_plan: 'producer pipeline (draft → red-team → refine) runs client-side',
  marketing_campaign: 'three-stage campaign compiler runs client-side',
  build_app: 'browser genuinely required (the forge) — the worker stages an honest handoff with the link',
  template_document: 'browser genuinely required (Paperwork studio) — the worker stages an honest handoff with the link',
  launch_vertical: 'composite founding flow runs client-side',
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
check('draft_episode gates credits BEFORE the model call and records the spend after',
  portedBlock.indexOf("checkCredits(admin, ownerId, 'short_script')") > 0
  && portedBlock.indexOf("checkCredits(admin, ownerId, 'short_script')") < portedBlock.indexOf('await complete([')
  && portedBlock.includes('await spendCredits(admin, ownerId,'));
check('draft_episode saves only a parseFactScript-validated script',
  portedBlock.includes('parseFactScript(rawScript)') && portedBlock.includes('if (!parsed.ok) throw new Error(parsed.reason)'));
check('start_app_marketing instantiates the real template, not an ad-hoc world',
  portedBlock.includes("templateById('app-marketing')") && portedBlock.includes('flattenTemplate(t)'));
check('a missing channel PARKS the step waiting (a seam, not a failure)',
  [...portedBlock.matchAll(/throw \{ waiting: 'No content channel exists yet/g)].length === 2);
check('the ported block never touches a send path — approvals are its only outward edge',
  !/api\.twilio\.com|resend\.com|functions\.invoke\('send-|social-publish/.test(portedBlock));

// The spend wall parks, never kills: a 402 (kill switch, caps, empty balance) leaves the step
// waiting for the operator, and the wake sweep resumes it.
check('a 402 spend wall parks the arc step as waiting',
  worker.includes(".status === 402") && /spendWall\s*\?\s*\{ kind: 'waiting'/.test(worker.replace(/\n\s*/g, ' ')));

console.log(`\narcParity.verify: ${passed} passed, ${failed} failed`
  + ` (server: ${serverActions.length}, client-only: ${Object.keys(CLIENT_ONLY).length}, catalog: ${catalogIds.length})`);
if (failed) throw new Error(`${failed} arc parity check(s) failed`);
