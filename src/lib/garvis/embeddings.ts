// src/lib/garvis/embeddings.ts
// Text embeddings for MEANING-based cluster matching — two jobs: entity resolution (snap "info
// paradox" onto "information paradox" even with no shared spelling) and "similar ideas" surfacing.
//
// KEY-SAFE BY DEFAULT: this now calls the `embed-worker` edge function, which holds the embeddings
// key SERVER-SIDE (Deno.env). The raw key never ships in the browser bundle. Only when the app is
// explicitly run in DIRECT mode (VITE_AI_DIRECT=true, dev-only) does it fall back to calling the
// provider directly with the local key — matching how the rest of aiClient behaves in dev.
//
// Returns null when embeddings are unavailable (no server key AND no direct key), so every caller
// MUST fall back to the lexical path in clustering.ts. Progressive: better with a key, correct without.

import { supabase } from '../supabase';
import { resolveAI } from '../aiConfig';
import type { Provider } from '../aiConfig';

// Conservative: only providers whose /embeddings endpoint + model id we're confident about (DIRECT mode).
const EMBED_MODEL: Partial<Record<Provider, string>> = {
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
  local: 'nomic-embed-text',
};

function directAvailable(): boolean {
  const ai = resolveAI();
  return ai.direct && !!ai.openAIBase && !!EMBED_MODEL[ai.provider] && ai.ready;
}

/** Embeddings are available if the server-side worker can be reached OR a direct dev key is set. */
export function embeddingsAvailable(): boolean {
  return Boolean(supabase) || directAvailable();
}

/** Direct provider call — dev/DIRECT-mode only. */
async function embedDirect(texts: string[]): Promise<number[][] | null> {
  const ai = resolveAI();
  const model = EMBED_MODEL[ai.provider];
  if (!ai.openAIBase || !model) return null;
  try {
    const res = await fetch(`${ai.openAIBase}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key || 'local'}` },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vecs = ((data?.data ?? []) as { embedding: number[] }[]).map((d) => d.embedding);
    return vecs.length === texts.length && vecs.every((v) => Array.isArray(v) && v.length) ? vecs : null;
  } catch {
    return null;
  }
}

/**
 * Embed a batch of strings. Returns one vector per input, or null if unsupported/failed.
 * Prefers the server-side worker (key-safe); falls back to the direct provider call only in DIRECT mode.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];

  // Server-side path (default, key-safe).
  try {
    const { data, error } = await supabase.functions.invoke('embed-worker', { body: { texts } });
    if (!error && data) {
      const vecs = (data as { vectors?: number[][] | null }).vectors;
      if (Array.isArray(vecs) && vecs.length === texts.length) return vecs;
      // vectors === null means embeddings aren't configured server-side; try direct as a dev fallback.
    }
  } catch {
    // network/edge unavailable — fall through to direct (dev) or null.
  }

  if (directAvailable()) return embedDirect(texts);
  return null;
}

/** Persist embeddings for one or more subjects (artifacts, documents, …) via the server-side
 *  worker, which holds the key and stamps owner_id. FIRE-AND-FORGET + fail-soft: retrieval is a
 *  progressive enhancement (lexical search always stands), so an embedding miss must never fail
 *  or slow the write it rides behind. Returns how many were embedded (0 when unconfigured). */
export async function persistEmbeddings(
  subjects: { subject_type: 'artifact' | 'document' | 'cluster' | 'business'; subject_id: string; content: string; chunk_ix?: number }[],
): Promise<number> {
  const clean = subjects.filter((s) => s.subject_id && (s.content ?? '').trim()).slice(0, 128);
  if (!clean.length) return 0;
  try {
    const { data, error } = await supabase.functions.invoke('embed-worker', { body: { subjects: clean } });
    if (error) return 0;
    return (data as { embedded?: number })?.embedded ?? 0;
  } catch {
    return 0;
  }
}

/** Cosine similarity in [-1,1] (≈[0,1] for embeddings). Pure. */
export function cosine(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
