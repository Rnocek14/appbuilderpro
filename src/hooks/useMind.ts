// src/hooks/useMind.ts
// Data hook for the intelligence core (app_0019): the identity layer, the event log, evidence-counted
// beliefs, and the decision journal — plus `mindContext()`, the compiled digest the Commander injects
// into every conversation. Mirrors usePortfolio's shape (refresh + realtime + mutations).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { IdentitySlot, MindBelief, MindDecision, MindEvent, MindIdentityDoc } from '../types';
import type { MindEventInput } from '../lib/garvis/mind';
import { compileMindContext } from '../lib/garvis/mind';
import { recordMindEvent } from '../lib/garvis/mindStore';

const EVENT_WINDOW = 100; // recent events kept in memory; the full log stays in the DB

export function useMind() {
  const { session } = useAuth();
  const [identity, setIdentity] = useState<MindIdentityDoc[]>([]);
  const [beliefs, setBeliefs] = useState<MindBelief[]>([]);
  const [decisions, setDecisions] = useState<MindDecision[]>([]);
  const [events, setEvents] = useState<MindEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [idn, bel, dec, evt] = await Promise.all([
        supabase.from('mind_identity').select('*'),
        supabase.from('mind_beliefs').select('*').order('updated_at', { ascending: false }),
        supabase.from('mind_decisions').select('*').order('decided_at', { ascending: false }),
        supabase.from('mind_events').select('*').order('occurred_at', { ascending: false }).limit(EVENT_WINDOW),
      ]);
      setIdentity((idn.data as MindIdentityDoc[]) ?? []);
      setBeliefs((bel.data as MindBelief[]) ?? []);
      setDecisions((dec.data as MindDecision[]) ?? []);
      setEvents((evt.data as MindEvent[]) ?? []);
    } finally {
      setLoading(false); // a failed load must never leave an eternal spinner
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: watch the record grow (events stream in from every surface).
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`mind-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mind_events' }, (payload) => {
        setEvents((prev) => [payload.new as MindEvent, ...prev].slice(0, EVENT_WINDOW));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  /** Fire-and-forget event append. Never throws; a lost event must never break the emitting flow. */
  const emit = useCallback((input: MindEventInput) => {
    if (!session) return;
    void recordMindEvent(session.user.id, input);
  }, [session]);

  /** The budgeted digest for prompt injection. '' when the record is empty. */
  const mindContext = useCallback((budgetChars?: number): string =>
    compileMindContext({ identity, beliefs, decisions, events, budgetChars }),
  [identity, beliefs, decisions, events]);

  // MUTATIONS THROW ON FAILURE (system scan): these used to swallow supabase errors, so callers
  // cleared the input and told the user nothing while the row silently never landed. The mind is
  // the record — a failed write to it must be loud.
  const must = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

  /** Upsert one human-edited identity slot. */
  const saveIdentity = async (slot: IdentitySlot, content: string): Promise<void> => {
    if (!session) return;
    const { error } = await supabase.from('mind_identity').upsert(
      { owner_id: session.user.id, slot, content },
      { onConflict: 'owner_id,slot' },
    );
    must(error);
    await refresh();
  };

  /** Open a decision-journal entry (mirrored into the event log as decision_made). */
  const openDecision = async (decision: string, prediction?: string, reasoning?: string): Promise<void> => {
    if (!session) return;
    const { error } = await supabase.from('mind_decisions').insert({
      owner_id: session.user.id, decision, prediction: prediction || null, reasoning: reasoning || null,
    });
    must(error);
    emit({ event_type: 'decision_made', subject: decision, source: 'user' });
    await refresh();
  };

  /** Close a decision with what actually happened (mirrored as outcome_observed). */
  const closeDecision = async (id: string, outcome: string, hit: boolean): Promise<void> => {
    if (!session) return;
    const { error } = await supabase.from('mind_decisions')
      .update({ outcome, outcome_hit: hit, outcome_at: new Date().toISOString() })
      .eq('id', id);
    must(error);
    emit({ event_type: 'outcome_observed', subject: outcome, source: 'user' });
    await refresh();
  };

  /** Record a free-form observation from the owner. */
  const addNote = async (subject: string): Promise<void> => {
    if (!session) return;
    await recordMindEvent(session.user.id, { event_type: 'note', subject, source: 'user' });
  };

  /** Propose a belief (starts with zero evidence → renders as tentative until events back it). */
  const addBelief = async (statement: string, scope = 'portfolio'): Promise<void> => {
    if (!session) return;
    const { error } = await supabase.from('mind_beliefs').insert({ owner_id: session.user.id, statement, scope });
    must(error);
    await refresh();
  };

  /** Retire a belief (never deleted — the record keeps everything). */
  const retireBelief = async (id: string): Promise<void> => {
    const { error } = await supabase.from('mind_beliefs').update({ status: 'retired' }).eq('id', id);
    must(error);
    await refresh();
  };

  return {
    identity, beliefs, decisions, events, loading, refresh,
    emit, mindContext, saveIdentity, openDecision, closeDecision, addNote, addBelief, retireBelief,
  };
}
