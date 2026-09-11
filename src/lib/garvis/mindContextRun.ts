// One impure loader for the owned reasoning record. Surfaces should not invent their own partial
// selections of identity, beliefs, decisions, and events; they ask this service for the same
// compiled, budgeted contract and may combine it with scope-specific facts.

import { supabase } from '../supabase';
import type { MindBelief, MindDecision, MindEvent, MindIdentityDoc } from '../../types';
import { compileMindContext, compileMindParts, type MindContextInput } from './mind';

const scopeFilter = (appId: string) => `app_id.eq.${appId},app_id.is.null`;

async function loadMindInputs(opts: { appId?: string | null } = {}): Promise<Omit<MindContextInput, 'budgetChars' | 'now'> | null> {
  try {
    let decisionsQ = supabase.from('mind_decisions').select('*').order('decided_at', { ascending: false }).limit(30);
    let eventsQ = supabase.from('mind_events').select('*').order('occurred_at', { ascending: false }).limit(80);
    if (opts.appId) {
      decisionsQ = decisionsQ.or(scopeFilter(opts.appId));
      eventsQ = eventsQ.or(scopeFilter(opts.appId));
    }
    const [identity, beliefs, decisions, events] = await Promise.all([
      supabase.from('mind_identity').select('*'),
      supabase.from('mind_beliefs').select('*').eq('status', 'active').order('updated_at', { ascending: false }).limit(30),
      decisionsQ,
      eventsQ,
    ]);
    if (identity.error || beliefs.error || decisions.error || events.error) return null;
    return {
      identity: (identity.data as MindIdentityDoc[]) ?? [],
      beliefs: (beliefs.data as MindBelief[]) ?? [],
      decisions: (decisions.data as MindDecision[]) ?? [],
      events: (events.data as MindEvent[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function loadMindRecordContext(opts: { appId?: string | null; budgetChars?: number } = {}): Promise<string> {
  const inputs = await loadMindInputs(opts);
  return inputs ? compileMindContext({ ...inputs, budgetChars: opts.budgetChars }) : '';
}

/** The cache-split record (SW2.3): stable (identity + beliefs) for the cached system position,
 *  volatile (open decisions + recent events) for the user turn. Fail-soft to empty strings. */
export async function loadMindRecordParts(opts: { appId?: string | null; stableBudget?: number; volatileBudget?: number } = {}): Promise<{ stable: string; volatile: string }> {
  const inputs = await loadMindInputs(opts);
  return inputs
    ? compileMindParts({ ...inputs, stableBudget: opts.stableBudget, volatileBudget: opts.volatileBudget })
    : { stable: '', volatile: '' };
}
