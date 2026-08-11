// src/lib/garvis/prospects/pitchCraft.ts
// THE CREATIVE LAYER of the cold pitch — pure and deterministic (no I/O; verified by
// pitchCraft.verify.ts). Two jobs, both born from the same audit finding: the cold path had ONE
// hardcoded subject line and one template opening while a real creative system (copyJudge's EMAIL
// CRAFT rubric, the EmailBoard's variant model) sat pointed at warm segments only.
//
//   1. SUBJECT VARIANTS — a small catalog of honest subject-line angles plus a deterministic
//      picker. Every angle states only what is true by construction at queue time (the demo IS
//      built before any pitch is queued); the question angle is additionally gated on observed
//      findings so the body can cash what the subject asks. The picked variant's id is persisted
//      on the message (outreach_messages.subject_variant), and opens/clicks are already tracked
//      per message — so which angle earns opens becomes a query, not a guess.
//
//   2. THE AI OPENER SEAM — prompt builders + an acceptance gate for one small model call that
//      writes only THE HOOK (the lines under "Hi X team,"). Everything load-bearing — the link,
//      the findings block, the upsells, the disclosure, the close — stays deterministic and keeps
//      its existing gates. acceptPitchOpener is the contract: an opener with a URL, a placeholder,
//      a hype adjective, an unsafe claim, or no grounding in this business is REJECTED (null), and
//      the template opening stands. The AI can only ever make the first lines better, never make
//      the email dishonest.
//
// Deno-safe: imported by the standing-worker edge function; the only import is the pure claims
// gate (same honesty spine as the findings copy).

import { claimsAreSafe } from './pitchFindings.ts';

// ---------------------------------------------------------------------------
// Subject variants
// ---------------------------------------------------------------------------

export interface SubjectVariant { id: string; subject: string }

export interface SubjectInput {
  businessName: string;
  industry?: string | null;
  /** True only when the pitch body will actually name observed findings — the question angle asks
   *  what the body then answers, so it is never offered without them. */
  hasFindings?: boolean;
}

/** Subjects longer than this are dropped (mobile truncates around 45; 70 is the hard ceiling —
 *  the control stays available at any length so a long business name still gets a subject). */
export const MAX_SUBJECT_CHARS = 70;

/**
 * The honest subject-line angles for a cold site pitch. `control` is the pre-variant subject,
 * byte-identical to what the cold path always sent — it anchors the experiment and is the floor
 * when a long business name disqualifies everything else. Order is stable (ids are persisted).
 */
export function subjectVariants(input: SubjectInput): SubjectVariant[] {
  const name = input.businessName.trim();
  const out: SubjectVariant[] = [{ id: 'control', subject: `A new website for ${name}` }];
  const candidates: SubjectVariant[] = [
    // The thing already happened — specificity, not clickbait: the demo exists before this queues.
    { id: 'built', subject: `I built ${name} a new website` },
    { id: 'ready', subject: `Your new website is ready to look at, ${name}` },
  ];
  if (input.hasFindings) {
    // A question the body immediately cashes with named, observed findings. Hedged by form —
    // it asks, it doesn't assert.
    candidates.push({ id: 'question', subject: `Is your website costing ${name} work?` });
  }
  for (const c of candidates) {
    if (c.subject.length <= MAX_SUBJECT_CHARS) out.push(c);
  }
  return out;
}

/** FNV-1a over the seed — a stable, dependency-free hash so the same prospect always gets the
 *  same subject (a re-queued pitch never flip-flops) while different prospects spread across
 *  the angles. Exported for tests. */
export function seedHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Pick one variant deterministically by seed (use the recipient address — stable per prospect).
 *  An empty list can't happen from subjectVariants (control is unconditional), but the guard keeps
 *  the function total. */
export function pickSubjectVariant(variants: SubjectVariant[], seed: string): SubjectVariant {
  if (!variants.length) return { id: 'control', subject: '' };
  return variants[seedHash(seed) % variants.length];
}

// ---------------------------------------------------------------------------
// The AI opener seam
// ---------------------------------------------------------------------------

/** Adjectives the deterministic voice bans (engine.ts's drafter prompt already bans "hype
 *  adjectives" in prose; the gate makes it checkable). Matched as whole words, case-insensitive. */
const HYPE = /\b(amazing|incredible|revolutionary|game[-\s]?changing|cutting[-\s]?edge|world[-\s]?class|stunning|unbeatable|best[-\s]?in[-\s]?class|next[-\s]?level|state[-\s]?of[-\s]?the[-\s]?art)\b/i;

/** The writer's rules for the opener — honesty spine + the copyJudge EMAIL CRAFT facts that apply
 *  to a first line (it doubles as the inbox preview text). The opener slots under "Hi X team," and
 *  above "So I went ahead and built you a new one:", so it must end on an observation about their
 *  current website for the bridge to land. */
export function openerSystemPrompt(): string {
  return [
    'You write the OPENING LINES of a short cold email from a local web designer to a small business owner.',
    'HONESTY IS ABSOLUTE: use ONLY facts present in the PROSPECT json. Never invent a name, place, number, review, or problem. No placeholders.',
    'Form: 1-3 sentences, 15-55 words, plain text. No greeting (the email already says hi), no sign-off, no links or URLs, no subject line.',
    'The first sentence doubles as the inbox preview text — make it carry a specific fact about THIS business, not "Hi there!" energy.',
    'End on a concrete observation about their current website or how customers find them, so the next line — "So I went ahead and built you a new one:" — lands naturally.',
    'Voice: a person who looked closely and will read the reply. Specific beats clever. No hype adjectives, no exclamation marks, no pressure.',
    'Return ONLY the opening text — no quotes, no commentary, no markdown.',
  ].join('\n');
}

/** The user message: the honest profile facts, nothing else — what the model can't see it can't
 *  invent from. */
export function openerUserPrompt(profile: unknown): string {
  return `PROSPECT: ${JSON.stringify(profile ?? {})}`;
}

export interface OpenerContext { businessName: string; industry?: string | null }

/** Words from the business name/trade worth ≥4 letters — the grounding tokens an accepted opener
 *  must touch. Exported for tests. */
export function groundingTokens(ctx: OpenerContext): string[] {
  const words = `${ctx.businessName} ${ctx.industry ?? ''}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return [...new Set(words)];
}

/**
 * The acceptance gate for a model-written opener. Returns the cleaned opener, or null — and null
 * ALWAYS means "the deterministic template opening stands", never a blocked email. Rejections are
 * deliberately strict: this seam adds personality, and a rejected draft costs nothing.
 */
export function acceptPitchOpener(raw: string, ctx: OpenerContext): string | null {
  let t = (raw ?? '').trim()
    .replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '')   // stray code fences
    .replace(/^["'“]+/, '').replace(/["'”]+$/, '')  // wrapping quotes
    .trim();
  // A leading greeting line would double the email's own "Hi X team," — drop just that line.
  t = t.replace(/^(?:hi|hey|hello|dear)\b[^\n]*\n+/i, '').trim();
  if (!t) return null;

  const words = t.split(/\s+/).length;
  if (words < 8 || words > 60 || t.length > 480) return null;              // not an opener's shape
  if (t.split(/\n{2,}/).length > 2) return null;                            // an essay, not a hook
  if (/https?:\/\/|www\./i.test(t)) return null;                            // the ONE link is the demo, later
  if (/\[|\{\{/.test(t)) return null;                                       // placeholders/merge tokens
  if (/@/.test(t)) return null;                                             // no addresses in a hook
  if (HYPE.test(t)) return null;                                            // the banned register
  if (/\b(regards|sincerely|cheers|thanks,)\b/i.test(t)) return null;       // a sign-off leaked in
  if (!claimsAreSafe(t)) return null;                                       // the language gate — non-negotiable
  // Grounding: the opener must touch this business by name or trade; a hook that fits any
  // business is the "honest slop" this seam exists to beat — and an ungrounded one may be lying.
  const tokens = groundingTokens(ctx);
  if (tokens.length && !tokens.some((w) => t.toLowerCase().includes(w))) return null;
  return t;
}
