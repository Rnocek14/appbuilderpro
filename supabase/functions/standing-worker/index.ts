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
import { complete, completeVision, modelForPlan } from '../_shared/ai.ts';
import { sendBookingNotice } from '../_shared/bookingNotify.ts';
import { checkCredits, spendCredits, getUserPlan } from '../_shared/credits.ts';
import { pickNextPending, mergeTemplate, batchProgress, staleSendingIndices, type BatchRecipient } from '../_shared/batchCore.ts';
// DAILY AUTOMATIC CLIENT HUNT (client_hunt kind) — the discovery brain + the pure builders are
// verified in src; this worker is only the I/O around them (Google Places, fetch-url scrape, DB
// writes). Discovery is the swift-prep-pros model: a self-exhausting query queue over Places.
import { parseHuntConfig, LOCAL_NICHES, type HuntConfig } from '../../../src/lib/garvis/clientHuntSchedule.ts';
import { buildQueries, parseOpportunities, dedupeKey, huntLine, EXTRACT_SYSTEM, MAX_QUERIES, DRY_RUNS_BEFORE_ROTATE, QUERY_VARIANTS } from '../../../src/lib/garvis/opportunityHunt.ts';
import { orderSteps, stepSucceeded, derivePlanStatus, type StepStatus, type PlanStep } from '../../../src/lib/garvis/orchestrator.ts';
import { buildHuntProfileRaw, buildHuntPitch, buildHuntPitchEmailHtml, huntRunLine, extractSiteFacts, huntImagePrompts, huntArtPrompts } from '../../../src/lib/garvis/clientHuntBuild.ts';
// THE INTELLIGENCE CHAIN (strategist → art director → simulated owner → refine) — the same brief
// the browser preview engine runs, so hunted prospects get the crafted site, not the template.
import {
  extractJson, SPEC_SYSTEM, specPrompt, STRATEGY_SYSTEM, CRITIQUE_SYSTEM,
  strategyBlock, critiqueBlock, critiqueUserPrompt,
} from '../../../src/lib/preview/specPrompts.ts';
import { normalizeStrategy, normalizeCritique, critiqueWarrantsRefine, fallbackAudit } from '../../../src/lib/preview/strategy.ts';
import { auditSite } from '../../../src/lib/garvis/siteAudit.ts';
import { deriveSignals, proposeFromSignals } from '../../../src/lib/garvis/automation/detect.ts';
import { detectVertical } from '../../../src/lib/garvis/verticals.ts';
// TRIGGER ENGINE pure core (app_0076) — the same verified math the in-app runner uses.
import { citiesFor } from '../../../src/lib/garvis/usCities.ts';
import {
  PLACES_FIELD_MASK, parsePlace, buildDiscoveryQueries, exhaustionUpdate,
  type PlaceRaw, type DiscoveredBiz,
} from '../../../src/lib/garvis/placesDiscovery.ts';
import { parseBusinessProfile, assembleFallbackSpec, normalizeSpec, navFor, pickRecipe, previewSlug, restraintFor, type SiteSpec } from '../_shared/previewSpec.ts';
import { BESPOKE_SYSTEM, buildBespokePrompt, bespokeHonest, looksLikeHtmlDoc } from '../../../src/lib/preview/bespokeSite.ts';
import { hashPayload, payloadMatches } from '../_shared/payloadHash.ts';
// CONTENT WEEK (app_0088): the same editor rubric the boards use (fail-CLOSED here — an unjudged
// draft never auto-queues) + the pure week machinery from standingCore.
import { honestySystemPrompt, judgeSystemPrompt, judgeUserPrompt, parseJudgeVerdict } from '../_shared/copyJudge.ts';
import { parseContentWeekConfig, weekSlots, contentWeekLine } from '../_shared/standingCore.ts';
import { composeBatchRecipients } from '../_shared/batchCore.ts';
// AUTOMATION TRIGGERS (app_0076): the pure scheduling core is verified in src (window guard, once-
// only ledger) — this worker adds the missing server half so rules fire on the clock, not only when
// the owner happens to click "Run due now" in a browser tab.
import { dueFires, renderTemplate, fireKey, type CustomerRec, type TriggerChannel } from '../../../src/lib/garvis/automation/triggers.ts';
import { toE164 } from '../../../src/lib/garvis/sms.ts';

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

  const body = (await req.json().catch(() => ({}))) as { order_id?: string; pitch_lead_id?: string };
  const nowIso = new Date().toISOString();

  // ---- ON-DEMAND: "Build & send" one prospect (operator, one click) ---------------------------
  // The Prospects screen sends { pitch_lead_id }. We build THIS lead's demo now and — because the
  // operator asked to send — approve + fire the pitch through send-email in the same call. This is
  // the single-lead, foreground twin of the nightly hunt loop: same claim → build → queue path,
  // plus an immediate send. All send-safety gates still apply inside send-email.
  if (ownerScope && body.pitch_lead_id) {
    const appOrigin = Deno.env.get('APP_ORIGIN');
    if (!appOrigin) return json({ error: 'Sending isn’t configured — set APP_ORIGIN on the server.' }, 400);
    const { data: leadRow } = await admin.from('discovered_businesses')
      .select('id, place_id, company_name, keyword, website, phone, city, state, status')
      .eq('id', body.pitch_lead_id).eq('owner_id', ownerScope).maybeSingle();
    if (!leadRow) return json({ error: 'Prospect not found.' }, 404);
    // CLAIM so a second click (or the nightly worker) can't build the same lead twice. Allow both a
    // fresh 'new' lead and re-sending a 'built'/'skipped' one — but never one already 'building'.
    const { data: claimRows } = await admin.from('discovered_businesses')
      .update({ status: 'building', updated_at: new Date().toISOString() })
      .eq('id', body.pitch_lead_id).eq('owner_id', ownerScope).neq('status', 'building').select('id');
    if (!claimRows?.length) return json({ error: 'This prospect is already being built — give it a moment.' }, 409);
    const env: HuntEnv = {
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      workerSecret: workerSecret ?? '',
      serviceKey,
      appOrigin,
      placesKey: Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '',
      nowYear: new Date(nowIso).getUTCFullYear(),
      runRatings: new Map(),
    };
    const order = { owner_id: ownerScope } as unknown as OrderRow;
    try {
      const outcome = await buildDemoForLead(admin, order, leadRow as unknown as LeadRow, env, true);
      if (outcome === 'queued') return json({ ok: true, sent: true });
      // Built a demo but no public email was found — honest: we can't cold-email without an address.
      if (outcome === 'built') return json({ ok: true, sent: false, error: 'Demo built, but no public email was found on their site — nothing was sent.' });
      await admin.from('discovered_businesses').update({ status: 'skipped', updated_at: new Date().toISOString() }).eq('id', body.pitch_lead_id);
      return json({ ok: false, error: 'Couldn’t build a demo for this prospect (not enough real content to work from).' }, 422);
    } catch (e) {
      // Leave status='building'; the stale sweep reclaims it. Surface the real error, don't fake success.
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

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

    // ---- BOOKING REMINDERS (app_0109) --------------------------------------------------------
    // Text/email a customer ~a day before their appointment. Fires once per appointment as it enters
    // the (now+3h, now+24h] window; reminder_sent is set regardless of send result, so a bad number
    // can never spam. Transactional (they booked) → sends direct via bookingNotify, not the marketing path.
    try { await drainBookingReminders(admin); } catch { /* a reminder never wedges the tick */ }

    // ---- ARC WAKE SWEEP (app_0095) -----------------------------------------------------------
    // Waiting arcs carry a machine-checkable blocker (waiting_on). When the blocker has cleared —
    // the business draft got approved, the chartered areas landed — flip the arc to 'ready':
    // the Orchestrate page auto-resumes ready arcs on sight, and the owner gets one honest line.
    // The system notices, so the operator doesn't have to remember.
    try {
      const { data: blocked } = await admin.from('orchestrator_plans')
        .select('id, owner_id, title, waiting_on')
        .eq('status', 'waiting').not('waiting_on', 'is', null).limit(20);
      for (const arc of (blocked ?? []) as { id: string; owner_id: string; title: string; waiting_on: { kind?: string; title?: string; world_id?: string } }[]) {
        const w = arc.waiting_on ?? {};
        let cleared = false;
        if (w.kind === 'world_exists' && w.title) {
          // Cleared when the world resolves the same way the executor will: one match, or an
          // exact-title match among two. ('world_named'/'other' need the operator — never auto.)
          const { data: worlds } = await admin.from('knowledge_worlds')
            .select('id, title').eq('owner_id', arc.owner_id).ilike('title', `%${w.title}%`).limit(2);
          const rows = (worlds ?? []) as { title: string }[];
          cleared = rows.length === 1
            || rows.filter((r) => r.title.toLowerCase() === String(w.title).toLowerCase()).length === 1;
        } else if (w.kind === 'world_area' && w.world_id) {
          const { data: areas } = await admin.from('knowledge_clusters')
            .select('id').eq('world_id', w.world_id).not('charter', 'is', null).limit(1);
          cleared = ((areas ?? []).length > 0);
        }
        if (!cleared) continue;
        await admin.from('orchestrator_plans')
          .update({ status: 'ready', updated_at: nowIso, last_activity_at: nowIso })
          .eq('id', arc.id).eq('status', 'waiting');
        await admin.from('mind_events').insert({
          owner_id: arc.owner_id, event_type: 'note', source: 'orchestrator',
          subject: `▶ Arc "${String(arc.title).slice(0, 120)}" is unblocked — it resumes when you next open Orchestrate.`,
          payload: { key: `arc-ready:${arc.id}`, plan_id: arc.id },
        }).then(() => {}, () => {});
        const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', arc.owner_id).maybeSingle();
        await notifyText((prof as { webhook_url?: string } | null)?.webhook_url,
          `▶ "${String(arc.title).slice(0, 120)}" is unblocked — open Orchestrate and it continues on its own.`).catch(() => {});
      }
    } catch { /* the wake sweep must never wedge the order tick */ }

    // ---- ARC ADVANCE (server-side execution of mechanical steps) -----------------------------
    // A 'ready' arc advances RIGHT HERE for every step whose action is purely mechanical
    // (standing orders, records, reminders, invoices — no model, no browser). Creative steps
    // (founding, plans, campaigns) stop the advance and leave the arc 'ready' for the client
    // visit. Zero presence required for the mechanical tail of a project.
    try {
      const { data: readyArcs } = await admin.from('orchestrator_plans')
        .select('id, owner_id, title, steps, statuses')
        .eq('status', 'ready').limit(5);
      for (const arc of (readyArcs ?? []) as { id: string; owner_id: string; title: string; steps: PlanStep[]; statuses: StepStatus[] }[]) {
        await advanceArcServerSide(admin, arc, nowIso).catch(() => {});
      }
    } catch { /* arc advance must never wedge the order tick */ }

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
            owner_id: b.owner_id, contact_id: r.contactId, batch_id: b.id, subject: mergeTemplate(b.subject, r.name),
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
              // The service-key bearer exists ONLY to pass the platform's verify-jwt gateway
              // (send-email deploys JWT-verified for browser callers); the real worker auth is
              // still x-worker-secret, checked inside the function. Without the bearer, every
              // drain send 401s at the gateway before send-email's code runs.
              headers: {
                'content-type': 'application/json', 'x-worker-secret': workerSecret ?? '',
                Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
              },
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

    // ---- SOCIAL POST DRAIN (app_0070) ----------------------------------------------------------
    // The missing half of social auto-posting: an APPROVED post used to publish only if the
    // owner's browser made the call — approve-and-walk-away (or a scheduled time arriving with
    // every laptop closed) left it queued forever. The clock now executes ALREADY-APPROVED posts
    // through THE ONE PUBLISH PATH (social-publish, worker-secret caller); approval status, the
    // payload-hash tamper check, the refusal gate, and the atomic double-post claim all re-check
    // server-side per post. NOTHING here decides — a pending approval waits for the human, a
    // rejected/expired one retires its post. Bounded per tick; never wedges the order tick.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const POSTS_PER_TICK = 5;
      const SOCIAL_DRAIN_BUDGET_MS = 30_000;
      const drainStart = Date.now();
      // Inspect more than we execute: a head-of-line block of still-pending approvals must not
      // starve approved posts behind it (the batch drain's ordering lesson).
      const { data: posts } = await admin.from('social_posts')
        .select('id, owner_id, approval_id, scheduled_for, status, provider_post_id, created_at')
        .eq('status', 'queued').not('approval_id', 'is', null).is('provider_post_id', null)
        // "Post now" rows AND scheduled rows whose moment has arrived — never a future one.
        .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
        .order('created_at', { ascending: true }).limit(25);
      let published = 0;
      for (const p of (posts ?? []) as { id: string; owner_id: string; approval_id: string; scheduled_for: string | null }[]) {
        if (published >= POSTS_PER_TICK || Date.now() - drainStart > SOCIAL_DRAIN_BUDGET_MS) break;
        try {
          const { data: ap } = await admin.from('approvals')
            .select('id, owner_id, kind, status, result').eq('id', p.approval_id).single();
          if (!ap || ap.kind !== 'publish_post' || ap.owner_id !== p.owner_id) continue; // never act on a mismatched record
          if (ap.status === 'rejected' || ap.status === 'expired') {
            // The human said no — retire the post so it can't sit "queued" forever (or clog this
            // window). Guarded on status so a concurrent decision is never clobbered.
            await admin.from('social_posts').update({ status: 'canceled', error: `approval ${ap.status}` })
              .eq('id', p.id).eq('status', 'queued');
            continue;
          }
          if (ap.status !== 'approved') continue; // still awaiting the human — not our call to make
          // Already claimed = in flight from another caller/tick. social-publish's atomic claim is
          // the real double-post guard; this check just skips a guaranteed-409 call.
          if ((ap.result as Record<string, unknown> | null)?.send_claimed_at) continue;
          const res = await fetch(`${supabaseUrl}/functions/v1/social-publish`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-worker-secret': workerSecret ?? '',
              // The Bearer exists ONLY to pass the platform's verify-jwt gateway (social-publish
              // deploys JWT-verified, like fetch-url) — its own worker check runs on x-worker-secret.
              authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({ approval_id: p.approval_id }),
          });
          if (res.ok) published++;
          // Non-ok: social-publish already recorded the honest outcome on the post row + the
          // ledger (a blocked/failed post leaves status != 'queued', so the drain never spins).
        } catch { /* one post's failure never blocks the rest */ }
      }
    } catch { /* social drain must never wedge the order tick */ }

    // ---- CLIENT AUTOMATION TRIGGERS (app_0076) --------------------------------------------------
    // The recurring-revenue engine ON THE CLOCK: every owner's active triggers run with the SAME
    // pure core (dueFires/renderTemplate) + claim-first trigger_fires ledger the in-app "Run due
    // now" uses — so automations fire while the operator sleeps (a rule created and left alone
    // used to fire ONLY when the owner clicked "Run due now"). Every fire enqueues a PENDING
    // approval through the one send path; nothing sends without the owner; the trigger_fires
    // unique index arbitrates between this drain and a concurrent browser run. Bounded per tick.
    try {
      // Stranded-claim sweep (mirror of the browser runner): a run that died after claiming but
      // before enqueuing leaves approval_id null — release older than 10 min so fires retry.
      const staleCutoff = new Date(Date.parse(nowIso) - 10 * 60 * 1000).toISOString();
      await admin.from('trigger_fires').delete().is('approval_id', null).lt('created_at', staleCutoff);

      interface AutoTrigRow {
        id: string; owner_id: string; list_id: string; label: string;
        anchor_field: 'last_service_at' | 'last_visit_at' | 'purchase_at' | 'next_due_at';
        offset_days: number; window_days: number; template_subject: string; template_body: string;
        channel: TriggerChannel | null;
      }
      interface AutoCustRow {
        id: string; email: string | null; phone: string | null; name: string | null; consent_basis: string | null;
        last_service_at: string | null; last_visit_at: string | null;
        purchase_at: string | null; next_due_at: string | null;
      }
      // Deterministic order + a bound far above any plausible fleet (review fix): an unordered
      // .limit(100) let PostgREST return an arbitrary subset, so rules past the cap could be
      // silently NEVER checked. Ordered by id, capped at 500 — the fireBudget below still bounds
      // per-tick work, and a backlog beyond the budget drains across subsequent ticks.
      const { data: trigData } = await admin.from('automation_triggers')
        .select('id, owner_id, list_id, label, anchor_field, offset_days, window_days, template_subject, template_body, channel')
        .eq('status', 'active').order('id', { ascending: true }).limit(500);

      const custCache = new Map<string, CustomerRec[]>();
      let fireBudget = 40; // bound tick time — a backlog drains over ticks, never in one stampede
      for (const t of (trigData ?? []) as AutoTrigRow[]) {
        if (fireBudget <= 0) break;
        // Ownership re-check under service-role (RLS doesn't protect the admin client): the
        // trigger's list must belong to the trigger's owner or nothing fires.
        const { data: list } = await admin.from('customer_lists').select('owner_id').eq('id', t.list_id).maybeSingle();
        if (!list || (list as { owner_id: string }).owner_id !== t.owner_id) continue;

        const cacheKey = `${t.owner_id}|${t.list_id}`;
        let customers = custCache.get(cacheKey);
        if (!customers) {
          const { data: custData } = await admin.from('customers')
            .select('id, email, phone, name, consent_basis, last_service_at, last_visit_at, purchase_at, next_due_at')
            .eq('owner_id', t.owner_id).eq('list_id', t.list_id).limit(2000);
          customers = ((custData ?? []) as AutoCustRow[])
            // Consent gate (the column existed but was never checked): automations are warm/
            // transactional by design — a cold-prospecting row never rides a recall trigger.
            .filter((c) => (c.consent_basis ?? 'warm_transactional') === 'warm_transactional')
            .map((c) => ({
              id: c.id, email: c.email, phone: c.phone, name: c.name,
              anchors: {
                last_service_at: c.last_service_at, last_visit_at: c.last_visit_at,
                purchase_at: c.purchase_at, next_due_at: c.next_due_at,
              },
            }));
          custCache.set(cacheKey, customers);
        }

        const { data: fireData } = await admin.from('trigger_fires')
          .select('customer_id, fired_for').eq('owner_id', t.owner_id).eq('trigger_id', t.id);
        const firedKeys = ((fireData ?? []) as { customer_id: string; fired_for: string }[])
          .map((f) => fireKey(f.customer_id, f.fired_for));

        const plan = dueFires(
          { id: t.id, anchorField: t.anchor_field, offsetDays: t.offset_days, windowDays: t.window_days, status: 'active', channel: t.channel ?? 'email' },
          customers, firedKeys, nowIso,
        );
        let queuedForTrigger = 0;
        for (const fire of plan) {
          if (fireBudget <= 0) break;

          const isSms = fire.channel === 'sms';
          // SMS: normalize the phone BEFORE any DB work — an un-textable number is skipped, never
          // claimed or enqueued as a doomed approval (the window guard retires it).
          const e164 = isSms ? toE164(fire.to) : null;
          if (isSms && !e164) continue;

          // Suppression pre-check BEFORE claiming (queueHuntPitch's honesty): a known unsubscribed/
          // bounced/complained email — or an SMS opt-out (STOP → phone_status='unsubscribed') — is
          // never re-queued, and never claimed, so the window guard retires it (no claim-release loop).
          let contactId: string | null = null;
          if (isSms) {
            const { data: found } = await admin.from('contacts')
              .select('id, phone_status').eq('owner_id', t.owner_id).eq('phone_e164', e164!).limit(1);
            const row = found && found.length ? (found[0] as { id: string; phone_status?: string }) : null;
            if (row?.phone_status === 'unsubscribed') continue;
            contactId = row?.id ?? null;
          } else {
            const { data: existing } = await admin.from('contacts')
              .select('id, email_status').eq('owner_id', t.owner_id).eq('email', fire.to.toLowerCase()).maybeSingle();
            const st = (existing as { email_status?: string } | null)?.email_status;
            if (st === 'unsubscribed' || st === 'bounced' || st === 'complained') continue;
            contactId = existing ? (existing as { id: string }).id : null;
          }

          // CLAIM-FIRST: the unique index rejects a duplicate/concurrent fire (23505 = skip).
          const { data: claim, error: claimErr } = await admin.from('trigger_fires')
            .insert({ owner_id: t.owner_id, trigger_id: t.id, customer_id: fire.customerId, fired_for: fire.firedFor })
            .select('id').maybeSingle();
          if (claimErr || !claim) continue;
          const fireId = (claim as { id: string }).id;
          fireBudget--;

          try {
            const cust = customers.find((c) => c.id === fire.customerId)!;
            const subject = renderTemplate(t.template_subject, cust).trim() || t.label;
            const bodyText = renderTemplate(t.template_body, cust);
            const to = isSms ? e164! : fire.to.toLowerCase().trim();

            // Create the contact if the pre-check found none. Email keys on email; SMS keys on
            // phone_e164 and carries warm_transactional consent (the client's own warm customer, texted
            // about their own service) — send-sms still re-checks consent and fails closed.
            if (!contactId) {
              if (isSms) {
                const { data: c } = await admin.from('contacts')
                  .insert({ owner_id: t.owner_id, phone: e164, phone_e164: e164, phone_status: 'unknown', sms_consent: 'warm_transactional', sms_consent_at: nowIso, is_primary: true })
                  .select('id').maybeSingle();
                if (c) contactId = (c as { id: string }).id;
                else {
                  const { data: again } = await admin.from('contacts')
                    .select('id').eq('owner_id', t.owner_id).eq('phone_e164', e164!).limit(1);
                  contactId = again && again.length ? (again[0] as { id: string }).id : null;
                }
              } else {
                const { data: c } = await admin.from('contacts')
                  .insert({ owner_id: t.owner_id, email: to, email_status: 'unknown', is_primary: true })
                  .select('id').maybeSingle();
                if (c) contactId = (c as { id: string }).id;
                else {
                  const { data: again } = await admin.from('contacts')
                    .select('id').eq('owner_id', t.owner_id).eq('email', to).maybeSingle();
                  contactId = again ? (again as { id: string }).id : null;
                }
              }
            }

            const { data: camp } = await admin.from('outreach_campaigns')
              .insert({ owner_id: t.owner_id, contact_id: contactId, kind: 'automation', state: 'pending_approval' })
              .select('id').single();
            if (!camp) throw new Error('campaign insert failed');
            const campaignId = (camp as { id: string }).id;

            const { data: msg } = await admin.from('outreach_messages').insert({
              owner_id: t.owner_id, campaign_id: campaignId, contact_id: contactId, sequence_step: 0,
              channel: isSms ? 'sms' : 'email', subject: isSms ? t.label : subject, body_text: bodyText, to_address: to, status: 'draft',
            }).select('id').single();
            if (!msg) throw new Error('message insert failed');

            const payload = isSms
              ? { message_id: (msg as { id: string }).id, campaign_id: campaignId, sms_kind: 'transactional' }
              : { message_id: (msg as { id: string }).id, campaign_id: campaignId };
            const payload_hash = await hashPayload(payload);
            const { data: ap, error: apErr } = await admin.from('approvals').insert({
              owner_id: t.owner_id, kind: isSms ? 'send_sms' : 'send_email',
              title: `${t.label} → ${to}`,
              preview: isSms ? bodyText : `${subject}\n\n${bodyText}`,
              payload, payload_hash, requested_by: 'garvis-auto',
            }).select('id').single();
            if (apErr || !ap) throw new Error(apErr?.message ?? 'approval insert failed');

            await admin.from('trigger_fires').update({ approval_id: (ap as { id: string }).id }).eq('id', fireId);
            queuedForTrigger++;
          } catch {
            // Release the claim so the fire retries next tick — a failed fire is never silently lost.
            await admin.from('trigger_fires').delete().eq('id', fireId);
          }
        }

        if (queuedForTrigger > 0) {
          await admin.from('mind_events').insert({
            owner_id: t.owner_id, event_type: 'note', source: 'execution',
            subject: `Automation "${t.label.slice(0, 120)}" queued ${queuedForTrigger} send${queuedForTrigger === 1 ? '' : 's'} for your approval`,
            payload: { key: `auto-trigger:${t.id}:${nowIso.slice(0, 10)}`, trigger_id: t.id, queued: queuedForTrigger },
          }).then(() => {}, () => {});
        }
      }
    } catch { /* automation drain must never wedge the order tick */ }

    // ---- CONTENT WEEK DRAIN (app_0088) -------------------------------------------------------
    // The executor HALF: a staged week executes ONLY after its approval verifies — re-checked
    // EVERY tick (rejected/expired cancels; pending waits) AND hash-verified twice: the approval's
    // own payload_hash, plus pieces_hash against the CURRENT pieces (post-decision tampering with
    // the content voids the decision). Social pieces become social_posts + pre-authorized
    // publish_post approvals executed through social-publish (Ayrshare scheduleDate spreads the
    // week); the email becomes an outreach_batch whose EXISTING drain sends through the one send
    // path with suppression/kill-switch/daily-cap re-checked per recipient. garvis-auto posts are
    // capped by outreach_settings.social_daily_cap.
    try {
      interface WeekPiece {
        id: string; channel: 'social' | 'email'; platform?: string | null;
        caption?: string; hashtags?: string[]; subject?: string; body?: string; segment?: string | null;
        media_urls?: string[]; scheduled_for: string; quality: { score: number; notes: string };
        state: string; reason?: string; social_post_id?: string; batch_id?: string;
      }
      interface WeekRow {
        id: string; owner_id: string; world_id: string | null; week_start: string;
        pieces: WeekPiece[]; status: string; approval_id: string | null; order_id: string | null;
      }
      const drainUrl = Deno.env.get('SUPABASE_URL')!;
      const { data: weeks } = await admin.from('content_weeks')
        .select('id, owner_id, world_id, week_start, pieces, status, approval_id, order_id')
        .in('status', ['staged', 'queued']).order('created_at', { ascending: true }).limit(5);
      for (const wk of (weeks ?? []) as WeekRow[]) {
        if (!wk.approval_id) continue;
        const { data: wkAp } = await admin.from('approvals')
          .select('id, owner_id, kind, status, payload, payload_hash').eq('id', wk.approval_id).maybeSingle();
        if (!wkAp || wkAp.kind !== 'content_week' || wkAp.owner_id !== wk.owner_id) continue;
        if (wkAp.status === 'rejected' || wkAp.status === 'expired') {
          await admin.from('content_weeks').update({ status: 'canceled', finished_at: nowIso }).eq('id', wk.id);
          continue;
        }
        if (wkAp.status !== 'approved') continue; // pending — the human hasn't decided yet
        if (!(await payloadMatches(wkAp.payload, wkAp.payload_hash as string | null))) {
          await admin.from('content_weeks').update({ status: 'canceled', finished_at: nowIso }).eq('id', wk.id);
          continue;
        }
        const wkPayload = wkAp.payload as { pieces_hash?: string };
        if ((await hashPayload(wk.pieces)) !== wkPayload.pieces_hash) {
          // The content changed AFTER the decision — the decision no longer covers it. Refuse.
          await admin.from('content_weeks').update({ status: 'canceled', finished_at: nowIso }).eq('id', wk.id);
          await admin.from('mind_events').insert({
            owner_id: wk.owner_id, event_type: 'note', source: 'execution',
            subject: `Content week of ${wk.week_start} canceled — pieces changed after approval (hash mismatch)`,
            payload: { key: `content-week-tamper:${wk.id}`, week_id: wk.id },
          }).then(() => {}, () => {});
          continue;
        }

        const { data: st } = await admin.from('outreach_settings')
          .select('social_daily_cap').eq('owner_id', wk.owner_id).maybeSingle();
        const socialCap = (st as { social_daily_cap?: number } | null)?.social_daily_cap ?? 4;

        const pieces = wk.pieces;
        let mutated = false;
        for (const piece of pieces) {
          if (piece.state !== 'staged') continue;
          // Unfilled [EDIT] holes NEVER go out — the piece skips with the reason on the record.
          const textOf = piece.channel === 'social'
            ? String(piece.caption ?? '') : `${piece.subject ?? ''}\n${piece.body ?? ''}`;
          if (/\[EDIT\b/i.test(textOf)) {
            piece.state = 'skipped'; piece.reason = 'has unfilled [EDIT] holes'; mutated = true; continue;
          }

          if (piece.channel === 'social') {
            // Cap gate: today's machine-queued posts across ALL sources. 0 blocks all auto posting.
            const since = `${nowIso.slice(0, 10)}T00:00:00Z`;
            const { count } = await admin.from('approvals')
              .select('id', { count: 'exact', head: true })
              .eq('owner_id', wk.owner_id).eq('kind', 'publish_post').eq('requested_by', 'garvis-auto')
              .gte('created_at', since);
            if ((count ?? 0) >= socialCap) break; // the rest waits for the next tick/day

            const postBody = [String(piece.caption ?? ''), (piece.hashtags ?? []).map((h) => `#${h}`).join(' ')]
              .filter(Boolean).join('\n\n');
            const { data: post } = await admin.from('social_posts').insert({
              owner_id: wk.owner_id, world_id: wk.world_id, body: postBody,
              platforms: [piece.platform], media_urls: piece.media_urls ?? [],
              scheduled_for: piece.scheduled_for, status: 'queued',
            }).select('id').single();
            if (!post) { piece.state = 'skipped'; piece.reason = 'post insert failed'; mutated = true; continue; }
            const postId = (post as { id: string }).id;
            const postPayload = { post_row_id: postId };
            const { data: pap } = await admin.from('approvals').insert({
              owner_id: wk.owner_id, kind: 'publish_post', world_id: wk.world_id,
              title: `Auto: post to ${piece.platform} (${piece.quality.score}/10, week of ${wk.week_start})`,
              preview: postBody.slice(0, 400), payload: postPayload, payload_hash: await hashPayload(postPayload),
              status: 'approved', requested_by: 'garvis-auto', decided_via: 'content_week', decided_at: nowIso,
            }).select('id').single();
            if (!pap) { piece.state = 'skipped'; piece.reason = 'approval insert failed'; mutated = true; continue; }
            await admin.from('social_posts').update({ approval_id: (pap as { id: string }).id }).eq('id', postId);
            const res = await fetch(`${drainUrl}/functions/v1/social-publish`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json', 'x-worker-secret': workerSecret ?? '',
                Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
              },
              body: JSON.stringify({ approval_id: (pap as { id: string }).id }),
            });
            const out = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));
            if (res.ok && (out as { ok?: boolean }).ok !== false) {
              piece.state = 'queued'; piece.social_post_id = postId;
            } else {
              piece.state = 'skipped';
              piece.reason = String((out as { error?: string }).error ?? `HTTP ${res.status}`).slice(0, 200);
            }
            mutated = true;
          } else {
            // EMAIL: only once its slot arrives — the batch drain then sends under the daily cap.
            if (Date.parse(piece.scheduled_for) > Date.parse(nowIso)) continue;
            let cq = admin.from('contacts').select('id, email, full_name, email_status')
              .eq('owner_id', wk.owner_id).limit(2000);
            if (wk.world_id) cq = cq.eq('world_id', wk.world_id);
            if (piece.segment && piece.segment !== 'all') cq = cq.eq('stage', piece.segment);
            const { data: contacts } = await cq;
            const { recipients } = composeBatchRecipients((contacts ?? []) as { id: string; email: string | null; full_name: string | null; email_status: string | null }[]);
            if (recipients.length === 0) {
              piece.state = 'skipped'; piece.reason = 'no sendable contacts in the segment'; mutated = true; continue;
            }
            const { data: batch } = await admin.from('outreach_batches').insert({
              owner_id: wk.owner_id, world_id: wk.world_id, subject: String(piece.subject ?? ''),
              body_text: String(piece.body ?? ''), recipients, status: 'queued',
            }).select('id').single();
            if (!batch) { piece.state = 'skipped'; piece.reason = 'batch insert failed'; mutated = true; continue; }
            const batchId = (batch as { id: string }).id;
            const bPayload = { batch_id: batchId, recipient_count: recipients.length, week_id: wk.id };
            const { data: bap } = await admin.from('approvals').insert({
              owner_id: wk.owner_id, kind: 'send_batch', world_id: wk.world_id,
              title: `Auto: send "${String(piece.subject ?? '').slice(0, 80)}" to ${recipients.length} (${piece.quality.score}/10)`,
              preview: String(piece.body ?? '').slice(0, 280), payload: bPayload, payload_hash: await hashPayload(bPayload),
              status: 'approved', requested_by: 'garvis-auto', decided_via: 'content_week', decided_at: nowIso,
            }).select('id').single();
            if (bap) {
              await admin.from('outreach_batches').update({ approval_id: (bap as { id: string }).id }).eq('id', batchId);
              piece.state = 'queued'; piece.batch_id = batchId;
            } else { piece.state = 'skipped'; piece.reason = 'approval insert failed'; }
            mutated = true;
          }
        }

        const staged = pieces.filter((p) => p.state === 'staged').length;
        if (mutated || staged === 0) {
          const done = staged === 0;
          await admin.from('content_weeks').update({
            pieces, status: done ? 'done' : 'queued', ...(done ? { finished_at: nowIso } : {}),
          }).eq('id', wk.id);
          if (done) {
            const queued = pieces.filter((p) => p.state === 'queued').length;
            const skipped = pieces.filter((p) => p.state === 'skipped').length;
            await admin.from('mind_events').insert({
              owner_id: wk.owner_id, event_type: 'note', source: 'execution',
              subject: `Content week of ${wk.week_start} executed — ${queued} queued${skipped > 0 ? `, ${skipped} skipped (reasons on record)` : ''}`,
              payload: { key: `content-week-done:${wk.id}`, week_id: wk.id, queued, skipped },
            }).then(() => {}, () => {});
          }
        }
      }
    } catch { /* content-week drain must never wedge the order tick */ }
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

    // ---- opportunity_hunt: scheduled search sweeps → fetched pages → honest extraction --------
    // The Opportunity Engine's unattended half: Serper queries (config.queries, derived from the
    // operator's focus) → fetch the organic results (static HTML; unreadable pages are COUNTED
    // and reported, never silently skipped) → ONE batched extraction call bound to the fetched
    // URL allowlist (hallucinated links cannot enter the feed) → dedupe-at-insert into the
    // opportunities table. READ + RECORD only — applying is the operator's move, in the feed.
    if (order.kind === 'opportunity_hunt') {
      try {
        const cfg = (order.config ?? {}) as { focus?: string; region?: string | null; queries?: string[]; dry_streak?: number; variant?: number };
        const focus = (cfg.focus ?? '').trim();
        if (!focus) throw new Error('no focus configured (config.focus missing)');
        // SELF-TUNING (holy-grail gap 5): the variant picks the query vocabulary; a hunt that has
        // been dry DRY_RUNS_BEFORE_ROTATE runs in a row rotates to the next angle set instead of
        // repeating a dead phrasing forever. Deterministic and stated in last_result.
        const variant = Number(cfg.variant) || 0;
        const queries = (variant === 0 && Array.isArray(cfg.queries) && cfg.queries.length
          ? cfg.queries : buildQueries(focus, cfg.region, variant)).slice(0, MAX_QUERIES);

        let line: string;
        let found = 0;
        const serperKey = Deno.env.get('SERPER_API_KEY');
        if (!serperKey) {
          line = `Opportunity hunt "${focus}": SERPER_API_KEY is not set — the hunt cannot search. Add the secret and this runs on the next tick.`;
        } else {
          const HUNT_BUDGET_MS = 70_000;
          const started = Date.now();

          // 1. SEARCH — organic results across the angle-diverse query set, deduped by URL.
          const candidates: { url: string; title: string }[] = [];
          const seenUrl = new Set<string>();
          let searched = 0;
          for (const q of queries) {
            if (Date.now() - started > HUNT_BUDGET_MS) break;
            try {
              const res = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: { 'X-API-KEY': serperKey, 'content-type': 'application/json' },
                body: JSON.stringify({ q, num: 8 }),
              });
              if (!res.ok) continue;
              searched++;
              const data = await res.json();
              for (const r of ((data?.organic ?? []) as { link?: string; title?: string }[])) {
                const url = (r.link ?? '').trim();
                if (/^https?:\/\//i.test(url) && !seenUrl.has(url)) { seenUrl.add(url); candidates.push({ url, title: r.title ?? '' }); }
              }
            } catch { /* one query failing never kills the sweep */ }
          }

          // 2. FETCH up to 6 result pages (SSRF-safe), keeping honest count of unreadable ones.
          // RENDERED-FETCH SENSE (holy-grail gap 7): a page too thin for static HTML gets ONE
          // second chance through Serper's scrape endpoint, which executes JS — the class of
          // portal the hunt used to only be able to flag now actually gets read. Fail-soft: a
          // scrape miss keeps the honest `thin` count exactly as before.
          const pages: { url: string; text: string }[] = [];
          let thin = 0;
          let rendered = 0;
          for (const c of candidates.slice(0, 6)) {
            if (Date.now() - started > HUNT_BUDGET_MS) break;
            let text = '';
            try {
              const res = await safeFetch(c.url);
              text = normalizeContent(await res.text()).slice(0, 6000);
            } catch { /* fall through to the rendered attempt */ }
            if (text.length < 200) {
              try {
                const sr = await fetch('https://scrape.serper.dev', {
                  method: 'POST', signal: AbortSignal.timeout(20_000),
                  headers: { 'X-API-KEY': serperKey, 'content-type': 'application/json' },
                  body: JSON.stringify({ url: c.url }),
                });
                if (sr.ok) {
                  const out = (await sr.json().catch(() => ({}))) as { text?: string; markdown?: string };
                  const renderedText = normalizeContent(String(out.text ?? out.markdown ?? '')).slice(0, 6000);
                  if (renderedText.length >= 200) { text = renderedText; rendered++; }
                }
              } catch { /* rendered attempt is best-effort */ }
            }
            if (text.length < 200) { thin++; continue; } // truly unreadable — reported, never silently skipped
            pages.push({ url: c.url, text });
          }

          // 3. EXTRACT — one batched, credit-metered call bound to the fetched-URL allowlist.
          if (pages.length) {
            await checkCredits(admin, order.owner_id, 'discover');
            const m = modelForPlan(await getUserPlan(admin, order.owner_id));
            const blocks = pages.map((p, i) => `PAGE ${i + 1} · ${p.url}\n${p.text}`).join('\n\n');
            const result = await complete([
              { role: 'system', content: EXTRACT_SYSTEM },
              { role: 'user', content: `${blocks}\n\nExtract the real opportunities now (strict JSON array):` },
            ], { provider: m.provider, model: m.model, maxTokens: 1600 });
            await spendCredits(admin, order.owner_id, { costUsd: result.costUsd, kind: 'discover', provider: m.provider, model: m.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
            const items = parseOpportunities(result.text, pages.map((p) => p.url));

            // 4. DEDUPE-AT-INSERT: (owner_id, dedupe_key) unique + ignoreDuplicates — only genuinely
            //    new rows come back, so `found` is what actually entered the feed.
            if (items.length) {
              const rows = items.map((it) => ({
                owner_id: order.owner_id, world_id: order.world_id ?? null, order_id: order.id,
                title: it.title, summary: it.summary, source_url: it.source_url, kind: it.kind,
                location: it.location, budget_text: it.budget_text, deadline_text: it.deadline_text,
                status: 'new', dedupe_key: dedupeKey(it.source_url, it.title),
              }));
              const { data: inserted } = await admin.from('opportunities')
                .upsert(rows, { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true }).select('id');
              found = (inserted ?? []).length;
            }
          }
          line = huntLine(focus, searched, pages.length, found, thin);
          if (rendered > 0) line += ` (${rendered} JS-rendered page${rendered === 1 ? '' : 's'} read via the rendered fetch)`;
        }

        ran++;
        if (found > 0) changed++;
        // Dry-streak accounting: only real searches count (a missing key is not a dry run).
        const searchedThisRun = !!serperKey;
        let dryStreak = searchedThisRun ? (found > 0 ? 0 : (Number(cfg.dry_streak) || 0) + 1) : (Number(cfg.dry_streak) || 0);
        let nextVariant = variant;
        if (dryStreak >= DRY_RUNS_BEFORE_ROTATE) {
          nextVariant = (variant + 1) % QUERY_VARIANTS;
          dryStreak = 0;
          line += ` Rotated search angles after ${DRY_RUNS_BEFORE_ROTATE} dry runs (vocabulary ${nextVariant + 1}/${QUERY_VARIANTS}).`;
        }
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          config: { ...cfg, dry_streak: dryStreak, variant: nextVariant },
          last_result: { status: found > 0 ? 'changed' : 'unchanged', line, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
          updated_at: nowIso,
        }).eq('id', order.id);

        if (found > 0) {
          await admin.from('mind_events').insert({
            owner_id: order.owner_id, event_type: 'note', source: 'standing-order',
            subject: line.slice(0, 300),
            payload: { order_id: order.id, kind: order.kind, found },
          }).then(() => {}, () => {});
          const { data: prof } = await admin.from('profiles').select('webhook_url').eq('id', order.owner_id).maybeSingle();
          await notifyText((prof as { webhook_url?: string } | null)?.webhook_url, line).catch(() => {});
        }
      } catch (e) {
        failed++;
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'unreachable', line: `Hunt failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}. Will retry on schedule.`, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso),
          updated_at: nowIso,
        }).eq('id', order.id).then(() => {}, () => {});
      }
      continue;
    }

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
          .select('title, business_context, dna').eq('id', order.world_id ?? '').maybeSingle();
        const title = (world?.title as string | undefined) ?? 'the project';
        // Read the board FIRST: existing titles become a hard do-not-repeat list — without it a
        // daily stream regenerates week 1's ideas by week 3.
        const { data: row } = await admin.from('knowledge_clusters').select('working_state').eq('id', clusterId).maybeSingle();
        const ws = ((row?.working_state as Record<string, unknown> | null) ?? {});
        const boards = ((ws.boards as Record<string, unknown> | undefined) ?? {});
        const board = (boards.idea as { tiles?: unknown[]; groups?: string[] } | undefined) ?? { tiles: [] };
        const tiles = Array.isArray(board.tiles) ? (board.tiles as { x?: number; y?: number; content?: { title?: string } }[]) : [];
        const existingTitles = tiles.map((t) => t.content?.title).filter((x): x is string => !!x).slice(-60);
        const m = modelForPlan(await getUserPlan(admin, order.owner_id));
        const result = await complete([
          { role: 'system', content: [
            'You generate product/business ideas for one specific real project. HONESTY IS ABSOLUTE:',
            "- Ground every idea ONLY on the facts given. NEVER invent user counts, revenue, competitors' specifics, or claims about the project.",
            '- Anything an idea needs but you cannot know goes in as a visible hole formatted exactly: [EDIT: what goes here].',
            '- SPECIFIC beats clever: every idea must name a concrete mechanism, user moment, or number from the context (or an [EDIT] hole asking for exactly the missing number). Banned: generic advice ("leverage", "engage", "optimize your presence"). If the idea would fit any business, it is wrong.',
            `Return ONLY a strict JSON array of exactly ${count} objects: {"title": string (<=60 chars), "pitch": string (2-3 sentences), "notes": string (3-5 short lines: first steps, risks, open questions), "tag": one of "feature"|"automation"|"content"|"growth"|"revenue"|"wild"}. No markdown fences.`,
          ].join('\n') },
          { role: 'user', content: `PROJECT: ${title}\nCONTEXT (the only facts you may use): ${JSON.stringify(world?.business_context ?? {})}\nGenerate ${count} fresh, specific, non-overlapping ideas across different tags.${world?.dna ? `\nPRODUCT DNA: ${JSON.stringify(world.dna).slice(0, 1500)}` : ''}${existingTitles.length ? `\nALREADY ON THE BOARD — do NOT repeat or rephrase any of these:\n${existingTitles.map((t) => `- ${t}`).join('\n')}` : ''}` },
        ], { provider: m.provider, model: m.model, maxTokens: 1400 });
        let ideas: { title?: string; pitch?: string; notes?: string; tag?: string }[] = [];
        try { ideas = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); } catch { /* refusal below */ }
        if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('the model returned nothing usable');
        await spendCredits(admin, order.owner_id, { costUsd: result.costUsd, kind: 'board_copy', provider: m.provider, model: m.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

        // Append as ordinary board tiles under working_state.boards.idea — merge, never clobber.
        const TAGS = new Set(['feature', 'automation', 'content', 'growth', 'revenue', 'wild']);
        const group = `Auto · ${nowIso.slice(0, 10)}`;
        const startY = tiles.length ? Math.max(...tiles.map((t) => (typeof t.y === 'number' ? t.y : 0))) + 206 : 40;
        const added = ideas.slice(0, count).map((i, ix) => ({
          id: crypto.randomUUID(), prompt: 'auto-idea', parentId: null,
          content: {
            kindId: `idea_${TAGS.has(i.tag ?? '') ? i.tag : 'feature'}`, tag: TAGS.has(i.tag ?? '') ? i.tag : 'feature',
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

    // ---- content_week: stage ONE judged week of content as ONE approval (app_0088) ------------
    // The producer HALF: draft N posts + 1 email grounded ONLY in the business's own facts, judge
    // every draft against the shared editor rubric (fail-CLOSED — no verdict, no queue; below the
    // bar → discarded with its score kept for audit), persist the week, and stage ONE approval
    // whose payload_hash binds the exact pieces + scores the decision covers. NOTHING publishes
    // here — the drain (below, worker block) executes only after the approval verifies.
    if (order.kind === 'content_week') {
      try {
        const cfg = parseContentWeekConfig(order.config);
        if (!cfg) throw new Error('no usable platforms in config');
        if (!order.world_id) throw new Error('no business bound (world_id missing)');
        await checkCredits(admin, order.owner_id, 'board_copy');

        // The Monday of the current week (UTC) — the idempotency key: a re-run never doubles a week.
        const dow = (new Date(nowIso).getUTCDay() + 6) % 7;
        const weekStart = new Date(Date.parse(nowIso) - dow * 86_400_000).toISOString().slice(0, 10);
        const { data: existingWeek } = await admin.from('content_weeks')
          .select('id').eq('order_id', order.id).eq('week_start', weekStart).maybeSingle();
        if (existingWeek) {
          await admin.from('standing_orders').update({
            last_run_at: nowIso, next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso), updated_at: nowIso,
          }).eq('id', order.id).then(() => {}, () => {});
          continue;
        }

        // GROUNDING — facts only: the world's own context + brand kit + past approved pieces
        // (closing the voiceExample dead wire: real posted work becomes the register to match).
        const { data: world } = await admin.from('knowledge_worlds')
          .select('title, business_context, dna').eq('id', order.world_id).maybeSingle();
        const { data: brand } = await admin.from('brand_kits')
          .select('tone, compliance_line').eq('world_id', order.world_id).maybeSingle();
        const { data: pastPosts } = await admin.from('social_posts')
          .select('body').eq('owner_id', order.owner_id).in('status', ['posted', 'scheduled'])
          .order('created_at', { ascending: false }).limit(5);
        const pastBodies = ((pastPosts ?? []) as { body: string }[]).map((p) => p.body).filter(Boolean);
        const materials: Record<string, unknown> = {
          business: world?.title ?? '', context: world?.business_context ?? {},
          tone: (brand as { tone?: string } | null)?.tone ?? null,
          compliance: (brand as { compliance_line?: string } | null)?.compliance_line ?? null,
          voiceExample: pastBodies[0] ?? null,
          doNotRepeat: pastBodies,
        };

        const m = modelForPlan(await getUserPlan(admin, order.owner_id));
        let cwCost = 0, cwIn = 0, cwOut = 0;
        const cwTrack = (r: { costUsd: number; inputTokens: number; outputTokens: number }) => {
          cwCost += r.costUsd; cwIn += r.inputTokens; cwOut += r.outputTokens;
        };
        const stripF = (t: string) => t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

        const briefs: { channel: 'social' | 'email'; platform?: string; brief: string }[] = [];
        for (let i = 0; i < cfg.postsPerWeek; i++) {
          const platform = cfg.platforms[i % cfg.platforms.length];
          briefs.push({ channel: 'social', platform, brief: `One ${platform} post for this business this week — a fresh, specific angle grounded in the materials; do not reuse an opening from the do-not-repeat list.` });
        }
        if (cfg.emailSegment) briefs.push({ channel: 'email', brief: `One short owner-to-person email to the business's ${cfg.emailSegment === 'all' ? '' : `${cfg.emailSegment} `}contacts this week — one useful, specific message grounded in the materials. No invented offers or urgency.` });

        const slots = weekSlots(weekStart, briefs.length, cfg.sendHourUtc);
        const pieces: Record<string, unknown>[] = [];
        const discards: Record<string, unknown>[] = [];
        for (let i = 0; i < briefs.length; i++) {
          const b = briefs[i];
          try {
            const draftR = await complete([
              { role: 'system', content: honestySystemPrompt(b.channel) },
              { role: 'user', content: `CHANNEL: ${b.channel}${b.platform ? ` (platform: ${b.platform})` : ''}\nMATERIALS (the only facts you may use): ${JSON.stringify(materials)}\n\nTHE BRIEF: ${b.brief}` },
            ], { provider: m.provider, model: m.model, maxTokens: 900 });
            cwTrack(draftR);
            let fields: Record<string, unknown>;
            try { fields = JSON.parse(stripF(draftR.text)); }
            catch { discards.push({ channel: b.channel, platform: b.platform ?? null, fields: null, quality: null, why: 'unparseable' }); continue; }

            const judgeOnce = async (piece: Record<string, unknown>) => {
              const jr = await complete([
                { role: 'system', content: judgeSystemPrompt(b.channel) },
                { role: 'user', content: judgeUserPrompt(materials, b.brief, piece) },
              ], { provider: m.provider, model: m.model, maxTokens: 300 });
              cwTrack(jr);
              return parseJudgeVerdict(jr.text);
            };
            let quality = await judgeOnce(fields).catch(() => null);
            if (quality && quality.score < cfg.minScore) {
              // ONE revision from the editor's notes; keep the better. Same loop the boards run.
              try {
                const rev = await complete([
                  { role: 'system', content: honestySystemPrompt(b.channel) },
                  { role: 'user', content: `MATERIALS: ${JSON.stringify(materials)}\n\nTHE BRIEF: ${b.brief}\n\nYOUR FIRST DRAFT: ${JSON.stringify(fields)}\n\nA professional editor's notes on it: ${quality.notes}\n\nRewrite the piece fixing exactly those notes. Keep every honesty rule: facts from MATERIALS only, [EDIT: …] holes for unknowns, merge fields untouched. Return ONLY the strict JSON.` },
                ], { provider: m.provider, model: m.model, maxTokens: 900 });
                cwTrack(rev);
                const revised = JSON.parse(stripF(rev.text)) as Record<string, unknown>;
                const q2 = await judgeOnce(revised).catch(() => null);
                if (q2 && q2.score > quality.score) { fields = revised; quality = q2; }
              } catch { /* keep the first draft */ }
            }
            // FAIL-CLOSED: no verdict → discard (never auto-queue an unjudged draft).
            if (!quality) { discards.push({ channel: b.channel, platform: b.platform ?? null, fields, quality: null, why: 'judge_failed' }); continue; }
            if (quality.score < cfg.minScore) { discards.push({ channel: b.channel, platform: b.platform ?? null, fields, quality, why: 'below_bar' }); continue; }
            pieces.push({
              id: crypto.randomUUID(), channel: b.channel, platform: b.platform ?? null,
              ...(b.channel === 'social'
                ? { caption: String(fields.caption ?? ''), hashtags: Array.isArray(fields.hashtags) ? fields.hashtags : [] }
                : { subject: String(fields.subject ?? ''), body: String(fields.body ?? ''), segment: cfg.emailSegment }),
              media_urls: [], scheduled_for: slots[i], quality, state: 'staged',
            });
          } catch { discards.push({ channel: b.channel, platform: b.platform ?? null, fields: null, quality: null, why: 'judge_failed' }); }
        }
        await spendCredits(admin, order.owner_id, { costUsd: cwCost, kind: 'board_copy', provider: m.provider, model: m.model, inputTokens: cwIn, outputTokens: cwOut });
        if (pieces.length === 0) throw new Error(`nothing cleared the bar (${discards.length} discarded — scores kept)`);

        const { data: weekRow, error: weekErr } = await admin.from('content_weeks').insert({
          owner_id: order.owner_id, order_id: order.id, world_id: order.world_id,
          week_start: weekStart, pieces, discards, status: 'staged', model: m.model, cost_usd: cwCost,
        }).select('id').single();
        if (weekErr || !weekRow) throw new Error(weekErr?.message ?? 'week insert failed');
        const weekId = (weekRow as { id: string }).id;

        // ONE approval, hash-bound to the exact pieces + scores. AUTO mode (earned by 3 clean
        // weeks, re-read FRESH so a just-revoked autonomy is honored) stages it pre-approved —
        // the speed-to-lead class: visible in the Queue and the ledger, capped, killable.
        const { data: freshOrder } = await admin.from('standing_orders').select('auto_mode').eq('id', order.id).maybeSingle();
        const auto = !!(freshOrder as { auto_mode?: boolean } | null)?.auto_mode;
        const scores = pieces.map((p) => (p.quality as { score: number }).score);
        const payload = { week_id: weekId, week_start: weekStart, pieces_hash: await hashPayload(pieces), scores };
        const payload_hash = await hashPayload(payload);
        const nPosts = pieces.filter((p) => p.channel === 'social').length;
        const emailIncluded = pieces.some((p) => p.channel === 'email');
        const preview = pieces.map((p) => {
          const q = p.quality as { score: number };
          const first = p.channel === 'social' ? String(p.caption ?? '').split('\n')[0] : String(p.subject ?? '');
          return `[${q.score}/10] ${p.channel === 'social' ? p.platform : 'email'}: ${first.slice(0, 110)}`;
        }).join('\n');
        const { data: ap, error: apErr } = await admin.from('approvals').insert({
          owner_id: order.owner_id, kind: 'content_week', world_id: order.world_id,
          title: `Content week of ${weekStart}: ${nPosts} post${nPosts === 1 ? '' : 's'}${emailIncluded ? ' + 1 email' : ''} — scores ${Math.min(...scores)}–${Math.max(...scores)}`,
          preview, payload, payload_hash,
          ...(auto
            ? { status: 'approved', requested_by: 'garvis-auto', decided_via: 'standing_rule', decided_at: nowIso }
            : { requested_by: 'garvis' }),
        }).select('id').single();
        if (apErr || !ap) throw new Error(apErr?.message ?? 'approval insert failed');
        await admin.from('content_weeks').update({ approval_id: (ap as { id: string }).id }).eq('id', weekId);

        ran++; changed++;
        const line = contentWeekLine(`Week of ${weekStart}`, pieces.length, discards.length, emailIncluded, auto);
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'changed', line, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso), updated_at: nowIso,
        }).eq('id', order.id);
        await admin.from('mind_events').insert({
          owner_id: order.owner_id, event_type: 'note', source: 'standing-order',
          subject: line.slice(0, 300),
          payload: { key: `content-week:${order.id}:${weekStart}`, order_id: order.id, week_id: weekId, kept: pieces.length, discarded: discards.length },
        }).then(() => {}, () => {});
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message.slice(0, 160) : 'unknown error';
        await admin.from('standing_orders').update({
          last_run_at: nowIso,
          last_result: { status: 'unreachable', line: `Content week skipped: ${msg}. Will retry on schedule.`, hash: null, excerpt: null, checkedAt: nowIso },
          next_run_at: nextRunAfter(order.cadence, order.anchor_at, nowIso), updated_at: nowIso,
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

interface HuntEnv {
  supabaseUrl: string; workerSecret: string; serviceKey: string; appOrigin: string; placesKey: string; nowYear: number;
  // Ratings seen DURING THIS RUN, keyed by place_id — used only to render the demo built in the
  // same invocation (Places ToS: display-at-use; the lead pool never stores rating).
  runRatings: Map<string, { rating: number | null; count: number | null }>;
}
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
    runRatings: new Map(),
  };
  const startedMs = Date.now();

  // Seed the discovery queue once per owner (idempotent: unique(owner, query_text) makes a re-seed a
  // no-op). buildDiscoveryQueries expands the niches (or the whole catalog) × the scope's cities.
  await ensureDiscoveryQueue(admin, order.owner_id, cfg);

  // --- DISCOVER: run up to searchesPerDay next-best queries, persist the real businesses ----------
  let discovered = 0;
  let discoveryError: string | null = null;
  const { data: queries } = await admin.from('discovery_queries')
    .select('id, query_text, keyword, last_run_at, exhausted, total_inserted, run_count, consecutive_zero_runs')
    .eq('owner_id', order.owner_id).eq('exhausted', false)
    .order('last_run_at', { ascending: true, nullsFirst: true })   // never-run first, then least-recent
    .limit(cfg.searchesPerDay);
  for (const q of (queries ?? []) as QueryRowDB[]) {
    if (Date.now() - startedMs > DISCOVER_BUDGET_MS) break;   // leave time for the build phase
    const r = await runDiscoveryQuery(admin, order.owner_id, q, env);
    discovered += r.inserted;
    // A rejected key fails EVERY query — stop hammering Places and surface the reason (below).
    if (r.apiError) { discoveryError = r.apiError; break; }
  }

  // --- BUILD: up to demoQuota fresh leads → demo + pitch, NO-WEBSITE prospects first --------------
  let built = 0; let queued = 0;
  // Stale-claim sweep: a crash mid-build leaves a lead 'building' forever — older than 2h means
  // that run is dead; return it to the queue (mirrors the batch drain's claim discipline).
  await admin.from('discovered_businesses')
    .update({ status: 'new', updated_at: nowIso })
    .eq('owner_id', order.owner_id).eq('status', 'building')
    .lt('updated_at', new Date(Date.now() - 2 * 3600_000).toISOString());
  const { data: leads } = await admin.from('discovered_businesses')
    .select('id, place_id, company_name, keyword, website, phone, city, state')
    .eq('owner_id', order.owner_id).eq('status', 'new')
    .order('has_website', { ascending: true }).order('created_at', { ascending: true })
    .limit(cfg.demoQuota);
  for (const lead of (leads ?? []) as LeadRow[]) {
    if (Date.now() - startedMs > HUNT_TIME_BUDGET_MS) break;
    // CLAIM FIRST: flip new → building before any expensive work. A crash between the preview
    // insert and the 'built' update used to re-run the whole chain next day — duplicate demo,
    // duplicate pitch email to a real business. No claim → someone else has it → skip silently.
    const { data: claimRows } = await admin.from('discovered_businesses')
      .update({ status: 'building', updated_at: new Date().toISOString() })
      .eq('id', lead.id).eq('status', 'new').select('id');
    if (!claimRows?.length) continue;
    try {
      const outcome = await buildDemoForLead(admin, order, lead, env);
      if (outcome === 'queued') { built++; queued++; }
      else if (outcome === 'built') built++;
      else await admin.from('discovered_businesses').update({ status: 'skipped', updated_at: nowIso }).eq('id', lead.id);
    } catch { /* one lead failing never sinks the day — the stale sweep reclaims it next run */ }
  }

  // A Places API error is the loud, actionable outcome — the operator needs to fix the key, not
  // wonder why the pool stopped growing. It never exhausted the queue (see runDiscoveryQuery), so
  // discovery resumes the moment the key works. The build phase still ran on existing leads.
  if (discoveryError) {
    const built_note = built > 0 ? ` Still built ${built} demo${built === 1 ? '' : 's'} from existing leads.` : '';
    return { discovered, built, queued,
      line: `${order.label}: ⚠️ Google Places rejected the request (${discoveryError.slice(0, 120)}) — check GOOGLE_PLACES_API_KEY in Supabase secrets: billing on, Places API (New) enabled, quota, and key API-restrictions.${built_note} No new businesses found; nothing sent on its own.` };
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
 *  Returns the count inserted AND any Places apiError. On an API error we DO NOT advance exhaustion —
 *  a rejected key is not an empty market, and counting it as a zero-run would (after 2 runs) mark
 *  every query exhausted and permanently kill discovery. On a genuine result (or genuine zero) the
 *  exhaustion counters advance as before. */
// deno-lint-ignore no-explicit-any
async function runDiscoveryQuery(admin: any, ownerId: string, q: QueryRowDB, env: HuntEnv): Promise<{ inserted: number; apiError: string | null }> {
  let inserted = 0;
  let apiError: string | null = null;
  try {
    const { places, apiError: err } = await fetchPlaces(env.placesKey, q.query_text, PLACES_PAGES);
    apiError = err;
    for (const raw of places) {
      const biz = parsePlace(raw, q.keyword);
      if (!biz) continue;
      if (biz.place_id && (biz.rating != null || biz.rating_count != null)) {
        env.runRatings.set(biz.place_id, { rating: biz.rating, count: biz.rating_count });
      }
      if (await insertLead(admin, ownerId, biz, q.id)) inserted++;
    }
  } catch { /* one query failing never sinks the run — still record the attempt below */ }
  if (apiError) {
    // Only stamp last_run_at (so ordering rotates) — never touch the exhaustion counters on an API
    // error. The caller halts discovery and surfaces the reason; the query is retried once fixed.
    await admin.from('discovery_queries').update({ last_run_at: new Date().toISOString() }).eq('id', q.id);
    return { inserted, apiError };
  }
  const upd = exhaustionUpdate(q, inserted);
  await admin.from('discovery_queries').update({
    last_run_at: new Date().toISOString(),
    last_inserted: upd.last_inserted, total_inserted: upd.total_inserted,
    run_count: upd.run_count, consecutive_zero_runs: upd.consecutive_zero_runs, exhausted: upd.exhausted,
  }).eq('id', q.id);
  return { inserted, apiError: null };
}

/** Google Places textSearch, paginated. Returns the businesses AND an apiError when Places rejects the
 *  request (bad key / quota / restriction). Surfacing the error — instead of returning [] as if the
 *  market were empty — is what stops a broken key from silently exhausting the whole discovery queue. */
async function fetchPlaces(apiKey: string, textQuery: string, pages: number): Promise<{ places: PlaceRaw[]; apiError: string | null }> {
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
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160);
      return { places: all, apiError: `${res.status}${snippet ? ` ${snippet}` : ''}` };
    }
    const json = (await res.json()) as { places?: PlaceRaw[]; nextPageToken?: string };
    if (json.places?.length) all.push(...json.places);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
    await new Promise((r) => setTimeout(r, 2000));  // Places needs a short delay before a pageToken is valid
  }
  return { places: all, apiError: null };
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
async function buildDemoForLead(admin: any, order: OrderRow, lead: LeadRow, env: HuntEnv, autoSend = false):
  Promise<'queued' | 'built' | 'skipped'> {
  const location = [lead.city, lead.state].filter(Boolean).join(', ') || null;
  let images: string[] = [];
  let email: string | null = null;
  let page: { title: string | null; description: string | null } = { title: null, description: null };
  let finalUrl = lead.website ?? '';
  // Default (no site, or an unreachable one): an honest "no website" audit — no invented score.
  let audit = auditSite({ url: finalUrl, reachable: false }, env.nowYear);
  // Kept for automation detection below — the pitch upsell is grounded ONLY in what was observed.
  let pageChecks: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean } = {};
  let pageText = '';
  let pageTech: Record<string, unknown> | null = null;

  if (lead.website) {
    const text = await scrapePage(lead.website, 'text', env);
    if (text && !text.error && text.checks) {   // reachable HTML — read their real site
      const checks = text.checks as { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
      pageChecks = checks;
      pageText = (text.text as string) ?? '';
      pageTech = (text.tech as Record<string, unknown> | undefined) ?? null;
      finalUrl = (typeof text.url === 'string' && text.url) || lead.website;
      page = { title: (text.title as string) ?? null, description: (text.description as string) ?? null };
      audit = auditSite({
        url: finalUrl, reachable: true, title: page.title, description: page.description,
        text: (text.text as string) ?? '', hasViewport: !!checks.viewport, hasForm: !!checks.form, emailFound: !!checks.email,
      }, env.nowYear);
    }
    // Photos + email do NOT depend on the text PARSE succeeding — a WAF quirk or an odd homepage
    // shouldn't cost us their real gallery or their published address. Attempt both whenever a site
    // exists; each is independent and fail-soft (empty on any failure), and the images mode follows
    // the gallery/portfolio crawl, so we get their work photos even when the homepage is thin.
    const imgResp = await scrapePage(lead.website, 'images', env);
    images = Array.isArray(imgResp?.images)
      ? (imgResp!.images as { url?: string }[]).map((i) => i.url).filter((u): u is string => !!u).slice(0, 12)
      : [];
    const contactResp = await scrapePage(lead.website, 'contact', env);
    email = Array.isArray(contactResp?.emails) ? ((contactResp!.emails as string[])[0] ?? null) : null;
  }

  const raw = buildHuntProfileRaw({
    url: finalUrl, niche: lead.keyword, fallbackName: lead.company_name,
    page, images, email, audit, location, phone: lead.phone,
    rating: lead.place_id ? env.runRatings.get(lead.place_id) ?? null : null,
    // The facts their page literally states (named services, "since 1987", areas served) ride into
    // the profile, so the rebuild carries THEIR specifics instead of a generic trade placeholder.
    facts: extractSiteFacts(pageText, env.nowYear),
  });
  const { profile } = parseBusinessProfile(raw);
  if (!profile) return 'skipped';

  // Save the profile, then build the demo through the intelligence chain below.
  const { data: profileRow, error: pErr } = await admin.from('business_profiles').insert({
    user_id: order.owner_id, business_name: profile.business_name, industry: profile.industry,
    website_score: profile.current_website_score ?? null, profile,
  }).select('id').single();
  if (pErr || !profileRow) return 'skipped';

  // GROUND THE REDESIGN — capture the prospect's CURRENT site ONCE, up front. Those bytes do double
  // duty: they're handed to the bespoke designer (vision) so it designs a clearly-better replacement
  // of THEIR actual page instead of a generic one, AND they become the "before" in the email
  // before/after (reused, not re-captured). Only for a reachable real site; no key/unreachable → null
  // and the build proceeds exactly as before. Fail-soft; a screenshot never blocks a demo.
  const currentShot = (audit.reachable && /^https?:\/\//.test(finalUrl))
    ? await captureShot(finalUrl)
    : null;

  // THE INTELLIGENCE CHAIN, server-side — the same strategist → art-director → owner-critique →
  // refine pass the manual preview engine runs (src/lib/preview/engine.ts), so a hunted prospect
  // gets the crafted, strategy-driven site. Every stage fails soft: the deterministic recipe spec
  // is the floor, and a chain failure never loses the demo. Real cost is metered per owner.
  let spec: SiteSpec = assembleFallbackSpec(profile);
  let specSource: 'ai' | 'fallback' = 'fallback';
  let strategy: Record<string, unknown> | null = null;
  let critique: Record<string, unknown> | null = null;
  // Build log — the answer to "why is this demo a template?" without usage-event archaeology.
  const buildLog: Record<string, unknown> = { stage: 'start', imagery: 0 };
  {
    let aiCost = 0, aiIn = 0, aiOut = 0;
    // Standard plan model for everyone; the premium model for EVERY demo on a paying plan when the
    // operator opts in via AI_PREMIUM_MODEL. The demo is the sales asset — worth the best brain on
    // every lead, not just high-LTV verticals. A model id that can't run on the configured provider
    // is ignored (one bad env var must not silently template every lead), and free-plan cost
    // discipline stays the default.
    const plan = await getUserPlan(admin, order.owner_id);
    const mPlan = modelForPlan(plan);
    const premiumRaw = Deno.env.get('AI_PREMIUM_MODEL');
    const premiumCompatible = !!premiumRaw &&
      (mPlan.provider === 'anthropic' ? /^claude/i.test(premiumRaw) : !/^claude/i.test(premiumRaw));
    if (premiumRaw && !premiumCompatible) console.warn(`AI_PREMIUM_MODEL ${premiumRaw} incompatible with provider ${mPlan.provider} — ignored`);
    const m = premiumRaw && premiumCompatible && plan !== 'free'
      ? { provider: mPlan.provider, model: premiumRaw }
      : mPlan;
    buildLog.model = m.model;
    const track = (r: { costUsd: number; inputTokens: number; outputTokens: number }) => {
      aiCost += r.costUsd; aiIn += r.inputTokens; aiOut += r.outputTokens;
    };
    // One JSON re-ask on a prose reply — the most common chain degradation, now a retry
    // instead of a straight fall to the template floor.
    const completeJson = async (msgs: Parameters<typeof complete>[0], maxTokens: number): Promise<unknown> => {
      const r1 = await complete(msgs, { provider: m.provider, model: m.model, maxTokens });
      track(r1);
      try { return extractJson(r1.text); } catch {
        const r2 = await complete([...msgs,
          { role: 'assistant', content: r1.text.slice(0, 4000) },
          { role: 'user', content: 'Return ONLY the JSON object — no prose, no code fences, nothing else.' },
        ], { provider: m.provider, model: m.model, maxTokens });
        track(r2);
        return extractJson(r2.text);
      }
    };
    try {
      await checkCredits(admin, order.owner_id, 'board_copy');   // out of credits → template floor
      // STRATEGY — its own failure domain: a prose-only strategist must not cost the lead the
      // spec AND the imagery (the browser path has always degraded per-stage; now the worker does).
      let strat = normalizeStrategy({}, profile);
      try {
        strat = normalizeStrategy(await completeJson([
          { role: 'system', content: STRATEGY_SYSTEM },
          { role: 'user', content: JSON.stringify(profile, null, 1) },
        ], 1800), profile);
        buildLog.stage = 'strategy';
      } catch (e) { buildLog.strategy_error = String((e as Error)?.message ?? e).slice(0, 200); }
      strategy = strat as unknown as Record<string, unknown>;
      // CONCEPT IMAGERY — a prospect with NO usable photos gets honest concept art (gpt-image-1)
      // so the site opens on full-bleed art instead of a flat color field. Their own photos
      // always win; generation is object photography only, labeled ai_generated +
      // can_publish:false, and fails soft (no key / refusal / no credits → the aurora hero).
      if (!profile.photos.length && Deno.env.get('OPENAI_API_KEY') && !restraintFor(profile.industry)) {
        try {
          await checkCredits(admin, order.owner_id, 'image');
          const made: typeof profile.photos = [];
          const aiPhoto = (url: string, alt: string) => ({
            url, alt, source_type: 'ai_generated', can_use_in_preview: true, can_publish: false,
            notes: 'AI-generated concept imagery — not photos of this business',
          });
          // The image prompts carry the recipe's primary hue so hero art and theme read as one
          // designed brand. Backdrop FIRST — a lone transparent object is unusable (the layers
          // hero needs both), so the object is only ever generated after a successful backdrop.
          const paletteHint = pickRecipe(profile).theme.primary;
          const art = huntArtPrompts(profile.industry, strat.tone, paletteHint);
          if (art) {
            const bg = await genHuntImage(admin, order.owner_id, art.backdrop, '1536x1024');
            if (bg) made.push(aiPhoto(bg, 'ai-backdrop'));
            const obj = bg ? await genHuntImage(admin, order.owner_id, art.object, '1024x1024', true) : null;
            if (obj) made.push(aiPhoto(obj, 'ai-object'));
          }
          if (!made.length) {
            const still = huntImagePrompts(profile.industry, strat.tone, paletteHint);
            if (still) {
              for (const [prompt, size] of [[still[0], '1536x1024'], [still[1], '1024x1024']] as const) {
                const url = await genHuntImage(admin, order.owner_id, prompt, size);
                if (url) made.push(aiPhoto(url, ''));
              }
            }
          }
          if (made.length) {
            profile.photos = made;
            buildLog.imagery = made.length;
            // Re-floor with the imagery in place: a spec-call failure below must still ship the
            // paid art instead of orphaning it (the old fallback predated the photos mutation).
            spec = assembleFallbackSpec(profile);
          }
        } catch (e) { buildLog.imagery_error = String((e as Error)?.message ?? e).slice(0, 200); }
      }
      const aiSpec = normalizeSpec(await completeJson([
        { role: 'system', content: SPEC_SYSTEM },
        { role: 'user', content: specPrompt(profile) + strategyBlock(strat) },
      ], 8000), profile);
      spec = aiSpec; specSource = 'ai';
      buildLog.stage = 'spec';
      // Owner-simulation critique + ONE refine — fails soft to the draft it was critiquing.
      try {
        const crit = normalizeCritique(await completeJson([
          { role: 'system', content: CRITIQUE_SYSTEM },
          { role: 'user', content: critiqueUserPrompt(profile, spec) },
        ], 1500));
        critique = crit as unknown as Record<string, unknown>;
        buildLog.stage = 'critique';
        if (critiqueWarrantsRefine(crit)) {
          const refined = normalizeSpec(await completeJson([
            { role: 'system', content: SPEC_SYSTEM },
            { role: 'user', content: specPrompt(profile) + strategyBlock(strat) + critiqueBlock(crit) },
          ], 8000), profile);
          spec = refined;
          buildLog.stage = 'refined';
        }
      } catch { /* keep the un-refined AI draft */ }
      // BESPOKE — the DEFAULT when the AI spec succeeded (opt OUT with BESPOKE_DEMOS=0). On top of the
      // honest spec — which stays as the fallback — the active model custom-DESIGNS a full HTML page:
      // the uncapped ceiling, a bespoke agency-quality layout instead of the section renderer's (very
      // good) template. The demo is the sales asset, so this is worth one extra model call per lead
      // (metered through the same aiCost accounting); set AI_PREMIUM_MODEL for the best design.
      // Honesty is a GATE, not a hope — HTML asserting any claim not grounded in the profile
      // (licensed/insured/ratings/tenure/warranties) is DISCARDED and the honest spec stands. A
      // truncated/non-doc reply is discarded too. A bad reply never blocks; set BESPOKE_DEMOS=0 to
      // fall back to the pure template path (cheaper, one fewer model call).
      if (Deno.env.get('BESPOKE_DEMOS') !== '0' && specSource === 'ai') {
        try {
          // VISION-GROUNDED when we captured their current site: the designer SEES the page it's
          // replacing (their real photos, brand, and every flaw) and beats it — a redesign OF this
          // business, not a generic one. No shot (no-website lead / no key) → text-only bespoke.
          // Vision failing (oversized image, non-vision model) falls through to text-only, so a
          // bespoke page still ships; only both failing drops to the honest template floor.
          let rbText: string | null = null;
          if (currentShot) {
            try {
              const rv = await completeVision(BESPOKE_SYSTEM, buildBespokePrompt(profile),
                [{ mediaType: 'image/png', base64: bytesToBase64(currentShot) }],
                { provider: m.provider, model: m.model, maxTokens: 16000 });
              track(rv); rbText = rv.text; buildLog.bespoke_grounded = true;
            } catch (e) { buildLog.bespoke_vision_error = String((e as Error)?.message ?? e).slice(0, 160); }
          }
          if (rbText == null) {
            const rb = await complete([
              { role: 'system', content: BESPOKE_SYSTEM },
              { role: 'user', content: buildBespokePrompt(profile) },
            ], { provider: m.provider, model: m.model, maxTokens: 16000 });
            track(rb); rbText = rb.text;
          }
          const html = rbText.trim();
          if (!looksLikeHtmlDoc(html)) {
            buildLog.bespoke = 'discarded: not a complete HTML document';
          } else {
            const gate = bespokeHonest(html, profile);
            if (gate.ok) { spec = { ...spec, html }; buildLog.stage = 'bespoke'; buildLog.bespoke = 'ok'; }
            else { buildLog.bespoke = `discarded: ${gate.violations.slice(0, 3).join('; ')}`; }
          }
        } catch (e) { buildLog.bespoke_error = String((e as Error)?.message ?? e).slice(0, 200); }
      }
    } catch (e) {
      // The deterministic recipe spec stands — and the log says WHY it's a template.
      buildLog.chain_error = String((e as Error)?.message ?? e).slice(0, 200);
    }
    buildLog.cost_usd = Math.round(aiCost * 10000) / 10000;
    if (aiCost > 0) {
      await spendCredits(admin, order.owner_id, {
        costUsd: aiCost, kind: 'preview_build', provider: m.provider, model: m.model,
        inputTokens: aiIn, outputTokens: aiOut,
      });
    }
  }
  const nonce = Math.random().toString(36).slice(2, 8);   // slug isn't enumerable by guessing names
  const slug = `${previewSlug(profile.business_name)}-${nonce}`;
  const previewUrl = env.appOrigin ? `${env.appOrigin}/preview-site/${slug}` : `/preview-site/${slug}`;

  // AUTOMATION SEARCH → PITCH: run the grounded detector on what we actually observed and put the
  // "website + automation $/mo" offer in the email. Zero observed signals → zero upsell lines.
  const view = {
    vertical: detectVertical([lead.keyword, page.title ?? '', pageText].filter(Boolean).join(' ')),
    checks: pageChecks,
    siteSignalIds: audit.signals.map((s) => s.id),
    text: pageText || null,
    tech: pageTech,
  };
  const sigs = deriveSignals(view);
  const { proposals } = proposeFromSignals(sigs, view.vertical);
  const upsells = proposals.map((p) => ({
    title: p.title, pitch: p.pitch, monthlyPrice: p.monthlyPrice,
    evidence: sigs.find((s) => s.id === p.matchedSignal)?.evidence ?? '',
  }));
  const pitch = buildHuntPitch(profile, previewUrl, upsells);

  const { data: site, error: sErr } = await admin.from('preview_sites').insert({
    user_id: order.owner_id, profile_id: profileRow.id, slug,
    business_name: profile.business_name, industry: profile.industry,
    spec, pitch, spec_source: specSource, status: 'preview',
    strategy, critique, build_log: buildLog,
    // Deterministic owner-language report grounded in the OBSERVED audit signals (profile.issues) —
    // the public /report page shows real problems instead of synthesizing a generic shell.
    audit: fallbackAudit(profile),
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

  // SHOW them the site: screenshot the generated preview (its animation-free email-shot render) so
  // the pitch lands the new site AS AN IMAGE in the inbox, not a bare link they must trust. When the
  // prospect's current site is reachable, add the honest before/after. A captured shot becomes the
  // hero of an HTML email; a failed/unconfigured shot (genPreviewShot → null) falls back to the
  // text+link pitch — never a broken or invented image. The new-site shot is persisted so the
  // operator UI and any re-send can reuse it. previewUrl is absolute here, so env.appOrigin is set.
  const siteId = (site as { id: string }).id;
  let bodyHtml: string | undefined;
  const shotUrl = await genPreviewShot(admin, order.owner_id,
    `${env.appOrigin}/preview-site/${encodeURIComponent(slug)}/email-shot`, slug);
  if (shotUrl) {
    await admin.from('preview_sites').update({ screenshot_url: shotUrl }).eq('id', siteId);
    // Reuse the current-site shot we already captured to ground the redesign — the email "before"
    // costs no second screenshot. (Fall back to a fresh capture only in the rare case it's missing.)
    const beforeUrl = currentShot
      ? await storeShot(admin, order.owner_id, currentShot, `before-${slug}`)
      : ((audit.reachable && /^https?:\/\//.test(finalUrl))
        ? await genPreviewShot(admin, order.owner_id, finalUrl, `before-${slug}`)
        : null);
    bodyHtml = buildHuntPitchEmailHtml(profile, previewUrl, shotUrl, upsells, beforeUrl);
  }

  const ok = await queueHuntPitch(admin, order.owner_id, {
    previewSiteId: siteId, businessProfileId: (profileRow as { id: string }).id,
    businessName: profile.business_name, pitch, previewUrl, toEmail: email, bodyHtml,
  });
  // ONE-CLICK SEND — the operator pressed "Build & send", so we approve the just-queued pitch and
  // fire it through send-email now (the same approval-gated path the operator would click through).
  // send-email still enforces every safety gate (kill switch, suppression/unsubscribe, CAN-SPAM
  // footer, daily cap), so "sends now" never means "sends unconditionally". A send failure THROWS so
  // the caller reports it honestly instead of claiming a pitch went out that didn't.
  if (ok && autoSend) {
    await admin.from('approvals')
      .update({ status: 'approved', decided_at: new Date().toISOString(), decided_via: 'ui' })
      .eq('id', ok).eq('status', 'pending');
    const sres = await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-worker-secret': env.workerSecret,
        authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey,
      },
      body: JSON.stringify({ approval_id: ok }),
    });
    const sjson = await sres.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!sres.ok || !sjson.ok) throw new Error(sjson.error ?? `send failed (${sres.status})`);
  }
  return ok ? 'queued' : 'built';
}

/** gpt-image-1 → project-assets bucket → public URL, metered per owner (kind 'image', same real
 *  ballpark the generate-image fn charges). Returns null on any failure — imagery never blocks. */
// deno-lint-ignore no-explicit-any
async function genHuntImage(admin: any, ownerId: string, prompt: string, size: '1536x1024' | '1024x1024', transparent = false): Promise<string | null> {
  try {
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return null;
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size, quality: 'medium', ...(transparent ? { background: 'transparent' } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    const b64 = data?.data?.[0]?.b64_json as string | undefined;
    if (!res.ok || !b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `${ownerId}/hunt/ai-${crypto.randomUUID()}.png`;
    const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (up.error) return null;
    await spendCredits(admin, ownerId, { costUsd: size === '1024x1024' ? 0.04 : 0.07, kind: 'image', provider: 'openai', model: 'gpt-image-1' });
    return admin.storage.from('project-assets').getPublicUrl(path).data.publicUrl as string;
  } catch {
    return null;
  }
}

/** BOOKING REMINDERS — text/email each confirmed appointment ~a day out, exactly once. Window is
 *  (now+3h, now+24h] so same-hour bookings aren't double-messaged (the confirmation covered those) and
 *  everything else gets one nudge the day before. reminder_sent is set even if the send fails, so a
 *  dead number can't spam. Transactional → bookingNotify sends direct (no marketing gates). */
// deno-lint-ignore no-explicit-any
async function drainBookingReminders(admin: any): Promise<void> {
  const now = Date.now();
  const loIso = new Date(now + 3 * 3_600_000).toISOString();
  const hiIso = new Date(now + 24 * 3_600_000).toISOString();
  const { data } = await admin.from('appointments')
    .select('id, owner_id, service_name, starts_at, created_at, customer_email, customer_phone, page:booking_pages(business_name, utc_offset_min, confirm_channel)')
    .eq('status', 'confirmed').eq('reminder_sent', false)
    .gt('starts_at', loIso).lte('starts_at', hiIso).limit(50);
  for (const a of (data ?? []) as Record<string, unknown>[]) {
    const rawPage = a.page as unknown;
    const pg = (Array.isArray(rawPage) ? rawPage[0] : rawPage) as
      { business_name: string; utc_offset_min: number; confirm_channel: 'email' | 'sms' | 'both' } | null;
    // Skip the reminder for a booking made LESS than 24h before its start — the confirmation it just
    // got IS the reminder, so a second message minutes later is noise. Still retire it (reminder_sent).
    const nearTerm = !!a.created_at && Date.parse(a.created_at as string) > Date.parse(a.starts_at as string) - 24 * 3_600_000;
    if (pg && !nearTerm) {
      await sendBookingNotice(admin, a.owner_id as string, null, {
        businessName: pg.business_name, serviceName: (a.service_name as string) ?? 'your appointment',
        startsAt: a.starts_at as string, utcOffsetMin: pg.utc_offset_min,
        toEmail: (a.customer_email as string) ?? null, toPhone: (a.customer_phone as string) ?? null,
        channel: pg.confirm_channel, kind: 'reminder',
      }).catch(() => ({ email: false, sms: false }));
    }
    await admin.from('appointments').update({ reminder_sent: true, updated_at: new Date().toISOString() }).eq('id', a.id as string);
  }
}

/** Base64-encode bytes for a vision API payload. Chunked so a large screenshot never overflows the
 *  call stack (String.fromCharCode(...bigArray) does). Deterministic; Deno's btoa handles the rest. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** CAPTURE ONLY — ScreenshotOne → raw PNG bytes, no upload, no metering. The seam that lets ONE
 *  screenshot of the prospect's current site serve two masters: grounding the bespoke redesign
 *  (vision) AND the email before/after. Returns null on ANY failure (missing key, API error,
 *  empty/oversized) so a screenshot never blocks the pitch. */
async function captureShot(target: string, mobile = false): Promise<Uint8Array | null> {
  try {
    const apiKey = Deno.env.get('SCREENSHOT_API_KEY');
    if (!apiKey) return null;
    const apiUrl = Deno.env.get('SCREENSHOT_API_URL') ?? 'https://api.screenshotone.com/take';
    const params = new URLSearchParams({
      access_key: apiKey, url: target, format: 'png',
      viewport_width: mobile ? '390' : '1280', viewport_height: mobile ? '844' : '800',
      device_scale_factor: '2', block_cookie_banners: 'true', delay: '3', // let fonts/reveals settle
    });
    const res = await fetch(`${apiUrl}?${params}`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) return null;
    return bytes;
  } catch {
    return null;
  }
}

/** STORE — upload already-captured shot bytes to project-assets, metered per owner (kind 'screenshot',
 *  the same $0.03 the shot-worker charges) → public URL. Split from captureShot so a shot captured once
 *  (to ground the redesign) can be reused as the email "before" without paying for a second capture. */
// deno-lint-ignore no-explicit-any
async function storeShot(admin: any, ownerId: string, bytes: Uint8Array, label: string, mobile = false): Promise<string | null> {
  try {
    const name = `${Date.now()}-${label.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 60)}${mobile ? '-mobile' : ''}.png`;
    const path = `${ownerId}/shots/${name}`;
    const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (up.error) return null;
    await spendCredits(admin, ownerId, { costUsd: 0.03, kind: 'screenshot', provider: 'screenshotone' });
    return admin.storage.from('project-assets').getPublicUrl(path).data.publicUrl as string;
  } catch {
    return null;
  }
}

/** Capture + store in one step (the original genPreviewShot contract) — used for the NEW-site email
 *  shot, where there's nothing to reuse. `target` is a fully-formed URL. Null on any failure. */
// deno-lint-ignore no-explicit-any
async function genPreviewShot(admin: any, ownerId: string, target: string, label: string, mobile = false): Promise<string | null> {
  const bytes = await captureShot(target, mobile);
  return bytes ? storeShot(admin, ownerId, bytes, label, mobile) : null;
}

/** Server-side twin of queuePitch: contact → campaign → message(draft) → PENDING approval. Nothing
 *  sends — the approval lands in the owner's queue. Suppression is sacred: a known unsubscribed/
 *  bounced/complained contact is never re-queued, and an existing contact's status is never reset.
 *  `bodyHtml` (present only when a real screenshot was captured) rides onto the message as the HTML
 *  body the send path prefers; without it the message is text-only exactly as before. */
// deno-lint-ignore no-explicit-any
async function queueHuntPitch(admin: any, uid: string, input: {
  previewSiteId: string; businessProfileId: string; businessName: string; pitch: string; previewUrl: string; toEmail: string; bodyHtml?: string;
}): Promise<string | null> {   // returns the pending approval's id (for one-click auto-send), or null
  const to = input.toEmail.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return null;

  let contactId: string;
  const { data: existing } = await admin.from('contacts')
    .select('id, email_status').eq('owner_id', uid).eq('email', to).maybeSingle();
  if (existing) {
    const st = (existing as { email_status?: string }).email_status;
    if (st === 'unsubscribed' || st === 'bounced' || st === 'complained') return null;  // never re-contact
    contactId = (existing as { id: string }).id;
  } else {
    const { data: c } = await admin.from('contacts').insert({
      owner_id: uid, business_profile_id: input.businessProfileId, email: to, email_status: 'unknown', is_primary: true,
    }).select('id').maybeSingle();
    if (c) contactId = (c as { id: string }).id;
    else {
      const { data: again } = await admin.from('contacts').select('id').eq('owner_id', uid).eq('email', to).maybeSingle();
      if (!again) return null;
      contactId = (again as { id: string }).id;
    }
  }

  const { data: camp } = await admin.from('outreach_campaigns').insert({
    owner_id: uid, business_profile_id: input.businessProfileId, contact_id: contactId,
    preview_site_id: input.previewSiteId, kind: 'cold_site_pitch', state: 'pending_approval',
  }).select('id').single();
  if (!camp) return null;

  const subject = `A new website for ${input.businessName}`;
  const body = `${input.pitch.trim()}\n\nTake a look: ${input.previewUrl}`;
  const { data: msg } = await admin.from('outreach_messages').insert({
    owner_id: uid, campaign_id: (camp as { id: string }).id, contact_id: contactId, preview_site_id: input.previewSiteId,
    sequence_step: 0, subject, body_text: body, body_html: input.bodyHtml ?? null, to_address: to, status: 'draft',
  }).select('id').single();
  if (!msg) return null;

  // The approval is payload-hash bound exactly like enqueueApproval — the send executor refuses if
  // the payload changes after this decision. requested_by 'garvis-auto' marks a machine-queued
  // request; status defaults to 'pending', so the OWNER still approves each send (unless the
  // Prospects screen's one-click path approves + sends it immediately — see buildDemoForLead autoSend).
  const payload = { message_id: (msg as { id: string }).id, campaign_id: (camp as { id: string }).id };
  const payload_hash = await hashPayload(payload);
  // When an HTML screenshot pitch rides along, tell the operator so the plain-text preview isn't
  // mistaken for the whole email — the recipient sees the site rendered as the hero image.
  const shotNote = input.bodyHtml ? '\n\n[Sends as an HTML email showing a screenshot of the new site as the hero image.]' : '';
  const { data: ap, error: apErr } = await admin.from('approvals').insert({
    owner_id: uid, kind: 'send_email',
    title: `Pitch "${input.businessName}" → ${to}`,
    preview: `${subject}\n\n${body}${shotNote}`,
    payload, payload_hash, requested_by: 'garvis-auto',
  }).select('id').single();
  return apErr || !ap ? null : (ap as { id: string }).id;
}

// ============================================================================
// ARC ADVANCE (app_0095, second half): server-side execution of MECHANICAL arc
// steps. The client's actionRegistry stays the authority for creative actions
// (models, browser rails); this list is strictly the subset that is pure DB
// work — the two implementations must agree on outcomes, and the coverage
// suite pins the catalog they both serve.
// ============================================================================

const SERVER_ACTIONS = new Set([
  'hunt_opportunities', 'watch_page', 'cadence_digest', 'record_thesis', 'check_master_switch',
  'add_reminder', 'add_contact', 'create_invoice', 'start_idea_stream', 'start_client_hunt',
  'start_content_week', 'mount_room',
]);

// deno-lint-ignore no-explicit-any
async function resolveWorldSrv(admin: any, ownerId: string, title: string): Promise<{ id: string; title: string } | null> {
  const { data } = await admin.from('knowledge_worlds')
    .select('id, title').eq('owner_id', ownerId).ilike('title', `%${title}%`).limit(2);
  const rows = (data ?? []) as { id: string; title: string }[];
  if (rows.length === 1) return rows[0];
  const exact = rows.filter((r) => r.title.toLowerCase() === title.toLowerCase());
  return exact.length === 1 ? exact[0] : null;
}

/** One mechanical step, server-side. Mirrors the client executors' outcomes; a missing world
 *  parks the step waiting (same seam), and anything unexpected fails the step honestly. */
// deno-lint-ignore no-explicit-any
async function execServerAction(admin: any, ownerId: string, action: string, p: Record<string, string>, nowIso: string): Promise<StepStatus> {
  const needWorld = async (title: string) => {
    const w = await resolveWorldSrv(admin, ownerId, title);
    if (!w) throw { waiting: `No business named "${title}" yet — approve its draft, then this continues on its own.` };
    return w;
  };
  const order = async (row: Record<string, unknown>, note: string): Promise<StepStatus> => {
    const { error } = await admin.from('standing_orders').insert({
      owner_id: ownerId, status: 'active', anchor_at: nowIso, next_run_at: nowIso, ...row,
    });
    if (error) throw new Error(error.message);
    return { kind: 'done', note, link: '/garvis/automations' };
  };

  switch (action) {
    case 'hunt_opportunities': {
      const worldId = p.world ? (await needWorld(p.world)).id : null;
      const cadence = p.cadence === 'weekly' ? 'weekly' : 'daily';
      return order({
        world_id: worldId, kind: 'opportunity_hunt', label: `Hunt: ${p.focus.slice(0, 60)}`, cadence,
        config: { focus: p.focus, region: p.region ?? null, queries: buildQueries(p.focus, p.region ?? null) },
      }, `Hunt "${p.focus.slice(0, 60)}" armed (${cadence}) unattended — new opportunities land in the feed.`);
    }
    case 'watch_page': {
      if (!/^https?:\/\/.+\..+/.test(p.url ?? '')) throw new Error('A watch needs a full URL.');
      const cadence = ['hourly', 'daily', 'weekly'].includes(p.cadence ?? '') ? p.cadence : 'daily';
      return order({ world_id: null, kind: 'watch_url', label: p.label, cadence, config: { url: p.url } },
        `Watch "${p.label}" armed (${cadence}) unattended.`);
    }
    case 'cadence_digest': {
      const w = await needWorld(p.world);
      const cadence = p.cadence === 'daily' ? 'daily' : 'weekly';
      return order({ world_id: w.id, kind: 'cadence_digest', label: `${w.title} digest`, cadence, config: {} },
        `Digest for ${w.title} armed (${cadence}) unattended.`);
    }
    case 'start_idea_stream': {
      const w = await needWorld(p.world);
      const cadence = p.cadence === 'daily' ? 'daily' : 'weekly';
      return order({ world_id: w.id, kind: 'idea_stream', label: `${w.title} idea stream`, cadence, config: {} },
        `Idea stream for ${w.title} armed (${cadence}) unattended.`);
    }
    case 'start_client_hunt': {
      const searches = Math.min(20, Math.max(1, Number(p.searches_per_day) || 6));
      const label = p.niche ? `Daily hunt: ${p.niche.trim()}` : 'Daily hunt: all local businesses';
      return order({
        world_id: null, kind: 'client_hunt', label, cadence: 'daily',
        config: { niches: p.niche ? [p.niche.trim()] : [], scope: { mode: 'topN', n: 50 }, searchesPerDay: searches, demoQuota: 2, cursor: 0 },
      }, `"${label}" armed unattended — pitches wait in the Queue.`);
    }
    case 'start_content_week': {
      const w = await needWorld(p.world);
      const posts = Math.min(7, Math.max(1, Number(p.posts_per_week) || 3));
      const seg = ['all', 'new', 'contacted', 'qualified', 'customer'].includes(p.email_segment ?? '') ? p.email_segment : null;
      return order({
        world_id: w.id, kind: 'content_week', label: `Content week: ${posts} post${posts === 1 ? '' : 's'}${seg ? ' + email' : ''}`,
        cadence: 'weekly', config: { platforms: ['twitter', 'linkedin'], postsPerWeek: posts, emailSegment: seg, sendHourUtc: 16, minScore: 6 },
      }, `Weekly content for ${w.title} armed unattended — each week stages as ONE approval.`);
    }
    case 'record_thesis': {
      const { error } = await admin.from('garvis_knowledge').insert({
        owner_id: ownerId, kind: 'decision', title: (p.title ?? '').slice(0, 80), body: p.body,
        source: 'orchestrator', status: 'proposed',
      });
      if (error) throw new Error(error.message);
      return { kind: 'needs_review', note: `Thesis "${(p.title ?? '').slice(0, 60)}" filed as proposed knowledge — approve it on Memory.`, link: '/garvis/memory' };
    }
    case 'add_reminder': {
      const due = p.due_at && !Number.isNaN(Date.parse(p.due_at)) ? new Date(p.due_at).toISOString() : null;
      const { error } = await admin.from('reminders').insert({ owner_id: ownerId, title: p.title, due_at: due });
      if (error) throw new Error(error.message);
      return { kind: 'done', note: `Reminder set unattended: "${p.title.slice(0, 80)}".`, link: '/garvis/home' };
    }
    case 'add_contact': {
      const email = (p.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error(`"${p.email}" is not a valid email.`);
      const worldId = p.world ? (await needWorld(p.world)).id : null;
      const { data: existing } = await admin.from('contacts').select('id').eq('owner_id', ownerId).eq('email', email).maybeSingle();
      if (existing) return { kind: 'done', note: `${email} is already in the CRM — nothing duplicated.`, link: '/garvis/contacts' };
      const { error } = await admin.from('contacts').insert({
        owner_id: ownerId, world_id: worldId, full_name: (p.name ?? '').trim(), email, email_status: 'unknown', is_primary: false,
      });
      if (error) throw new Error(error.message);
      return { kind: 'done', note: `${(p.name ?? '').trim()} (${email}) added to the CRM unattended.`, link: '/garvis/contacts' };
    }
    case 'create_invoice': {
      const amount = Number(p.amount_usd);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(`"${p.amount_usd}" is not a billable amount.`);
      const to = (p.to_email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error(`"${p.to_email}" is not a valid billing email.`);
      const worldId = p.world ? (await needWorld(p.world)).id : null;
      const year = new Date().getFullYear();
      const { count } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId);
      let lastErr = 'Could not create the invoice.';
      for (let attempt = 0; attempt < 3; attempt++) {
        const number = `INV-${year}-${String((count ?? 0) + 1 + attempt).padStart(3, '0')}`;
        const { error } = await admin.from('invoices').insert({
          owner_id: ownerId, world_id: worldId, number, title: p.title, to_email: to,
          line_items: [{ description: p.title, qty: 1, unit_usd: amount }], amount_usd: amount,
          due_date: p.due_date || null, source: 'garvis_tool',
        });
        if (!error) return { kind: 'done', note: `Invoice ${number} drafted unattended for $${amount.toFixed(2)} → ${to}. Queue its send from Money (approval-gated).`, link: '/garvis/money' };
        lastErr = error.message;
        if (error.code !== '23505') break;
      }
      throw new Error(lastErr);
    }
    case 'mount_room': {
      if (!/^https:\/\/.+\..+/.test(p.url ?? '')) throw new Error('A room needs a full https:// URL.');
      const w = await needWorld(p.world);
      const { error } = await admin.from('world_rooms').insert({
        owner_id: ownerId, world_id: w.id, title: (p.title ?? '').trim() || 'Room', url: p.url.trim(), kind: 'deployed',
      });
      if (error) throw new Error(error.message);
      return { kind: 'done', note: `Room "${(p.title ?? '').trim()}" mounted in ${w.title} unattended.`, link: '/garvis/webs' };
    }
    case 'check_master_switch': {
      const { data } = await admin.from('system_heartbeat').select('last_tick_at').order('last_tick_at', { ascending: false }).limit(1);
      const last = (data?.[0] as { last_tick_at?: string } | undefined)?.last_tick_at;
      const age = last ? Math.round((Date.now() - Date.parse(last)) / 60000) : null;
      return age !== null && age <= 120
        ? { kind: 'done', note: `The clock is alive — last tick ${age} min ago.`, link: '/garvis/health' }
        : { kind: 'needs_review', note: 'The heartbeat looks stale from here — check the Health page.', link: '/garvis/health' };
    }
    default:
      throw new Error(`"${action}" is not a server-executable action.`);
  }
}

/** Advance one 'ready' arc as far as its mechanical steps allow. Claims the arc (same CAS the
 *  client uses), executes SERVER_ACTIONS in topological order, stops at the first creative step
 *  (arc stays 'ready' for the client visit), and releases the claim with an honest status. */
// deno-lint-ignore no-explicit-any
async function advanceArcServerSide(admin: any, arc: { id: string; owner_id: string; title: string; steps: PlanStep[]; statuses: StepStatus[] }, nowIso: string): Promise<void> {
  const { data: claimed } = await admin.from('orchestrator_plans')
    .update({ claimed_until: new Date(Date.now() + 5 * 60_000).toISOString() })
    .eq('id', arc.id)
    .or(`claimed_until.is.null,claimed_until.lt.${new Date().toISOString()}`)
    .select('id').maybeSingle();
  if (!claimed) return; // a client run owns it — never fight

  const steps = arc.steps;
  const statuses: StepStatus[] = steps.map((_, i) => arc.statuses?.[i] ?? { kind: 'pending', note: '' });
  let advanced = 0;
  let blockedOnCreative = false;
  const { order: topo } = orderSteps(steps);
  for (const i of topo) {
    if (stepSucceeded(statuses[i].kind)) continue;
    const deps = steps[i].after;
    if (deps.some((a) => statuses[a].kind === 'failed' || statuses[a].kind === 'skipped')) {
      statuses[i] = { kind: 'skipped', note: 'Skipped — a prerequisite did not complete.' };
      continue;
    }
    if (deps.some((a) => !stepSucceeded(statuses[a].kind))) { continue; }
    if (!SERVER_ACTIONS.has(steps[i].action)) { blockedOnCreative = true; continue; }
    try {
      statuses[i] = await execServerAction(admin, arc.owner_id, steps[i].action, steps[i].params, nowIso);
      advanced++;
    } catch (e) {
      const waiting = (e as { waiting?: string })?.waiting;
      statuses[i] = waiting
        ? { kind: 'waiting', note: waiting }
        : { kind: 'failed', note: e instanceof Error ? e.message : 'The step failed server-side.' };
    }
  }

  // waiting > done/failed > ready: a parked step re-enters the wake sweep; anything still
  // pending (creative steps, dep chains) leaves the arc 'ready' for the client visit.
  const derived = derivePlanStatus(statuses);
  const status = derived === 'waiting' ? 'waiting' : derived === 'done' ? 'done' : derived === 'failed' ? 'failed' : 'ready';
  const waitingReason = statuses.find((s) => s.kind === 'waiting')?.note ?? null;
  await admin.from('orchestrator_plans').update({
    statuses, status, waiting_reason: waitingReason,
    last_activity_at: nowIso, updated_at: nowIso, claimed_until: null,
  }).eq('id', arc.id);

  if (advanced > 0) {
    await admin.from('mind_events').insert({
      owner_id: arc.owner_id, event_type: 'note', source: 'orchestrator',
      subject: `⚙ Arc "${String(arc.title).slice(0, 100)}": ${advanced} step(s) executed unattended${status === 'done' ? ' — the arc is DONE' : blockedOnCreative ? ' — creative steps wait for your next visit' : ''}.`,
      payload: { key: `arc-advance:${arc.id}:${nowIso.slice(0, 13)}`, plan_id: arc.id, advanced },
    }).then(() => {}, () => {});
  }
}
