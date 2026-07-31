// src/lib/garvis/clients/clientReportRun.ts
// IMPURE half of the monthly client report (app_0118). This half owns SCOPING — every gather below
// is filtered to ONE world, and a source we cannot scope is passed to the core as `null` (unknown)
// rather than as owner-wide rows pretending to be the client's. That is the whole discipline: the
// audit's finding was a one-sentence owner-wide "report" presented as client truth; the core
// refuses to invent, and this half refuses to substitute.
//
// Delivery rides the ONE send spine: approve() marks the DRAFT approved (an operator act on our own
// artifact), and queueDelivery() mints a pending send_email approval exactly like every other
// outbound. Nothing reaches a client without the Queue.

import { supabase } from '../../supabase';
import {
  compileClientReport, reportPeriod, ledgerRange,
  type ReportSources, type ReportPeriod,
} from './clientReport';

export interface ClientReportRow {
  id: string; world_id: string; period_start: string; period_end: string;
  body_md: string; approval_state: 'draft' | 'approved';
  delivery_state: 'not_sent' | 'queued' | 'sent'; version: number;
}

/** Gather one world's month and compile it. Sources that cannot be scoped to this world are NULL
 *  (the core lists them as explicit unknowns) — never owner-wide substitutes. */
export async function generateClientReport(input: {
  worldId: string; clientSubscriptionId?: string | null; nowIso?: string;
}): Promise<ClientReportRow> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.worldId) throw new Error('A client report needs the client\'s world — refusing to compile an unscoped report.');

  const nowIso = input.nowIso ?? new Date().toISOString();
  const period: ReportPeriod = reportPeriod(nowIso);
  const { fromIso, toIso } = ledgerRange(period);

  const sources: ReportSources = {
    watchRuns: null, changeRequests: null, triggerFires: null,
    breakerEvents: null, outreach: null, usage: null, leads: null,
  };

  // ---- website watch ---------------------------------------------------------------------------
  // HONEST LIMIT: standing_orders keeps only the LAST result, not a per-run history, so a month of
  // uptime cannot be reconstructed from it. We pass the single observation we actually have; the
  // core then refuses to state a percentage (< MIN_WATCH_OBSERVATIONS) and says so. A real uptime
  // series needs a watch-run history table — named in the closing report as a known gap.
  try {
    const { data: watches } = await supabase.from('standing_orders')
      .select('label, status, last_result, last_run_at')
      .eq('owner_id', uid).eq('world_id', input.worldId).eq('kind', 'watch_url');
    if (watches?.length) {
      sources.watchRuns = (watches as { label: string; last_result: { status?: string; line?: string } | null; last_run_at: string | null }[])
        .filter((w) => w.last_run_at && w.last_run_at >= fromIso && w.last_run_at <= toIso)
        .map((w) => ({
          at: w.last_run_at!,
          ok: (w.last_result?.status ?? 'unchanged') !== 'unreachable',
          note: w.last_result?.line ?? '',
        }));
    }
  } catch { /* leave null — unknown, not zero */ }

  // ---- change requests (world-scoped by construction, app_0117) ---------------------------------
  try {
    const { data } = await supabase.from('change_requests')
      .select('status, request, received_at, closed_at')
      .eq('world_id', input.worldId).lte('received_at', toIso);
    sources.changeRequests = ((data ?? []) as { status: string; request: string; received_at: string; closed_at: string | null }[])
      .map((c) => ({ status: c.status, request: c.request, receivedAt: c.received_at, closedAt: c.closed_at }));
  } catch { /* null */ }

  // ---- automation fires + breaker events (attributed via client_subscription_id) ----------------
  if (input.clientSubscriptionId) {
    try {
      const { data: trigs } = await supabase.from('automation_triggers')
        .select('id, label').eq('client_subscription_id', input.clientSubscriptionId);
      const ids = ((trigs ?? []) as { id: string; label: string }[]);
      if (ids.length) {
        const byId = new Map(ids.map((t) => [t.id, t.label]));
        const { data: fires } = await supabase.from('trigger_fires')
          .select('trigger_id, created_at, approval_id')
          .in('trigger_id', ids.map((t) => t.id))
          .gte('created_at', fromIso).lte('created_at', toIso);
        sources.triggerFires = ((fires ?? []) as { trigger_id: string; created_at: string; approval_id: string | null }[])
          .map((f) => ({ at: f.created_at, label: byId.get(f.trigger_id) ?? 'automation', approvalId: f.approval_id }));
      } else {
        sources.triggerFires = [];   // measured: this client has no automations — a fact, not unknown
      }
    } catch { /* null */ }
  }

  // ---- outreach to this client's contacts (world-stamped contacts, app_0082) --------------------
  try {
    const { data: contacts } = await supabase.from('contacts').select('id').eq('world_id', input.worldId);
    const cids = ((contacts ?? []) as { id: string }[]).map((c) => c.id);
    if (cids.length) {
      // Real columns only: sent_at + opened_at live on the message (app_0081); a REPLY is a row in
      // `replies` keyed by message_id (resend-inbound), so it is joined, not guessed at.
      const { data: msgs } = await supabase.from('outreach_messages')
        .select('id, sent_at, opened_at').in('contact_id', cids)
        .gte('created_at', fromIso).lte('created_at', toIso);
      const rows = ((msgs ?? []) as { id: string; sent_at: string | null; opened_at: string | null }[]);
      let repliedIds = new Set<string>();
      if (rows.length) {
        const { data: reps } = await supabase.from('replies')
          .select('message_id').in('message_id', rows.map((m) => m.id));
        repliedIds = new Set(((reps ?? []) as { message_id: string }[]).map((x) => x.message_id));
      }
      sources.outreach = rows.map((m) => ({
        sentAt: m.sent_at, opened: !!m.opened_at, replied: repliedIds.has(m.id),
      }));
    } else {
      sources.outreach = [];
    }
  } catch { /* null */ }

  // ---- usage/cost, world-scoped by the app_0114 spine -------------------------------------------
  try {
    const { data } = await supabase.from('usage_events')
      .select('event_type, cost_usd, created_at')
      .eq('world_id', input.worldId).gte('created_at', fromIso).lte('created_at', toIso);
    sources.usage = ((data ?? []) as { event_type: string; cost_usd: number; created_at: string }[])
      .map((u) => ({ kind: u.event_type, costUsd: Number(u.cost_usd) || 0, at: u.created_at }));
  } catch { /* null */ }

  // leads + breakerEvents deliberately left null unless a world-scoped source exists — see the
  // closing report's known-gaps list rather than an owner-wide substitute.

  const { data: sub } = input.clientSubscriptionId
    ? await supabase.from('client_subscriptions').select('business_name').eq('id', input.clientSubscriptionId).maybeSingle()
    : { data: null };
  const compiled = compileClientReport(sources, period, {
    businessName: (sub as { business_name?: string } | null)?.business_name ?? null,
  });

  const { data: pin } = input.clientSubscriptionId
    ? await supabase.from('package_pins').select('package_id').eq('client_subscription_id', input.clientSubscriptionId).maybeSingle()
    : { data: null };

  // Version: a re-run for the same period supersedes the previous draft (corrections chain).
  const { data: prior } = await supabase.from('client_reports')
    .select('id, version').eq('world_id', input.worldId)
    .eq('period_start', period.start).eq('period_end', period.end)
    .order('version', { ascending: false }).limit(1);
  const priorRow = prior?.length ? (prior[0] as { id: string; version: number }) : null;

  const { data: row, error } = await supabase.from('client_reports').insert({
    owner_id: uid, world_id: input.worldId,
    client_subscription_id: input.clientSubscriptionId ?? null,
    period_start: period.start, period_end: period.end,
    package_id: (pin as { package_id?: string } | null)?.package_id ?? null,
    ledger_from: fromIso, ledger_to: toIso,
    body_md: compiled.bodyMd, evidence: compiled.evidence, unknowns: compiled.unknowns,
    version: (priorRow?.version ?? 0) + 1, supersedes: priorRow?.id ?? null,
  }).select('id, world_id, period_start, period_end, body_md, approval_state, delivery_state, version').single();
  if (error || !row) throw new Error(`Could not save the report: ${error?.message ?? 'unknown'}`);
  return row as ClientReportRow;
}

/** Operator approves their own draft — this is NOT the outbound gate (that is the send approval
 *  below); it records that a human read the numbers before a client ever could. */
export async function approveReport(id: string): Promise<void> {
  const { error } = await supabase.from('client_reports')
    .update({ approval_state: 'approved' }).eq('id', id).eq('approval_state', 'draft');
  if (error) throw new Error(error.message);
}

/** Queue delivery through the ONE send spine. Refuses an unapproved report (a client must never
 *  receive numbers no human read) and refuses a client with no email. Nothing sends here. */
export async function queueReportDelivery(id: string): Promise<{ approvalId: string }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const { data: rep } = await supabase.from('client_reports')
    .select('id, world_id, client_subscription_id, period_start, period_end, body_md, approval_state, delivery_state')
    .eq('id', id).maybeSingle();
  if (!rep) throw new Error('Report not found.');
  const r = rep as {
    id: string; world_id: string; client_subscription_id: string | null;
    period_start: string; period_end: string; body_md: string;
    approval_state: string; delivery_state: string;
  };
  if (r.approval_state !== 'approved') throw new Error('Read and approve the report first — a client never receives numbers no human read.');
  if (r.delivery_state !== 'not_sent') throw new Error('This report is already queued or sent.');

  const { data: sub } = r.client_subscription_id
    ? await supabase.from('client_subscriptions').select('business_name, email, contact_id').eq('id', r.client_subscription_id).maybeSingle()
    : { data: null };
  const to = (sub as { email?: string | null } | null)?.email ?? null;
  if (!to) throw new Error('No client email on file — add one on the client before sending.');
  const name = (sub as { business_name?: string } | null)?.business_name ?? 'your site';

  const { data: camp, error: cErr } = await supabase.from('outreach_campaigns').insert({
    owner_id: uid, kind: 'report', state: 'pending_approval',
  }).select('id').single();
  if (cErr || !camp) throw new Error(cErr?.message ?? 'Could not stage the send.');

  const subject = `${name} — your monthly report (${r.period_start} to ${r.period_end})`;
  const { data: msg, error: mErr } = await supabase.from('outreach_messages').insert({
    owner_id: uid, campaign_id: (camp as { id: string }).id, sequence_step: 0,
    subject, body_text: r.body_md, to_address: to, status: 'draft',
  }).select('id').single();
  if (mErr || !msg) throw new Error(mErr?.message ?? 'Could not draft the report email.');

  const { data: ap, error: apErr } = await supabase.from('approvals').insert({
    owner_id: uid, kind: 'send_email', status: 'pending', requested_by: 'user',
    world_id: r.world_id,                       // scope contract: the client's world
    title: `Send monthly report → ${to}`,
    preview: `${subject}\n\n${r.body_md.slice(0, 600)}`,
    payload: { message_id: (msg as { id: string }).id, client_report_id: r.id },
  }).select('id').single();
  if (apErr || !ap) throw new Error(`Could not queue the report (${apErr?.message ?? 'unknown'}) — it was NOT marked queued; try again.`);

  await supabase.from('client_reports')
    .update({ delivery_state: 'queued', approval_id: (ap as { id: string }).id, message_id: (msg as { id: string }).id })
    .eq('id', r.id);
  return { approvalId: (ap as { id: string }).id };
}
