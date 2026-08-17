// src/lib/garvis/crossVentureRun.ts
// Impure half of the cross-venture engine (pure core: crossVenture.ts): assemble each world's
// channel table through the SAME assembleChannels the adaptive read uses — one substrate, so a
// transfer recommendation can never disagree with a world's own numbers — and return the one
// move (or null). Bounded: the most recent worlds only; fail-soft per world (a broken world
// contributes nothing, never a guess).

import { supabase } from '../supabase';
import { assembleChannels } from './adaptiveRun';
import { crossVentureMove, type TransferMove, type VentureIn } from './crossVenture';

const MAX_WORLDS = 6;

export async function loadCrossVentureMove(): Promise<TransferMove | null> {
  const { data: worldRows } = await supabase.from('knowledge_worlds')
    .select('id, title').order('updated_at', { ascending: false }).limit(MAX_WORLDS);
  const worlds = (worldRows ?? []) as { id: string; title: string }[];
  if (worlds.length < 2) return null; // a single-world portfolio has no other venture to learn from

  const ventures: VentureIn[] = [];
  for (const w of worlds) {
    try {
      const { channels } = await assembleChannels(w.id);
      ventures.push({ worldId: w.id, worldTitle: w.title, channels });
    } catch { /* a broken world contributes nothing */ }
  }
  return crossVentureMove(ventures);
}
