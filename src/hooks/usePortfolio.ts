// src/hooks/usePortfolio.ts
// Data hook for the Garvis portfolio layer: the owner's real products, their rollups, and a
// one-time seed of the known repos. Mirrors useProjects' shape (refresh + mutations).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { AppStage, PortfolioApp } from '../types';
import { PORTFOLIO_SEED } from '../data/portfolioSeed';
import { fetchRepoState, listUserRepos } from '../lib/garvis/github';

export interface GitHubSyncResult { synced: number; updated: number; failed: { name: string; error: string }[] }
export interface DiscoverResult { found: number; added: number }

export function usePortfolio() {
  const { session } = useAuth();
  const [apps, setApps] = useState<PortfolioApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('apps')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      setApps((data as PortfolioApp[]) ?? []);
    } catch {
      setApps([]);   // never strand the spinner on a network rejection
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: reflect portfolio changes (or another tab's seed) instantly.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`garvis-apps-${crypto.randomUUID()}`)
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

  /**
   * Auto-discover the portfolio straight from the GitHub account — every owned, non-fork repo —
   * and upsert them as apps. ignoreDuplicates keeps any curated rows (matched on owner_id,slug)
   * untouched; only genuinely new repos are added. This is what makes Garvis populate itself
   * instead of asking the user to seed by hand. Returns how many repos were found vs newly added.
   */
  const discoverFromGitHub = async (username?: string): Promise<DiscoverResult> => {
    if (!session) return { found: 0, added: 0 };
    setSeeding(true);
    try {
      const repos = await listUserRepos(username);
      if (repos.length === 0) return { found: 0, added: 0 };
      const known = new Set(apps.map((a) => a.slug));
      const rows = repos.map((r) => ({
        owner_id: session.user.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        repo_url: r.repo_url,
        deploy_url: r.deploy_url,
        stage: r.stage,
        tags: r.tags,
      }));
      const { error } = await supabase.from('apps').upsert(rows, { onConflict: 'owner_id,slug', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      await refresh();
      return { found: repos.length, added: rows.filter((r) => !known.has(r.slug)).length };
    } finally {
      setSeeding(false);
    }
  };

  /**
   * Read each app's GitHub repo (read-only) and backfill ONLY empty fields — description and
   * deploy_url — plus flip stage→archived when the repo is archived. Curated values are never
   * overwritten. The brain reads richer/live repo state (commits, issues) on demand via the
   * get_repo_state tool; this just makes the persisted dashboard reflect reality.
   */
  const syncFromGitHub = async (): Promise<GitHubSyncResult> => {
    if (!session) return { synced: 0, updated: 0, failed: [] };
    setSyncing(true);
    const result: GitHubSyncResult = { synced: 0, updated: 0, failed: [] };
    try {
      const withRepos = apps.filter((a) => a.repo_url);
      for (const app of withRepos) {
        try {
          const state = await fetchRepoState(app.repo_url!);
          result.synced++;
          const patch: Partial<PortfolioApp> = {};
          if (!app.description && state.description) patch.description = state.description;
          if (!app.deploy_url && state.homepage) patch.deploy_url = state.homepage;
          if (state.archived && app.stage !== 'archived') patch.stage = 'archived' as AppStage;
          if (Object.keys(patch).length > 0) {
            await supabase.from('apps').update(patch).eq('id', app.id);
            result.updated++;
          }
        } catch (e) {
          result.failed.push({ name: app.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (result.updated > 0) await refresh();
      return result;
    } finally {
      setSyncing(false);
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

  return { apps, loading, seeding, syncing, refresh, seedPortfolio, discoverFromGitHub, syncFromGitHub, addApp, updateApp, deleteApp, rollup };
}
