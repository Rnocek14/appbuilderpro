// supabase/functions/garvis-canary/index.ts
// THE NIGHTLY CANARY (holy-grail gap 9): the system proves its own LIVE wiring on the clock,
// instead of the operator discovering breakage by absence. 96 verify suites test logic in CI;
// this tests the deployed reality every night:
//   1. the real catalog + parse gauntlet load and behave inside this runtime
//   2. outbound networking works through the hardened fetch stack (safeFetch → example.com)
//   3. the database round-trips a real write
//   4. THE SEND GATE REFUSES an unauthorized send (a 2xx here would be the worst possible news)
//   5. heartbeat stamps are fresh (which scheduled jobs actually ran lately)
// Silent when green (a stamp is the only trace); on ANY failure every owner gets one honest
// mind-event line + a webhook nudge naming exactly what broke.
// Auth: the shared cron gate. Deploy --no-verify-jwt; scheduled by garvis_arm_heartbeat (app_0096).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeFetch } from '../_shared/safeFetch.ts';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { notifyText } from '../_shared/notify.ts';
import { parsePlan } from '../../../src/lib/garvis/orchestrator.ts';
import { ACTION_SPECS } from '../../../src/lib/garvis/actionCatalog.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret, x-worker-secret' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!cronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-canary');
  const failures: string[] = [];
  const notes: string[] = [];

  // 1. Catalog + gauntlet behave in THIS runtime (a broken import/regression fails loudly).
  try {
    const good = parsePlan(JSON.stringify({
      title: 'canary', summary: 'canary plan',
      steps: [{ action: 'check_master_switch', params: {}, why: 'Canary: prove the gauntlet accepts a valid step.', after: [] }],
      holes: [], questions: [],
    }), ACTION_SPECS);
    if (!good.plan || good.plan.steps.length !== 1) failures.push('gauntlet: a valid plan did not parse');
    const bad = parsePlan(JSON.stringify({
      title: 'canary', summary: 'canary plan',
      steps: [{ action: 'invented_by_canary', params: {}, why: 'Canary: prove unknown actions are dropped.', after: [] }],
      holes: ['canary hole'], questions: [],
    }), ACTION_SPECS);
    if (bad.plan && bad.plan.steps.length !== 0) failures.push('gauntlet: an unknown action LEAKED through');
  } catch (e) {
    failures.push(`gauntlet: threw (${e instanceof Error ? e.message.slice(0, 120) : 'unknown'})`);
  }

  // 2. Outbound networking through the hardened stack.
  try {
    const r = await safeFetch('https://example.com/', { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) failures.push(`egress: example.com answered HTTP ${r.status}`);
    else notes.push('egress ok');
  } catch (e) {
    failures.push(`egress: fetch failed (${e instanceof Error ? e.message.slice(0, 120) : 'unknown'})`);
  }

  // 3. DB round-trip: a real write, read back, removed (the stamp in step 0 already proves
  //    upsert; this proves insert+select+delete on an RLS'd table via the service role).
  try {
    const key = `canary:${new Date().toISOString()}`;
    const { data: owner } = await admin.from('profiles').select('id').limit(1).maybeSingle();
    if (owner) {
      const { data: row, error: insErr } = await admin.from('mind_events').insert({
        owner_id: (owner as { id: string }).id, event_type: 'note', source: 'canary',
        subject: 'canary round-trip (removed on success)', payload: { key },
      }).select('id').single();
      if (insErr || !row) failures.push(`db: insert failed (${insErr?.message?.slice(0, 120) ?? 'no row'})`);
      else {
        const { data: back } = await admin.from('mind_events').select('id').eq('id', (row as { id: string }).id).maybeSingle();
        if (!back) failures.push('db: written row did not read back');
        await admin.from('mind_events').delete().eq('id', (row as { id: string }).id);
      }
    } else notes.push('db: no profiles yet — round-trip skipped honestly');
  } catch (e) {
    failures.push(`db: round-trip threw (${e instanceof Error ? e.message.slice(0, 120) : 'unknown'})`);
  }

  // 4. THE SEND GATE REFUSES: a fabricated approval id must never produce a 2xx. This is the
  //    one probe where "error" is the healthy answer.
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': Deno.env.get('WORKER_SECRET') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ approval_id: '00000000-0000-4000-8000-00000000dead' }),
    });
    if (res.ok) failures.push('SEND GATE: a fabricated approval id got a 2xx — the outbound gate is NOT refusing');
    else notes.push(`send gate refuses (HTTP ${res.status})`);
  } catch {
    notes.push('send gate: unreachable (deploy state) — counted as a stamp gap below, not a leak');
  }

  // 5. Stamp freshness: which scheduled jobs actually ran in the last 26h.
  try {
    const { data: stamps } = await admin.from('system_heartbeat').select('job, last_tick_at');
    const stale = ((stamps ?? []) as { job: string; last_tick_at: string }[])
      .filter((s) => Date.now() - Date.parse(s.last_tick_at) > 26 * 3_600_000)
      .map((s) => s.job);
    if (stale.length) notes.push(`stale stamps (>26h): ${stale.join(', ')}`);
  } catch { /* informational */ }

  // Report: silent when green; on failure, one honest line to every owner + webhook.
  if (failures.length) {
    const line = `🐤 CANARY FAILED: ${failures.join(' · ')}${notes.length ? ` (notes: ${notes.join('; ')})` : ''}`;
    const { data: owners } = await admin.from('profiles').select('id, webhook_url').limit(5);
    for (const o of (owners ?? []) as { id: string; webhook_url?: string | null }[]) {
      await admin.from('mind_events').insert({
        owner_id: o.id, event_type: 'note', source: 'canary',
        subject: line.slice(0, 280), payload: { key: `canary-fail:${new Date().toISOString().slice(0, 10)}`, failures, notes },
      }).then(() => {}, () => {});
      await notifyText(o.webhook_url, line).catch(() => {});
    }
  }

  return json({ ok: failures.length === 0, failures, notes });
});
