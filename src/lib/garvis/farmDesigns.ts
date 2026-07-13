// src/lib/garvis/farmDesigns.ts
// The farm prints the world's OWN saved postcard designs — this loads every design the mailer
// studio saved anywhere in the world (they're knowledge_artifacts with slug 'postcard-*'), parsed
// back into a spec via the same round-trip the designer uses. No design = honest empty state.

import { supabase } from '../supabase';
import { parseMailerDetail, type MailerSpec } from './mailer';

export interface WorldPostcardDesign { slug: string; title: string; spec: MailerSpec }

export async function loadWorldPostcardDesigns(worldId: string): Promise<WorldPostcardDesign[]> {
  const { data, error } = await supabase.from('knowledge_artifacts')
    .select('slug, title, detail, created_at, knowledge_clusters!inner(world_id)')
    .eq('knowledge_clusters.world_id', worldId)
    .like('slug', 'postcard-%')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const out: WorldPostcardDesign[] = [];
  for (const row of (data ?? []) as { slug: string; title: string; detail: string | null }[]) {
    const spec = parseMailerDetail(row.detail);
    if (spec) out.push({ slug: row.slug, title: row.title || row.slug, spec });
  }
  return out;
}
