// src/lib/garvis/loops.ts
// THE OPEN-LOOP LEDGER — the questions Garvis has named but the user hasn't chased yet. Verified
// science (rabbit-hole doctrine): an unanswered named gap is an aversive itch that keeps pulling
// (information-gap theory), a question whose answer would close SEVERAL open loops at once is the
// strongest lure there is (the epiphany factor), and once a loop closes it must retire — answered
// questions fall BELOW their prior interest (belief resolution effect).
//
// Pure halves (add/close/count — tested in loops.verify.ts) + a thin localStorage wrapper keyed per
// world. Persisting into knowledge_worlds.mind is the cloud upgrade (column already exists, app_0018).

import { titleSimilarity } from './clustering';

export interface OpenLoop {
  id: string;
  text: string;           // the named gap, question-phrased
  fromClusterId: string;  // where it was raised (the ember sits near this node)
  createdAt: string;
}

const DUP_SIM = 0.6;    // same question reworded → don't stack duplicate embers
const CLOSE_SIM = 0.45; // a dive whose title matches this well closes the loop
const EPIPHANY_SIM = 0.3; // looser: a current merely TOUCHING a loop counts toward an epiphany
const MAX_LOOPS = 12;   // embers are an itch, not a backlog

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/** Add a loop unless an equivalent one is already open. Newest first, capped. */
export function addLoopPure(loops: OpenLoop[], loop: OpenLoop): OpenLoop[] {
  if (!loop.text.trim()) return loops;
  if (loops.some((l) => titleSimilarity(l.text, loop.text) >= DUP_SIM)) return loops;
  return [loop, ...loops].slice(0, MAX_LOOPS);
}

/** Retire every loop this title answers (belief resolution: closed questions leave the stage). */
export function closeLoopsPure(loops: OpenLoop[], title: string): { kept: OpenLoop[]; closed: OpenLoop[] } {
  const kept: OpenLoop[] = [];
  const closed: OpenLoop[] = [];
  for (const l of loops) (titleSimilarity(l.text, title) >= CLOSE_SIM ? closed : kept).push(l);
  return { kept, closed };
}

/** How many open loops this current would touch — ≥2 makes it an EPIPHANY lure. */
export function epiphanyCount(label: string, loops: OpenLoop[]): number {
  return loops.filter((l) => titleSimilarity(l.text, label) >= EPIPHANY_SIM).length;
}

// ---------------------------------------------------------------------------
// Storage (localStorage per world; fail-silent like the rest of the spike)
// ---------------------------------------------------------------------------

const KEY = 'ff:loops:v1';

function readAll(): Record<string, OpenLoop[]> {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, OpenLoop[]>) : {};
    return all && typeof all === 'object' ? all : {};
  } catch { return {}; }
}

function writeAll(all: Record<string, OpenLoop[]>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

export function readLoops(worldKey: string): OpenLoop[] {
  const l = readAll()[worldKey];
  return Array.isArray(l) ? l : [];
}

export function writeLoops(worldKey: string, loops: OpenLoop[]): void {
  const all = readAll();
  all[worldKey] = loops;
  writeAll(all);
}

/** Follow the world when its id changes (first cloud push assigns the server uuid). */
export function migrateLoops(oldKey: string, newKey: string): void {
  if (!oldKey || oldKey === newKey) return;
  const all = readAll();
  if (all[oldKey]) {
    all[newKey] = all[oldKey];
    delete all[oldKey];
    writeAll(all);
  }
}

export function newLoop(text: string, fromClusterId: string): OpenLoop {
  return { id: `l_${Math.random().toString(36).slice(2, 9)}`, text: text.trim(), fromClusterId, createdAt: new Date().toISOString() };
}
