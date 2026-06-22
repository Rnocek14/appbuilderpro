// src/hooks/usePortfolio.ts
// Data hook for the Garvis portfolio layer: the owner's real products, their rollups, and a
// one-time seed of the known repos. Mirrors useProjects' shape (refresh + mutations).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { PortfolioApp } from '../types';
import { PORTFOLIO_SEED } from '../data/portfolioSeed';

export function usePortfolio() {
  const { session } = useAuth();
  const [apps, setApps] = useState<PortfolioApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('apps')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    setApps((data as PortfolioApp[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: reflect portfolio changes (or another tab's seed) instantly.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('garvis-apps')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apps' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  /** Insert the known repos once. No-op if the portfolio is non-empty. Returns rows created. */
  const seedPortfolio = async (): Promise<number> => {
    if (!session || apps.length > 0) return 0;
    setSeeding(true);
    try {
      const rows = PORTFOLIO_SEED.map((s) => ({
        owner_id: session.user.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        repo_url: s.repo_url,
        stage: s.stage,
        tags: s.tags,
      }));
      // ignoreDuplicates so a re-seed can't trip the (owner_id, slug) unique constraint.
      const { error } = await supabase.from('apps').upsert(rows, { onConflict: 'owner_id,slug', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      await refresh();
      return rows.length;
    } finally {
      setSeeding(false);
    }
  };

  const addApp = async (name: string): Promise<PortfolioApp | null> => {
    if (!session) return null;
    const { data, error } = await supabase
      .from('apps')
      .insert({ owner_id: session.user.id, name })
      .select().single();
    if (error) throw new Error(error.message);
    await refresh();
    return data as PortfolioApp;
  };

  const updateApp = async (id: string, patch: Partial<PortfolioApp>) => {
    await supabase.from('apps').update(patch).eq('id', id);
    await refresh();
  };

  const deleteApp = async (id: string) => {
    await supabase.from('apps').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await refresh();
  };

  const rollup = useMemo(() => {
    const active = apps.filter((a) => !a.archived);
    return {
      total: active.length,
      live: active.filter((a) => a.stage === 'launched' || a.stage === 'growing').length,
      building: active.filter((a) => a.stage === 'building').length,
      mrr: active.reduce((s, a) => s + Number(a.monthly_revenue ?? 0), 0),
    };
  }, [apps]);

  return { apps, loading, seeding, refresh, seedPortfolio, addApp, updateApp, deleteApp, rollup };
}
