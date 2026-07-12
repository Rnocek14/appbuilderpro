// src/lib/garvis/gardenerRun.ts
// Impure half of the gardener: gather cluster titles across the owner's worlds — local store
// (side-effect-free peek) merged with cloud rows — and let the pure grouping decide what actually
// recurs. Fail-soft everywhere: a gardener that can't see simply says nothing.

import { supabase } from '../supabase';
import { listWorlds, peekLocalWorlds } from './universe';
import { recurringThreads, type GardenClusterIn, type RecurringThread } from './gardener';

export async function sweepRecurringThreads(): Promise<RecurringThread[]> {
  try {
    const worlds = (await listWorlds()).slice(0, 12); // most recent — the living edge of the universe
    if (worlds.length < 2) return []; // recurrence needs at least two worlds to exist
    const keep = new Set(worlds.map((w) => w.id));
    const rows: GardenClusterIn[] = [];

    const local = new Set<string>();
    for (const u of peekLocalWorlds()) {
      if (!keep.has(u.id)) continue;
      local.add(u.id);
      for (const c of u.graph.clusters) rows.push({ worldId: u.id, worldTitle: u.title, title: c.title, kind: c.kind });
    }

    const remote = worlds.filter((w) => !local.has(w.id) && w.remote);
    if (remote.length) {
      const titleBy = new Map(remote.map((w) => [w.id, w.title]));
      const { data } = await supabase.from('knowledge_clusters')
        .select('world_id, title, kind').in('world_id', remote.map((w) => w.id)).limit(800);
      for (const r of data ?? []) {
        rows.push({
          worldId: r.world_id as string,
          worldTitle: titleBy.get(r.world_id as string) ?? 'A world',
          title: (r.title as string) ?? '',
          kind: (r.kind as string) ?? 'topic',
        });
      }
    }

    return recurringThreads(rows);
  } catch {
    return []; // no sweep is better than a wrong one
  }
}
