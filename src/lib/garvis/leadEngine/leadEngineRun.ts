// src/lib/garvis/leadEngine/leadEngineRun.ts
// The impure half of the Lead Engine (pure core: leadEngine.ts). Sources and leads are records;
// the DIGEST goes out through the one approval-gated send path (a pending approval in the queue,
// same as every email); an OUTCOME is a fact the customer reported — and a won outcome with a
// value mints an ordinary commission invoice (source='commission') so the Money loop's chase
// ladder and scorecard revenue work unchanged. Nothing here sends anything.

import { supabase } from '../../supabase';
import { enqueueApproval } from '../execution';
import { createInvoice } from '../moneyRun';
import { createOrder, listOrders, setOrderStatus } from '../standingRun';
import type { StandingOrder } from '../standing';
import {
  digestFor, commissionFor, TRADES, isTradeKey,
  type DigestLead, type TradeKey, type LeadStatus,
} from './leadEngine.ts';
import type { SourceKind } from './adapters.ts';

export interface LeadSourceRow {
  id: string; world_id: string; name: string; kind: SourceKind; base_url: string;
  query_config: Record<string, unknown>; region: string; active: boolean;
  last_fetch_at: string | null; last_status: string | null; consecutive_failures: number;
  cursor: Record<string, unknown>; created_at: string;
}

export interface LeadRow {
  id: string; world_id: string; event_id: string; trade: TradeKey; score: number;
  score_reasons: string[]; contact_name: string | null; contact_company: string | null;
  contact_email: string | null; contact_phone: string | null; why_now: string;
  status: LeadStatus; delivered_at: string | null; verified_at: string | null; created_at: string;
  // joined from le_events for display
  le_events?: { title: string; source_url: string; event_type: string; address: string | null; valuation_usd: number | null } | null;
}

export interface OutcomeRow {
  id: string; lead_id: string; result: 'quoted' | 'won' | 'lost' | 'no_contact';
  contract_value_usd: number | null; commission_invoice_id: string | null; notes: string | null; reported_at: string;
}

const SOURCE_COLS = 'id, world_id, name, kind, base_url, query_config, region, active, last_fetch_at, last_status, consecutive_failures, cursor, created_at';
const LEAD_COLS = 'id, world_id, event_id, trade, score, score_reasons, contact_name, contact_company, contact_email, contact_phone, why_now, status, delivered_at, verified_at, created_at, le_events(title, source_url, event_type, address, valuation_usd)';

async function uid(): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const id = sess.user?.id;
  if (!id) throw new Error('Not signed in.');
  return id;
}

export async function listSources(worldId: string): Promise<LeadSourceRow[]> {
  const { data, error } = await supabase.from('le_sources').select(SOURCE_COLS)
    .eq('world_id', worldId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadSourceRow[];
}

export async function createSource(input: {
  worldId: string; name: string; kind: SourceKind; baseUrl: string; region: string;
  queryConfig?: Record<string, unknown>;
}): Promise<LeadSourceRow> {
  const owner = await uid();
  if (!input.name.trim()) throw new Error('Name the source (e.g. "Denver building permits").');
  if (!/^https:\/\//i.test(input.baseUrl.trim())) throw new Error('Source URL must be https.');
  const { data, error } = await supabase.from('le_sources').insert({
    owner_id: owner, world_id: input.worldId, name: input.name.trim(), kind: input.kind,
    base_url: input.baseUrl.trim(), region: input.region.trim(),
    query_config: input.queryConfig ?? {},
  }).select(SOURCE_COLS).single();
  if (error) throw new Error(error.message);
  return data as LeadSourceRow;
}

/** Pause/resume. Resuming also forgives the failure streak — the operator said try again. */
export async function setSourceActive(sourceId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('le_sources')
    .update({ active, ...(active ? { consecutive_failures: 0 } : {}), updated_at: new Date().toISOString() })
    .eq('id', sourceId);
  if (error) throw new Error(error.message);
}

export async function listLeads(worldId: string, status?: LeadStatus): Promise<LeadRow[]> {
  let q = supabase.from('le_leads').select(LEAD_COLS)
    .eq('world_id', worldId).order('score', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeadRow[];
}

export async function setLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const { error } = await supabase.from('le_leads')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', leadId);
  if (error) throw new Error(error.message);
}

/** THE CLOCK: is this market on the standing schedule? One lead_engine order per world — the
 *  15-minute heartbeat tick runs it hourly, so leads accrue with the laptop closed. */
export async function getClockOrder(worldId: string): Promise<StandingOrder | null> {
  const orders = await listOrders(worldId);
  return orders.find((o) => o.kind === 'lead_engine') ?? null;
}

/** Put the market on the clock (idempotent — returns the existing order if one exists). */
export async function enableClock(worldId: string, worldLabel: string): Promise<StandingOrder> {
  const existing = await getClockOrder(worldId);
  if (existing) {
    if (existing.status === 'paused') await setOrderStatus(existing.id, 'active');
    return existing;
  }
  return createOrder({
    worldId, kind: 'lead_engine', cadence: 'hourly',
    label: `Lead market: ${worldLabel}`,
    config: {},   // trades default to ALL in the worker (parseLeadEngineConfig); narrow later if wanted
  });
}

export async function setClockActive(orderId: string, active: boolean): Promise<void> {
  await setOrderStatus(orderId, active ? 'active' : 'paused');
}

/** Run one market's ingest now (the panel's "Check sources now" button). The edge function does
 *  the fetching; a signed-in call is scoped to the caller's own sources server-side. */
export async function runIngestNow(worldId: string): Promise<{ line: string }> {
  const { data, error } = await supabase.functions.invoke('lead-ingest', { body: { world_id: worldId } });
  if (error) throw new Error(error.message);
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return { line: (data as { line?: string } | null)?.line ?? 'Ingest ran.' };
}

/** Queue this week's digest as ONE pending approval through the one send path. The digest is
 *  composed from rows by the pure core (never a model); the leads it includes are stamped
 *  'delivered' when the approval is enqueued — the queue shows exactly what would go out. */
export async function queueDigest(input: {
  worldId: string; worldLabel: string; toEmail: string; trades?: TradeKey[];
}): Promise<{ included: number }> {
  const owner = await uid();
  const to = input.toEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a valid recipient email.');

  const fresh = await listLeads(input.worldId, 'new');
  const scoped = input.trades?.length ? fresh.filter((l) => input.trades!.includes(l.trade)) : fresh;
  const digestLeads: DigestLead[] = scoped.filter((l) => isTradeKey(l.trade)).map((l) => ({
    trade: l.trade, score: l.score, why_now: l.why_now,
    contact_name: l.contact_name, contact_company: l.contact_company,
    source_url: l.le_events?.source_url ?? '', title: l.le_events?.title ?? l.why_now,
  }));
  const dig = digestFor(input.worldLabel, digestLeads);
  if (dig.included === 0) throw new Error('No new leads to send — a quiet week is not a digest.');

  // The send substrate: contact (select-first; email_status never reset) → campaign → message.
  let contactId: string | null = null;
  const { data: existing } = await supabase.from('contacts').select('id').eq('owner_id', owner).eq('email', to).maybeSingle();
  if (existing) contactId = (existing as { id: string }).id;
  else {
    const { data: c } = await supabase.from('contacts')
      .insert({ owner_id: owner, email: to, email_status: 'unknown', is_primary: false }).select('id').maybeSingle();
    contactId = (c as { id: string } | null)?.id ?? null;
  }
  const { data: camp, error: campErr } = await supabase.from('outreach_campaigns')
    .insert({ owner_id: owner, contact_id: contactId, kind: 'lead_digest', state: 'pending_approval' })
    .select('id').single();
  if (campErr || !camp) throw new Error(campErr?.message ?? 'Could not create the digest campaign.');
  const { data: msg, error: msgErr } = await supabase.from('outreach_messages').insert({
    owner_id: owner, campaign_id: (camp as { id: string }).id, contact_id: contactId,
    sequence_step: 0, subject: dig.subject, body_text: dig.body, to_address: to, status: 'draft',
  }).select('id').single();
  if (msgErr || !msg) throw new Error(msgErr?.message ?? 'Could not draft the digest message.');

  const includedIds = scoped.slice(0, dig.included).map((l) => l.id);
  await enqueueApproval({
    kind: 'send_email',
    title: `Lead digest → ${to} (${dig.included} lead${dig.included === 1 ? '' : 's'})`,
    preview: `${dig.subject}\n\n${dig.body.slice(0, 400)}`,
    payload: { message_id: (msg as { id: string }).id, lead_ids: includedIds, world_id: input.worldId },
    requestedBy: 'lead-engine',
    worldId: input.worldId,
  });
  const nowIso = new Date().toISOString();
  await supabase.from('le_leads')
    .update({ status: 'delivered', delivered_at: nowIso, updated_at: nowIso }).in('id', includedIds);
  return { included: dig.included };
}

/** Record what actually happened to a lead — the moat data. A WON with a contract value and a
 *  billing email mints a commission invoice through the Money loop (draft; sending it is a
 *  separate approval, as ever). */
export async function recordOutcome(input: {
  lead: LeadRow; worldId: string; result: OutcomeRow['result'];
  contractValueUsd?: number | null; commissionPct?: number; billToEmail?: string | null; notes?: string | null;
}): Promise<{ commissionUsd: number | null }> {
  const owner = await uid();
  let invoiceId: string | null = null;
  let commissionUsd: number | null = null;

  if (input.result === 'won' && input.contractValueUsd && input.contractValueUsd > 0 && input.billToEmail?.trim()) {
    commissionUsd = commissionFor(input.contractValueUsd, input.commissionPct);
    if (commissionUsd > 0) {
      const inv = await createInvoice({
        title: `Referral commission — ${TRADES[input.lead.trade]?.label ?? input.lead.trade} lead`,
        toEmail: input.billToEmail.trim(),
        lineItems: [{
          description: `Commission (${input.commissionPct ?? 10}%) on won job: ${input.lead.le_events?.title ?? input.lead.why_now}`.slice(0, 200),
          qty: 1, unit_usd: commissionUsd,
        }],
        worldId: input.worldId,
        source: 'commission',
      });
      invoiceId = inv.id;
    }
  }

  const { error } = await supabase.from('le_outcomes').insert({
    owner_id: owner, world_id: input.worldId, lead_id: input.lead.id,
    reported_by: 'owner', result: input.result,
    contract_value_usd: input.contractValueUsd ?? null,
    commission_invoice_id: invoiceId, notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);

  const statusFor: Record<OutcomeRow['result'], LeadStatus> = { quoted: 'quoted', won: 'won', lost: 'lost', no_contact: 'contacted' };
  await setLeadStatus(input.lead.id, statusFor[input.result]);
  return { commissionUsd };
}

/** The pilot scoreboard, counted from real rows: delivered → quoted → won, close rate, commission. */
export async function leadScoreboard(worldId: string): Promise<{
  delivered: number; quoted: number; won: number; closeRatePct: number | null; commissionUsd: number;
}> {
  const { data, error } = await supabase.from('le_leads').select('id, status').eq('world_id', worldId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; status: LeadStatus }[];
  const delivered = rows.filter((r) => r.status !== 'new' && r.status !== 'skipped').length;
  const quoted = rows.filter((r) => r.status === 'quoted' || r.status === 'won' || r.status === 'lost').length;
  const won = rows.filter((r) => r.status === 'won').length;
  const { data: oc } = await supabase.from('le_outcomes')
    .select('contract_value_usd, result').eq('world_id', worldId).eq('result', 'won');
  const commissionUsd = ((oc ?? []) as { contract_value_usd: number | null }[])
    .reduce((s, o) => s + commissionFor(o.contract_value_usd ?? 0), 0);
  return { delivered, quoted, won, closeRatePct: delivered ? Math.round((won / delivered) * 100) : null, commissionUsd };
}
