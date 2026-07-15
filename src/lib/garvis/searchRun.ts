// src/lib/garvis/searchRun.ts
// UNIVERSAL SEARCH client seam (app_0053): one RPC over everything the record holds, consumed by
// the ⌘K palette. Fail-soft by contract — before the migration is applied (or offline) the RPC
// errors and the palette simply shows commands, exactly as before.

import { supabase } from '../supabase';

export type SearchKind = 'artifact' | 'area' | 'world' | 'contact' | 'invoice' | 'document' | 'belief' | 'mission';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  worldId: string | null;
  extra: Record<string, unknown>;
  at: string;
}

export async function universalSearch(q: string, cap = 4): Promise<SearchHit[]> {
  const needle = q.trim();
  if (needle.length < 3) return [];
  try {
    const { data, error } = await supabase.rpc('garvis_search', { q: needle, cap });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      kind: r.kind as SearchKind,
      id: r.id as string,
      title: (r.title as string) ?? '',
      snippet: (r.snippet as string) ?? '',
      worldId: (r.world_id as string | null) ?? null,
      extra: (r.extra as Record<string, unknown>) ?? {},
      at: (r.at as string) ?? '',
    })).filter((h) => h.title);
  } catch { return []; }
}

/** Where a hit lands. Every route already exists; area hits land ON the area, not the world's
 *  default pane (same rule the next-move engine follows). */
export function routeForHit(h: SearchHit): string {
  switch (h.kind) {
    case 'world': return `/garvis/webs/${h.id}`;
    case 'area': return h.worldId ? `/garvis/webs/${h.worldId}?area=${(h.extra.area as string) ?? ''}` : '/garvis/webs';
    case 'artifact': return h.worldId ? `/garvis/webs/${h.worldId}?area=${(h.extra.area as string) ?? ''}` : '/garvis/webs';
    case 'contact': return '/garvis/contacts';
    case 'invoice': return '/garvis/money';
    case 'document': return '/garvis/memory';
    case 'belief': return '/garvis/memory?tab=mind';
    case 'mission': return '/garvis/missions';
  }
}

export const KIND_LABEL: Record<SearchKind, string> = {
  artifact: 'artifact', area: 'area', world: 'business', contact: 'contact',
  invoice: 'invoice', document: 'document', belief: 'belief', mission: 'mission',
};
