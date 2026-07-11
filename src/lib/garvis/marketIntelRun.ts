// src/lib/garvis/marketIntelRun.ts
// Impure half of Market Intelligence: run one category scan through the EXISTING rails —
// discover-media (Serper, metered) for finding, cluster-chat (metered) for the evidence-labeled
// fit verdicts — and land prospects as rows. READ-ONLY by construction: nothing here contacts
// anyone; a prospect becomes outreach only when the user moves it into contacts and the
// approval spine takes over. Caps are explicit: 2 queries and 8 stored prospects per scan.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import {
  researchPlanFor, parseSerperOrganic, parseFits, FIT_SYSTEM,
  type ScanCategory, type ProspectCandidate, type FitLabel,
} from './marketIntel';
import type { WorldDNA, BusinessContext } from './genesis';

export interface ProspectRow {
  id: string; category: string; name: string; url: string | null; snippet: string | null;
  fit: FitLabel; fit_reason: string | null; status: 'new' | 'qualified' | 'dropped' | 'contacted';
  created_at: string;
}

export async function worldPlan(worldId: string) {
  const { data } = await supabase.from('knowledge_worlds').select('dna, business_context, title').eq('id', worldId).maybeSingle();
  return {
    title: (data?.title as string) ?? '',
    dna: (data?.dna as WorldDNA | null) ?? null,
    ctx: (data?.business_context as BusinessContext | null) ?? null,
    plan: researchPlanFor((data?.dna as WorldDNA | null) ?? null, (data?.business_context as BusinessContext | null) ?? null),
  };
}

export async function listProspects(worldId: string): Promise<ProspectRow[]> {
  const { data } = await supabase.from('prospects')
    .select('id, category, name, url, snippet, fit, fit_reason, status, created_at')
    .eq('world_id', worldId).neq('status', 'dropped')
    .order('created_at', { ascending: false }).limit(60);
  return (data ?? []) as ProspectRow[];
}

export async function setProspectStatus(id: string, status: ProspectRow['status']): Promise<void> {
  const { error } = await supabase.from('prospects').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ScanResult { found: number; stored: number; judged: number; message: string }

/** One category scan: search (≤2 queries) → store candidates (≤8, deduped by url) → one batched
 *  fit-judgment call, reasons grounded in the snippets. Fail-soft at every stage. */
export async function scanCategory(worldId: string, category: ScanCategory, dna: WorldDNA | null, ctx: BusinessContext | null): Promise<ScanResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const candidates: ProspectCandidate[] = [];
  const seen = new Set<string>();
  for (const q of category.queries.slice(0, 2)) {
    const { data, error } = await supabase.functions.invoke('discover-media', {
      body: { provider: 'serper', path: 'search', q },
    });
    if (error) throw new Error(error.message);
    const payload = data as { available?: boolean; data?: unknown; error?: string };
    if (payload?.error) throw new Error(payload.error);
    if (!payload?.available) throw new Error('Search is not configured on the server (SERPER_API_KEY missing).');
    for (const c of parseSerperOrganic(payload.data, 8)) {
      const key = c.url ?? c.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); candidates.push(c); }
    }
  }
  const kept = candidates.slice(0, 8);
  if (!kept.length) return { found: 0, stored: 0, judged: 0, message: 'The search returned nothing usable for this segment.' };

  // Store first (found is a fact even if judgment fails); unique(world_id, url) absorbs re-scans.
  const { data: inserted } = await supabase.from('prospects').upsert(
    kept.map((c) => ({ owner_id: uid, world_id: worldId, category: category.name, name: c.name, url: c.url, snippet: c.snippet || null })),
    { onConflict: 'world_id,url', ignoreDuplicates: true },
  ).select('id, name');
  const stored = inserted?.length ?? 0;

  // One batched judgment — evidence-labeled fits, grounded in the snippets.
  let judged = 0;
  try {
    const { data, error } = await supabase.functions.invoke('cluster-chat', {
      body: {
        system: FIT_SYSTEM,
        context: `BUSINESS DNA:\n${JSON.stringify({ dna, businessContext: ctx }, null, 1)}\n\nCANDIDATES:\n${kept.map((c) => `- ${c.name}: ${c.snippet || '(no snippet)'}`).join('\n')}`,
        history: [], message: `Judge fit for the "${category.name}" segment now. JSON only.`,
      },
    });
    if (!error) {
      const fits = parseFits((data as { text?: string })?.text ?? '');
      for (const f of fits) {
        if (f.fit === 'unknown') continue;
        const { error: upErr } = await supabase.from('prospects')
          .update({ fit: f.fit, fit_reason: f.reason })
          .eq('world_id', worldId).eq('category', category.name).eq('name', f.name);
        if (!upErr) judged++;
      }
    }
  } catch { /* fits stay 'unknown' — visible, never guessed */ }

  await recordMindEvent(uid, {
    event_type: 'note', source: 'market-intel',
    subject: `Scanned "${category.name}": ${kept.length} found, ${stored} new, ${judged} fit-judged`,
    payload: { world_id: worldId, category: category.name },
  });
  return { found: kept.length, stored, judged, message: `${kept.length} found · ${stored} new · ${judged} fit-judged. Judging is read-only — contacting stays behind approvals.` };
}
