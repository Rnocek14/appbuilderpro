// src/lib/garvis/mindStore.ts
// Thin supabase seam for the intelligence core. All logic lives in mind.ts (pure, verified);
// this file only moves rows. recordMindEvent is deliberately fire-and-forget-safe: emitting an
// event must NEVER break the flow that emitted it — a lost event is a data gap, a thrown error
// mid-run is a broken product.

import { supabase } from '../supabase';
import type { MindEventInput } from './mind';
import { normalizeMindEvent } from './mind';

/**
 * Append one event to the record. Invalid events (unknown type, empty subject) are dropped with a
 * console warning; DB errors are swallowed the same way. Returns the new event id, or null.
 */
export async function recordMindEvent(ownerId: string, input: MindEventInput): Promise<string | null> {
  const ev = normalizeMindEvent(input);
  if (!ev) {
    console.warn('[mind] dropped invalid event', input.event_type);
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('mind_events')
      .insert({ owner_id: ownerId, ...ev })
      .select('id')
      .single();
    if (error) { console.warn('[mind] event insert failed:', error.message); return null; }
    return (data as { id: string }).id;
  } catch (e) {
    console.warn('[mind] event insert threw:', e instanceof Error ? e.message : e);
    return null;
  }
}
