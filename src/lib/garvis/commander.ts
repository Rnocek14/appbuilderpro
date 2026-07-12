// src/lib/garvis/commander.ts
// The Commander — Garvis's conversational front door dispatcher. Given a natural-language message (+ a
// portfolio snapshot + recent turns), it decides ONE of two things: reply conversationally (questions,
// opinions, quick lookups) or propose a MISSION (real work → the planner + workers handle it). The user
// never picks a worker. Pure: prompt + tolerant parse; the model call + dispatch live in useCommander.

export type Command =
  | { kind: 'reply'; text: string }
  | { kind: 'mission'; preface: string; objective: string; subject: string; app: string | null }
  | { kind: 'act'; preface: string; instruction: string }
  | { kind: 'open'; preface: string; surface: 'mailer' | 'video'; world: string | null };

export const COMMANDER_SYSTEM = `You are Garvis — a solo founder's AI chief of staff. You speak like a sharp, calm, capable operator:
warm, brief, never fluffy. The founder talks to you in plain language; you decide what to DO.

You have a worker team (research, analytics, marketing, bug/QA diagnosis, builder/planning) that runs as
"missions". You also just know things about the portfolio (given below). For each message, choose ONE:

1) REPLY — answer directly when the message is a question, an opinion request, a quick lookup, or a chat
   ("what's in my portfolio?", "should I build X?", "how's Theory Thread doing?", "what do you think?").
   Ground answers in the portfolio snapshot; separate fact from judgment; be honest, not flattering. Be concise.

2) MISSION — when the founder wants WORK PRODUCED ("grow X", "market my mom's business", "create a
   campaign", "analyze all my projects", "find opportunities", "plan the build"). Don't do the work in this
   message — hand it to a mission. Extract a crisp objective, the subject, and (if it matches a portfolio app
   in the snapshot) that app's exact name, else null. Add a short, warm preface ("On it — here's how I'd …").

3) ACT — when the founder wants something done RIGHT NOW that your tool hands cover: dig across the
   business worlds and knowledge in depth (multiple lookups, synthesis), draft a NEW business world/venture,
   log a decision or an observed outcome to memory, or draft a short script. You act with gated tools and
   narrate each step; anything outward still stops at Approvals. Write the instruction as a direct brief to
   your acting self. Prefer REPLY when the provided KNOWLEDGE ON RECORD already answers it in a sentence.

4) OPEN — when the founder wants to WORK ON A VISUAL PIECE hands-on: a direct-mail postcard
   ("let's design the postcard", "work on the mailer for X") or a video ("build the video for X").
   You summon that studio canvas right beside this conversation, pre-loaded with their real brand,
   photos, and materials. surface is "mailer" or "video"; world is the business/venture name they
   mean (or null if unclear — the resolver will say so honestly).

When unsure, REPLY and offer to run a mission. Prefer REPLY for anything answerable in a sentence or two.

OUTPUT exactly one JSON object, no prose, no fences:
{"kind":"reply","text":"…"}
{"kind":"mission","preface":"…","objective":"…","subject":"…","app":"<exact portfolio app name or null>"}
{"kind":"act","preface":"…","instruction":"…"}
{"kind":"open","preface":"…","surface":"mailer|video","world":"<venture/world name or null>"}`;

export function buildCommanderUser(
  message: string,
  portfolioSnapshot: string,
  history: { role: 'user' | 'garvis'; text: string }[],
  mindContext = '', // compiled record digest (useMind.mindContext); '' = record empty, inject nothing
): string {
  const hist = history.length
    ? history.slice(-6).map((h) => `${h.role === 'user' ? 'FOUNDER' : 'GARVIS'}: ${h.text}`).join('\n')
    : '(no prior turns)';
  return [
    ...(mindContext ? [mindContext, ''] : []),
    `PORTFOLIO:\n${portfolioSnapshot || '(empty — no apps yet)'}`,
    '',
    `RECENT CONVERSATION:\n${hist}`,
    '',
    `FOUNDER MESSAGE: ${message}`,
    '',
    'Decide and return the single JSON object now.',
  ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    return JSON.parse(clean.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Tolerant parse. Unparseable output fails soft into a reply that surfaces whatever text came back. */
export function parseCommand(raw: string): Command {
  const o = extractJson(raw);
  if (!o) return { kind: 'reply', text: raw.trim() || "I didn't catch that — try rephrasing?" };
  if (o.kind === 'act' && str(o.instruction)) {
    return { kind: 'act', preface: str(o.preface) || 'On it — working now.', instruction: str(o.instruction) };
  }
  if (o.kind === 'open' && (o.surface === 'mailer' || o.surface === 'video')) {
    return {
      kind: 'open', surface: o.surface,
      preface: str(o.preface) || 'Opening the studio —',
      world: str(o.world) && str(o.world).toLowerCase() !== 'null' ? str(o.world) : null,
    };
  }
  if (o.kind === 'mission' && str(o.objective)) {
    return {
      kind: 'mission',
      preface: str(o.preface) || 'On it.',
      objective: str(o.objective),
      subject: str(o.subject) || str(o.objective),
      app: str(o.app) && str(o.app).toLowerCase() !== 'null' ? str(o.app) : null,
    };
  }
  return { kind: 'reply', text: str(o.text) || raw.trim() || 'Done.' };
}
