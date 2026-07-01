// src/hooks/useAppProfiles.ts
// Data hook for Garvis app-intelligence profiles: load the owner's profiles, and generate a profile
// for an app by reading its repo (read-only) and distilling it with one lightweight model call.
// Mirrors usePortfolio/useGarvisObjective (refresh + realtime + mutations). Generation runs in DIRECT
// mode via rawComplete — like generateProjectMap/generateRoadmap, it needs no edge deploy.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { rawComplete } from '../lib/aiClient';
import { resolveAI } from '../lib/aiConfig';
import { fetchRepoState, fetchRepoReadme, getGitHubToken } from '../lib/garvis/github';
import { PROFILE_SYSTEM, buildProfileUser, parseProfileResponse, isProfileEmpty } from '../lib/garvis/profiles';
import type { GarvisAppProfile, PortfolioApp } from '../types';

export interface GenerateMissingResult { generated: number; failed: number }
export interface GenerateMissingOpts {
  force?: boolean;
  onProgress?: (done: number, total: number, name: string) => void;
}

export function useAppProfiles() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<GarvisAppProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('garvis_app_profiles')
      .select('*')
      .order('generated_at', { ascending: false });
    setProfiles((data as GarvisAppProfile[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`garvis-app-profiles-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_app_profiles' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const profilesByAppId = useMemo(() => {
    const m: Record<string, GarvisAppProfile> = {};
    for (const p of profiles) m[p.app_id] = p;
    return m;
  }, [profiles]);

  /**
   * Generate (or regenerate) one app's profile from its repo: read metadata + README + recent commits
   * + open issues (read-only, browser-direct GitHub), distill to a profile with one model call, upsert.
   * Throws when the app has no repo to read, or the model couldn't produce any usable profile.
   */
  const generateProfile = useCallback(async (app: PortfolioApp): Promise<GarvisAppProfile | null> => {
    if (!session) return null;
    if (!app.repo_url) throw new Error(`${app.name} has no repo URL to profile from.`);
    const token = getGitHubToken();
    const [state, readme] = await Promise.all([
      fetchRepoState(app.repo_url, token).catch(() => null),
      fetchRepoReadme(app.repo_url, token),
    ]);

    const user = buildProfileUser({
      name: app.name,
      slug: app.slug,
      storedStage: app.stage,
      storedDescription: app.description,
      deployUrl: app.deploy_url,
      repo: state
        ? {
            description: state.description,
            homepage: state.homepage,
            language: state.language,
            stars: state.stars,
            openIssues: state.openIssues,
            archived: state.archived,
            pushedAt: state.pushedAt,
            recentCommits: state.recentCommits.map((c) => ({ message: c.message, date: c.date })),
            topIssues: state.topIssues.map((i) => ({ title: i.title, comments: i.comments })),
          }
        : null,
      readme,
    });

    const r = await rawComplete(
      [{ role: 'system', content: PROFILE_SYSTEM }, { role: 'user', content: user }],
      1200,
    );
    const parsed = parseProfileResponse(r.text);
    if (isProfileEmpty(parsed)) throw new Error(`Couldn't build a profile for ${app.name} from its repo.`);

    const source = [
      state ? 'metadata' : '',
      readme ? 'readme' : '',
      state?.recentCommits.length ? 'commits' : '',
      state?.topIssues.length ? 'issues' : '',
    ].filter(Boolean).join('+') || 'metadata';

    const { data, error } = await supabase
      .from('garvis_app_profiles')
      .upsert(
        {
          owner_id: session.user.id,
          app_id: app.id,
          ...parsed,
          source,
          model: resolveAI().model,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'app_id' },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    await refresh();
    return data as GarvisAppProfile;
  }, [session, refresh]);

  /**
   * Generate profiles for every non-archived app that has a repo and (unless force) no profile yet.
   * Sequential so progress is reportable and we stay friendly to the GitHub rate limit. Per-app
   * failures are counted, never thrown — one bad repo shouldn't abort the batch.
   */
  const generateMissing = useCallback(
    async (apps: PortfolioApp[], opts: GenerateMissingOpts = {}): Promise<GenerateMissingResult> => {
      if (!session) return { generated: 0, failed: 0 };
      const have = new Set(profiles.map((p) => p.app_id));
      const targets = apps.filter((a) => a.repo_url && !a.archived && (opts.force || !have.has(a.id)));
      let generated = 0;
      let failed = 0;
      for (let i = 0; i < targets.length; i++) {
        opts.onProgress?.(i + 1, targets.length, targets[i].name);
        try {
          await generateProfile(targets[i]);
          generated++;
        } catch {
          failed++;
        }
      }
      return { generated, failed };
    },
    [session, profiles, generateProfile],
  );

  return { profiles, profilesByAppId, loading, refresh, generateProfile, generateMissing };
}
