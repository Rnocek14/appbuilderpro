// src/lib/garvis/resultsRun.ts
// G5 — the honest per-channel results read. Every number is a COUNT OF ROWS: email from
// outreach_messages/replies, mail from mail_batches, site from site_events/leads (with ?src
// attribution, so a postcard QR scan is credited to the card). Channels that aren't instrumented
// say so — "not instrumented" is a state, never a zero pretending to be knowledge. This is the
// data Adaptive Operation will stand on; nothing here interprets, it only counts.

import { supabase } from '../supabase';

export interface ChannelResults {
  email: { sent: number; replies: number } | null;          // null = no campaigns bound to this world
  mail: { batches: number; pieces: number } | null;          // null = nothing logged
  site: {
    visits: number; visits7d: number;
    leads: number; leads7d: number;
    bySource: { source: string; visits: number; leads: number }[];
  } | null;                                                   // null = no site channel (not instrumented)
  /** SW10.11: social joins the measured world. posts = really-posted rows; engagements = the
   *  summed synced metrics; synced=false means metrics never arrived — the channel ran blind. */
  social: { posts: number; engagements: number; synced: boolean } | null; // null = nothing posted
  leadsList: LeadRow[];
}

export interface LeadRow {
  id: string; name: string | null; email: string; phone: string | null; message: string | null;
  source: string; status: 'new' | 'contacted' | 'qualified' | 'closed' | 'spam';
  contact_id: string | null; created_at: string;
}

const DAY = 86_400_000;

export async function worldResults(worldId: string): Promise<ChannelResults> {
  const now = Date.now();
  const within7 = (iso: string) => now - new Date(iso).getTime() < 7 * DAY;

  const [campsQ, batchesQ, channelQ, eventsQ, leadsQ, postsQ, metricsQ] = await Promise.all([
    supabase.from('outreach_campaigns').select('id').eq('world_id', worldId),
    supabase.from('mail_batches').select('piece_count, status').eq('world_id', worldId).eq('status', 'mailed'),
    supabase.from('site_channels').select('id').eq('world_id', worldId).is('revoked_at', null).limit(1),
    supabase.from('site_events').select('kind, source, created_at').eq('world_id', worldId).order('created_at', { ascending: false }).limit(1000),
    supabase.from('leads').select('id, name, email, phone, message, source, status, contact_id, created_at')
      .eq('world_id', worldId).neq('status', 'spam').order('created_at', { ascending: false }).limit(50),
    supabase.from('social_posts').select('id').eq('world_id', worldId).eq('status', 'posted').limit(1000),
    supabase.from('social_post_metrics').select('likes, comments, shares, engagement').eq('world_id', worldId).limit(1000),
  ]);

  // Email — only when campaigns exist for this world.
  let email: ChannelResults['email'] = null;
  const campIds = ((campsQ.data ?? []) as { id: string }[]).map((c) => c.id);
  if (campIds.length) {
    const [{ data: msgs }, { data: reps }] = await Promise.all([
      supabase.from('outreach_messages').select('status').in('campaign_id', campIds).limit(1000),
      supabase.from('replies').select('id').in('campaign_id', campIds).limit(1000),
    ]);
    email = {
      sent: ((msgs ?? []) as { status: string }[]).filter((m) => m.status === 'sent').length,
      replies: (reps ?? []).length,
    };
  }

  // Mail — logged batches, mailed only (planned/printed aren't outreach yet).
  const batches = ((batchesQ.data ?? []) as { piece_count: number }[]);
  const mail: ChannelResults['mail'] = batches.length
    ? { batches: batches.length, pieces: batches.reduce((n, b) => n + (b.piece_count ?? 0), 0) }
    : null;

  // Site — only when a channel exists (otherwise honestly "not instrumented").
  let site: ChannelResults['site'] = null;
  const hasChannel = ((channelQ.data ?? []) as { id: string }[]).length > 0;
  if (hasChannel) {
    const events = ((eventsQ.data ?? []) as { kind: string; source: string | null; created_at: string }[]);
    const leads = ((leadsQ.data ?? []) as LeadRow[]);
    const visits = events.filter((e) => e.kind === 'visit');
    const bySrc = new Map<string, { visits: number; leads: number }>();
    for (const v of visits) {
      const s = v.source ?? 'direct';
      if (!bySrc.has(s)) bySrc.set(s, { visits: 0, leads: 0 });
      bySrc.get(s)!.visits++;
    }
    for (const l of leads) {
      const s = l.source === 'postcard-qr' ? 'postcard' : (l.source ?? 'direct');
      if (!bySrc.has(s)) bySrc.set(s, { visits: 0, leads: 0 });
      bySrc.get(s)!.leads++;
    }
    site = {
      visits: visits.length,
      visits7d: visits.filter((v) => within7(v.created_at)).length,
      leads: leads.length,
      leads7d: leads.filter((l) => within7(l.created_at)).length,
      bySource: [...bySrc.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => (b.leads * 10 + b.visits) - (a.leads * 10 + a.visits)),
    };
  }

  // Social — only when posts really went out. Engagement is the SYNCED read (social_post_metrics,
  // written only by social-sync from the provider); prefer the provider's own engagement total,
  // else sum the parts. Absent metrics stay absent — synced:false says the channel ran blind.
  let social: ChannelResults['social'] = null;
  const postCount = ((postsQ.data ?? []) as { id: string }[]).length;
  if (postCount > 0) {
    const metricRows = ((metricsQ.data ?? []) as { likes: number | null; comments: number | null; shares: number | null; engagement: number | null }[]);
    const engagements = metricRows.reduce((n, m) => n + (m.engagement ?? ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0))), 0);
    social = { posts: postCount, engagements, synced: metricRows.length > 0 };
  }

  return { email, mail, site, social, leadsList: ((leadsQ.data ?? []) as LeadRow[]) };
}

/** Move a lead through its honest lifecycle. 'contacted' is the operator's report that they
 *  actually answered — the row is the record. */
export async function setLeadStatus(id: string, status: LeadRow['status']): Promise<void> {
  const { data, error } = await supabase.from('leads').update({ status }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Lead not found.');
}
