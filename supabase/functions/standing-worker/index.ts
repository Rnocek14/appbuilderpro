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
import { pickNextPending, mergeTemplate, batchProgress, type BatchRecipient } from '../_shared/batchCore.ts';
// DAILY AUTOMATIC CLIENT HUNT (client_hunt kind) — the scheduling brain + the pure builders are
// verified in src; this worker is only the I/O around them (Serper search, fetch-url scrape, DB writes).
import { parseHuntConfig, plannedHuntToday, type HuntConfig } from '../../../src/lib/garvis/clientHuntSchedule.ts';
import { pickHuntTargets, buildHuntProfileRaw, buildHuntPitch, huntRunLine } from '../../../src/lib/garvis/clientHuntBuild.ts';
import { auditSite } from '../../../src/lib/garvis/siteAudit.ts';
import { parseBusinessProfile, assembleFallbackSpec, previewSlug } from '../_shared/previewSpec.ts';
import { hashPayload } from '../_shared/payloadHash.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-worker-secret' };
const MAX_ORDERS_PER_TICK = 20;    // a runaway backlog drains over ticks, never in one stampede
const MAX_BODY = 500_000;          // hash the first 500k chars — same cap every run, so deterministic
const STORED_TEXT_CAP = 20_000;    // enough context for change excerpts without bloating the row

interface OrderRow {
  id: string; owner_id: string; world_id: string | null; kind: string; label: string;
  cadence: 'hourly' | 'daily' | 'weekly';
  config: { url?: string; note?: string; cursor?: number; [k: string]: unknown } | null;
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
  if (isWorker) {
    await stampHeartbeat(admin, 'standing-worker');
    // TIMED REMINDERS (Tier 2): fire due, unfired reminders exactly once — a reminder must reach
    // the owner when it's due, not when they next open a tab. Best-effort per row; a failure just
    // retries next tick because notified_at only sets on success.
    try {
      const { data: due } = await admin.from('reminders')
        .select('id, owner_id, title, due_at').eq('done', false).is('notified_at', null)
        .not('due_at', 'is', null).lte('due_at', nowIso).limit(50);
      for (const r of (due ?? []) as { id: string; owner_id: string; title: string }[]) {
        await admin.from('mind_events').insert({
          owner_id: r.owner_id, event_type: 'note', source: 'reminder',
          subject: `Reminder due: ${r.title.slice(0, 200)}`,
          payload: { key: `reminder:${r.id}`, reminder_id: r.id },
        });
        const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', r.owner_id).maybeSingle();
        await notifyText((prof as { webhook_url?: string } | null)?.webhook_url, `⏰ Reminder: ${r.title}`).catch(() => {});
        await admin.from('reminders').update({ notified_at: nowIso }).eq('id', r.id);
      }
    } catch { /* reminder firing must never wedge the order tick */ }

    // ---- BULK SEND DRAIN (app_0064) ----------------------------------------------------------
    // One human approval covers a snapshotted batch; the clock drains it a slice per tick by
    // pushing each recipient through THE ONE SEND PATH (send-email), so suppression, contact
    // status, kill switch, and the daily cap re-check per recipient AT SEND TIME. The worker
    // re-verifies the batch approval server-side on every tick — a rejected approval cancels
    // the batch; a pending one waits. Never wedges the order tick.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const PER_TICK = 10;
      const { data: batches } = await admin.from('outreach_batches')
        .select('id, owner_id, subject, body_text, recipients, status, approval_id, sent_count, skipped_count, created_at')
        // Approved batches first so a stuck-unapproved backlog can't starve batches the human OK'd.
        .in('status', ['queued', 'draining']).order('approval_id', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true }).limit(5);
      for (const b of (batches ?? []) as {
        id: string; owner_id: string; subject: string; body_text: string;
        recipients: BatchRecipient[]; status: string; approval_id: string | null;
        sent_count: number; skipped_count: number; created_at: string;
      }[]) {
        const cancel = async (note: string) => {
          await admin.from('outreach_batches').update({ status: 'canceled', finished_at: nowIso }).eq('id', b.id);
          await admin.from('mind_events').insert({
            owner_id: b.owner_id, event_type: 'note', source: 'execution',
            subject: `Batch "${b.subject.slice(0, 100)}" canceled — ${note}`,
            payload: { key: `batch-cancel:${b.id}`, batch_id: b.id },
          }).then(() => {}, () => {});
        };
        // A just-created batch has a brief window where the row exists but its approval_id hasn't
        // been written yet (createBatch inserts, enqueues, then links). Only cancel a no-approval
        // batch once it's clearly abandoned (>2 min old), never one mid-creation.
        if (!b.approval_id) {
          if (Date.now() - new Date(b.created_at).getTime() > 120_000) await cancel('no approval attached');
          continue;
        }
        const { data: ap } = await admin.from('approvals')
          .select('id, owner_id, kind, status').eq('id', b.approval_id).single();
        if (!ap || ap.kind !== 'send_batch' || ap.owner_id !== b.owner_id) { await cancel('approval record invalid'); continue; }
        if (ap.status === 'rejected' || ap.status === 'expired') { await cancel(`approval ${ap.status}`); continue; }
        if (ap.status !== 'approved') continue; // still awaiting the human — not our call to make

        const recips: BatchRecipient[] = Array.isArray(b.recipients) ? b.recipients : [];
        const slice = pickNextPending(recips, PER_TICK);
        if (slice.length === 0) {
          const prog = batchProgress(recips);
          await admin.from('outreach_batches').update({ status: 'done', finished_at: nowIso }).eq('id', b.id);
          await admin.from('mind_events').insert({
            owner_id: b.owner_id, event_type: 'note', source: 'execution',
            subject: `Batch "${b.subject.slice(0, 100)}" done — ${prog.sent} sent${prog.skipped > 0 ? `, ${prog.skipped} skipped` : ''}`,
            payload: { key: `batch-done:${b.id}`, batch_id: b.id, sent: prog.sent, skipped: prog.skipped },
          }).then(() => {}, () => {});
          continue;
        }
        if (b.status !== 'draining') await admin.from('outreach_batches').update({ status: 'draining' }).eq('id', b.id);

        let sentNow = 0; let skippedNow = 0;
        // Persist each recipient's outcome IMMEDIATELY, not after the whole slice: a worker crash
        // then re-sends at most the one in-flight recipient, never the batch already delivered.
        // The write is guarded on status so a cancel that lands mid-tick can't be resurrected.
        const persistRecips = () => admin.from('outreach_batches')
          .update({ recipients: recips }).eq('id', b.id).in('status', ['queued', 'draining']);
        for (const ix of slice) {
          const r = recips[ix];
          const { data: msg, error: msgErr } = await admin.from('outreach_messages').insert({
            owner_id: b.owner_id, contact_id: r.contactId, subject: mergeTemplate(b.subject, r.name),
            body_text: mergeTemplate(b.body_text, r.name), to_address: r.email, status: 'approved',
          }).select('id').single();
          if (msgErr || !msg) { r.state = 'skipped'; r.reason = `message row failed: ${msgErr?.message ?? 'unknown'}`.slice(0, 200); skippedNow++; await persistRecips(); continue; }
          // Pre-authorized per-recipient approval: the HUMAN authority is the batch approval,
          // recorded in payload.batch_id; requested_by 'garvis-auto' is the class send-email
          // accepts from the worker. Every gate still re-checks inside send-email.
          const { data: apRow, error: apErr } = await admin.from('approvals').insert({
            owner_id: b.owner_id, kind: 'send_email',
            title: `Batch: ${b.subject.slice(0, 80)} → ${r.email}`, preview: '',
            payload: { message_id: msg.id, batch_id: b.id }, requested_by: 'garvis-auto',
            status: 'approved', decided_at: nowIso, decided_via: 'batch',
          }).select('id').single();
          if (apErr || !apRow) { r.state = 'skipped'; r.reason = `approval row failed: ${apErr?.message ?? 'unknown'}`.slice(0, 200); skippedNow++; await persistRecips(); continue; }
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-worker-secret': workerSecret ?? '' },
              body: JSON.stringify({ approval_id: apRow.id }),
            });
            if (res.ok) { r.state = 'sent'; sentNow++; await persistRecips(); }
            else {
              const out = await res.json().catch(() => ({} as { error?: string }));
              const why = String((out as { error?: string })?.error ?? `HTTP ${res.status}`);
              if (why.includes('Daily send cap')) {
                // Cap reached: this recipient stays pending for a later tick. send-email already
                // marked its message 'blocked' and released the claim; reject the now-unused
                // approval so no live garvis-auto send_email row is left dangling, then stop.
                await admin.from('approvals').update({ status: 'rejected', decided_via: 'batch-cap' }).eq('id', apRow.id);
                break;
              }
              r.state = 'skipped'; r.reason = why.slice(0, 200); skippedNow++; await persistRecips();
            }
          } catch (e) {
            r.state = 'skipped'; r.reason = `send call failed: ${e instanceof Error ? e.message : 'network'}`.slice(0, 200); skippedNow++; await persistRecips();
          }
        }
        const prog = batchProgress(recips);
        await admin.from('outreach_batches').update({
          sent_count: b.sent_count + sentNow,
          skipped_count: b.skipped_count + skippedNow,
          ...(prog.pending === 0 ? { status: 'done', finished_at: nowIso } : {}),
        }).eq('id', b.id).in('status', ['queued', 'draining']);
        if (prog.pending === 0) {
          await admin.from('mind_events').insert({
            owner_id: b.owner_id, event_type: 'note', source: 'execution',
            subject: `Batch "${b.subject.slice(0, 100)}" done — ${prog.sent} sent${prog.skipped > 0 ? `, ${prog.skipped} skipped` : ''}`,
            payload: { key: `batch-done:${b.id}`, batch_id: b.id, sent: prog.sent, skipped: prog.skipped },
          }).then(() => {}, () => {});
        }
      }
    } catch { /* batch drain must never wedge the order tick */ }
  }

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

    // ---- client_hunt: a self-contained daily prospecting run ---------------------------------
    // It owns its own persistence (a rolling cursor in config, not a content hash), so it never
    // flows into the watch/digest persist block below. Honesty is the same everywhere: it READS +
    // queues pitches as PENDING approvals; nothing sends.
    if (order.kind === 'client_hunt') {
      try {
        const r = await runClientHunt(admin, order, nowIso);
        ran++;
        if (r.built > 0) changed++;
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: r.built > 0 ? 'changed' : 'unchanged', line: r.line, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
          config: { ...(order.config ?? {}), cursor: r.nextCursor },  // advance the sweep for tomorrow
          updated_at: nowIso,
        }).eq('id', order.id);
        // Surface a productive day once (deduped by order+date) — the waking moment reads these.
        if (r.built > 0) {
          const key = `client-hunt:${order.id}:${nowIso.slice(0, 10)}`;
          const dayAgo = new Date(Date.parse(nowIso) - 26 * 60 * 60 * 1000).toISOString();
          const { data: recent } = await admin.from('mind_events')
            .select('payload').eq('owner_id', order.owner_id).eq('source', 'standing-order')
            .gte('occurred_at', dayAgo).limit(200);
          const seen = new Set((recent ?? []).map((x) => String((x as { payload?: { key?: string } }).payload?.key ?? '')));
          if (!seen.has(key)) {
            await admin.from('mind_events').insert({
              owner_id: order.owner_id, event_type: 'note', source: 'standing-order',
              subject: r.line.slice(0, 300),
              payload: { key, order_id: order.id, kind: order.kind, built: r.built, queued: r.queued },
            });
            const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', order.owner_id).maybeSingle();
            await notifyText((prof as { webhook_url?: string } | null)?.webhook_url, r.line).catch(() => {});
          }
        }
      } catch (e) {
        failed++;
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'unreachable', line: `Run failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}. Will retry on schedule.`, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
          updated_at: nowIso,
        }).eq('id', order.id).then(() => {}, () => {});
      }
      continue;
    }

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

// --- client_hunt: the daily automatic prospecting run --------------------------------------------
// Executes ONE day's slice of a standing hunt: sweep today's fresh cities (rolling cursor), find real
// businesses, and for up to demoQuota of them build a demo + queue a pitch. All the decisions —
// which cities, which businesses, what the profile/pitch say — come from the VERIFIED pure modules;
// this function is only Serper + fetch-url + DB. A soft time budget keeps a hand-edited large config
// from overrunning the edge invocation (the cursor still advances, so tomorrow picks up fresh).
const HUNT_TIME_BUDGET_MS = 90_000;

interface HuntEnv { supabaseUrl: string; workerSecret: string; appOrigin: string; nowYear: number }

// deno-lint-ignore no-explicit-any
async function runClientHunt(admin: any, order: OrderRow, nowIso: string):
  Promise<{ built: number; queued: number; line: string; nextCursor: number }> {
  const cfg: HuntConfig | null = parseHuntConfig(order.config);
  const cursorRaw = order.config?.cursor;
  const cursor = typeof cursorRaw === 'number' && isFinite(cursorRaw) ? cursorRaw : 0;
  if (!cfg) return { built: 0, queued: 0, line: `${order.label}: no niche is configured — nothing to hunt. Set it up on Win Clients.`, nextCursor: cursor };

  const plan = plannedHuntToday(cfg, cursor);
  const serperKey = Deno.env.get('SERPER_API_KEY');
  if (!serperKey) return { built: 0, queued: 0, line: `${order.label}: search isn’t configured on the server (SERPER_API_KEY missing) — nothing was hunted.`, nextCursor: plan.nextCursor };

  const env: HuntEnv = {
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    workerSecret: Deno.env.get('WORKER_SECRET') ?? '',
    appOrigin: Deno.env.get('APP_ORIGIN') ?? '',
    nowYear: new Date(nowIso).getUTCFullYear(),
  };
  const startedMs = Date.now();
  const seenDomains = new Set<string>();   // a business found in two cities is built once (per run)
  let built = 0; let queued = 0;

  for (const qy of plan.queries) {
    if (built >= cfg.demoQuota) break;
    if (Date.now() - startedMs > HUNT_TIME_BUDGET_MS) break;   // soft budget — cursor already advances
    // Real businesses for this city — Google organic via Serper, never invented.
    let serperData: unknown;
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'content-type': 'application/json' },
        body: JSON.stringify({ q: `${qy.niche} ${qy.area}` }),
      });
      if (!r.ok) continue;
      serperData = await r.json();
    } catch { continue; }   // one city's search failing never sinks the day

    const targets = pickHuntTargets(serperData, cfg.demoQuota - built, seenDomains);
    for (const t of targets) {
      if (built >= cfg.demoQuota) break;
      if (Date.now() - startedMs > HUNT_TIME_BUDGET_MS) break;
      try {
        const outcome = await buildOneDemo(admin, order, qy.niche, t, env);  // per-query type (grid mixes types)
        if (outcome === 'queued') { built++; queued++; }
        else if (outcome === 'built') built++;
        // 'skipped' → unreachable/invalid; nothing recorded, nothing faked
      } catch { /* one prospect failing never sinks the day */ }
    }
  }
  return { built, queued, line: huntRunLine(order.label, built, queued), nextCursor: plan.nextCursor };
}

/** Read one page through the SAME hardened scrape path the app uses (fetch-url), authenticated with
 *  the worker secret. Returns the parsed JSON, or null on any failure. */
async function scrapePage(url: string, mode: 'text' | 'images' | 'contact', env: HuntEnv): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${env.supabaseUrl}/functions/v1/fetch-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-secret': env.workerSecret },
      body: JSON.stringify({ url, mode }),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

/** Build ONE demo from a target: scrape → honest audit → deterministic profile → recipe demo →
 *  pitch → (if a public email exists) a PENDING approval. Returns what actually happened. Mirrors
 *  ingest-profile's save path (one build path) and queuePitch's queue path (approval-gated). */
// deno-lint-ignore no-explicit-any
async function buildOneDemo(admin: any, order: OrderRow, niche: string, target: { name: string; url: string }, env: HuntEnv):
  Promise<'queued' | 'built' | 'skipped'> {
  const text = await scrapePage(target.url, 'text', env);
  // fetch-url returns { error } (HTTP 200) for an unreachable/non-HTML page — we do NOT fabricate a
  // demo of a site we couldn't read.
  if (!text || text.error || !text.checks) return 'skipped';
  const checks = text.checks as { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
  const finalUrl = (typeof text.url === 'string' && text.url) || target.url;

  const imgResp = await scrapePage(target.url, 'images', env);
  const images: string[] = Array.isArray(imgResp?.images)
    ? (imgResp!.images as { url?: string }[]).map((i) => i.url).filter((u): u is string => !!u).slice(0, 12)
    : [];
  const contactResp = await scrapePage(target.url, 'contact', env);
  const email: string | null = Array.isArray(contactResp?.emails) ? ((contactResp!.emails as string[])[0] ?? null) : null;

  const audit = auditSite({
    url: finalUrl, reachable: true,
    title: (text.title as string) ?? null, description: (text.description as string) ?? null,
    text: (text.text as string) ?? '', hasViewport: !!checks.viewport, hasForm: !!checks.form, emailFound: !!checks.email,
  }, env.nowYear);

  const raw = buildHuntProfileRaw({
    url: finalUrl, niche, fallbackName: target.name,
    page: { title: (text.title as string) ?? null, description: (text.description as string) ?? null },
    images, email, audit,
  });
  const { profile } = parseBusinessProfile(raw);
  if (!profile) return 'skipped';

  // Save the profile + the deterministic recipe demo (identical to ingest-profile — one build path).
  const { data: profileRow, error: pErr } = await admin.from('business_profiles').insert({
    user_id: order.owner_id, business_name: profile.business_name, industry: profile.industry,
    website_score: profile.current_website_score ?? null, profile,
  }).select('id').single();
  if (pErr || !profileRow) return 'skipped';

  const spec = assembleFallbackSpec(profile);
  const nonce = Math.random().toString(36).slice(2, 8);   // slug isn't enumerable by guessing names
  const slug = `${previewSlug(profile.business_name)}-${nonce}`;
  const previewUrl = env.appOrigin ? `${env.appOrigin}/preview-site/${slug}` : `/preview-site/${slug}`;
  const pitch = buildHuntPitch(profile, previewUrl);

  const { data: site, error: sErr } = await admin.from('preview_sites').insert({
    user_id: order.owner_id, profile_id: profileRow.id, slug,
    business_name: profile.business_name, industry: profile.industry,
    spec, pitch, spec_source: 'fallback', status: 'preview',
  }).select('id').single();
  if (sErr || !site) return 'skipped';

  // No public email → the demo is a warm asset the owner can send by hand, but there is nothing to
  // queue. Honest: a built demo, not a queued pitch.
  if (!email) return 'built';

  const ok = await queueHuntPitch(admin, order.owner_id, {
    previewSiteId: (site as { id: string }).id, businessProfileId: (profileRow as { id: string }).id,
    businessName: profile.business_name, pitch, previewUrl, toEmail: email,
  });
  return ok ? 'queued' : 'built';
}

/** Server-side twin of queuePitch: contact → campaign → message(draft) → PENDING approval. Nothing
 *  sends — the approval lands in the owner's queue. Suppression is sacred: a known unsubscribed/
 *  bounced/complained contact is never re-queued, and an existing contact's status is never reset. */
// deno-lint-ignore no-explicit-any
async function queueHuntPitch(admin: any, uid: string, input: {
  previewSiteId: string; businessProfileId: string; businessName: string; pitch: string; previewUrl: string; toEmail: string;
}): Promise<boolean> {
  const to = input.toEmail.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return false;

  let contactId: string;
  const { data: existing } = await admin.from('contacts')
    .select('id, email_status').eq('owner_id', uid).eq('email', to).maybeSingle();
  if (existing) {
    const st = (existing as { email_status?: string }).email_status;
    if (st === 'unsubscribed' || st === 'bounced' || st === 'complained') return false;  // never re-contact
    contactId = (existing as { id: string }).id;
  } else {
    const { data: c } = await admin.from('contacts').insert({
      owner_id: uid, business_profile_id: input.businessProfileId, email: to, email_status: 'unknown', is_primary: true,
    }).select('id').maybeSingle();
    if (c) contactId = (c as { id: string }).id;
    else {
      const { data: again } = await admin.from('contacts').select('id').eq('owner_id', uid).eq('email', to).maybeSingle();
      if (!again) return false;
      contactId = (again as { id: string }).id;
    }
  }

  const { data: camp } = await admin.from('outreach_campaigns').insert({
    owner_id: uid, business_profile_id: input.businessProfileId, contact_id: contactId,
    preview_site_id: input.previewSiteId, kind: 'cold_site_pitch', state: 'pending_approval',
  }).select('id').single();
  if (!camp) return false;

  const subject = `A new website for ${input.businessName}`;
  const body = `${input.pitch.trim()}\n\nTake a look: ${input.previewUrl}`;
  const { data: msg } = await admin.from('outreach_messages').insert({
    owner_id: uid, campaign_id: (camp as { id: string }).id, contact_id: contactId, preview_site_id: input.previewSiteId,
    sequence_step: 0, subject, body_text: body, to_address: to, status: 'draft',
  }).select('id').single();
  if (!msg) return false;

  // The approval is payload-hash bound exactly like enqueueApproval — the send executor refuses if
  // the payload changes after this decision. requested_by 'garvis-auto' marks a machine-queued
  // request; status defaults to 'pending', so the OWNER still approves each send.
  const payload = { message_id: (msg as { id: string }).id, campaign_id: (camp as { id: string }).id };
  const payload_hash = await hashPayload(payload);
  const { error: apErr } = await admin.from('approvals').insert({
    owner_id: uid, kind: 'send_email',
    title: `Pitch "${input.businessName}" → ${to}`,
    preview: `${subject}\n\n${body}`,
    payload, payload_hash, requested_by: 'garvis-auto',
  });
  return !apErr;
}
