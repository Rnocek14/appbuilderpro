// supabase/functions/standing-worker/index.ts
// THE CLOCK'S HANDS — executes due standing orders on the heartbeat (garvis-standing-tick, every
// 15 minutes) and on demand ("Run now" from the panel). Two kinds:
//
//   watch_url        fetch the page through the hardened SSRF-safe fetch, decide with the VERIFIED
//                    core (_shared/standingCore.ts): a failed fetch is UNREACHABLE (never "no
//                    change"), first sight is a baseline (never a fake "change"), markup noise is
//                    not a change. A real change lands one mind_events row (the waking moment picks
//                    it up with zero extra wiring) + a best-effort webhook push, deduped by key so
//                    the same change never re-alerts.
//   cadence_digest   counts what actually happened in the world since the last run — artifacts
//                    made (seeds excluded), straight from rows, no model call — and records the
//                    digest as a mind_event + a ledger-shelf doc. A quiet week says "quiet week".
//
// HONESTY RULES: orders only READ and RECORD. This function never sends, posts, or spends; anything
// outward still goes through Approvals. Every last_result line states exactly what the run did.
//
// Auth: x-worker-secret (the heartbeat) or service-role bearer → all due orders across owners.
//       A signed-in user → only their own orders; body { order_id } force-runs one they own.
// Deploy: supabase functions deploy standing-worker --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeFetch } from '../_shared/safeFetch.ts';
import { notifyText } from '../_shared/notify.ts';
import { decideWatch, nextRunAfter, normalizeContent, changeExcerpt, isDue, type WatchResult } from '../_shared/standingCore.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-worker-secret' };
const MAX_ORDERS_PER_TICK = 20;    // a runaway backlog drains over ticks, never in one stampede
const MAX_BODY = 500_000;          // hash the first 500k chars — same cap every run, so deterministic
const STORED_TEXT_CAP = 20_000;    // enough context for change excerpts without bloating the row

interface OrderRow {
  id: string; owner_id: string; world_id: string | null; kind: string; label: string;
  cadence: 'hourly' | 'daily' | 'weekly'; config: { url?: string; note?: string } | null;
  status: string; anchor_at: string; next_run_at: string; last_run_at: string | null;
  last_hash: string | null; last_text: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const workerSecret = Deno.env.get('WORKER_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // --- gate: heartbeat/service run everything; a signed-in user runs only their own -------------
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isWorker = (!!workerSecret && req.headers.get('x-worker-secret') === workerSecret) || bearer === serviceKey;
  let ownerScope: string | null = null;
  if (!isWorker) {
    if (!bearer) return json({ error: 'Unauthorized' }, 401);
    const { data: u } = await admin.auth.getUser(bearer);
    if (!u.user) return json({ error: 'Unauthorized' }, 401);
    ownerScope = u.user.id;
  }

  const body = (await req.json().catch(() => ({}))) as { order_id?: string };
  const nowIso = new Date().toISOString();

  // Liveness: only a WORKER-authenticated hit is the cron clock (a signed-in "Run now" proves the
  // function is deployed, not that the heartbeat is armed).
  if (isWorker) await stampHeartbeat(admin, 'standing-worker');

  // --- pick the work: one forced order, or the due set --------------------------------------------
  let q = admin.from('standing_orders')
    .select('id, owner_id, world_id, kind, label, cadence, config, status, anchor_at, next_run_at, last_run_at, last_hash, last_text');
  if (body.order_id) q = q.eq('id', body.order_id);
  else q = q.eq('status', 'active').lte('next_run_at', nowIso).order('next_run_at', { ascending: true }).limit(MAX_ORDERS_PER_TICK);
  if (ownerScope) q = q.eq('owner_id', ownerScope);
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let ran = 0, changed = 0, failed = 0;
  for (const order of (rows ?? []) as OrderRow[]) {
    // A forced run may target a paused/not-yet-due order (the owner asked); the scan only sees due ones.
    if (!body.order_id && !isDue({ status: order.status as 'active' | 'paused', nextRunAt: order.next_run_at }, nowIso)) continue;
    try {
      const result = order.kind === 'watch_url'
        ? await runWatch(order, nowIso)
        : await runDigest(admin, order, nowIso);
      ran++;
      if (result.status === 'changed') changed++;
      else if (result.status === 'unreachable') failed++; // an unreachable check is a failed run — the tally must say so

      // Persist the run: the honest line, the schedule step, and (for watches) the new baseline.
      // normalizedText is working state for the baseline write — it must NOT ride into last_result
      // (an uncapped page body in a jsonb column the panel loads for every order would defeat the cap).
      const { normalizedText, ...persisted } = result as WatchResult & { normalizedText?: string };
      await admin.from('standing_orders').update({
        last_run_at: nowIso,
        last_result: persisted,
        next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
        updated_at: nowIso,
        ...(order.kind === 'watch_url' && persisted.hash !== order.last_hash && persisted.hash !== null
          ? { last_hash: persisted.hash, last_text: normalizedText?.slice(0, STORED_TEXT_CAP) ?? order.last_text }
          : {}),
      }).eq('id', order.id);

      // Surface anything real: one deduped mind_event (the waking moment reads these) + webhook.
      if (result.status === 'changed') {
        const key = `${order.id}:${result.hash ?? nowIso}`;
        const threeDaysAgo = new Date(Date.parse(nowIso) - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await admin.from('mind_events')
          .select('payload').eq('owner_id', order.owner_id).eq('source', 'standing-order')
          .gte('occurred_at', threeDaysAgo).limit(200);
        const seen = new Set((recent ?? []).map((r) => String((r as { payload?: { key?: string } }).payload?.key ?? '')));
        if (!seen.has(key)) {
          await admin.from('mind_events').insert({
            owner_id: order.owner_id, event_type: 'note', source: 'standing-order',
            subject: result.line.slice(0, 300),
            payload: { key, order_id: order.id, kind: order.kind, world_id: order.world_id },
          });
          const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', order.owner_id).maybeSingle();
          await notifyText((prof as { webhook_url?: string } | null)?.webhook_url, result.line).catch(() => {});
        }
      }
    } catch (e) {
      failed++;
      // An order that throws still records an honest failure line and keeps its schedule moving —
      // a broken order must not wedge the tick or silently vanish from its own history.
      await admin.from('standing_orders').update({
        last_run_at: nowIso,
        last_result: { status: 'unreachable', line: `Run failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}. Will retry on schedule.`, hash: order.last_hash, excerpt: null, checkedAt: nowIso },
        next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
        updated_at: nowIso,
      }).eq('id', order.id).then(() => {}, () => {});
    }
  }

  return json({ ok: true, ran, changed, failed });
});

// --- watch_url: fetch honestly, decide with the verified core -----------------------------------
async function runWatch(order: OrderRow, nowIso: string): Promise<WatchResult & { normalizedText?: string }> {
  const url = String(order.config?.url ?? '').trim();
  if (!url) return decideWatch({ label: order.label, prevHash: order.last_hash, prevText: order.last_text, fetched: { ok: false, error: 'no URL configured' }, nowIso });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  let fetched: { ok: boolean; text?: string; error?: string };
  try {
    const res = await safeFetch(url, {
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FableForge/1.0; +https://fableforge.app)',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    if (!res.ok) fetched = { ok: false, error: `HTTP ${res.status}` };
    else {
      const raw = (await res.text()).slice(0, MAX_BODY);
      fetched = { ok: true, text: normalizeContent(raw) };
    }
  } catch (e) {
    fetched = { ok: false, error: e instanceof Error ? e.message : 'fetch failed' };
  } finally { clearTimeout(t); }

  let result = decideWatch({ label: order.label, prevHash: order.last_hash, prevText: order.last_text, fetched, nowIso });

  // EXCERPT HONESTY over the storage cap: the hash covers the full text, but the stored baseline is
  // capped — comparing full-new vs truncated-old would fabricate a giant "added" tail. When the
  // baseline was truncated, compare like-for-like windows; if the change lies beyond the window,
  // say exactly that instead of inventing an excerpt.
  if (result.status === 'changed' && fetched.ok && order.last_text && order.last_text.length >= STORED_TEXT_CAP) {
    const newWindow = (fetched.text ?? '').slice(0, STORED_TEXT_CAP);
    const excerpt = newWindow === order.last_text
      ? 'content changed beyond the stored comparison window'
      : changeExcerpt(order.last_text, newWindow);
    result = { ...result, excerpt, line: `${order.label} CHANGED — ${excerpt}` };
  }

  return fetched.ok ? { ...result, normalizedText: (fetched.text ?? '').slice(0, STORED_TEXT_CAP) } : result;
}

// --- cadence_digest: count what really happened — rows, not prose --------------------------------
const CADENCE_MS: Record<string, number> = { hourly: 3600_000, daily: 86_400_000, weekly: 604_800_000 };

// deno-lint-ignore no-explicit-any
async function runDigest(admin: any, order: OrderRow, nowIso: string): Promise<WatchResult> {
  // First run: look back exactly one cadence period — a fixed 7-day window would mislabel a week of
  // history as "this hour"/"this day". After that, the window is simply since the last run.
  const stepMs = CADENCE_MS[order.cadence] ?? CADENCE_MS.weekly;
  const sinceIso = order.last_run_at ?? new Date(Date.parse(nowIso) - stepMs).toISOString();
  if (!order.world_id) {
    return { status: 'unchanged', line: `${order.label}: no world attached — nothing to digest.`, hash: null, excerpt: null, checkedAt: nowIso };
  }

  // OWNERSHIP RE-CHECK (defense in depth beside the RLS with-check): the worker runs service-role,
  // so it must never read or write a world the order's owner doesn't own — an order row pointing at
  // someone else's world digests NOTHING.
  const { data: world } = await admin.from('knowledge_worlds')
    .select('id, owner_id').eq('id', order.world_id).maybeSingle();
  if (!world || (world as { owner_id: string }).owner_id !== order.owner_id) {
    return { status: 'unchanged', line: `${order.label}: the attached world is not available to this account — nothing was digested.`, hash: null, excerpt: null, checkedAt: nowIso };
  }

  const { data: clusters } = await admin.from('knowledge_clusters')
    .select('id, charter').eq('world_id', order.world_id);
  const clusterIds = (clusters ?? []).map((c: { id: string }) => c.id);
  let madeCount = 0; let titles: string[] = [];
  if (clusterIds.length) {
    // Seeds are guidance, and the digest's OWN ledger docs are reporting — neither is "work made".
    // Counting our own digest would make a quiet week structurally impossible after any active one.
    const { data: arts } = await admin.from('knowledge_artifacts')
      .select('title, source, created_at').in('cluster_id', clusterIds)
      .neq('source', 'garvis-seed').neq('source', 'garvis-digest').gte('created_at', sinceIso)
      .order('created_at', { ascending: false }).limit(50);
    const real = (arts ?? []) as { title: string }[];
    madeCount = real.length;
    titles = real.slice(0, 5).map((a) => a.title);
  }

  const period = order.cadence === 'weekly' ? 'week' : order.cadence === 'daily' ? 'day' : 'hour';
  const line = madeCount === 0
    ? `${order.label}: quiet ${period} — nothing new was made. (Counted from records since ${sinceIso.slice(0, 10)}.)`
    : `${order.label}: ${madeCount} thing${madeCount === 1 ? '' : 's'} made this ${period} — ${titles.join(' · ')}${madeCount > 5 ? ` (+${madeCount - 5} more)` : ''}.`;

  // Keep the digest on the world's ledger shelf too. The slug (and the dedupe hash below) bucket by
  // the CADENCE period — an hourly digest must not be silenced for the rest of the day by its 9am run.
  const bucket = order.cadence === 'hourly' ? nowIso.slice(0, 13) : nowIso.slice(0, 10);
  const ledger = ((clusters ?? []) as { id: string; charter: { archetype?: string } | null }[])
    .find((c) => c.charter?.archetype === 'ledger');
  if (ledger) {
    const slug = `digest-${order.id.slice(0, 8)}-${bucket}`;
    const { data: existing } = await admin.from('knowledge_artifacts')
      .select('id').eq('cluster_id', ledger.id).eq('slug', slug).maybeSingle();
    if (!existing) {
      await admin.from('knowledge_artifacts').insert({
        owner_id: order.owner_id, cluster_id: ledger.id, slug, kind: 'doc',
        title: `Digest — ${bucket.replace('T', ' ')}${order.cadence === 'hourly' ? ':00' : ''}`, detail: line, source: 'garvis-digest',
      });
    }
  }

  // A digest with real news counts as "changed" so it surfaces; a quiet period stays quiet.
  return { status: madeCount > 0 ? 'changed' : 'unchanged', line, hash: `digest-${bucket}`, excerpt: null, checkedAt: nowIso };
}
