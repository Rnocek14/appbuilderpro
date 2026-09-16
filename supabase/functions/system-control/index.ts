// supabase/functions/system-control/index.ts
// THE MASTER SWITCH PANEL — answers, from the server where the truth lives, the one question the
// operator could never see from the app: "is the brain actually on?"
//
//   status → which edge secrets are SET (presence booleans only — values never leave the server),
//            which garvis cron jobs are scheduled (via garvis_cron_status(), app_0087), and the
//            latest system_heartbeat stamps. This is the line between real and dark.
//   arm    → runs garvis_arm_heartbeat(functions_base, worker_secret) — the one-time call that
//            schedules all 9 unattended jobs and was previously documented only in a migration
//            comment. Idempotent: re-arming re-schedules with the new URL/secret.
//   set    → SETS an edge secret from inside the app, through the Supabase Management API.
//
// WHY `set` EXISTS: the platform survey found that three secrets decide whether anything at all
// happens — the AI key, APP_ORIGIN and WORKER_SECRET — and that NO field anywhere in the app accepted
// any of them. They could only be typed into the Supabase dashboard from a terminal, so a
// non-technical owner pressed the one button on the one daily-loop page and hit a dead end naming a
// key they had no way to enter. Reading presence while refusing to let anyone fix it is the worst of
// both worlds: the app knew exactly what was wrong and could not help.
//
// The machinery was already here — deploy-backend has written edge secrets through the Management API
// for ages; it was just never pointed at the owner's OWN project. This does that, with the same
// discipline: the token is the owner's own Supabase personal access token, stored server-side via
// Settings → Connections and never returned to the browser; the project is derived from this
// deployment's own SUPABASE_URL (never from the request, so a caller cannot aim it at someone else's
// project); and only names on the SECRETS allowlist below can be written.
//
// Auth: owner JWT (the operator, from the Health page). This is a single-operator system; any
// authenticated user IS the operator. Secrets are reported as present/absent only.
// Deploy: supabase functions deploy system-control

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getConnection } from '../_shared/connections.ts';
import { publicOriginProblem, normalizeOrigin } from '../_shared/appOriginCore.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// Every secret a pillar needs, with what it lights up — the Health page renders this map.
// Presence only: Deno.env.get(name) checked for truthiness, values never returned.
const SECRETS: { name: string; pillar: string; unlocks: string }[] = [
  { name: 'WORKER_SECRET', pillar: 'heartbeat', unlocks: 'All cron workers (shared x-worker-secret)' },
  { name: 'CRON_SECRET', pillar: 'heartbeat', unlocks: 'Daily cron functions (followups, inbox-draft, reactivate, invoice-chase)' },
  { name: 'RESEND_API_KEY', pillar: 'email', unlocks: 'Sending real email (send-email)' },
  { name: 'RESEND_WEBHOOK_SECRET', pillar: 'email', unlocks: 'Bounce/open/click tracking (resend-webhook)' },
  { name: 'INBOUND_SECRET', pillar: 'email', unlocks: 'Reply ingestion (resend-inbound)' },
  { name: 'TWILIO_ACCOUNT_SID', pillar: 'texting', unlocks: 'SMS reminders + missed-call text-back (send-sms, voice-inbound)' },
  { name: 'TWILIO_AUTH_TOKEN', pillar: 'texting', unlocks: 'Twilio auth + missed-call webhook signature check (send-sms, voice-inbound)' },
  { name: 'TWILIO_FROM_NUMBER', pillar: 'texting', unlocks: 'The number SMS automations send from (send-sms)' },
  // Social posting does NOT use an edge secret: the Ayrshare key is per-user, sealed in
  // provider_connections via Settings → Connections (getConnection). Listing a phantom
  // AYRSHARE_API_KEY secret here sent operators to set an env var no code reads.
  { name: 'SHOTSTACK_API_KEY', pillar: 'video', unlocks: 'Video rendering (render-video)' },
  { name: 'GEMINI_API_KEY', pillar: 'video', unlocks: 'Veo photoreal scene generation (generate-video)' },
  { name: 'SERPER_API_KEY', pillar: 'research', unlocks: 'Web search for research + prospecting (discover-media)' },
  { name: 'PERPLEXITY_API_KEY', pillar: 'research', unlocks: 'Topic discovery in Explorer (discover-media)' },
  { name: 'GOOGLE_PLACES_API_KEY', pillar: 'prospecting', unlocks: 'Daily client hunt + business leads (discover-media, standing-worker)' },
  { name: 'APP_ORIGIN', pillar: 'prospecting', unlocks: 'The demo-link base in prospect pitches — UNSET means hunts build demos but NO pitch is ever queued (standing-worker)' },
  { name: 'SCREENSHOT_API_KEY', pillar: 'prospecting', unlocks: 'Site screenshots for audits (shot-worker)' },
  { name: 'EMBEDDINGS_API_KEY', pillar: 'memory', unlocks: 'Semantic recall — without it the brain falls back to keyword matching (embed-worker)' },
  { name: 'ANTHROPIC_API_KEY', pillar: 'intelligence', unlocks: 'Server-side model calls (agent-turn relay, workers)' },
  { name: 'NETLIFY_AUTH_TOKEN', pillar: 'ship', unlocks: 'One-click site deploys (deploy-site)' },
  { name: 'SB_MANAGEMENT_TOKEN', pillar: 'ship', unlocks: 'Database provisioning + backend deploys (provision-supabase, deploy-backend)' },
  { name: 'STRIPE_SECRET_KEY', pillar: 'money', unlocks: 'Checkout + billing (create-checkout, stripe-webhook)' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'arm' ? 'arm'
      : body?.action === 'probe_places' ? 'probe_places'
      : body?.action === 'set' ? 'set'
      : 'status';

    // ---- set an edge secret, from inside the app ----
    if (action === 'set') {
      const name = String(body?.name ?? '').trim();
      const value = String(body?.value ?? '');
      const allowed = SECRETS.some((sx) => sx.name === name);
      if (!allowed) {
        return json({ error: `"${name}" is not a key this app uses. Nothing was changed.` }, 400);
      }
      if (!value.trim()) return json({ error: 'Paste the key\u2019s value \u2014 an empty value would switch the feature off.' }, 400);

      // APP_ORIGIN IS THE ONE WHOSE WRONG VALUE IS WORSE THAN ITS MISSING ONE. It is the base of the
      // demo link inside a cold email to a real business. Unset, standing-worker refuses to queue any
      // pitch and nothing goes out. Set to a laptop address, every check reports ready and every
      // recipient gets a link to their own machine — and the only person who cannot see that is the
      // one who set it. Refused here as well as in the browser, because the browser is not the only
      // way to reach this action.
      if (name === 'APP_ORIGIN') {
        const problem = publicOriginProblem(value);
        if (problem) return json({ error: problem, field: 'APP_ORIGIN' }, 400);
      }

      const conn = await getConnection(admin, user.id, 'supabase');
      if (!conn?.access_token) {
        return json({
          error: 'Connect Supabase first \u2014 one paste of a personal access token, and every other key can be set from here.',
          needs: 'supabase_connection',
        }, 409);
      }

      // The project is THIS deployment, derived from its own URL. Never from the caller.
      const ref = (Deno.env.get('SUPABASE_URL') ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i)?.[1];
      if (!ref) {
        return json({ error: 'Could not work out which Supabase project this is running on.' }, 500);
      }

      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.access_token}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify([{ name, value: name === 'APP_ORIGIN' ? normalizeOrigin(value) : value }]),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 240);
        const hint = res.status === 401 || res.status === 403
          ? ' \u2014 the Supabase token was rejected. Reconnect it in Settings \u2192 Connections.'
          : res.status === 404 ? ' \u2014 that Supabase project was not found for this token.' : '';
        return json({ error: `Supabase refused to save the key (${res.status}${hint}). ${detail}` }, 502);
      }

      // The VALUE is never logged, here or anywhere. Only that it was set, and by whom.
      await admin.from('execution_runs').insert({
        owner_id: user.id, connector: 'supabase', action: 'set_secret',
        status: 'ok', request: { name },
      }).then(() => {}, () => {});

      // Edge functions read secrets at boot, so a just-saved key is live for NEW invocations but this
      // running instance still holds the old environment. Say so rather than let the light lie.
      return json({
        ok: true, name,
        note: 'Saved. It takes about a minute to reach the running functions \u2014 the light here may lag until then.',
      });
    }

    // PROBE the Google Places key with a real (tiny) call — presence booleans can't tell a VALID key
    // from an invalid/over-quota one, which fails every hunt while the readiness light reads green.
    if (action === 'probe_places') {
      const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
      if (!key) return json({ ok: false, reason: 'GOOGLE_PLACES_API_KEY is not set — add it in Supabase secrets.' });
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' },
          body: JSON.stringify({ textQuery: 'coffee shop', maxResultCount: 1, regionCode: 'US' }),
        });
        if (res.ok) {
          const j = (await res.json().catch(() => ({}))) as { places?: unknown[] };
          return json({ ok: true, reason: `Key works — Places answered a test query (${j.places?.length ?? 0} result).` });
        }
        const snippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
        const hint = res.status === 403 ? ' — key invalid, Places API (New) not enabled, or key API-restrictions block it'
          : res.status === 429 ? ' — over quota / rate-limited'
          : res.status === 400 ? ' — request rejected (check billing is enabled on the project)'
          : '';
        return json({ ok: false, status: res.status, reason: `Places rejected the key (${res.status}${hint}). ${snippet}` });
      } catch (e) {
        return json({ ok: false, reason: `Could not reach Places: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    if (action === 'arm') {
      const base = String(body?.functionsBase ?? '').trim();
      const secret = String(body?.workerSecret ?? '').trim();
      if (!base || !secret) return json({ error: 'Pass functionsBase (this project\'s functions URL) and workerSecret.' }, 400);
      const { data, error } = await admin.rpc('garvis_arm_heartbeat', { p_functions_base: base, p_secret: secret });
      if (error) {
        // pg_cron / vault not installed reads as a missing function or schema — say so usefully.
        return json({ error: `Arm failed: ${error.message}. The heartbeat needs the pg_cron + vault extensions and migration app_0059 applied.` }, 500);
      }
      return json({ armed: true, result: data ?? 'armed' });
    }

    // ---- status ----
    const secrets = SECRETS.map((s) => ({ ...s, set: !!Deno.env.get(s.name) }));

    let cron: { jobname: string; schedule: string; active: boolean }[] = [];
    let cronError: string | null = null;
    {
      const { data, error } = await admin.rpc('garvis_cron_status');
      if (error) cronError = /function .* does not exist/i.test(error.message) ? 'migration app_0087 not applied' : error.message;
      else cron = (data ?? []) as typeof cron;
    }

    // Latest heartbeat stamps — proof the scheduled jobs actually FIRE, not just exist.
    const { data: beats } = await admin.from('system_heartbeat')
      .select('*').order('last_tick_at', { ascending: false }).limit(12);

    return json({ secrets, cron, cronError, heartbeat: beats ?? [] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'system-control failed' }, 500);
  }
});
