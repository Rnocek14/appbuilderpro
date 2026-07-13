// src/lib/garvis/assist.ts
// OPERATOR ASSISTANT — pure core (no Supabase, no DOM; verified by assist.verify.ts).
//
// The answering desk: an incoming message + this world's knowledge base → a drafted reply the owner
// copies and sends. This module owns the DRAFTING CONTRACT and the HONESTY GATE, the two things that
// make it trustworthy. Everything impure (retrieval, the model call, persistence) lives in
// assistRun.ts.
//
// The rule that matters (same discipline as ask.ts / the no-theater law): a support answer is only
// as good as its grounding. The draft is composed ONLY from retrieved knowledge-base entries; when
// nothing relevant was found, the desk REFUSES rather than inventing a policy, price, or promise —
// and even a grounded draft flags anything it couldn't answer as "[needs your input: …]" so the
// owner fills it before it goes out. The human always sends.

export interface AssistSource {
  id: string;
  title: string;
  snippet: string;
  where: string | null; // the area/document it came from, for the "show your work" list
}

export interface AssistDraft {
  reply: string;                 // the ready-to-copy text ('' when refused)
  sources: AssistSource[];       // the KB entries the draft stands on
  grounded: boolean;             // true only when real sources backed the draft
  refusal: string | null;        // set when there was nothing to ground on
  gaps: string[];                // "[needs your input: …]" markers pulled out of the draft
  costUsd: number;
}

// ---------------------------------------------------------------------------
// The drafting contract
// ---------------------------------------------------------------------------

export const ASSIST_SYSTEM = `You are Garvis drafting a reply to an incoming message on the owner's
behalf, using ONLY the KNOWLEDGE BASE entries in the context — the owner's own policies, facts, and
past answers. Rules:
- Ground every statement in the SOURCES. Do NOT invent policies, prices, dates, order details,
  names, or commitments. If a fact isn't in the knowledge base, you do not know it.
- Write a complete, ready-to-send reply in the owner's voice: courteous, direct, specific, no filler,
  never "as an AI". Match the tone given. Answer the person's actual question.
- If the message asks for something the knowledge base does NOT cover, write the parts you CAN answer
  and mark each missing piece inline as "[needs your input: <what you'd need>]" — never guess it.
- Cite with [n] where a fact comes from source n.
- Plain text only. No markdown fences. No subject line unless the message clearly needs one.`;

/** Build the user turn: the incoming message + the retrieved KB, plus the owner's tone. */
export function buildAssistUser(incoming: string, sources: AssistSource[], tone: string | null): string {
  const kb = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}${s.where ? ` (${s.where})` : ''}: ${s.snippet.replace(/\s+/g, ' ').trim()}`).join('\n')
    : '(the knowledge base returned nothing relevant)';
  return [
    tone ? `OWNER'S VOICE: ${tone}` : '',
    `KNOWLEDGE BASE (ground the reply ONLY in these; cite as [n]):`,
    kb,
    ``,
    `INCOMING MESSAGE:`,
    incoming.trim().slice(0, 4000),
    ``,
    `Draft the reply now.`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// The honesty gate
// ---------------------------------------------------------------------------

const GAP_RE = /\[needs your input:[^\]]*\]/gi;

/** Pull the "[needs your input: …]" markers out of a draft so the UI can surface them as a checklist. */
export function extractGaps(reply: string): string[] {
  const out = (reply.match(GAP_RE) ?? []).map((m) => m.replace(/^\[needs your input:\s*/i, '').replace(/\]$/, '').trim());
  return [...new Set(out.filter(Boolean))];
}

/**
 * Decide whether a drafted reply may stand. The core refusal: with ZERO knowledge-base sources, the
 * desk must not answer at all — a confident invented support reply is the worst possible output.
 * A thin/empty model reply is also refused. Otherwise the draft is grounded (its gaps are honest).
 */
export function decideAssist(input: { incoming: string; sources: AssistSource[]; reply: string; costUsd?: number }): AssistDraft {
  const reply = (input.reply ?? '').trim();
  const costUsd = input.costUsd ?? 0;

  if (input.sources.length === 0) {
    return {
      reply: '', sources: [], grounded: false, gaps: [], costUsd,
      refusal: 'Nothing in this world’s knowledge base covers this yet — so I won’t guess an answer. Add an entry for it (drop the policy or a past answer into the vault) and I’ll draft the reply grounded in it.',
    };
  }
  if (reply.length < 20) {
    return {
      reply: '', sources: input.sources, grounded: false, gaps: [], costUsd,
      refusal: 'I found related knowledge but couldn’t compose a reply from it — the sources below have what you need; answer from them directly, or add a clearer entry.',
    };
  }
  return { reply, sources: input.sources, grounded: true, refusal: null, gaps: extractGaps(reply), costUsd };
}

/** A saved draft becomes a small record on the world's answering area, so the ledger can learn which
 *  drafts were kept vs heavily rewritten. Kind 'doc', source 'garvis' — never a seed. Pure + hashable. */
export function assistArtifact(incoming: string, draft: AssistDraft): { id: string; kind: 'doc'; title: string; detail: string; source: 'garvis' } {
  let h = 5381;
  for (const ch of incoming) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  const id = `answer-${(h >>> 0).toString(36)}`;
  const cited = draft.sources.map((s, i) => `[${i + 1}] ${s.title}`).join(' · ');
  const title = `Reply: ${incoming.trim().replace(/\s+/g, ' ').slice(0, 48)}${incoming.trim().length > 48 ? '…' : ''}`;
  const detail = `${draft.reply}\n\n— grounded in: ${cited || '(none)'}`;
  return { id, kind: 'doc', title, detail, source: 'garvis' };
}
