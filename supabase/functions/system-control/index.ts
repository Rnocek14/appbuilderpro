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
//
// Auth: owner JWT (the operator, from the Health page). This is a single-operator system; any
// authenticated user IS the operator. Secrets are reported as present/absent only.
// Deploy: supabase functions deploy system-control

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };

// Every secret a pillar needs, with what it lights up — the Health page renders this map.
// Presence only: Deno.env.get(name) checked for truthiness, values never returned.
const SECRETS: { name: string; pillar: string; unlocks: string }[] = [
  { name: 'WORKER_SECRET', pillar: 'heartbeat', unlocks: 'All cron workers (shared x-worker-secret)' },
  { name: 'CRON_SECRET', pillar: 'heartbeat', unlocks: 'Daily cron functions (followups, inbox-draft, reactivate, invoice-chase)' },
  { name: 'RESEND_API_KEY', pillar: 'email', unlocks: 'Sending real email (send-email)' },
  { name: 'RESEND_WEBHOOK_SECRET', pillar: 'email', unlocks: 'Bounce/open/click tracking (resend-webhook)' },
  { name: 'INBOUND_SECRET', pillar: 'email', unlocks: 'Reply ingestion (resend-inbound)' },
  { name: 'AYRSHARE_API_KEY', pillar: 'social', unlocks: 'Real social posting (social-publish)' },
  { name: 'SHOTSTACK_API_KEY', pillar: 'video', unlocks: 'Video rendering (render-video)' },
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
      : 'status';

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
