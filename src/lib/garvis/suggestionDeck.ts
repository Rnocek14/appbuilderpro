// src/lib/garvis/suggestionDeck.ts
// NEXT-MOVE SUGGESTIONS — the concierge's tap-to-do chips for the OPEN surface (the Lovable
// pattern, but wired to act): on the postcard board "Add a hook up top" isn't pasted text, it
// runs through the same surface bridge the spoken ask uses, so one tap DOES the move. Pure and
// deterministic; the decks are craft moves per channel, not personalization theater.
// Honesty spine: the moves ask for real things — copy seams already render unknown facts as
// [EDIT] holes, so "add a local stat" can never silently invent a number. The research chip only
// appears when the world actually HAS a research note, and it names it.

import type { SurfaceAsk } from './concierge';

export interface SurfaceSuggestion {
  label: string;        // the chip (short — it must read at a glance)
  cmd: SurfaceAsk;      // what the surface runs when tapped (same contract as a spoken ask)
}

export interface DeckState {
  /** Pieces already on the board? Riff moves point AT a piece — they only make sense then. */
  hasPieces: boolean;
  /** Titles of the world's real research notes (intel area). Empty = no research chip. */
  researchTitles?: string[];
}

const riff = (label: string, text: string): SurfaceSuggestion => ({ label, cmd: { kind: 'riff', text } });
const make = (label: string, text: string): SurfaceSuggestion => ({ label, cmd: { kind: 'make', text } });
const instruct = (label: string, text: string): SurfaceSuggestion => ({ label, cmd: { kind: 'instruct', text } });

/** Craft moves per channel, keyed by the board adapter's storageKey (plus 'builder' for the
 *  project workspace). Riff moves act on the pointed-at piece; make moves start one. */
const DECKS: Record<string, { start: SurfaceSuggestion[]; improve: SurfaceSuggestion[] }> = {
  postcard: {
    start: [
      make('Start a just-listed card', 'a just listed announcement with one strong hook'),
      make('Try a free-valuation offer', 'a free home valuation offer for the neighborhood'),
    ],
    improve: [
      riff('Add a hook up top', 'add a short attention-grabbing hook line at the top'),
      riff('Try a scenic photo', 'use a scenic lakefront photo as the background'),
      riff('Add a local stat', 'add one real local market stat that supports the message'),
      riff('One clear call-to-action', 'cut it down to one clear call-to-action'),
    ],
  },
  social: {
    start: [
      make('Start a myth-vs-fact post', 'a myth vs fact post about the local market'),
      make('Try a behind-the-scenes', 'a behind-the-scenes post from this week'),
    ],
    improve: [
      riff('Stronger first line', 'rewrite the first line as a scroll-stopping hook'),
      riff('Add a question to end', 'end with a question that invites comments'),
      riff('Tighten to 3 sentences', 'tighten the caption to three sentences'),
    ],
  },
  email: {
    start: [
      make('Start a market-update letter', 'a short market update letter for this month'),
      make('Try a win-back note', 'a warm win-back note for past clients'),
    ],
    improve: [
      riff('Sharper subject line', 'rewrite the subject line to be concrete and curiosity-driven'),
      riff('Shorter, one ask', 'shorten it and keep exactly one ask'),
      riff('Warmer opening', 'make the opening line warmer and more personal'),
    ],
  },
  brand: {
    start: [
      make('Start a wordmark concept', 'a clean wordmark concept from the palette'),
      make('Try a monogram', 'a simple monogram concept'),
    ],
    improve: [
      riff('Simplify the mark', 'simplify the mark so it reads at small sizes'),
      riff('Try it one-color', 'a one-color version that works on dark and light'),
    ],
  },
  // The merch board (t-shirts, hats) picks this up the day its adapter lands — same wire.
  merch: {
    start: [
      make('Start a front-print tee', 'a t-shirt concept with a bold front print'),
    ],
    improve: [
      riff('Small logo on front pocket', 'put a small logo on the front pocket area'),
      riff('Try a back print', 'move the main design to a large back print'),
      riff('Two colors max', 'limit the design to two colors for cheaper printing'),
    ],
  },
  builder: {
    start: [],
    improve: [
      instruct('Add a lead-capture form', 'add a lead capture form (name, email, message) that stores submissions and shows a thank-you state'),
      instruct('Automate new-lead follow-up', 'add a custom automation: when a new lead submits the form, prepare a follow-up email draft for review'),
      instruct('Add SEO basics', 'add descriptive page titles, meta descriptions, and open graph tags to every page'),
      instruct('Tighten the mobile layout', 'tighten the mobile layout: readable text sizes, tappable buttons, no horizontal scroll'),
    ],
  },
};

/** The chips for a surface right now. Boards with pieces get improve-moves (they act on the
 *  pointed-at piece) plus the research chip; empty boards get start-moves — zero-input value
 *  either way. Unknown channels get nothing (never a wrong-channel move). Capped at 4. */
export function nextMoves(channel: string, state: DeckState): SurfaceSuggestion[] {
  const deck = DECKS[channel];
  if (!deck) return [];
  const out: SurfaceSuggestion[] = [];
  if (state.hasPieces) {
    const title = state.researchTitles?.find((t) => t?.trim());
    if (title) out.push(riff(`Use the research: ${title.trim().slice(0, 28)}`, `work in the takeaways from our research note "${title.trim().slice(0, 80)}"`));
    out.push(...deck.improve);
  } else {
    out.push(...(deck.start.length ? deck.start : deck.improve));
  }
  return out.slice(0, 4);
}

/** The deck learns from the operator's OWN taps: chips they actually use rise to the front.
 *  Pure reorder — never adds, drops, or invents; ties and never-tapped chips keep deck order,
 *  so day one looks exactly like the curated deck. The tap counts live client-side only. */
export function rankMoves(moves: SurfaceSuggestion[], taps: Record<string, number>): SurfaceSuggestion[] {
  return moves
    .map((m, i) => ({ m, i, t: Math.max(0, taps[m.label] ?? 0) }))
    .sort((a, b) => (b.t - a.t) || (a.i - b.i))
    .map((x) => x.m);
}
