// src/lib/garvis/currents.ts
// "Your currents" — Garvis quietly learns how YOU drift. Every time you choose a kind of next-dive
// (dig deeper / a question / a surprising tangent), we tally it. Those tendencies then bias which
// directions glow brightest — so over time the rabbit hole bends toward how your mind actually moves.
// Local, tiny, privacy-respecting (localStorage only).

import type { LeadKind } from './clustering';

const KEY = 'ff:currents:v1';

function read(): Partial<Record<LeadKind, number>> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Record<LeadKind, number>>; }
  catch { return {}; }
}

export function recordPick(kind: LeadKind): void {
  try { const w = read(); w[kind] = (w[kind] ?? 0) + 1; localStorage.setItem(KEY, JSON.stringify(w)); }
  catch { /* ignore */ }
}

/** Normalized 0..1 weight per lead kind (how much YOU tend toward each). Even split before any data. */
export function kindBias(): Record<LeadKind, number> {
  const w = read();
  const d = w.dig ?? 0, q = w.question ?? 0, t = w.tangent ?? 0;
  const total = d + q + t;
  if (total < 3) return { dig: 0.34, question: 0.33, tangent: 0.33 }; // not enough signal yet
  return { dig: d / total, question: q / total, tangent: t / total };
}
