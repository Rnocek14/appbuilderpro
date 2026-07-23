// src/lib/garvis/prospects/prospectsRun.ts
// The impure loader for the Prospects pipeline. Loads the discovered-business pool, joins each to its
// demo (preview_sites) and any booked sale (client_subscriptions), and derives ONE stage per prospect
// with the pure core (stage.ts). Owner-scoped via RLS; best-effort so the page degrades to an empty
// pool rather than erroring before the discovery migration is applied.

import { supabase } from '../../supabase';
import { deriveStage, type ProspectStage } from './stage';

export interface Prospect {
  id: string;
  company_name: string;
  keyword: string | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  has_website: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;                    // raw discovered_businesses.status
  created_at: string;
  preview_site_id: string | null;
  previewSlug: string | null;        // the demo's public slug (/preview-site/:slug)
  previewStatus: string | null;      // preview | emailed | purchased | published
  profileId: string | null;          // preview_sites.profile_id → contacts / business_profiles
  won: boolean;
  stage: ProspectStage;
  // Post-send signals (from the demo + the pitch email) — what actually happened after "Build & send".
  opened: boolean;                   // the pitch email was opened
  openCount: number;
  demoViews: number;                 // the demo was viewed (preview_events 'view')
  engaged: boolean;                  // …and dwelled 45s+ ('engaged')
  replied: boolean;                  // the prospect wrote back
}

export interface ProspectContact {
  id: string; email: string | null; email_status: string | null;
  phone: string | null; full_name: string | null; is_primary: boolean;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Load the whole pool, enriched with stage. One pass: pool → demos (by preview_site_id) → sales (won). */
export async function loadProspects(): Promise<Prospect[]> {
  const u = await uid(); if (!u) return [];

  const { data: pool, error } = await supabase.from('discovered_businesses')
    .select('id, company_name, keyword, category, phone, website, has_website, address, city, state, status, preview_site_id, created_at')
    .eq('owner_id', u)
    .order('has_website', { ascending: true })       // no-website (the best sell targets) first
    .order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (pool ?? []) as Omit<Prospect, 'previewSlug' | 'previewStatus' | 'profileId' | 'won' | 'stage'>[];

  // Demos: batch-load the linked preview_sites in one query.
  const previewIds = [...new Set(rows.map((r) => r.preview_site_id).filter((x): x is string => !!x))];
  const previewById = new Map<string, { slug: string | null; status: string | null; profile_id: string | null }>();
  if (previewIds.length) {
    const { data: sites } = await supabase.from('preview_sites')
      .select('id, slug, status, profile_id').in('id', previewIds);
    for (const s of (sites ?? []) as { id: string; slug: string | null; status: string | null; profile_id: string | null }[]) {
      previewById.set(s.id, { slug: s.slug, status: s.status, profile_id: s.profile_id });
    }
  }

  // Post-send signals, keyed by preview_site_id. Opens/replies come off the pitch message; demo views
  // off preview_events. Both batch-loaded once for the whole pool.
  const openByPreview = new Map<string, { opened: boolean; openCount: number; replied: boolean }>();
  const viewByPreview = new Map<string, { views: number; engaged: boolean }>();
  if (previewIds.length) {
    const { data: msgs } = await supabase.from('outreach_messages')
      .select('preview_site_id, opened_at, open_count, status').eq('owner_id', u).in('preview_site_id', previewIds);
    for (const m of (msgs ?? []) as { preview_site_id: string | null; opened_at: string | null; open_count: number | null; status: string | null }[]) {
      if (!m.preview_site_id) continue;
      const cur = openByPreview.get(m.preview_site_id) ?? { opened: false, openCount: 0, replied: false };
      cur.opened = cur.opened || !!m.opened_at;
      cur.openCount = Math.max(cur.openCount, m.open_count ?? 0);
      cur.replied = cur.replied || m.status === 'replied';
      openByPreview.set(m.preview_site_id, cur);
    }
    const { data: evs } = await supabase.from('preview_events')
      .select('preview_site_id, event').in('preview_site_id', previewIds);
    for (const e of (evs ?? []) as { preview_site_id: string; event: string }[]) {
      const cur = viewByPreview.get(e.preview_site_id) ?? { views: 0, engaged: false };
      if (e.event === 'view') cur.views++;
      if (e.event === 'engaged') cur.engaged = true;
      viewByPreview.set(e.preview_site_id, cur);
    }
  }

  // Sales: a demo (or its profile) with a non-canceled client_subscription is WON.
  const wonPreviewIds = new Set<string>();
  const wonProfileIds = new Set<string>();
  const { data: subs } = await supabase.from('client_subscriptions')
    .select('preview_site_id, business_profile_id, status').eq('owner_id', u).neq('status', 'canceled');
  for (const s of (subs ?? []) as { preview_site_id: string | null; business_profile_id: string | null; status: string }[]) {
    if (s.preview_site_id) wonPreviewIds.add(s.preview_site_id);
    if (s.business_profile_id) wonProfileIds.add(s.business_profile_id);
  }

  return rows.map((r) => {
    const demo = r.preview_site_id ? previewById.get(r.preview_site_id) : undefined;
    const profileId = demo?.profile_id ?? null;
    const won = (r.preview_site_id ? wonPreviewIds.has(r.preview_site_id) : false) || (profileId ? wonProfileIds.has(profileId) : false);
    const previewStatus = demo?.status ?? null;
    const opens = r.preview_site_id ? openByPreview.get(r.preview_site_id) : undefined;
    const views = r.preview_site_id ? viewByPreview.get(r.preview_site_id) : undefined;
    return {
      ...r,
      previewSlug: demo?.slug ?? null,
      previewStatus,
      profileId,
      won,
      stage: deriveStage({ status: r.status, previewStatus, won }),
      opened: opens?.opened ?? false,
      openCount: opens?.openCount ?? 0,
      demoViews: views?.views ?? 0,
      engaged: views?.engaged ?? false,
      replied: opens?.replied ?? false,
    };
  });
}

/** Skip (pass over) or reopen a prospect. Only ever writes 'new' or 'skipped' — 'built'/'won' are
 *  derived from real progress, never set by hand here. */
export async function setProspectStatus(id: string, status: 'new' | 'skipped'): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const { error } = await supabase.from('discovered_businesses')
    .update({ status, updated_at: new Date().toISOString() }).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The scraped contacts for a prospect's demo (drawer). Keyed by the demo's business_profile_id; empty
 *  until the demo is built (that's when emails/photos are scraped). Primary contact first. */
export async function loadProspectContacts(profileId: string | null): Promise<ProspectContact[]> {
  if (!profileId) return [];
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('contacts')
    .select('id, email, email_status, phone, full_name, is_primary')
    .eq('owner_id', u).eq('business_profile_id', profileId)
    .order('is_primary', { ascending: false });
  return (data ?? []) as ProspectContact[];
}
