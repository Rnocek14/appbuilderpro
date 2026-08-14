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
const CLIENT_ONLY: Record<string, string> = {
  found_company: 'genesis draft flow runs through client-side genesisRun',
  onboard_client: 'engagement + intake checklist built by client-side clientEngagementRun',
  research_market: 'producer pipeline (grounded research) runs client-side',
  business_plan: 'producer pipeline (draft → red-team → refine) runs client-side',
  marketing_campaign: 'three-stage campaign compiler runs client-side',
  email_segment: 'segment staging runs through client-side batch flow',
  queue_social_post: 'post staging runs through client-side social flow',
  build_app: 'hands off to the forge — generation needs the browser workspace',
  template_document: 'hands off to the Paperwork studio — a browser surface',
  draft_episode: 'episode drafting invoked from the client executor',
  start_app_marketing: 'world instantiation from template runs client-side',
  point_channel_cta: 'channel CTA update runs client-side',
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

console.log(`\narcParity.verify: ${passed} passed, ${failed} failed`
  + ` (server: ${serverActions.length}, client-only: ${Object.keys(CLIENT_ONLY).length}, catalog: ${catalogIds.length})`);
if (failed) throw new Error(`${failed} arc parity check(s) failed`);
