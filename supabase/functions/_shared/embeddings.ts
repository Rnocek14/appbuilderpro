// supabase/functions/_shared/embeddings.ts
// Server-side text embeddings for the persistent brain (app_0021). This is the write-side companion
// to the client's src/lib/garvis/embeddings.ts — but here the key is held server-side (Deno.env) and
// the vectors are PERSISTED to public.embeddings, so "similar ideas" and entity resolution survive a
// reload and span every module.
//
// OpenAI-compatible /embeddings endpoint. Config (edge secrets):
//   EMBEDDINGS_API_KEY   — the key (falls back to OPENAI_API_KEY)
//   EMBEDDINGS_BASE_URL   — e.g. https://api.openai.com/v1 (falls back to OPENAI_BASE_URL, then OpenAI)
//   EMBEDDINGS_MODEL      — default text-embedding-3-small (1536-dim — must match the vector(1536) column)

export const EMBED_MODEL = Deno.env.get('EMBEDDINGS_MODEL') ?? 'text-embedding-3-small';
export const EMBED_DIM = 1536;

function baseUrl(): string {
  return (Deno.env.get('EMBEDDINGS_BASE_URL') ?? Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1')
    .replace(/\/$/, '');
}
function apiKey(): string | null {
  return Deno.env.get('EMBEDDINGS_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? null;
}

export function embeddingsConfigured(): boolean {
  return !!apiKey();
}

/**
 * Embed a batch of strings. Returns one vector per input, or null if unconfigured/failed — every
 * caller MUST tolerate null (the brain degrades to lexical, it does not break). Inputs are trimmed
 * and capped; empty inputs get a zero-length guard upstream.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const key = apiKey();
  if (!key) return null;
  // OpenAI caps input size; keep each chunk well under the token limit (~8k tokens ≈ 32k chars).
  const input = texts.map((t) => (t ?? '').slice(0, 30000));
  try {
    const res = await fetch(`${baseUrl()}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vecs = ((data?.data ?? []) as { embedding: number[] }[]).map((d) => d.embedding);
    return vecs.length === input.length && vecs.every((v) => Array.isArray(v) && v.length === EMBED_DIM)
      ? vecs
      : null;
  } catch {
    return null;
  }
}

/** Convenience: embed one string, or null. */
export async function embedOne(text: string): Promise<number[] | null> {
  const out = await embedTexts([text]);
  return out && out[0] ? out[0] : null;
}

/** pgvector text literal for a float array: '[0.1,0.2,...]'. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(',')}]`;
}

/** Cosine similarity in [-1,1]. Pure. Mirrors the client's cosine() for parity. */
export function cosine(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
