// src/hooks/useOpportunities.ts
// Opportunity Detection — Garvis's proactive, cross-app brain. scan() reasons over the whole portfolio
// (apps + profiles + strategy + liveness) in one model call and persists the fresh opportunities it
// finds (deduped against what you've already seen). Convert turns one into a mission via the planner.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { rawComplete } from '../lib/aiClient';
import { classifyLiveness, latestByApp } from '../lib/garvis/liveness';
import { OPPORTUNITY_SYSTEM, buildOpportunityUser, parseOpportunities, dedupe, oppKey } from '../lib/garvis/opportunities';
import { usePortfolio } from './usePortfolio';
import { useMissions } from './useMissions';
import type { AppLiveness, GarvisAppProfile, GarvisOpportunity, PortfolioApp } from '../types';

export interface ScanResult { found: number }

export function useOpportunities() {
  const { session } = useAuth();
  const { apps } = usePortfolio();
  const { planMission } = useMissions();
  const [opportunities, setOpportunities] = useState<GarvisOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('garvis_opportunities').select('*').order('created_at', { ascending: false });
    setOpportunities((data as GarvisOpportunity[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`garvis-opps-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_opportunities' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, refresh]);

  const active = useMemo(() => opportunities.filter((o) => o.status !== 'dismissed'), [opportunities]);
  const fresh = useMemo(() => opportunities.filter((o) => o.status === 'new'), [opportunities]);

  /** Build the cross-app portfolio digest the detector reasons over. */
  const buildDigest = useCallback(async (): Promise<string> => {
    const [{ data: profs }, { data: live }] = await Promise.all([
      supabase.from('garvis_app_profiles').select('app_id, purpose, business_model, blocker'),
      supabase.from('app_liveness').select('*').order('checked_at', { ascending: false }).limit(300),
    ]);
    const profByApp: Record<string, Partial<GarvisAppProfile>> = {};
    for (const p of (profs as GarvisAppProfile[]) ?? []) profByApp[p.app_id] = p;
    const latest = latestByApp((live as AppLiveness[]) ?? []);
    return apps
      .filter((a) => !a.archived)
      .map((a: PortfolioApp) => {
        const p = profByApp[a.id];
        const liveness = classifyLiveness(a.deploy_url, latest[a.id]);
        return [
          `- ${a.name} [stage:${a.stage}; ${a.strategic_importance ?? 'unclassified'}; liveness:${liveness}; $${a.monthly_revenue}/mo]`,
          p?.purpose ? `    purpose: ${p.purpose}` : (a.description ? `    desc: ${a.description}` : ''),
          p?.business_model ? `    model: ${p.business_model}` : '',
          p?.blocker ? `    blocker: ${p.blocker}` : '',
          a.strategic_role ? `    role: ${a.strategic_role}` : '',
        ].filter(Boolean).join('\n');
      })
      .join('\n');
  }, [apps]);

  /** Proactive scan: find opportunities across the portfolio, persist the fresh (deduped) ones. */
  const scan = useCallback(async (): Promise<ScanResult> => {
    if (!session) throw new Error('Scanning requires an authenticated user.');
    if (apps.filter((a) => !a.archived).length === 0) return { found: 0 };
    setScanning(true);
    try {
      const digest = await buildDigest();
      const r = await rawComplete([{ role: 'system', content: OPPORTUNITY_SYSTEM }, { role: 'user', content: buildOpportunityUser(digest) }], 1800);
      const found = parseOpportunities(r.text);
      const known = new Set(opportunities.filter((o) => o.status !== 'dismissed').map((o) => oppKey(o.title)));
      const freshOnes = dedupe(found, known);
      if (freshOnes.length > 0) {
        await supabase.from('garvis_opportunities').insert(
          freshOnes.map((o) => ({
            owner_id: session.user.id, title: o.title, type: o.type, rationale: o.rationale,
            suggested_move: o.suggested_move, related_apps: o.related_apps, confidence: o.confidence, status: 'new', source: 'scan',
          })),
        );
        await refresh();
      }
      return { found: freshOnes.length };
    } finally {
      setScanning(false);
    }
  }, [session, apps, opportunities, buildDigest, refresh]);

  const setStatus = async (id: string, status: 'saved' | 'dismissed') => { await supabase.from('garvis_opportunities').update({ status }).eq('id', id); await refresh(); };

  /** Turn an opportunity into a mission (the planner takes it from here). */
  const convertToMission = useCallback(async (opp: GarvisOpportunity): Promise<string | null> => {
    const appName = opp.related_apps[0];
    const appId = appName ? (apps.find((a) => a.name.toLowerCase() === appName.toLowerCase())?.id ?? null) : null;
    const objective = opp.suggested_move?.trim() || opp.title;
    const missionId = await planMission({ objective, subject: appName ?? opp.title, appId });
    if (missionId) { await supabase.from('garvis_opportunities').update({ status: 'converted', mission_id: missionId }).eq('id', opp.id); await refresh(); }
    return missionId;
  }, [apps, planMission, refresh]);

  return { opportunities, active, fresh, loading, scanning, refresh, scan, save: (id: string) => setStatus(id, 'saved'), dismiss: (id: string) => setStatus(id, 'dismissed'), convertToMission };
}
