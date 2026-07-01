// src/hooks/useGarvisKnowledge.ts
// Data hook for the Garvis knowledge ("Learn") layer: the owner's proposed/approved decisions,
// outcomes, and lessons, plus the approval actions. Mirrors usePortfolio's shape (refresh + realtime).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { GarvisKnowledge } from '../types';

export function useGarvisKnowledge() {
  const { session } = useAuth();
  const [rows, setRows] = useState<GarvisKnowledge[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('garvis_knowledge')
      .select('*')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false });
    setRows((data as GarvisKnowledge[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: a proposal written by a Garvis act-run shows up in the approval panel instantly.
  useEffect(() => {
    if (!session) return;
    // Unique topic per mount — a fixed topic name collides across StrictMode's double-mount
    // (removeChannel is async) or multiple consumers, which makes realtime-js throw
    // "cannot add postgres_changes callbacks for realtime:<topic>".
    const channel = supabase
      .channel(`garvis-knowledge-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_knowledge' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const approve = async (id: string) => {
    if (!session) return;
    await supabase
      .from('garvis_knowledge')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: session.user.id })
      .eq('id', id);
    await refresh();
  };

  const reject = async (id: string) => {
    await supabase.from('garvis_knowledge').update({ status: 'rejected' }).eq('id', id);
    await refresh();
  };

  /**
   * Log a real-world outcome the user observed (e.g. the result of publishing a drafted post). Written
   * as APPROVED immediately — it's human-authored, so it's trusted and feeds the next run's context.
   * run_id links it to the act-run that produced the content (provenance).
   */
  const logOutcome = async (o: { title: string; body: string; appId?: string | null; runId?: string | null; confidence?: number | null }) => {
    if (!session) return;
    await supabase.from('garvis_knowledge').insert({
      owner_id: session.user.id,
      app_id: o.appId ?? null,
      run_id: o.runId ?? null,
      kind: 'outcome',
      title: o.title,
      body: o.body,
      source: 'user',
      confidence: o.confidence ?? null,
      status: 'approved',
    });
    await refresh();
  };

  const proposed = useMemo(() => rows.filter((r) => r.status === 'proposed'), [rows]);
  const approved = useMemo(() => rows.filter((r) => r.status === 'approved'), [rows]);

  return { proposed, approved, loading, refresh, approve, reject, logOutcome };
}
