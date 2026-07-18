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
import { buildHuntProfileRaw, buildHuntPitch, huntRunLine, extractSiteFacts, huntImagePrompts, huntArtPrompts } from '../../../src/lib/garvis/clientHuntBuild.ts';
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
import { parseBusinessProfile, assembleFallbackSpec, normalizeSpec, navFor, pickRecipe, previewSlug, type SiteSpec } from '../_shared/previewSpec.ts';
import { hashPayload, payloadMatches } from '../_shared/payloadHash.ts';
// CONTENT WEEK (app_0088): the same editor rubric the boards use (fail-CLOSED here — an unjudged
// draft never auto-queues) + the pure week machinery from standingCore.
import { honestySystemPrompt, judgeSystemPrompt, judgeUserPrompt, parseJudgeVerdict } from '../_shared/copyJudge.ts';
import { parseContentWeekConfig, weekSlots, contentWeekLine } from '../_shared/standingCore.ts';
import { composeBatchRecipients } from '../_shared/batchCore.ts';
// AUTOMATION TRIGGERS (app_0076): the pure scheduling core is verified in src (window guard, once-
// only ledger) — this worker adds the missing server half so rules fire on the clock, not only when
// the owner happens to click "Run due now" in a browser tab.
import { dueFires, renderTemplate, fireKey, type CustomerRec } from '../../../src/lib/garvis/automation/triggers.ts';

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

    // ---- AUTOMATION TRIGGER DRAIN (app_0076) -------------------------------------------------
    // The audit's finding: rules on the Automations page fired ONLY when the owner clicked "Run
    // due now" in a browser tab — a rule created and left alone never fired. This drain runs the
    // same verified pure core (window guard, once-only ledger) on every tick, cross-owner, and
    // lands each due fire as a PENDING send_email approval through the one send path. The
    // trigger_fires unique index arbitrates between this drain and a concurrent browser run.
    try {
      // Stranded-claim sweep (mirror of the browser runner): a run that died after claiming but
      // before enqueuing leaves approval_id null — release older than 10 min so fires retry.
      const staleCutoff = new Date(Date.parse(nowIso) - 10 * 60 * 1000).toISOString();
      await admin.from('trigger_fires').delete().is('approval_id', null).lt('created_at', staleCutoff);

      interface AutoTrigRow {
        id: string; owner_id: string; list_id: string; label: string;
        anchor_field: 'last_service_at' | 'last_visit_at' | 'purchase_at' | 'next_due_at';
        offset_days: number; window_days: number; template_subject: string; template_body: string;
      }
      interface AutoCustRow {
        id: string; email: string | null; name: string | null; consent_basis: string | null;
        last_service_at: string | null; last_visit_at: string | null;
        purchase_at: string | null; next_due_at: string | null;
      }
      // Deterministic order + a bound far above any plausible fleet (review fix): an unordered
      // .limit(100) let PostgREST return an arbitrary subset, so rules past the cap could be
      // silently NEVER checked. Ordered by id, capped at 500 — the fireBudget below still bounds
      // per-tick work, and a backlog beyond the budget drains across subsequent ticks.
      const { data: trigData } = await admin.from('automation_triggers')
        .select('id, owner_id, list_id, label, anchor_field, offset_days, window_days, template_subject, template_body')
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
            .select('id, email, name, consent_basis, last_service_at, last_visit_at, purchase_at, next_due_at')
            .eq('owner_id', t.owner_id).eq('list_id', t.list_id).limit(2000);
          customers = ((custData ?? []) as AutoCustRow[])
            // Consent gate (the column existed but was never checked): automations are warm/
            // transactional by design — a cold-prospecting row never rides a recall trigger.
            .filter((c) => (c.consent_basis ?? 'warm_transactional') === 'warm_transactional')
            .map((c) => ({
              id: c.id, email: c.email, name: c.name,
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
          { id: t.id, anchorField: t.anchor_field, offsetDays: t.offset_days, windowDays: t.window_days, status: 'active' },
          customers, firedKeys, nowIso,
        );
        let queuedForTrigger = 0;
        for (const fire of plan) {
          if (fireBudget <= 0) break;

          // Suppression pre-check BEFORE claiming (queueHuntPitch's honesty): a known
          // unsubscribed/bounced/complained address is never re-queued — and never claimed, so
          // the window guard naturally retires it instead of a claim-release loop.
          const { data: existing } = await admin.from('contacts')
            .select('id, email_status').eq('owner_id', t.owner_id).eq('email', fire.email.toLowerCase()).maybeSingle();
          const st = (existing as { email_status?: string } | null)?.email_status;
          if (st === 'unsubscribed' || st === 'bounced' || st === 'complained') continue;

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
            const to = fire.email.toLowerCase().trim();

            let contactId: string | null = existing ? (existing as { id: string }).id : null;
            if (!contactId) {
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

            const { data: camp } = await admin.from('outreach_campaigns')
              .insert({ owner_id: t.owner_id, contact_id: contactId, kind: 'automation', state: 'pending_approval' })
              .select('id').single();
            if (!camp) throw new Error('campaign insert failed');
            const campaignId = (camp as { id: string }).id;

            const { data: msg } = await admin.from('outreach_messages').insert({
              owner_id: t.owner_id, campaign_id: campaignId, contact_id: contactId, sequence_step: 0,
              subject, body_text: bodyText, to_address: to, status: 'draft',
            }).select('id').single();
            if (!msg) throw new Error('message insert failed');

            const payload = { message_id: (msg as { id: string }).id, campaign_id: campaignId };
            const payload_hash = await hashPayload(payload);
            const { data: ap, error: apErr } = await admin.from('approvals').insert({
              owner_id: t.owner_id, kind: 'send_email',
              title: `${t.label} → ${to}`,
              preview: `${subject}\n\n${bodyText}`,
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
      if (!biz) continue;
      if (biz.place_id && (biz.rating != null || biz.rating_count != null)) {
        env.runRatings.set(biz.place_id, { rating: biz.rating, count: biz.rating_count });
      }
      if (await insertLead(admin, ownerId, biz, q.id)) inserted++;
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

  // THE INTELLIGENCE CHAIN, server-side — the same strategist → art-director → owner-critique →
  // refine pass the manual preview engine runs (src/lib/preview/engine.ts), so a hunted prospect
  // gets the crafted, strategy-driven site. Every stage fails soft: the deterministic recipe spec
  // is the floor, and a chain failure never loses the demo. Real cost is metered per owner.
  let spec: SiteSpec = assembleFallbackSpec(profile);
  let specSource: 'ai' | 'fallback' = 'fallback';
  let strategy: Record<string, unknown> | null = null;
  let critique: Record<string, unknown> | null = null;
  {
    let aiCost = 0, aiIn = 0, aiOut = 0;
    const m = modelForPlan(await getUserPlan(admin, order.owner_id));
    const track = (r: { costUsd: number; inputTokens: number; outputTokens: number }) => {
      aiCost += r.costUsd; aiIn += r.inputTokens; aiOut += r.outputTokens;
    };
    try {
      await checkCredits(admin, order.owner_id, 'board_copy');   // out of credits → template floor
      const sR = await complete([
        { role: 'system', content: STRATEGY_SYSTEM },
        { role: 'user', content: JSON.stringify(profile, null, 1) },
      ], { provider: m.provider, model: m.model, maxTokens: 1800 });
      track(sR);
      const strat = normalizeStrategy(extractJson(sR.text), profile);
      // CONCEPT IMAGERY — a prospect with NO usable photos gets two honest, generic trade
      // still-lifes (gpt-image-1) so the site opens on full-bleed art instead of a flat color
      // field. Their own photos always win; generation is object photography only (no people/
      // text/logos — huntImagePrompts hard rules), labeled ai_generated + can_publish:false,
      // and fails soft (no key / refusal / no credits → the aurora hero stands).
      if (!profile.photos.length && Deno.env.get('OPENAI_API_KEY')) {
        try {
          await checkCredits(admin, order.owner_id, 'image');
          const made: typeof profile.photos = [];
          const aiPhoto = (url: string, alt: string) => ({
            url, alt, source_type: 'ai_generated', can_use_in_preview: true, can_publish: false,
            notes: 'AI-generated concept imagery — not photos of this business',
          });
          // Layered depth-sandwich pair first (backdrop art + transparent iconic object) — the
          // "I need that" hero. Trades without an iconic object get the still-life pair instead.
          const art = huntArtPrompts(profile.industry, strat.tone);
          if (art) {
            const bg = await genHuntImage(admin, order.owner_id, art.backdrop, '1536x1024');
            if (bg) made.push(aiPhoto(bg, 'ai-backdrop'));
            const obj = await genHuntImage(admin, order.owner_id, art.object, '1024x1024', true);
            if (obj) made.push(aiPhoto(obj, 'ai-object'));
          }
          if (!made.length) {
            const [wide, tight] = huntImagePrompts(profile.industry, strat.tone);
            for (const [prompt, size] of [[wide, '1536x1024'], [tight, '1024x1024']] as const) {
              const url = await genHuntImage(admin, order.owner_id, prompt, size);
              if (url) made.push(aiPhoto(url, ''));
            }
          }
          if (made.length) profile.photos = made;
        } catch { /* imagery is a bonus, never a blocker */ }
      }
      const gR = await complete([
        { role: 'system', content: SPEC_SYSTEM },
        { role: 'user', content: specPrompt(profile) + strategyBlock(strat) },
      ], { provider: m.provider, model: m.model, maxTokens: 8000 });
      track(gR);
      const aiSpec = normalizeSpec(extractJson(gR.text), profile);
      aiSpec.nav = navFor(aiSpec.sections, pickRecipe(profile).cta);
      spec = aiSpec; specSource = 'ai';
      strategy = strat as unknown as Record<string, unknown>;
      // Owner-simulation critique + ONE refine — fails soft to the draft it was critiquing.
      try {
        const cR = await complete([
          { role: 'system', content: CRITIQUE_SYSTEM },
          { role: 'user', content: critiqueUserPrompt(profile, spec) },
        ], { provider: m.provider, model: m.model, maxTokens: 1500 });
        track(cR);
        const crit = normalizeCritique(extractJson(cR.text));
        critique = crit as unknown as Record<string, unknown>;
        if (critiqueWarrantsRefine(crit)) {
          const rR = await complete([
            { role: 'system', content: SPEC_SYSTEM },
            { role: 'user', content: specPrompt(profile) + strategyBlock(strat) + critiqueBlock(crit) },
          ], { provider: m.provider, model: m.model, maxTokens: 8000 });
          track(rR);
          const refined = normalizeSpec(extractJson(rR.text), profile);
          refined.nav = navFor(refined.sections, pickRecipe(profile).cta);
          spec = refined;
        }
      } catch { /* keep the un-refined AI draft */ }
    } catch { /* the deterministic recipe spec stands */ }
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
    strategy, critique,
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

  const ok = await queueHuntPitch(admin, order.owner_id, {
    previewSiteId: (site as { id: string }).id, businessProfileId: (profileRow as { id: string }).id,
    businessName: profile.business_name, pitch, previewUrl, toEmail: email,
  });
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
