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
import { complete, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, getUserPlan } from '../_shared/credits.ts';
import { pickNextPending, mergeTemplate, batchProgress, staleSendingIndices, type BatchRecipient } from '../_shared/batchCore.ts';
// DAILY AUTOMATIC CLIENT HUNT (client_hunt kind) — the discovery brain + the pure builders are
// verified in src; this worker is only the I/O around them (Google Places, fetch-url scrape, DB
// writes). Discovery is the swift-prep-pros model: a self-exhausting query queue over Places.
import { parseHuntConfig, LOCAL_NICHES, type HuntConfig } from '../../../src/lib/garvis/clientHuntSchedule.ts';
import { buildHuntProfileRaw, buildHuntPitch, huntRunLine } from '../../../src/lib/garvis/clientHuntBuild.ts';
import { auditSite } from '../../../src/lib/garvis/siteAudit.ts';
import { citiesFor } from '../../../src/lib/garvis/usCities.ts';
import {
  PLACES_FIELD_MASK, parsePlace, buildDiscoveryQueries, exhaustionUpdate,
  type PlaceRaw, type DiscoveredBiz,
} from '../../../src/lib/garvis/placesDiscovery.ts';
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
        // Persist each recipient's outcome IMMEDIATELY, not after the whole slice.
        // The write is guarded on status so a cancel that lands mid-tick can't be resurrected.
        const persistRecips = () => admin.from('outreach_batches')
          .update({ recipients: recips }).eq('id', b.id).in('status', ['queued', 'draining']);

        // RECOVERY SWEEP: a recipient stuck 'sending' means a crash between its claim and its outcome.
        // We never re-send it (that would risk a duplicate real email) — we skip it with an honest reason
        // so the batch can still finish and the operator sees a true count.
        const stale = staleSendingIndices(recips, Date.now(), 3 * 60_000);
        if (stale.length) {
          for (const ix of stale) {
            recips[ix].state = 'skipped';
            recips[ix].reason = 'send interrupted before confirmation — not retried to avoid a duplicate; resend manually if it did not arrive';
          }
          await persistRecips();
        }

        const slice = pickNextPending(recips, PER_TICK);
        if (slice.length === 0) {
          const prog = batchProgress(recips);
          // Nothing left to pick. If a fresh claim is still in flight, wait for it to resolve (or be
          // swept) before finishing — never mark a batch done while a send is unconfirmed.
          if (prog.sending > 0) continue;
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
        for (const ix of slice) {
          const r = recips[ix];
          // CLAIM before any irreversible work: persist 'sending' so a crash can't re-pick (and re-send)
          // this recipient. Every outcome below overwrites the claim; a crash leaves it for the sweep.
          r.state = 'sending'; r.claimedAt = nowIso; await persistRecips();
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
                // Cap reached: send-email blocked (did NOT send). Release the claim back to 'pending' so
                // a later tick retries this recipient; send-email already marked its message 'blocked'.
                // Reject the now-unused approval so no live garvis-auto send_email row dangles, then stop.
                r.state = 'pending'; r.claimedAt = undefined; await persistRecips();
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
        const finished = prog.pending === 0 && prog.sending === 0;
        await admin.from('outreach_batches').update({
          sent_count: b.sent_count + sentNow,
          skipped_count: b.skipped_count + skippedNow,
          ...(finished ? { status: 'done', finished_at: nowIso } : {}),
        }).eq('id', b.id).in('status', ['queued', 'draining']);
        if (finished) {
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
              payload: { key, order_id: order.id, kind: order.kind, discovered: r.discovered, built: r.built, queued: r.queued },
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

    // ---- idea_stream: continuous ideation onto a project's Idea Board -------------------------
    // Garvis ideating on a clock: N fresh, grounded ideas appended to the world's idea board as
    // ordinary tiles, grouped by date ("Auto · 2026-07-16") so the board never drowns. HONESTY:
    // grounded ONLY on the world's own title + business context; unknowns stay [EDIT: ...] holes;
    // no AI key or no credits -> an honest last_result line, never template tiles pretending to be
    // ideation. (working_state write is read-merge-write; the worker typically runs while the owner
    // is away, which is the point of the stream.)
    if (order.kind === 'idea_stream') {
      try {
        const cfg = order.config as { cluster_id?: string; count?: number };
        const clusterId = cfg.cluster_id ?? '';
        if (!clusterId) throw new Error('no idea board bound (config.cluster_id missing)');
        const count = Math.min(5, Math.max(1, cfg.count ?? 3));
        await checkCredits(admin, order.owner_id, 'board_copy');
        const { data: world } = await admin.from('knowledge_worlds')
          .select('title, business_context').eq('id', order.world_id ?? '').maybeSingle();
        const title = (world?.title as string | undefined) ?? 'the project';
        const m = modelForPlan(await getUserPlan(admin, order.owner_id));
        const result = await complete([
          { role: 'system', content: [
            'You generate product/business ideas for one specific real project. HONESTY IS ABSOLUTE:',
            "- Ground every idea ONLY on the facts given. NEVER invent user counts, revenue, competitors' specifics, or claims about the project.",
            '- Anything an idea needs but you cannot know goes in as a visible hole formatted exactly: [EDIT: what goes here].',
            `Return ONLY a strict JSON array of exactly ${count} objects: {"title": string (<=60 chars), "pitch": string (2-3 sentences), "notes": string (3-5 short lines: first steps, risks, open questions), "tag": one of "feature"|"automation"|"content"|"growth"|"revenue"|"wild"}. No markdown fences.`,
          ].join('\n') },
          { role: 'user', content: `PROJECT: ${title}\nCONTEXT (the only facts you may use): ${JSON.stringify(world?.business_context ?? {})}\nGenerate ${count} fresh, specific, non-overlapping ideas across different tags.` },
        ], { provider: m.provider, model: m.model, maxTokens: 1400 });
        let ideas: { title?: string; pitch?: string; notes?: string; tag?: string }[] = [];
        try { ideas = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); } catch { /* refusal below */ }
        if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('the model returned nothing usable');
        await spendCredits(admin, order.owner_id, { costUsd: result.costUsd, kind: 'board_copy', provider: m.provider, model: m.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

        // Append as ordinary board tiles under working_state.boards.idea — merge, never clobber.
        const TAGS = new Set(['feature', 'automation', 'content', 'growth', 'revenue', 'wild']);
        const { data: row } = await admin.from('knowledge_clusters').select('working_state').eq('id', clusterId).maybeSingle();
        const ws = ((row?.working_state as Record<string, unknown> | null) ?? {});
        const boards = ((ws.boards as Record<string, unknown> | undefined) ?? {});
        const board = (boards.idea as { tiles?: unknown[]; groups?: string[] } | undefined) ?? { tiles: [] };
        const tiles = Array.isArray(board.tiles) ? (board.tiles as { x?: number; y?: number }[]) : [];
        const group = `Auto · ${nowIso.slice(0, 10)}`;
        const startY = tiles.length ? Math.max(...tiles.map((t) => (typeof t.y === 'number' ? t.y : 0))) + 206 : 40;
        const added = ideas.slice(0, count).map((i, ix) => ({
          id: crypto.randomUUID(), prompt: 'auto-idea', parentId: null,
          content: {
            kindId: 'idea_feature', tag: TAGS.has(i.tag ?? '') ? i.tag : 'feature',
            title: String(i.title ?? 'Untitled idea').slice(0, 60),
            pitch: String(i.pitch ?? ''), notes: String(i.notes ?? ''),
          },
          x: 40 + (ix % 3) * 276, y: startY + Math.floor(ix / 3) * 206,
          favorite: false, createdAt: Date.parse(nowIso), group,
        }));
        const groups = Array.isArray(board.groups) ? board.groups : [];
        boards.idea = { ...board, tiles: [...tiles, ...added], groups: groups.includes(group) ? groups : [...groups, group] };
        await admin.from('knowledge_clusters').update({ working_state: { ...ws, boards } }).eq('id', clusterId);

        ran++; changed++;
        const line = `${added.length} fresh idea${added.length === 1 ? '' : 's'} added to ${title}'s idea board (${group}).`;
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'changed', line, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
          updated_at: nowIso,
        }).eq('id', order.id);
        await admin.from('mind_events').insert({
          owner_id: order.owner_id, event_type: 'note', source: 'standing-order',
          subject: line.slice(0, 300),
          payload: { key: `idea-stream:${order.id}:${nowIso.slice(0, 10)}`, order_id: order.id, kind: order.kind, added: added.length },
        }).then(() => {}, () => {});
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message.slice(0, 160) : 'unknown error';
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'unreachable', line: `Idea run skipped: ${msg}. Will retry on schedule.`, hash: null, excerpt: null, checkedAt: nowIso },
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

// --- client_hunt: the daily automatic prospecting run (Google Places) ----------------------------
// Two phases per run, the swift-prep-pros model. DISCOVER: run the next-best non-exhausted Places
// queries, persisting every REAL business into the lead pool (deduped) and marking a market drained
// after two zero-insert runs. BUILD: turn up to demoQuota fresh leads into demos + queued pitches,
// NO-WEBSITE prospects first (they need a site the most). All decisions come from the VERIFIED pure
// modules; this is only Places + fetch-url + DB. A soft time budget bounds the invocation.
const HUNT_TIME_BUDGET_MS = 90_000;
const DISCOVER_BUDGET_MS = 55_000;   // cap discovery so building always gets a share of the window
const PLACES_PAGES = 2;   // pages per query (≤20 results each) — bounds Places cost per search

interface HuntEnv { supabaseUrl: string; workerSecret: string; serviceKey: string; appOrigin: string; placesKey: string; nowYear: number }
interface QueryRowDB { id: string; query_text: string; keyword: string; last_run_at: string | null; exhausted: boolean; total_inserted: number; run_count: number; consecutive_zero_runs: number }
interface LeadRow { id: string; place_id: string | null; company_name: string; keyword: string; website: string | null; phone: string | null; city: string | null; state: string | null }

// deno-lint-ignore no-explicit-any
async function runClientHunt(admin: any, order: OrderRow, nowIso: string):
  Promise<{ discovered: number; built: number; queued: number; line: string }> {
  const cfg = parseHuntConfig(order.config);
  if (!cfg) return { discovered: 0, built: 0, queued: 0, line: `${order.label}: no config — nothing to hunt. Set it up on Win Clients.` };
  const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!placesKey) return { discovered: 0, built: 0, queued: 0, line: `${order.label}: Google Places isn’t configured on the server (GOOGLE_PLACES_API_KEY missing) — nothing was hunted.` };

  const env: HuntEnv = {
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    workerSecret: Deno.env.get('WORKER_SECRET') ?? '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    appOrigin: Deno.env.get('APP_ORIGIN') ?? '',
    placesKey,
    nowYear: new Date(nowIso).getUTCFullYear(),
  };
  const startedMs = Date.now();

  // Seed the discovery queue once per owner (idempotent: unique(owner, query_text) makes a re-seed a
  // no-op). buildDiscoveryQueries expands the niches (or the whole catalog) × the scope's cities.
  await ensureDiscoveryQueue(admin, order.owner_id, cfg);

  // --- DISCOVER: run up to searchesPerDay next-best queries, persist the real businesses ----------
  let discovered = 0;
  const { data: queries } = await admin.from('discovery_queries')
    .select('id, query_text, keyword, last_run_at, exhausted, total_inserted, run_count, consecutive_zero_runs')
    .eq('owner_id', order.owner_id).eq('exhausted', false)
    .order('last_run_at', { ascending: true, nullsFirst: true })   // never-run first, then least-recent
    .limit(cfg.searchesPerDay);
  for (const q of (queries ?? []) as QueryRowDB[]) {
    if (Date.now() - startedMs > DISCOVER_BUDGET_MS) break;   // leave time for the build phase
    discovered += await runDiscoveryQuery(admin, order.owner_id, q, env);
  }

  // --- BUILD: up to demoQuota fresh leads → demo + pitch, NO-WEBSITE prospects first --------------
  let built = 0; let queued = 0;
  const { data: leads } = await admin.from('discovered_businesses')
    .select('id, place_id, company_name, keyword, website, phone, city, state')
    .eq('owner_id', order.owner_id).eq('status', 'new')
    .order('has_website', { ascending: true }).order('created_at', { ascending: true })
    .limit(cfg.demoQuota);
  for (const lead of (leads ?? []) as LeadRow[]) {
    if (Date.now() - startedMs > HUNT_TIME_BUDGET_MS) break;
    try {
      const outcome = await buildDemoForLead(admin, order, lead, env);
      if (outcome === 'queued') { built++; queued++; }
      else if (outcome === 'built') built++;
      else await admin.from('discovered_businesses').update({ status: 'skipped', updated_at: nowIso }).eq('id', lead.id);
    } catch { /* one lead failing never sinks the day */ }
  }

  return { discovered, built, queued, line: huntRunLine(order.label, discovered, built, queued) };
}

/** Seed the discovery queue on the owner's first run (skipped once any rows exist). Chunked upsert,
 *  ignoreDuplicates — the unique(owner, query_text) index makes it safe + idempotent. */
// deno-lint-ignore no-explicit-any
async function ensureDiscoveryQueue(admin: any, ownerId: string, cfg: HuntConfig): Promise<void> {
  const { count } = await admin.from('discovery_queries')
    .select('id', { count: 'exact', head: true }).eq('owner_id', ownerId);
  if ((count ?? 0) > 0) return;
  const niches = cfg.niches.length ? cfg.niches : [...LOCAL_NICHES];
  const cities = citiesFor(cfg.scope).map((c) => ({ city: c.city, state: c.state }));
  const rows = buildDiscoveryQueries(niches, cities).map((r) => ({ owner_id: ownerId, ...r }));
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from('discovery_queries').upsert(rows.slice(i, i + 500), { onConflict: 'owner_id,query_text', ignoreDuplicates: true });
  }
}

/** Run ONE discovery query: Places search (paginated) → parse → dedupe-insert into the lead pool.
 *  Always records the attempt (counters + exhaustion) even if it threw, so the queue keeps rolling. */
// deno-lint-ignore no-explicit-any
async function runDiscoveryQuery(admin: any, ownerId: string, q: QueryRowDB, env: HuntEnv): Promise<number> {
  let inserted = 0;
  try {
    for (const raw of await fetchPlaces(env.placesKey, q.query_text, PLACES_PAGES)) {
      const biz = parsePlace(raw, q.keyword);
      if (biz && await insertLead(admin, ownerId, biz, q.id)) inserted++;
    }
  } catch { /* one query failing never sinks the run — still record the attempt below */ }
  const upd = exhaustionUpdate(q, inserted);
  await admin.from('discovery_queries').update({
    last_run_at: new Date().toISOString(),
    last_inserted: upd.last_inserted, total_inserted: upd.total_inserted,
    run_count: upd.run_count, consecutive_zero_runs: upd.consecutive_zero_runs, exhausted: upd.exhausted,
  }).eq('id', q.id);
  return inserted;
}

/** Google Places textSearch, paginated. Returns structured business records — never invented. */
async function fetchPlaces(apiKey: string, textQuery: string, pages: number): Promise<PlaceRaw[]> {
  const all: PlaceRaw[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < pages; i++) {
    const body: Record<string, unknown> = { textQuery, maxResultCount: 20, regionCode: 'US' };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': PLACES_FIELD_MASK },
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const json = (await res.json()) as { places?: PlaceRaw[]; nextPageToken?: string };
    if (json.places?.length) all.push(...json.places);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
    await new Promise((r) => setTimeout(r, 2000));  // Places needs a short delay before a pageToken is valid
  }
  return all;
}

/** Insert a discovered business, deduped per owner by place_id then normalized website. Returns true
 *  only when a genuinely NEW lead was stored (so the discovery count is honest). */
// deno-lint-ignore no-explicit-any
async function insertLead(admin: any, ownerId: string, biz: DiscoveredBiz, queryId: string): Promise<boolean> {
  if (biz.place_id) {
    const { data } = await admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('place_id', biz.place_id).maybeSingle();
    if (data) return false;
  }
  if (biz.website_normalized) {
    const { data } = await admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('website_normalized', biz.website_normalized).maybeSingle();
    if (data) return false;
  }
  const { error } = await admin.from('discovered_businesses').insert({
    owner_id: ownerId, place_id: biz.place_id, company_name: biz.company_name, keyword: biz.keyword,
    website: biz.website, website_normalized: biz.website_normalized, phone: biz.phone, address: biz.address,
    city: biz.city, state: biz.state, category: biz.category, lat: biz.lat, lng: biz.lng,
    has_website: biz.has_website, status: 'new', source_query_id: queryId,
  });
  return !error;   // a unique-violation race → not counted as new (correct)
}

/** Read one page through the SAME hardened scrape path the app uses (fetch-url), authenticated with
 *  the worker secret. The Bearer header exists ONLY to pass the platform's verify-jwt gateway
 *  (fetch-url deploys JWT-verified) — fetch-url's own worker check still runs on x-worker-secret.
 *  Returns the parsed JSON, or null on any failure. */
async function scrapePage(url: string, mode: 'text' | 'images' | 'contact', env: HuntEnv): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${env.supabaseUrl}/functions/v1/fetch-url`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': env.workerSecret,
        authorization: `Bearer ${env.serviceKey}`,
        apikey: env.serviceKey,
      },
      body: JSON.stringify({ url, mode }),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

/** Build ONE demo from a discovered lead. A lead WITH a website is scraped for real content/photos/
 *  email + honestly audited; a lead with NO website (the strongest "build you a site" prospect) is
 *  built from the Places facts alone (real name/type/city/phone — never invented). Then: recipe demo
 *  → pitch → (if a public email exists) a PENDING approval. Mirrors ingest-profile's save path and
 *  queuePitch's queue path. Also marks the lead built + links the demo. */
// deno-lint-ignore no-explicit-any
async function buildDemoForLead(admin: any, order: OrderRow, lead: LeadRow, env: HuntEnv):
  Promise<'queued' | 'built' | 'skipped'> {
  const location = [lead.city, lead.state].filter(Boolean).join(', ') || null;
  let images: string[] = [];
  let email: string | null = null;
  let page: { title: string | null; description: string | null } = { title: null, description: null };
  let finalUrl = lead.website ?? '';
  // Default (no site, or an unreachable one): an honest "no website" audit — no invented score.
  let audit = auditSite({ url: finalUrl, reachable: false }, env.nowYear);

  if (lead.website) {
    const text = await scrapePage(lead.website, 'text', env);
    if (text && !text.error && text.checks) {   // reachable HTML — read their real site
      const checks = text.checks as { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
      finalUrl = (typeof text.url === 'string' && text.url) || lead.website;
      page = { title: (text.title as string) ?? null, description: (text.description as string) ?? null };
      const imgResp = await scrapePage(lead.website, 'images', env);
      images = Array.isArray(imgResp?.images)
        ? (imgResp!.images as { url?: string }[]).map((i) => i.url).filter((u): u is string => !!u).slice(0, 12)
        : [];
      const contactResp = await scrapePage(lead.website, 'contact', env);
      email = Array.isArray(contactResp?.emails) ? ((contactResp!.emails as string[])[0] ?? null) : null;
      audit = auditSite({
        url: finalUrl, reachable: true, title: page.title, description: page.description,
        text: (text.text as string) ?? '', hasViewport: !!checks.viewport, hasForm: !!checks.form, emailFound: !!checks.email,
      }, env.nowYear);
    }
  }

  const raw = buildHuntProfileRaw({
    url: finalUrl, niche: lead.keyword, fallbackName: lead.company_name,
    page, images, email, audit, location, phone: lead.phone,
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

  // The lead now has a demo — mark it built + link the preview so it never gets re-built.
  await admin.from('discovered_businesses')
    .update({ status: 'built', preview_site_id: (site as { id: string }).id, updated_at: new Date().toISOString() })
    .eq('id', lead.id);

  // No public email → the demo is a warm asset (plus a real phone lead from Places), but there is
  // nothing to email. Honest: a built demo, not a queued pitch.
  if (!email) return 'built';

  // Never queue a pitch whose link can't be opened: with APP_ORIGIN unset the URL is a relative
  // path that would email as a broken link. The demo stays built; the pitch waits for real config.
  if (!/^https?:\/\//.test(previewUrl)) return 'built';

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
