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
    return {
      ...r,
      previewSlug: demo?.slug ?? null,
      previewStatus,
      profileId,
      won,
      stage: deriveStage({ status: r.status, previewStatus, won }),
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
