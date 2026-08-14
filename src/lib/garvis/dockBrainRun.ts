// src/lib/garvis/dockBrainRun.ts
// THE DEEP BRAIN, DOCK-SIDE — impure half (pure core + contract: dockBrain.ts).
//
// The corner concierge's last tier used to be a 250-token router that saw three things: the
// sentence, the URL, and a list of task labels. The good brain — the one that reads the mind
// record, the live situation, the operator's goals and their own retrieved knowledge — only ran
// on /garvis/command. This makes that same brain the dock's fallback, everywhere.
//
// Two rules hold the whole thing honest:
//   1. The commander DECIDES; the dock ACTS (see dockBrain.ts). Nothing here navigates or runs.
//   2. Fail-soft to null. A missing key, a dead network, an unreadable reply — any of them just
//      means the dock uses the router it always had. The deep brain is an upgrade, never a
//      dependency.

import { rawComplete } from '../aiClient';
import { supabase } from '../supabase';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from './commander';
import { dockActionFor, worthAsking, type DockAction } from './dockBrain';
import { loadMindRecordContext } from './mindContextRun';
import { goalsDigest } from './goalsRun';
import { retrieveForPrompt } from './ask';
import { assembleSituation } from './situationRun';

export interface DockBrainInput {
  sentence: string;
  /** Recent dock turns, oldest first — the commander windows this itself. */
  history?: { role: 'user' | 'garvis'; text: string }[];
  /** The dock's own world titles, so 'open' names a business that actually exists. */
  worlds?: { title: string }[];
  /** When one of the operator's apps is the subject, its digest rides along. */
  projectId?: string | null;
}

// The dock is a corner widget the operator hits all day — the context is deliberately tighter
// than the full command page's. Enough to be grounded, not enough to make every stray question
// expensive.
const MIND_BUDGET = 2_500;
const PROJECT_BUDGET = 8_000;
const MAX_TOKENS = 1_000;

/** Never let one dead probe sink the call: a rejecting assembler contributes nothing. */
const soft = (p: Promise<string>): Promise<string> => p.catch(() => '');

interface SnapshotApp { name: string; stage: string | null; description: string | null }

// Supabase query builders are PromiseLike, not Promise — no .catch to hang a fallback on, so the
// await happens inside a try instead.
async function listApps(): Promise<SnapshotApp[]> {
  try {
    const { data } = await supabase.from('apps')
      .select('name, stage, description')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(40);
    return (data ?? []) as SnapshotApp[];
  } catch { return []; }
}

async function portfolioSnapshot(worlds: { title: string }[]): Promise<string> {
  const apps = await listApps();
  const lines = apps.map((a) => `- ${a.name}${a.stage ? ` (${a.stage})` : ''}: ${a.description ?? 'no description'}`);
  // The businesses ride in the same block: 'open' must name a real world, and the dock resolves
  // that name against this exact list a moment later.
  if (worlds.length) {
    lines.push('', 'BUSINESSES (worlds):', ...worlds.map((w) => `- ${w.title}`));
  }
  return lines.join('\n');
}

/**
 * Ask the deep brain what the sentence IS, and translate its answer into something the dock can
 * do. Returns null when the brain can't be reached or isn't worth asking — the caller then falls
 * back to its own router. Never navigates, never runs work.
 */
export async function askCommander(input: DockBrainInput): Promise<DockAction | null> {
  const sentence = input.sentence.trim();
  if (!worthAsking(sentence)) return null;
  try {
    const [mind, situation, goals, knowledge, project] = await Promise.all([
      soft(loadMindRecordContext({ budgetChars: MIND_BUDGET })),
      soft(assembleSituation()),
      soft(goalsDigest()),
      soft(retrieveForPrompt(sentence)),
      input.projectId
        ? import('./projectDigestRun')
          .then((m) => m.loadProjectDigest(input.projectId as string))
          .then((d) => (d?.context ?? '').slice(0, PROJECT_BUDGET))
          .catch(() => '')
        : Promise.resolve(''),
    ]);
    const context = [mind, situation, goals, knowledge, project].filter(Boolean).join('\n\n');
    const snapshot = await portfolioSnapshot(input.worlds ?? []);

    const r = await rawComplete([
      { role: 'system', content: COMMANDER_SYSTEM },
      { role: 'user', content: buildCommanderUser(sentence, snapshot, input.history ?? [], context) },
    ], MAX_TOKENS);
    if (!r?.text?.trim()) return null;
    return dockActionFor(parseCommand(r.text));
  } catch {
    return null;   // the dock's own router takes it from here
  }
}
