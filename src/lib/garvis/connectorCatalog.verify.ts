// Run: npx tsx src/lib/garvis/connectorCatalog.verify.ts
// The API manager's contract: one catalog drives the hub; every provider the backend accepts is
// probed live before it saves; tokens and platform key VALUES never reach the browser (booleans
// only); and the status copy is honest — it names what breaks, says which key is carrying a
// service, and never claims a connection that isn't there.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECTOR_CATALOG, SERVICE_PROVIDER_IDS, connectorStatusLine } from './connectorCatalog';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- catalog shape ----
{
  const ids = CONNECTOR_CATALOG.map((c) => c.id);
  check('ids are unique', new Set(ids).size === ids.length);
  check('the four service keys are cataloged',
    ['resend', 'lob', 'google_places', 'twilio'].every((id) => SERVICE_PROVIDER_IDS.includes(id)));
  check('every entry says what it POWERS in plain words',
    CONNECTOR_CATALOG.every((c) => c.powers.length > 10 && !/api|env|token/i.test(c.powers)));
  check('every non-OAuth connectable row says where the key comes from',
    CONNECTOR_CATALOG.filter((c) => !c.oauth && c.kind !== 'platform').every((c) => c.url.startsWith('https://')));
  check('the platform rows are anthropic and stripe',
    CONNECTOR_CATALOG.filter((c) => c.kind === 'platform').map((c) => c.id).sort().join() === 'anthropic,stripe');
  const anthropic = CONNECTOR_CATALOG.find((c) => c.id === 'anthropic')!;
  check('anthropic is paste-able in-app and says the sync contract out loud',
    anthropic.pasteable === true && anthropic.hint.includes('deploy run'));
  check('stripe stays report-only', CONNECTOR_CATALOG.find((c) => c.id === 'stripe')!.pasteable !== true);
}

// ---- honest status copy ----
{
  const resend = CONNECTOR_CATALOG.find((c) => c.id === 'resend')!;
  check('a connected service row names the account',
    connectorStatusLine(resend, { connected: true, label: 'mail.acme.com', platformConfigured: true }) === 'connected · mail.acme.com');
  check('platform fallback is stated, never passed off as the user\'s own key',
    connectorStatusLine(resend, { connected: false, label: null, platformConfigured: true }).startsWith('running on the platform key'));
  const dead = connectorStatusLine(resend, { connected: false, label: null, platformConfigured: false });
  check('a dead service names its cost', dead.includes("won't run") && dead.includes(resend.powers));
  const anthropic = CONNECTOR_CATALOG.find((c) => c.id === 'anthropic')!;
  check('a missing platform key is missing, not hedged',
    connectorStatusLine(anthropic, { connected: false, label: null, platformConfigured: false }).includes("won't run"));
  check('a pasted-but-unsynced platform key says exactly where it stands',
    connectorStatusLine(anthropic, { connected: true, label: 'Anthropic', platformConfigured: false }).includes('next deploy run'));
}

// ---- wiring pins (textual proof against the real sources) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const fn = read('supabase/functions/connections/index.ts');
const shared = read('supabase/functions/_shared/connections.ts');
const hub = read('src/components/ConnectionsHub.tsx');
const hook = read('src/hooks/useConnections.ts');
{
  for (const id of CONNECTOR_CATALOG.filter((c) => c.kind !== 'platform').map((c) => c.id)) {
    check(`backend accepts provider: ${id}`, fn.includes(`'${id}'`));
  }
  for (const id of [...SERVICE_PROVIDER_IDS, 'anthropic']) {
    check(`live probe exists for: ${id}`, shared.includes(`provider === '${id}'`));
  }
  // The CI bridge: keys pasted in the app reach the rails that run outside it.
  const deployWf = read('.github/workflows/deploy-supabase.yml');
  const frontendWf = read('.github/workflows/deploy-frontend.yml');
  const evalWf = read('.github/workflows/routing-eval.yml');
  check('the deploy pulls the app-pasted Anthropic key into function secrets (repo secret wins)',
    deployWf.includes('Sync keys pasted in the app') && deployWf.includes("provider = '\\''anthropic'\\''")
    && deployWf.includes('the repo wins'));
  check('the frontend deploy pulls the app-connected Netlify token (masked, secret overrides)',
    frontendWf.includes("provider = '\\''netlify'\\''") && frontendWf.includes('::add-mask::'));
  check('the live eval reaches the app-pasted key the same way',
    evalWf.includes("provider = '\\''anthropic'\\''") && evalWf.includes('::add-mask::'));
  check('a token only saves after its probe PASSES',
    fn.indexOf('probeProvider(provider, token.trim())') < fn.indexOf('upsertConnection(admin, user.id, provider'));
  check('list returns sanitized status — access_token is never selected for the browser',
    /action === 'list'[\s\S]{0,400}select\('provider, account_label, expires_at'\)/.test(fn));
  const statusBlock = fn.slice(fn.indexOf("action === 'status'"), fn.indexOf("action === 'list'"));
  check('platform status is BOOLEANS only — a value can never leak through it',
    statusBlock.includes('!!Deno.env.get') && !statusBlock.replace(/!!Deno\.env\.get/g, '').includes('Deno.env.get'));
  check('twilio tokens are a validated SID:secret pair',
    shared.includes('splitTwilioToken') && shared.includes('AC[0-9a-fA-F]{32}'));
  check('the hub renders FROM the catalog — one registry, no fork',
    hub.includes('CONNECTOR_CATALOG') && hub.includes('connectorStatusLine'));
  check('the hook fetches platform status alongside the list',
    hook.includes("action: 'status'") && hook.includes('platformHas'));
}

// ---- part 2: connection-first consumption (the owner's key carries their calls) ----
{
  check('serviceKey resolves the CONNECTION first, platform env second',
    /serviceKey[\s\S]{0,500}getConnection[\s\S]{0,300}source: 'connection'[\s\S]{0,200}Deno\.env\.get\(envName\)/.test(shared));
  check('a connections-table hiccup degrades to the platform key, never a crash',
    /getConnection\(admin, ownerId, provider\)\.catch\(\(\) => null\)/.test(shared));
  check('twilioCreds prefers the connected pair + its from number, platform as fallback',
    shared.includes('splitTwilioToken(conn.access_token)') && /twilioCreds[\s\S]{0,900}source: 'platform'/.test(shared));
  const consumers: [string, string][] = [
    ['send-email', 'serviceKey(admin, uid, \'resend\''],
    ['sender-domain', 'serviceKey(admin, uid, \'resend\''],
    ['lob-verify', 'serviceKey(admin, user.id, \'lob\''],
    ['lob-send', 'serviceKey(admin, uid, \'lob\''],
    ['discover-run', 'serviceKey(admin, ownerId, \'google_places\''],
    ['discover-media', 'serviceKey(admin, user.id, \'google_places\''],
    ['lead-ingest', 'serviceKey(admin, ownerId, \'google_places\''],
    ['system-control', 'serviceKey(admin, user.id, \'google_places\''],
    ['garvis-pulse', 'twilioCreds(admin, owner)'],
    ['garvis-line', 'twilioCreds(admin, user.id)'],
    ['send-sms', 'twilioCreds(admin, uid)'],
  ];
  for (const [fnName, needle] of consumers) {
    check(`${fnName} consumes connection-first`, read(`supabase/functions/${fnName}/index.ts`).includes(needle));
  }
  const worker = read('supabase/functions/standing-worker/index.ts');
  check('all three standing-worker hunt paths consume connection-first',
    (worker.match(/connectionKey\(admin, /g) ?? []).length === 3);
  check('inbound webhooks stay on the PLATFORM auth token — per-user keys never gate inbound routing',
    !read('supabase/functions/sms-inbound/index.ts').includes('twilioCreds')
    && !read('supabase/functions/voice-inbound/index.ts').includes('twilioCreds')
    && shared.includes('inbound routing'));
}

console.log(`\nconnectorCatalog.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} connector check(s) failed`);
