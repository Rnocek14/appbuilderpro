// src/lib/garvis/dockBrain.ts
// THE DEEP BRAIN, DOCK-SIDE — pure core (verified by dockBrain.verify.ts).
//
// The dock had TWO problems the operator felt as "Garvis is shallow". Its AI fallback was, by its
// own comment, "router work → always the cheap tier": the cheapest model, 250 tokens, and a
// context of exactly three things — the sentence, the URL, and a list of task labels. Meanwhile a
// far better brain already existed one page away (useCommander on /garvis/command), assembling
// the mind record, the live situation, the operator's goals, and retrieved knowledge, and able to
// answer, open, build, explore, or hand out work. The two shared zero code.
//
// This joins them WITHOUT letting the commander drive. The commander decides what KIND of thing
// the sentence is; the dock decides what to DO about it, keeping its own routing and its own
// approval spine. That distinction is the whole point of this module:
//   - the commander navigating from inside the dock would fight the dock's own act() (two things
//     racing to choose where the operator lands), so 'open'/'build'/'explore' come back as
//     INTENTIONS the dock resolves with its own world knowledge;
//   - work ('mission'/'act') does NOT fire-and-forget from the corner. It routes into the dock's
//     Do-engine, where it compiles to a reviewable plan the operator presses Run on — nothing
//     consequential happens because a model chose a verb.

import type { Command } from './commander';

export type DockAction =
  /** Just say it — the deep, grounded answer. */
  | { kind: 'say'; text: string }
  /** Work: hand to the dock's Do-engine, which compiles a REVIEWABLE plan (approval spine intact). */
  | { kind: 'compile'; sentence: string; note: string }
  /** A destination the dock resolves and navigates to itself. */
  | { kind: 'goto'; to: string; note: string }
  /** A world-scoped studio: the dock matches the world by its own rules, then deep-links. */
  | { kind: 'studio'; surface: 'mailer' | 'video'; world: string | null; note: string };

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Join a preface to a fallback so the operator always gets a sentence, never an empty bubble. */
const note = (preface: string, fallback: string): string => clean(preface) || fallback;

/**
 * Map the commander's decision onto what the DOCK should do. Pure and total: every Command kind
 * has an action, and an empty/garbled reply still produces something honest to show.
 */
export function dockActionFor(cmd: Command): DockAction {
  switch (cmd.kind) {
    case 'reply':
      return { kind: 'say', text: clean(cmd.text) || "I don't have an answer for that one." };

    // WORK — never fired from the corner on a model's say-so. The Do-engine compiles it into a
    // plan with steps, risks, holes and questions, and the operator presses Run.
    case 'mission':
      return {
        kind: 'compile',
        sentence: clean(cmd.objective) || clean(cmd.subject),
        note: note(cmd.preface, "Here's the plan — press Run when it reads right."),
      };
    case 'act':
      return {
        kind: 'compile',
        sentence: clean(cmd.instruction),
        note: note(cmd.preface, "Here's the plan — press Run when it reads right."),
      };

    // DESTINATIONS — returned as intentions; the dock owns the actual navigation.
    case 'build':
      return {
        kind: 'goto',
        to: `/new?idea=${encodeURIComponent(clean(cmd.prompt).slice(0, 1900))}`,
        note: note(cmd.preface, 'The brief is pre-filled at the forge — press Generate when it reads right.'),
      };
    case 'explore':
      return {
        kind: 'goto',
        to: `/garvis/universe?dive=${encodeURIComponent(clean(cmd.query).slice(0, 300))}`,
        note: note(cmd.preface, 'Opening the rabbit hole.'),
      };
    case 'open':
      return {
        kind: 'studio',
        surface: cmd.surface,
        world: clean(cmd.world ?? '') || null,
        note: note(cmd.preface, cmd.surface === 'mailer' ? 'Opening the postcard studio.' : 'Opening the video studio.'),
      };
  }
}

/** The area a studio intention deep-links to, in the dock's own area vocabulary. */
export const STUDIO_AREA: Record<'mailer' | 'video', string> = {
  mailer: 'direct-mail',
  video: 'video-studio',
};

// Token-folded (apostrophes dropped, plural-s folded) so a spoken "mom" reaches a world titled
// "Mom's Real Estate Marketing" — the same fold that fixed the possessive-title miss elsewhere.
const fold = (s: string): string[] =>
  s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map((t) => t.replace(/s$/, ''));

/**
 * Resolve the world NAME the commander said against the titles the dock actually has. Exact wins;
 * otherwise a token-subset match either way. No match returns null — the dock then says what
 * exists rather than opening the wrong business.
 */
export function matchWorldTitle(said: string, titles: string[]): string | null {
  const want = said.trim();
  if (!want) return null;
  const exact = titles.find((t) => t.toLowerCase() === want.toLowerCase());
  if (exact) return exact;
  const st = fold(want);
  if (!st.length) return null;
  return titles.find((t) => {
    const wt = fold(t);
    return wt.length > 0 && (st.every((x) => wt.includes(x)) || wt.every((x) => st.includes(x)));
  }) ?? null;
}

/**
 * Should the deep brain even be asked? It costs a real model call with real context, so it runs
 * only where the cheap tiers already gave up — never as a first resort, and never for a sentence
 * too short to carry an intent (a stray keystroke must not spend credits).
 */
export function worthAsking(sentence: string): boolean {
  const t = sentence.trim();
  return t.length >= 4 && /[a-z]/i.test(t);
}
