// src/lib/garvis/dockPresence.ts
// WHEN THE DOCK IS A GUEST — pure core (verified by dockPresence.verify.ts).
//
// The corner concierge is on every page, which is the point: Garvis is everywhere. But two
// surfaces already have a conversation of their own, and walking into them with a second one
// was worse than useless:
//
//   · THE COMMAND PAGE renders the very same transcript the dock now shares with it. The
//     operator saw one conversation twice on one screen — the page's copy, and the corner's.
//   · THE PROJECT WORKSPACE has the builder chat, which edits that app's code. Two chat boxes,
//     and the dock sat on top of the preview error and its "Fix with AI" button.
//
// The answer is not to delete either one — they do different jobs, and the dock is the only
// thing that can take you out of a project and across the whole operation. The answer is that
// THE DOCK DEFERS. It stays available everywhere and stops competing where it is a guest.

export interface Deference {
  /** The page renders this SAME conversation. The dock drops its scrollback — one copy is enough. */
  ownsThread: boolean;
  /** The page has a conversation of its own. The dock starts collapsed, one click from open. */
  ownsChat: boolean;
}

const NONE: Deference = { ownsThread: false, ownsChat: false };

/**
 * How much room the dock should give the page under it. Path-based on purpose: this is a fact
 * about the app's own surfaces, and a page cannot forget to declare it.
 */
export function dockDeference(pathname: string): Deference {
  const p = (pathname || '').replace(/\/+$/, '').toLowerCase() || '/';
  // Home / the command page — the conversation IS the page.
  if (p === '/garvis/command') return { ownsThread: true, ownsChat: false };
  // A builder project — its chat is a different conversation about that app's code.
  if (/^\/project\/[^/]+/.test(p)) return { ownsThread: false, ownsChat: true };
  return NONE;
}

/**
 * Should the dock open on arrival? It remembers how the operator left it — except on a page with
 * its own chat, where arriving to two open conversations is the thing being fixed.
 *
 * Unless the dock is the reason they are here. "Work on jims site" routes INTO the project and
 * the dock stays to walk them through the steps; collapsing on arrival would drop the guide it
 * just started, mid-sentence. Deference is about walking in on someone, not about being escorted.
 */
export function opensOnArrival(remembered: boolean, d: Deference, escorting = false): boolean {
  if (escorting) return true;
  return remembered && !d.ownsChat;
}

/** Should the dock render its scrollback? Not where the page is already showing it. */
export function showsScrollback(turns: number, d: Deference): boolean {
  return turns > 0 && !d.ownsThread;
}
