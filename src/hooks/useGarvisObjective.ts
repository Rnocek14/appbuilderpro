// src/hooks/useGarvisObjective.ts
// Data hook for the Garvis objective layer: goals, the owner's constraints (single row), and the
// capability registry — plus the management/approval mutations. Mirrors usePortfolio/useGarvisKnowledge
// (refresh + realtime + owner-scoped writes).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CAPABILITY_SEED } from '../data/capabilitySeed';
import type { GarvisCapability, GarvisConstraints, GarvisGoal, GoalStatus } from '../types';

export function useGarvisObjective() {
  const { session } = useAuth();
  const [goals, setGoals] = useState<GarvisGoal[]>([]);
  const [constraints, setConstraints] = useState<GarvisConstraints | null>(null);
  const [capabilities, setCapabilities] = useState<GarvisCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    const [g, c, caps] = await Promise.all([
      supabase.from('garvis_goals').select('*').neq('status', 'abandoned').order('priority', { ascending: true }),
      supabase.from('garvis_constraints').select('*').maybeSingle(),
      supabase.from('garvis_capabilities').select('*').neq('status', 'retired').order('name', { ascending: true }),
    ]);
    setGoals((g.data as GarvisGoal[]) ?? []);
    setConstraints((c.data as GarvisConstraints) ?? null);
    setCapabilities((caps.data as GarvisCapability[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`garvis-objective-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_goals' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_constraints' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_capabilities' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  // ---- goals ----
  const addGoal = async (patch: Partial<GarvisGoal>) => {
    if (!session || !patch.title) return;
    await supabase.from('garvis_goals').insert({
      owner_id: session.user.id,
      title: patch.title,
      description: patch.description ?? null,
      priority: patch.priority ?? 3,
      success_metric: patch.success_metric ?? null,
      target_date: patch.target_date ?? null,
      app_id: patch.app_id ?? null,
      status: 'active', // user-authored goals are committed immediately
    });
    await refresh();
  };
  const updateGoalStatus = async (id: string, status: GoalStatus) => {
    await supabase.from('garvis_goals').update({ status }).eq('id', id);
    await refresh();
  };
  const approveGoal = (id: string) => updateGoalStatus(id, 'active');
  const rejectGoal = (id: string) => updateGoalStatus(id, 'abandoned');

  // ---- constraints (single row, upsert on owner_id) ----
  const saveConstraints = async (patch: Partial<GarvisConstraints>) => {
    if (!session) return;
    await supabase.from('garvis_constraints').upsert(
      { owner_id: session.user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'owner_id' },
    );
    await refresh();
  };

  // ---- capabilities ----
  const addCapability = async (patch: Partial<GarvisCapability>) => {
    if (!session || !patch.name || !patch.description) return;
    await supabase.from('garvis_capabilities').insert({
      owner_id: session.user.id,
      app_id: patch.app_id ?? null,
      name: patch.name,
      description: patch.description,
      safety_level: patch.safety_level ?? 'read_only',
      approval_required: patch.approval_required ?? true,
      maturity: patch.maturity ?? 'stub',
      status: 'approved', // user-authored = approved
    });
    await refresh();
  };
  const approveCapability = async (id: string) => {
    await supabase.from('garvis_capabilities').update({ status: 'approved' }).eq('id', id);
    await refresh();
  };
  const retireCapability = async (id: string) => {
    await supabase.from('garvis_capabilities').update({ status: 'retired' }).eq('id', id);
    await refresh();
  };

  /** Seed the curated capability baseline, resolving app_slug → app_id. Idempotent (ignoreDuplicates). */
  const seedCapabilities = async (): Promise<number> => {
    if (!session) return 0;
    setSeeding(true);
    try {
      const { data: apps } = await supabase.from('apps').select('id, slug').is('deleted_at', null);
      const idBySlug: Record<string, string> = {};
      for (const a of (apps as { id: string; slug: string | null }[] | null) ?? []) {
        if (a.slug) idBySlug[a.slug] = a.id;
      }
      // Skip rows whose app isn't in the portfolio (slug unresolved); Garvis-native (null slug) always seeds.
      const rows = CAPABILITY_SEED
        .filter((s) => s.app_slug === null || idBySlug[s.app_slug])
        .map((s) => ({
          owner_id: session.user.id,
          app_id: s.app_slug ? idBySlug[s.app_slug] : null,
          name: s.name,
          description: s.description,
          safety_level: s.safety_level,
          maturity: s.maturity,
          approval_required: s.approval_required,
          status: 'approved' as const,
        }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from('garvis_capabilities').upsert(rows, { onConflict: 'owner_id,app_id,name', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      await refresh();
      return rows.length;
    } finally {
      setSeeding(false);
    }
  };

  const proposedGoals = useMemo(() => goals.filter((g) => g.status === 'proposed'), [goals]);
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals]);
  const proposedCapabilities = useMemo(() => capabilities.filter((c) => c.status === 'proposed'), [capabilities]);
  const approvedCapabilities = useMemo(() => capabilities.filter((c) => c.status === 'approved'), [capabilities]);

  return {
    goals, activeGoals, proposedGoals, constraints, capabilities, approvedCapabilities, proposedCapabilities,
    loading, seeding, refresh,
    addGoal, updateGoalStatus, approveGoal, rejectGoal, saveConstraints,
    addCapability, approveCapability, retireCapability, seedCapabilities,
  };
}
