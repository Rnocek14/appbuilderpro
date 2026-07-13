// src/lib/garvis/assistRun.ts
// Impure half of the Operator Assistant: retrieve this world's knowledge base for an incoming
// message and draft a reply grounded ONLY in it. The honesty gate (decideAssist) lives in the pure
// assist.ts; this half does the retrieval, the model call, and — critically — SKIPS the model call
// entirely when the knowledge base has no match, so a "we have nothing on this" costs nothing and
// can never turn into an invented answer.

import { supabase } from '../supabase';
import { retrieveSources } from './ask';
import { ASSIST_SYSTEM, buildAssistUser, decideAssist, type AssistDraft, type AssistSource } from './assist';

/** The world's own voice, so drafts sound like the owner (best-effort; null is fine). */
async function worldTone(worldId: string): Promise<string | null> {
  const { data } = await supabase.from('knowledge_worlds').select('business_context').eq('id', worldId).maybeSingle();
  const tone = (data as { business_context?: { tone?: string | null } } | null)?.business_context?.tone;
  return (typeof tone === 'string' && tone.trim()) ? tone.trim() : null;
}

/** Draft a reply to `incoming`, grounded in `worldId`'s knowledge base. Never throws on retrieval;
 *  a thrown model error propagates so the desk can show it honestly. */
export async function draftReply(input: { worldId: string; incoming: string }): Promise<AssistDraft> {
  const incoming = (input.incoming ?? '').trim();
  if (incoming.length < 3) return decideAssist({ incoming, sources: [], reply: '' });

  const raw = await retrieveSources(incoming, { worldId: input.worldId, k: 6 });
  const sources: AssistSource[] = raw.map((s) => ({
    id: s.id, title: s.title, snippet: s.snippet, where: s.area ?? s.world ?? null,
  }));

  // No match in this world's knowledge base → refuse now, before spending a model call. The gate
  // owns the refusal wording; we just don't fabricate an answer over an empty corpus.
  if (sources.length === 0) return decideAssist({ incoming, sources, reply: '' });

  const tone = await worldTone(input.worldId).catch(() => null);
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system: ASSIST_SYSTEM, context: '', history: [], message: buildAssistUser(incoming, sources, tone) },
  });
  if (error) throw new Error(error.message);
  const reply = ((data as { text?: string })?.text ?? '').trim();
  const costUsd = ((data as { costUsd?: number })?.costUsd) ?? 0;
  return decideAssist({ incoming, sources, reply, costUsd });
}
