// src/lib/garvis/workweb.verify.ts
// Standalone verification of the Work Web pure model + plays (run: `npm run verify:workweb`).
// Guards the contracts the impure layer depends on: template integrity (slugs, parent order),
// tool-registry coverage, play↔template slug agreement, CSV parsing, rollup math, charter parsing.

import {
  ARCHETYPES, FLAVORS, TOOL_IDS, makeCharter, parseCharter, toolsFor,
  MOM_REAL_ESTATE_TEMPLATE, APP_LAUNCH_TEMPLATE, WEB_TEMPLATES, templateById,
  flattenTemplate, validateTemplate, parseAudienceCsv, rollupWeb, deriveStatus,
  type Archetype,
} from './workweb';
import { PLAYS, LAKEFRONT_SELLER_PLAY, playById, validatePlay, DEFAULT_LAKE_GENEVA_CONTEXT } from './plays';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const playIds = PLAYS.map((p) => p.id);

// 1. Every template validates clean (slug rules, parent-first, tools present, plays known).
for (const t of WEB_TEMPLATES) {
  const problems = validateTemplate(t, playIds);
  check(`template "${t.id}" validates`, problems.length === 0, problems.join('; '));
}

// 2. Every archetype has tools for EVERY flavor (the registry can never strand a charter).
for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
  const allHaveTools = FLAVORS.every((f) => toolsFor(makeCharter(a, f)).length > 0);
  check(`archetype "${a}" has tools for every flavor`, allHaveTools);
}

// 3. All registry tool ids are registered TOOL_IDs (no orphan buttons).
{
  const ids = new Set<string>();
  for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
    for (const f of FLAVORS) for (const tool of toolsFor(makeCharter(a, f))) ids.add(tool.id);
  }
  const unknown = [...ids].filter((id) => !(TOOL_IDS as readonly string[]).includes(id));
  check('every emitted tool id is a registered TOOL_ID', unknown.length === 0, unknown.join(','));
}

// 4. Mom template: parent-first flatten, Direct Mail decomposed, launch areas exist.
{
  const flat = flattenTemplate(MOM_REAL_ESTATE_TEMPLATE);
  const slugs = flat.map((n) => n.slug);
  check('mom web has the direct-mail production sub-areas',
    ['direct-mail-strategy', 'direct-mail-lists', 'direct-mail-creative', 'direct-mail-send', 'direct-mail-follow-up', 'direct-mail-results']
      .every((s) => slugs.includes(s)));
  const dmIdx = slugs.indexOf('direct-mail');
  check('parents precede children in flatten order', dmIdx >= 0 && dmIdx < slugs.indexOf('direct-mail-creative'));
  check('mom web declares the lakefront-seller play', MOM_REAL_ESTATE_TEMPLATE.playIds.includes('lakefront-seller'));
  check('templateById resolves', templateById('mom-real-estate') === MOM_REAL_ESTATE_TEMPLATE && templateById('nope') === null);
  check('app-launch template proves generality (has all 7 archetypes across nodes)',
    (['intel', 'audience', 'studio', 'launch', 'loop', 'ledger', 'vault'] as Archetype[])
      .every((a) => flattenTemplate(APP_LAUNCH_TEMPLATE).some((n) => n.charter.archetype === a)));
}

// 5. The lakefront-seller play validates against the mom template (acceptance-test wiring).
{
  const slugs = flattenTemplate(MOM_REAL_ESTATE_TEMPLATE).map((n) => n.slug);
  const problems = validatePlay(LAKEFRONT_SELLER_PLAY, slugs, DEFAULT_LAKE_GENEVA_CONTEXT);
  check('lakefront-seller play validates against the mom web', problems.length === 0, problems.join('; '));
  check('play covers research → angle → postcard → email → landing → social → video',
    ['research', 'angle', 'postcard', 'email-seq', 'landing', 'social', 'video']
      .every((id) => LAKEFRONT_SELLER_PLAY.steps.some((s) => s.id === id)));
  check('playById resolves', playById('lakefront-seller') === LAKEFRONT_SELLER_PLAY && playById('nope') === null);
  const seq = LAKEFRONT_SELLER_PLAY.emailSequence(DEFAULT_LAKE_GENEVA_CONTEXT);
  check('email sequence steps are 0,1,2 with Re: threading on bumps',
    seq.map((e) => e.step).join(',') === '0,1,2' && seq[1].subject.startsWith('Re: ') && seq[2].subject.startsWith('Re: '));
  check('email bodies carry the personalization slot', seq.every((e) => e.body.includes('{{first_name}}')));
}

// 6. Charter parsing is tolerant of garbage.
check('parseCharter accepts a valid charter', parseCharter({ archetype: 'studio', flavor: 'video', status: 'active', refs: [] })?.flavor === 'video');
check('parseCharter rejects junk archetype', parseCharter({ archetype: 'wizard' }) === null);
check('parseCharter defaults bad flavor/status', (() => {
  const c = parseCharter({ archetype: 'intel', flavor: 'nope', status: 'nope', refs: 'nope' });
  return c?.flavor === 'generic' && c?.status === 'dormant' && c?.refs.length === 0;
})());
check('parseCharter handles null/undefined/strings', parseCharter(null) === null && parseCharter('x') === null && parseCharter(42) === null);

// 7. Audience CSV parsing.
{
  const r = parseAudienceCsv('name,email\nJane Shore,jane@lakefront.example\n"Bob Pier",BOB@pier.example\nnot-an-email-row\njane@lakefront.example');
  check('csv parses valid rows with names', r.contacts.length === 2 && r.contacts[0].name === 'Jane Shore');
  check('csv lowercases + dedupes emails', r.contacts[1].email === 'bob@pier.example' && r.skipped === 2);
  const emailOnly = parseAudienceCsv('a@b.co\nb@c.co');
  check('csv handles email-only lists', emailOnly.contacts.length === 2 && emailOnly.contacts[0].name === null);
  check('csv of garbage yields nothing but never throws', parseAudienceCsv(',,,\n\n???').contacts.length === 0);
}

// 8. Rollup + status derivation math.
{
  const roll = rollupWeb({ artifactCount: 7, approvalStatuses: ['pending', 'approved', 'pending', 'rejected'], sentCount: 3, replyCount: 1 });
  check('rollup counts', roll.artifacts === 7 && roll.pendingApprovals === 2 && roll.approvedActions === 1 && roll.messagesSent === 3 && roll.replies === 1);
  check('status: pending approvals → waiting', deriveStatus(makeCharter('launch'), 5, 2) === 'waiting');
  check('status: artifacts → active', deriveStatus(makeCharter('studio'), 3, 0) === 'active');
  check('status: empty → dormant', deriveStatus(makeCharter('studio'), 0, 0) === 'dormant');
  check('status: done sticks when nothing pending', deriveStatus({ ...makeCharter('studio'), status: 'done' }, 3, 0) === 'done');
}

console.log(`\nworkweb.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} workweb check(s) failed`);
