// src/lib/garvis/explorerAI.ts
// The Explorer's ONE road to a model. Every Knowledge Universe call (overview, currents, think,
// mind, bridge, investigate) goes through here instead of aiClient's browser-direct rawComplete —
// so in production the operator key stays server-side and every turn is credit-metered by the
// explorer-turn edge function. Falls back to the user's own browser key (rawComplete/streamComplete)
// ONLY when the edge isn't reachable (local dev without functions, signed-out spike) AND a key is
// configured — the Explorer keeps working on a laptop with no backend, but never silently double-paths.
//
// Contract mirrors aiClient but always carries the REAL cost:
//   exploreComplete(messages, maxTokens)            → { text, inputTokens, outputTokens, costUsd }
//   exploreStream(messages, maxTokens, onDelta, cb) → full text; cb gets { inputTokens, outputTokens, costUsd }

import { supabase, supabaseUrl, supabaseAnonKey, supabaseConfigured } from '../supabase';
import { rawComplete, streamComplete } from '../aiClient';
import { resolveAI } from '../aiConfig';
import { estimateCostUsd } from './directBrain';

export interface ExploreResult { text: string; inputTokens: number; outputTokens: number; costUsd: number }
export interface ExploreUsage { inputTokens: number; outputTokens: number; costUsd: number; stopReason?: string }
/** `fast: true` routes to the cheap/fast model tier (haiku-class) — for small structural calls
 * (think/leads/mind/bridge/theme) where latency matters more than prose quality. */
export interface ExploreOpts { fast?: boolean }

type Msg = { role: string; content: string };

// Breaker: once the edge says "not deployed / unreachable" we stop retrying it this session
// (same pattern as discover.ts). Auth failures do NOT trip it — those mean "sign in", not "no edge".
// The REASON is kept so the fallback error can tell the truth: "sign in" and "the backend
// function isn't deployed" are different problems with different fixes.
let edgeBlockedReason: string | null = null;

function fallbackMessage(signedOut: boolean): string {
  if (!supabaseConfigured) {
    return 'This build has no Supabase configured — add your own API key in Settings for local mode.';
  }
  if (signedOut) {
    return 'Sign in to explore (server AI), or add your own API key in Settings for local mode.';
  }
  return `Garvis's server AI is unreachable — ${edgeBlockedReason ?? 'the explorer-turn edge function errored'}. ` +
    'Deploy the edge functions to your Supabase project (npm run functions:deploy) and set its AI secrets, ' +
    'or add your own API key in Settings for local mode.';
}

async function authHeader(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  } catch { return null; }
}

function edgeCandidate(): boolean {
  return supabaseConfigured && !edgeBlockedReason;
}

/** Local fallback is only legitimate when the user configured their own key. */
function directReady(): boolean {
  try { return resolveAI().ready; } catch { return false; }
}

class EdgeUnavailable extends Error {}

async function callEdge(body: Record<string, unknown>, auth: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/explorer-turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: supabaseAnonKey, Authorization: auth },
      body: JSON.stringify(body),
    });
  } catch {
    edgeBlockedReason = 'the explorer-turn function did not respond (network)'; // don't hammer it again this session
    throw new EdgeUnavailable('explorer-turn unreachable');
  }
  if (res.status === 404) {
    edgeBlockedReason = 'the explorer-turn edge function is NOT DEPLOYED on this Supabase project';
    throw new EdgeUnavailable('explorer-turn not deployed');
  }
  return res;
}

async function edgeError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error ?? `Explorer call failed (${res.status})`);
}

export async function exploreComplete(messages: Msg[], maxTokens = 800, opts: ExploreOpts = {}): Promise<ExploreResult> {
  let signedOut = false;
  if (edgeCandidate()) {
    const auth = await authHeader();
    if (!auth) signedOut = true;
    if (auth) {
      try {
        const res = await callEdge({ messages, maxTokens, fast: opts.fast }, auth);
        if (!res.ok) throw await edgeError(res); // 402 out-of-credits etc. surface to the UI as-is
        const data = await res.json() as ExploreResult;
        return {
          text: data.text ?? '',
          inputTokens: data.inputTokens ?? 0,
          outputTokens: data.outputTokens ?? 0,
          costUsd: data.costUsd ?? 0,
        };
      } catch (e) {
        if (!(e instanceof EdgeUnavailable)) throw e;
        // fall through to the local-key path
      }
    }
  }
  if (!directReady()) {
    throw new Error(fallbackMessage(signedOut));
  }
  const r = await rawComplete(messages, maxTokens, { fast: opts.fast });
  return { ...r, costUsd: estimateCostUsd(r.inputTokens, r.outputTokens) };
}

export async function exploreStream(
  messages: Msg[], maxTokens: number, onDelta: (fullText: string) => void, onUsage?: (u: ExploreUsage) => void, opts: ExploreOpts = {},
): Promise<string> {
  let signedOut = false;
  if (edgeCandidate()) {
    const auth = await authHeader();
    if (!auth) signedOut = true;
    if (auth) {
      try {
        const res = await callEdge({ messages, maxTokens, stream: true, fast: opts.fast }, auth);
        if (!res.ok) throw await edgeError(res);
        if (!res.body) throw new Error('Explorer stream returned no body.');
        let full = '';
        let err: string | null = null;
        await readSSE(res.body, (data) => {
          let obj: { t?: string; error?: string; done?: boolean; inputTokens?: number; outputTokens?: number; costUsd?: number };
          try { obj = JSON.parse(data); } catch { return; }
          if (typeof obj.t === 'string') { full += obj.t; onDelta(full); }
          else if (obj.error) err = obj.error;
          else if (obj.done) onUsage?.({ inputTokens: obj.inputTokens ?? 0, outputTokens: obj.outputTokens ?? 0, costUsd: obj.costUsd ?? 0 });
        });
        if (err) throw new Error(err);
        return full;
      } catch (e) {
        if (!(e instanceof EdgeUnavailable)) throw e;
      }
    }
  }
  if (!directReady()) {
    throw new Error(fallbackMessage(signedOut));
  }
  // Local fallback: streamComplete's onDelta gives chunks; ours promises the accumulated text.
  let acc = '';
  return streamComplete(
    messages, maxTokens,
    (d) => { acc += d; onDelta(acc); },
    undefined,
    (u) => onUsage?.({ inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: estimateCostUsd(u.inputTokens, u.outputTokens), stopReason: u.stopReason }),
    undefined,
    { fast: opts.fast },
  );
}

/** Minimal SSE reader (aiClient's readSSE is private). */
async function readSSE(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  }
}
