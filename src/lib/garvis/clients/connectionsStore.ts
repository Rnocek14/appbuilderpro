// src/lib/garvis/clients/connectionsStore.ts
// The impure half of the per-client connections checklist. Seeds a client's connector rows on first
// view, LOADS them, and REFRESHES their status by looking at each connector's own table (the row is a
// thin index, never a copy). Owner-scoped via RLS; best-effort so the UI degrades to an empty checklist
// rather than erroring before the migration is applied. The pure mapping lives in connections.ts.

import { supabase } from '../../supabase';
import {
  CONNECTORS, seedForTier, deriveStatus, type ConnectorId, type ConnectionStatus, type ConnectionEvidence,
} from './connections';

export interface ConnectionRow {
  id: string;
  connector: ConnectorId;
  status: ConnectionStatus;
  detail: string | null;
  error: string | null;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Load a client's connector rows (raw, as stored). */
export async function loadConnections(clientSubId: string): Promise<ConnectionRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('client_connections')
    .select('id, connector, status, detail, error')
    .eq('owner_id', u).eq('client_subscription_id', clientSubId);
  return (data ?? []) as ConnectionRow[];
}

/** Create the connector rows for a client the first time its checklist is opened. Idempotent: the
 *  (client, connector) unique index makes a re-seed a no-op via upsert-ignore. Seeds from the tier. */
export async function ensureConnections(clientSubId: string, tier: 'website' | 'website_automation'): Promise<void> {
  const u = await uid(); if (!u) return;
  const rows = seedForTier(tier).map((r) => ({
    owner_id: u, client_subscription_id: clientSubId, connector: r.connector, status: r.status,
  }));
  // ignoreDuplicates: never clobber an existing row's operator-set status on a re-open.
  await supabase.from('client_connections')
    .upsert(rows, { onConflict: 'client_subscription_id,connector', ignoreDuplicates: true });
}

/** Manually set one connector's status (operator marks it done / not needed / re-opens it). */
export async function setConnectionStatus(id: string, status: ConnectionStatus, detail?: string | null): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString(), error: null };
  if (detail !== undefined) patch.detail = detail;
  const { error } = await supabase.from('client_connections').update(patch).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Gather evidence from each connector's own table + build the display detail per connector. Best-effort:
 *  a query that fails leaves that connector's evidence false (shown as still-needed, never a crash). */
async function gatherEvidence(
  u: string, sub: { id: string; email: string | null; twilio_number: string | null; stripe_subscription_id: string | null; status: string; preview_site_id: string | null },
): Promise<{ ev: ConnectionEvidence; detail: Partial<Record<ConnectorId, string>> }> {
  const ev: ConnectionEvidence = {};
  const detail: Partial<Record<ConnectorId, string>> = {};

  // sms_number + payments come straight off the client row.
  if (sub.twilio_number) { ev.smsNumber = true; detail.sms_number = sub.twilio_number; }
  if (sub.stripe_subscription_id || sub.status === 'active') { ev.payments = true; detail.payments = sub.stripe_subscription_id ? 'billing on Stripe' : 'marked paid'; }

  // domain: the client's published site (linked by the plain preview_site_id uuid on the sub).
  if (sub.preview_site_id) {
    const { data: site } = await supabase.from('preview_sites')
      .select('custom_domain, live_url').eq('id', sub.preview_site_id).maybeSingle();
    const s = site as { custom_domain?: string | null; live_url?: string | null } | null;
    if (s?.custom_domain) { ev.domain = true; detail.domain = s.custom_domain; }
    else if (s?.live_url) { ev.domain = true; detail.domain = s.live_url.replace(/^https?:\/\//, ''); }
  }

  // email_sender: the brand sender identity on the client's world (via the linked engagement).
  const { data: eng } = await supabase.from('client_engagements')
    .select('world_id').eq('owner_id', u).eq('client_subscription_id', sub.id).maybeSingle();
  let worldId = (eng as { world_id?: string | null } | null)?.world_id ?? null;
  // Not linked yet? Adopt an unlinked engagement with the EXACT same client email (case-insensitive) and
  // link it, so a client we both bill and operate becomes one identity — and future refreshes are direct.
  // Exact email only (never guess by name); limit(1) so duplicates never throw.
  if (!worldId && sub.email) {
    const { data: match } = await supabase.from('client_engagements')
      .select('id, world_id').eq('owner_id', u).ilike('client_email', sub.email).is('client_subscription_id', null).limit(1);
    const m = match && match.length ? (match[0] as { id: string; world_id: string | null }) : null;
    if (m) {
      worldId = m.world_id;
      await supabase.from('client_engagements').update({ client_subscription_id: sub.id }).eq('owner_id', u).eq('id', m.id);
    }
  }
  if (worldId) {
    const { data: ident } = await supabase.from('world_sender_identities')
      .select('from_email').eq('world_id', worldId).maybeSingle();
    const fromEmail = (ident as { from_email?: string | null } | null)?.from_email ?? null;
    if (fromEmail) { ev.emailSender = true; detail.email_sender = fromEmail; }
  }

  // voice_number: a missed-call config attached to this client.
  const { data: mc } = await supabase.from('missed_call_configs')
    .select('twilio_number, enabled').eq('owner_id', u).eq('client_subscription_id', sub.id).limit(1);
  const mcRow = mc && mc.length ? (mc[0] as { twilio_number: string; enabled: boolean }) : null;
  if (mcRow) { ev.voiceNumber = true; ev.voiceEnabled = mcRow.enabled; detail.voice_number = `${mcRow.twilio_number}${mcRow.enabled ? '' : ' (off)'}`; }

  // booking: a booking page attached to this client.
  const { data: bp } = await supabase.from('booking_pages')
    .select('slug, enabled').eq('owner_id', u).eq('client_subscription_id', sub.id).limit(1);
  const bpRow = bp && bp.length ? (bp[0] as { slug: string; enabled: boolean }) : null;
  if (bpRow) { ev.booking = true; ev.bookingEnabled = bpRow.enabled; detail.booking = `/book/${bpRow.slug}${bpRow.enabled ? '' : ' (off)'}`; }

  return { ev, detail };
}

/** The one call the checklist UI makes: ensure rows exist, refresh their status against reality, and
 *  return the fresh checklist. Only auto-moves rows between 'needed' and 'connected' — an operator's
 *  'not_needed'/'pending'/'error' is preserved by deriveStatus. */
export async function refreshConnections(
  clientSubId: string, tier: 'website' | 'website_automation',
): Promise<ConnectionRow[]> {
  const u = await uid(); if (!u) return [];
  await ensureConnections(clientSubId, tier);

  const { data: subData } = await supabase.from('client_subscriptions')
    .select('id, email, twilio_number, stripe_subscription_id, status, preview_site_id')
    .eq('owner_id', u).eq('id', clientSubId).maybeSingle();
  const sub = subData as { id: string; email: string | null; twilio_number: string | null; stripe_subscription_id: string | null; status: string; preview_site_id: string | null } | null;
  const rows = await loadConnections(clientSubId);
  if (!sub) return rows;

  const { ev, detail } = await gatherEvidence(u, sub);
  const nowIso = new Date().toISOString();

  // Update only the rows whose derived status or detail actually changed — one write per real change.
  const next: ConnectionRow[] = [];
  for (const row of rows) {
    const derived = deriveStatus(row.connector, ev, row.status);
    const newDetail = detail[row.connector] ?? row.detail ?? null;
    if (derived !== row.status || newDetail !== row.detail) {
      await supabase.from('client_connections')
        .update({ status: derived, detail: newDetail, last_checked_at: nowIso, updated_at: nowIso })
        .eq('owner_id', u).eq('id', row.id);
    }
    next.push({ ...row, status: derived, detail: newDetail });
  }
  // Keep catalog order for a stable checklist.
  const order = new Map(CONNECTORS.map((c, i) => [c.id, i]));
  next.sort((a, b) => (order.get(a.connector) ?? 99) - (order.get(b.connector) ?? 99));
  return next;
}
