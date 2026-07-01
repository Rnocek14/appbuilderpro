// src/hooks/useTriage.ts
// Garvis portfolio TRIAGE — the "what should I stop doing" reasoning pass. Reads what Garvis already
// knows (apps + profiles + active goals + latest liveness), makes ONE structured model call, and
// returns a keep/reconsider/archive verdict per app + the single app to focus on. Adds no table; logs
// an `analyze` agent_run for history (so the brain's recent_runs can reference "you triaged on X").
// DIRECT-mode via rawComplete, consistent with profiles/roadmap generation.

import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { rawComplete } from '../lib/aiClient';
import { resolveAI } from '../lib/aiConfig';
import { estimateCostUsd } from '../lib/garvis/directBrain';
import { classifyLiveness, latestByApp } from '../lib/garvis/liveness';
import { TRIAGE_SYSTEM, buildTriageUser, parseTriageResponse, applyStrategicGuard } from '../lib/garvis/triage';
import type { TriageInput, TriageReport, TriageAppInput } from '../lib/garvis/triage';
import type { AppLiveness, GarvisAppProfile, GarvisGoal, PortfolioApp, StrategicImportance } from '../types';

export function useTriage() {
  const { session } = useAuth();
  const [report, setReport] = useState<TriageReport | null>(null);
  const [running, setRunning] = useState(false);

  const runTriage = useCallback(async (): Promise<TriageReport | null> => {
    if (!session) throw new Error('Triage requires an authenticated user.');
    setRunning(true);
    try {
      // Gather what Garvis already knows — fresh, owner-scoped by RLS.
      const [appsRes, profRes, goalsRes, liveRes] = await Promise.all([
        supabase.from('apps').select('id, name, stage, deploy_url, monthly_revenue, updated_at, strategic_importance, strategic_role').is('deleted_at', null).eq('archived', false),
        supabase.from('garvis_app_profiles').select('app_id, purpose, current_state, blocker, next_milestone'),
        supabase.from('garvis_goals').select('title, success_metric').eq('status', 'active').order('priority', { ascending: true }),
        supabase.from('app_liveness').select('*').order('checked_at', { ascending: false }).limit(300),
      ]);

      const apps = (appsRes.data as Pick<PortfolioApp, 'id' | 'name' | 'stage' | 'deploy_url' | 'monthly_revenue' | 'updated_at' | 'strategic_importance' | 'strategic_role'>[]) ?? [];
      if (apps.length === 0) throw new Error('No active apps to triage.');

      const profByApp: Record<string, Partial<GarvisAppProfile>> = {};
      for (const p of (profRes.data as GarvisAppProfile[]) ?? []) profByApp[p.app_id] = p;
      const latest = latestByApp((liveRes.data as AppLiveness[]) ?? []);
      const goals = ((goalsRes.data as Pick<GarvisGoal, 'title' | 'success_metric'>[]) ?? []).map(
        (g) => `${g.title}${g.success_metric ? ` — metric: ${g.success_metric}` : ''}`,
      );

      const triageApps: TriageAppInput[] = apps.map((a) => ({
        id: a.id,
        name: a.name,
        stage: a.stage,
        deployUrl: a.deploy_url,
        monthlyRevenue: Number(a.monthly_revenue ?? 0),
        lastActivity: a.updated_at,
        liveness: classifyLiveness(a.deploy_url, latest[a.id]),
        importance: a.strategic_importance,
        strategicRole: a.strategic_role,
        profile: profByApp[a.id]
          ? {
              purpose: profByApp[a.id].purpose ?? null,
              current_state: profByApp[a.id].current_state ?? null,
              blocker: profByApp[a.id].blocker ?? null,
              next_milestone: profByApp[a.id].next_milestone ?? null,
            }
          : null,
      }));

      const input: TriageInput = { apps: triageApps, goals };
      const r = await rawComplete(
        [{ role: 'system', content: TRIAGE_SYSTEM }, { role: 'user', content: buildTriageUser(input) }],
        1800,
      );
      const knownIds = new Set(apps.map((a) => a.id));
      const parsedRaw = parseTriageResponse(r.text, knownIds);
      // Code-level strategic guard: a 'core' app can never be archived even if the model says so.
      const importanceByApp: Record<string, StrategicImportance | null> = {};
      for (const a of apps) importanceByApp[a.id] = a.strategic_importance;
      const parsed: TriageReport = { ...parsedRaw, verdicts: applyStrategicGuard(parsedRaw.verdicts, importanceByApp) };

      // Log for history so recommendations can later reference the triage call.
      const focusName = parsed.focusAppId ? apps.find((a) => a.id === parsed.focusAppId)?.name ?? null : null;
      const cost = estimateCostUsd(r.inputTokens, r.outputTokens);
      await supabase.from('agent_runs').insert({
        owner_id: session.user.id,
        kind: 'analyze',
        title: 'Portfolio triage',
        status: 'succeeded',
        phase: 'plan',
        input: 'Triage the portfolio: keep / reconsider / archive each app, and pick one focus.',
        output: parsed.summary,
        recommendation: focusName ? `Focus on ${focusName}` : null,
        cost_usd: cost,
        spent_usd: cost,
        finished_at: new Date().toISOString(),
      });

      setReport(parsed);
      return parsed;
    } finally {
      setRunning(false);
    }
  }, [session]);

  return { report, running, runTriage, clear: () => setReport(null) };
}
