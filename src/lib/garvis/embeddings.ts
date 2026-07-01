// src/lib/garvis/embeddings.ts
// Best-effort text embeddings for MEANING-based cluster matching — the production-grade upgrade over
// lexical title similarity for two jobs: entity resolution (snap "info paradox" onto "information
// paradox" even with no shared spelling) and "similar ideas" surfacing across the universe.
//
// OpenAI-compatible providers only. Returns null when the active provider has no embeddings endpoint
// (e.g. Anthropic), so every caller MUST fall back to the lexical path in clustering.ts. This keeps
// the feature progressive: better with an embeddings-capable key, still correct without one.

import { resolveAI } from '../aiConfig';
import type { Provider } from '../aiConfig';

// Conservative: only providers whose /embeddings endpoint + model id we're confident about.
const EMBED_MODEL: Partial<Record<Provider, string>> = {
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
  local: 'nomic-embed-text',
};

export function embeddingsAvailable(): boolean {
  const ai = resolveAI();
  return !!ai.openAIBase && !!EMBED_MODEL[ai.provider] && ai.ready;
}

/** Embed a batch of strings. Returns one vector per input, or null if unsupported/failed. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
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

/** Cosine similarity in [-1,1] (≈[0,1] for embeddings). Pure. */
export function cosine(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
