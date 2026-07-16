// src/lib/garvis/boardCopyRun.ts
// Impure half of the board-copy seam: invoke the metered `board-copy` edge function that turns a typed
// idea (or a rendition instruction) into real copy for a board tile. The honesty rules live in the
// edge function's system prompt (facts from materials only, [EDIT: …] holes for unknowns, merge fields
// preserved). Degrades honestly: when the provider key isn't set the seam says so ONCE and every board
// falls back to its deterministic templates — no spinner theater, no repeated failed calls.

import { supabase } from '../supabase';

export type CopyChannel = 'postcard' | 'social' | 'email' | 'idea';

export interface BoardCopyArgs {
  channel: CopyChannel;
  mode: 'make' | 'rendition';
  instruction: string;                       // the typed idea, or the rendition instruction
  kindLabel?: string | null;
  platform?: string | null;                  // social only
  materials: Record<string, unknown>;        // the ONLY facts the model may use
  current?: Record<string, unknown> | null;  // rendition: the piece being revised
}

export type BoardCopyResult =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; available: false }          // no key — caller uses its deterministic path silently
  | { ok: false; available: true; error: string };

// Remember "no key" for the session so rapid makes don't re-ask the server every time.
let copyUnavailable = false;

export async function generateBoardCopy(args: BoardCopyArgs): Promise<BoardCopyResult> {
  if (copyUnavailable) return { ok: false, available: false };
  try {
    const { data, error } = await supabase.functions.invoke('board-copy', {
      body: {
        channel: args.channel, mode: args.mode, instruction: args.instruction,
        kindLabel: args.kindLabel ?? null, platform: args.platform ?? null,
        materials: args.materials, current: args.current ?? null,
      },
    });
    if (error) return { ok: false, available: true, error: error.message };
    const d = data as { available?: boolean; ok?: boolean; fields?: Record<string, unknown>; error?: string };
    if (d?.available === false) { copyUnavailable = true; return { ok: false, available: false }; }
    if (d?.ok && d.fields && typeof d.fields === 'object') return { ok: true, fields: d.fields };
    return { ok: false, available: true, error: d?.error || 'The copy seam returned nothing.' };
  } catch (e) {
    return { ok: false, available: true, error: e instanceof Error ? e.message : 'board-copy failed' };
  }
}

/** Test/dev hook: forget a cached "unavailable" verdict (e.g. after the operator adds a key). */
export function resetBoardCopyAvailability(): void { copyUnavailable = false; }

// A typed idea must never vanish silently: when the seam ERRORS (network, server) the boards fall
// back to templates — this tells the user their words went nowhere, once per session, not per Make.
// ("available: false" stays silent by design: the banner already explains that AI is off.)
let missExplained = false;
export function explainCopyMiss(r: BoardCopyResult, toast: (k: 'info' | 'error', m: string) => void): void {
  if (r.ok || r.available === false || missExplained) return;
  missExplained = true;
  toast('info', 'The AI writer couldn’t be reached, so this used the starter template instead of your words. It will retry on your next Make.');
}
