// src/lib/garvis/surfaceBridge.ts
// THE SURFACE BRIDGE — how the concierge acts ON the page instead of navigating away. A working
// surface (a creative board room, the builder workspace) registers itself while mounted; the
// dock offers each sentence to the active surface FIRST, and a claimed ask runs right there
// ("make one with a lake background" makes it on the open board). Module-level singleton on
// purpose: the dock remounts per page (AppShell), the registration must survive that. Only one
// surface is ever active — boards and the builder are exclusive full-screen rooms.
// The claim/parse logic is pure and verified (concierge.ts: parseBoardCommand/parseBuilderCommand);
// this file is only the wire.

import type { SurfaceAsk } from './concierge';
import type { SurfaceSuggestion } from './suggestionDeck';

export interface Surface {
  id: string;
  /** Pure claim test — null means "not mine", and the sentence flows to the normal tiers. */
  claims: (sentence: string) => SurfaceAsk | null;
  /** Act on a claimed ask. Returns the short confirmation line the dock shows (and speaks). */
  handle: (cmd: SurfaceAsk) => string;
  /** Tap-to-do next moves for THIS surface right now (suggestionDeck). Optional — a surface
   *  without a deck just shows no chips. Read fresh on every call, so state gating is live. */
  suggest?: () => SurfaceSuggestion[];
}

let active: Surface | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) { try { l(); } catch { /* a dead listener never blocks the rest */ } } };

/** Subscribe to surface register/unregister (the dock re-reads its chips on change). */
export function onSurfaceChange(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Register the mounted surface; returns the unregister for the effect cleanup. */
export function registerSurface(s: Surface): () => void {
  active = s;
  emit();
  return () => { if (active === s) { active = null; emit(); } };
}

/** The dock's entry: offer a sentence to the active surface. Null = nothing mounted or not
 *  claimed — the sentence continues through the normal tiers. A throwing handler also yields
 *  null, so a surface bug degrades to ordinary routing, never a dead dock. */
export function offerToSurface(sentence: string): string | null {
  if (!active) return null;
  try {
    const cmd = active.claims(sentence);
    return cmd ? active.handle(cmd) : null;
  } catch {
    return null;
  }
}

/** The active surface's next-move chips (empty when nothing is mounted or it has no deck). */
export function surfaceSuggestions(): SurfaceSuggestion[] {
  try { return active?.suggest?.() ?? []; } catch { return []; }
}

/** Run a tapped chip through the active surface. Same degradation rule as offerToSurface. */
export function applySuggestion(s: SurfaceSuggestion): string | null {
  if (!active) return null;
  try { return active.handle(s.cmd); } catch { return null; }
}
