// src/lib/garvis/thread.ts
// ONE CONVERSATION — pure core (verified by thread.verify.ts).
//
// Garvis had two mouths and no shared memory of what it had said. The command page kept a real
// persistent transcript (command_messages, app_0048); the corner concierge showed exactly one
// line at a time and forgot it on the next keystroke. Ask the corner something, walk to the
// command page, and Garvis had never heard of it.
//
// This makes both surfaces read and write ONE record. The rules that keep it from becoming a
// junk drawer:
//   · STATUS IS NOT CONVERSATION. "Thinking…", "Compiling the plan…" are theater the corner
//     shows live and forgets. Only answers, outcomes and the operator's own words persist.
//   · THE CORNER STAYS THIN. It renders a short scrollback, not the whole history — the doctrine
//     is work first, chrome collapsed. The full transcript lives on the command page.
//   · A ROUND-TRIP IS NOT A REPEAT. A turn shown optimistically and then loaded back from the
//     database is one turn, not two.

export interface ThreadTurn {
  id: string;
  role: 'user' | 'garvis';
  text: string;
  /** ISO timestamp when the row carried one; optimistic local turns have none yet. */
  at?: string;
}

/** Rows loaded per surface. The command page renders all of them; the corner renders its tail. */
export const THREAD_WINDOW = 40;
/** How much of the conversation the corner shows. Enough to see what just happened, no more. */
export const DOCK_SCROLLBACK = 8;
/** Turns handed to the deep brain as context. Raised 6 → 16 (SW2.3): the cached stable prefix
 *  pays for the headroom, and a conversation that references "that thing from earlier" needs
 *  the earlier to still be in the window. */
export const BRAIN_WINDOW = 16;

// Live status the corner prints while it works. It is true when shown and meaningless an hour
// later, so it never reaches the record.
const TRANSIENT = [
  /^thinking/i,
  /^compiling the plan/i,
  /^revising the plan/i,
  /^reading the state of things/i,
  /^counting/i,
  /^closest matches/i,
  /^that's a multi-part ask/i,
];

/**
 * Is this line part of the conversation, or is it live status? Status lines and blanks are shown
 * and dropped; everything else — answers, honest refusals, outcomes — is kept.
 */
export function worthKeeping(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (t.length < 2) return false;
  return !TRANSIENT.some((re) => re.test(t));
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const key = (t: ThreadTurn): string => `${t.role} ${norm(t.text)}`;

/** Append a turn, keeping the window bounded and never repeating the line already at the end. */
export function appendTurn(turns: ThreadTurn[], turn: ThreadTurn, cap = THREAD_WINDOW): ThreadTurn[] {
  const last = turns[turns.length - 1];
  if (last && key(last) === key(turn)) return turns;
  const next = [...turns, turn];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * Reconcile the durable record with what a surface is holding optimistically. Remote is the
 * truth; a local turn survives only if the record doesn't already end with it — so a turn that
 * has round-tripped through the database appears once, while a genuine repeat from earlier in
 * the conversation is left alone.
 */
export function mergeThread(remote: ThreadTurn[], local: ThreadTurn[]): ThreadTurn[] {
  const ids = new Set(remote.map((t) => t.id));
  const tail = new Set(remote.slice(-DOCK_SCROLLBACK).map(key));
  const extra = local.filter((t) => !ids.has(t.id) && !tail.has(key(t)));
  return [...remote, ...extra];
}

/**
 * The cross-surface catch-up: turns in the record that this surface is not already showing.
 * Purely additive by design — a surface that already rendered a line (with its own optimistic id)
 * must never have it rewritten, because local turns carry things the row does not (a mission
 * link, a tappable next step). The cost is that a word-for-word repeat said on ANOTHER surface
 * waits for a reload rather than appearing live; the record itself keeps both.
 */
export function unseenTurns(remote: ThreadTurn[], shown: { role: 'user' | 'garvis'; text: string }[]): ThreadTurn[] {
  const seen = new Set(shown.map((s) => `${s.role} ${norm(s.text)}`));
  return remote.filter((t) => !seen.has(key(t)));
}

/** What the corner renders: the tail of the conversation, oldest first. */
export function dockScrollback(turns: ThreadTurn[], n = DOCK_SCROLLBACK): ThreadTurn[] {
  return n <= 0 ? [] : turns.slice(-n);
}

/** What the deep brain reads as recent history — shape it already expects, newest last. */
export function recentForBrain(turns: ThreadTurn[], n = BRAIN_WINDOW): { role: 'user' | 'garvis'; text: string }[] {
  return turns.slice(-n).map((t) => ({ role: t.role, text: t.text }));
}
