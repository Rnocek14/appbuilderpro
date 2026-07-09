import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Github, ExternalLink, Plus, Sparkles, TrendingUp, Rocket, Hammer, X, Check, Lightbulb, Zap, ChevronDown, ChevronRight, RefreshCw, Settings2, Target, Brain, ListChecks } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { GoalsPanel } from '../components/garvis/GoalsPanel';
import { CapabilitiesPanel } from '../components/garvis/CapabilitiesPanel';
import { ContentPanel } from '../components/garvis/ContentPanel';
import { TriagePanel } from '../components/garvis/TriagePanel';
import { FollowUpPanel } from '../components/garvis/FollowUpPanel';
import { usePortfolio } from '../hooks/usePortfolio';
import { useAppProfiles } from '../hooks/useAppProfiles';
import { useLiveness } from '../hooks/useLiveness';
import { useTriage } from '../hooks/useTriage';
import { useFollowup } from '../hooks/useFollowup';
import { useGarvisObjective } from '../hooks/useGarvisObjective';
import { useGarvisKnowledge } from '../hooks/useGarvisKnowledge';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Badge, Button, Card, EmptyState, Spinner, StatCard } from '../components/ui';
import { formatUsd, timeAgo } from '../lib/utils';
import { recommendNextAction, runGarvisAct, classifyLiveness } from '../lib/garvis';
import type { AgentRun, AppStage, StrategicImportance } from '../types';

const IMPORTANCE_OPTS: { value: StrategicImportance | ''; label: string }[] = [
  { value: '', label: '— importance' },
  { value: 'core', label: 'Core' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'experimental', label: 'Experimental' },
];

const LIVENESS_DOT: Record<string, string> = {
  live: 'bg-emerald-500',
  down: 'bg-red-500',
  not_deployed: 'bg-forge-dim/40',
  unknown: 'bg-forge-dim/40',
};

// Throttle the on-load GitHub status sync so revisits don't burn the API rate limit.
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000; // 6h

const STAGE_TONE: Record<AppStage, 'dim' | 'ember' | 'ok' | 'warn'> = {
  idea: 'dim',
  building: 'ember',
  launched: 'ok',
  growing: 'ok',
  paused: 'warn',
  archived: 'dim',
};

export default function Garvis() {
  const { apps, loading, seeding, syncing, discoverFromGitHub, syncFromGitHub, addApp, updateApp, rollup } = usePortfolio();
  const { profilesByAppId, generateProfile, generateMissing } = useAppProfiles();
  const { latestByAppId, checkAll } = useLiveness();
  const { report: triage, running: triaging, runTriage, clear: clearTriage } = useTriage();
  const { loops: openLoops } = useFollowup();
  const { addGoal, updateGoalStatus } = useGarvisObjective();
  const { proposed, approved, approve, reject, logOutcome } = useGarvisKnowledge();
  const { toast } = useToast();
  const { session } = useAuth();
  const [adding, setAdding] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [acting, setActing] = useState(false);
  const [advice, setAdvice] = useState<AgentRun | null>(null);
  const [actRun, setActRun] = useState<AgentRun | null>(null);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profilesDone, setProfilesDone] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [goalAdded, setGoalAdded] = useState(false);
  const [profilingId, setProfilingId] = useState<string | null>(null);

  // Auto-pilot guards: each phase runs at most once per mount so revisits don't loop or re-spend.
  const didGather = useRef(false);
  const didProfiles = useRef(false);
  const didLiveness = useRef(false);
  const didAutoRecommend = useRef(false);

  // Generate a fresh recommendation and (per "auto-do safe things") immediately draft on it.
  const generateRecommendation = async (autoAct: boolean) => {
    setThinking(true);
    try {
      const run = await recommendNextAction({ budgetUsd: 0.25 });
      if (run && run.status !== 'failed') {
        setAdvice(run);
        if (autoAct && run.status === 'succeeded' && (run.recommendation || run.output)) {
          void autoActOn(run);
        }
        return run;
      }
      if (run?.status === 'failed') toast('error', run.error ?? 'Garvis failed to produce a recommendation.');
      return null;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not reach Garvis.');
      return null;
    } finally {
      setThinking(false);
    }
  };

  // Act mode on a recommendation. Drafts/scripts are safe (memory writes still land as proposals
  // needing approval), so this can run without a per-action prompt.
  const autoActOn = async (rec: AgentRun) => {
    setActing(true);
    try {
      const run = await runGarvisAct({
        title: 'Act on Garvis recommendation',
        input:
          `Act on this recommendation. Where useful, draft a short script (generate_short_script), ` +
          `and log the key decision (log_decision) or outcome (record_outcome) for future memory.\n\n` +
          `RECOMMENDATION: ${rec.recommendation ?? rec.output}`,
        appId: rec.app_id,
        budgetUsd: 0.5,
      });
      if (run && run.status !== 'failed') setActRun(run);
    } catch {
      /* non-fatal: the recommendation still stands on its own */
    } finally {
      setActing(false);
    }
  };

  // ---- AUTO-PILOT: gather data + surface value on load, no buttons required ----
  // Phase 1 — gather: discover repos if the portfolio is empty, then sync live status (throttled).
  useEffect(() => {
    if (!session || loading || didGather.current) return;
    didGather.current = true;
    (async () => {
      try {
        if (apps.length === 0) {
          setAutoStatus('Discovering your repos from GitHub…');
          const r = await discoverFromGitHub();
          if (r.added > 0) toast('success', `Found ${r.found} repos — added ${r.added} to your portfolio.`);
        }
        const last = Number(localStorage.getItem('garvis_last_sync') ?? 0);
        if (Date.now() - last > SYNC_EVERY_MS) {
          setAutoStatus('Syncing live status from GitHub…');
          await syncFromGitHub();
          try { localStorage.setItem('garvis_last_sync', String(Date.now())); } catch { /* ignore */ }
        }
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'GitHub auto-gather failed.');
      } finally {
        setAutoStatus(null);
      }
    })();
  }, [session, loading, apps.length, discoverFromGitHub, syncFromGitHub, toast]);

  // Phase 1.5 — build intelligence: generate a profile for every app that lacks one, so the brain
  // reasons over WHAT EACH PRODUCT IS (purpose/state/blocker/next), not just commit activity. Read-only
  // against GitHub; one lightweight model call per app. Runs once per mount; skips apps already profiled.
  useEffect(() => {
    if (!session || loading || didProfiles.current || apps.length === 0) return;
    didProfiles.current = true;
    (async () => {
      try {
        const targets = apps.filter((a) => a.repo_url && !a.archived && !profilesByAppId[a.id]);
        if (targets.length === 0) return;
        setProfileStatus(`Building intelligence profiles… (0/${targets.length})`);
        await generateMissing(apps, {
          onProgress: (done, total, name) => setProfileStatus(`Profiling ${name}… (${done}/${total})`),
        });
      } catch {
        /* non-fatal: recommendations still work without profiles, just less grounded */
      } finally {
        setProfileStatus(null);
        setProfilesDone(true); // unblock the first fresh recommendation
      }
    })();
  }, [session, loading, apps, profilesByAppId, generateMissing]);

  // Phase 1.6 — sense liveness: ping each deployed app once per mount so the brain has a real,
  // automatic outcome signal (reachable vs not) instead of only self-reported state. Fast, no LLM.
  useEffect(() => {
    if (!session || loading || didLiveness.current || apps.length === 0) return;
    if (!apps.some((a) => a.deploy_url)) return; // nothing deployed → nothing to ping
    didLiveness.current = true;
    void checkAll(apps);
  }, [session, loading, apps, checkAll]);

  // Phase 2 — surface a recommendation: show the latest from history instantly; if there's none yet,
  // generate the first one once profiles are ready (so it's grounded) and auto-draft on it.
  useEffect(() => {
    if (!session || loading || didAutoRecommend.current || apps.length === 0 || advice) return;
    (async () => {
      // Only adopt a SUCCEEDED prior recommendation; a stale failed run shouldn't block a fresh one.
      const { data } = await supabase
        .from('agent_runs').select('*')
        .eq('kind', 'recommend').eq('status', 'succeeded')
        .order('created_at', { ascending: false }).limit(1);
      const latest = (data as AgentRun[] | null)?.[0];
      if (latest) { didAutoRecommend.current = true; setAdvice(latest); return; }
      if (!profilesDone) return; // wait for profiles before the first grounded recommendation
      didAutoRecommend.current = true;
      await generateRecommendation(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading, apps.length, advice, profilesDone]);

  const onDiscover = async () => {
    try {
      const r = await discoverFromGitHub();
      toast('success', r.found ? `Found ${r.found} repos — added ${r.added} new.` : 'No repos found for that account.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Discovery failed.');
    }
  };

  const onSync = async () => {
    try {
      const r = await syncFromGitHub();
      if (r.synced === 0) {
        toast('info', 'No products have a GitHub repo URL to sync.');
      } else {
        const failed = r.failed.length ? `, ${r.failed.length} failed` : '';
        toast('success', `Synced ${r.synced} repo${r.synced === 1 ? '' : 's'} — ${r.updated} updated${failed}.`);
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'GitHub sync failed.');
    }
  };

  const onAdd = async () => {
    const name = window.prompt('Product name?')?.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addApp(name);
      toast('success', `Added “${name}”.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add product.');
    } finally {
      setAdding(false);
    }
  };

  // Manual refresh from the header — generate a new recommendation (no auto-act; the user can
  // choose "Act on this"). Read-only by construction (plan mode → inspect + propose tools only).
  const askGarvis = async () => {
    if (apps.length === 0) {
      toast('info', 'Garvis is still gathering your portfolio — give it a moment.');
      return;
    }
    await generateRecommendation(false);
  };

  const onAct = async () => {
    if (!advice?.recommendation && !advice?.output) return;
    setActing(true);
    try {
      // Act mode: the brain may draft a script, log a decision, or record an outcome. Knowledge
      // writes land as PROPOSALS in the panel below; nothing enters memory without your approval.
      const run = await runGarvisAct({
        title: 'Act on Garvis recommendation',
        input:
          `Act on this recommendation. Where useful, draft a short script (generate_short_script), ` +
          `and log the key decision (log_decision) or outcome (record_outcome) for future memory.\n\n` +
          `RECOMMENDATION: ${advice.recommendation ?? advice.output}`,
        appId: advice.app_id,
        budgetUsd: 0.5,
      });
      if (!run) toast('error', 'Garvis had nothing queued to act on.');
      else if (run.status === 'failed') toast('error', run.error ?? 'Act run failed.');
      else { setActRun(run); toast('success', 'Garvis acted — see the draft below.'); }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not run act mode.');
    } finally {
      setActing(false);
    }
  };

  const onApprove = async (id: string) => {
    try { await approve(id); toast('success', 'Saved to Garvis memory.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Approve failed.'); }
  };
  const onReject = async (id: string) => {
    try { await reject(id); toast('info', 'Discarded — not saved to memory.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Reject failed.'); }
  };

  // Reset the per-recommendation UI (reasoning collapsed, goal button armed) whenever the advice changes.
  useEffect(() => { setShowReasoning(false); setGoalAdded(false); }, [advice?.id]);

  // Turn the current recommendation into an active goal — the "Approve goal" half of the decision card.
  const makeGoal = async () => {
    if (!advice?.recommendation) return;
    try {
      await addGoal({ title: advice.recommendation, app_id: advice.app_id, description: advice.output ?? undefined });
      setGoalAdded(true);
      toast('success', 'Added as an active goal — Garvis will optimize toward it.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add goal.');
    }
  };

  // Run portfolio triage — the "what should I stop doing" pass over profiles + goals + liveness.
  const onTriage = async () => {
    if (apps.length === 0) { toast('info', 'Garvis is still gathering your portfolio — give it a moment.'); return; }
    try {
      const r = await runTriage();
      if (r) toast('success', 'Garvis triaged your portfolio.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Triage failed.');
    }
  };

  // Archive an app from a triage verdict — reversible (stage can be set back any time).
  const onArchiveApp = async (id: string) => {
    try {
      await updateApp(id, { archived: true, stage: 'archived' as AppStage });
      toast('success', 'Archived — out of the active portfolio.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not archive.');
    }
  };

  // Set an app's strategic importance — the founder's judgment that gives triage its second lens.
  const onSetImportance = async (id: string, importance: StrategicImportance | null) => {
    try {
      await updateApp(id, { strategic_importance: importance });
      toast('success', importance ? `Marked as ${importance}.` : 'Cleared strategic importance.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not set importance.');
    }
  };

  // Edit the one-line strategic role (why it matters / platform role / relationship to other apps).
  const onEditRole = async (id: string, current: string | null) => {
    const role = window.prompt('Why does this app matter long-term? (its platform role / relationship to other apps)', current ?? '');
    if (role === null) return; // cancelled
    try {
      await updateApp(id, { strategic_role: role.trim() || null });
      toast('success', 'Strategic role saved.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save role.');
    }
  };

  // Follow-through actions on an open loop (an active goal Garvis is holding you to).
  const onLoopDone = async (loop: { goalId: string }) => {
    try { await updateGoalStatus(loop.goalId, 'achieved'); toast('success', 'Marked done — nice.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };
  const onLoopDrop = async (loop: { goalId: string }) => {
    try { await updateGoalStatus(loop.goalId, 'abandoned'); toast('info', 'Dropped — off your plate.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };
  const onLoopLogOutcome = async (loop: { title: string; appId: string | null }, text: string) => {
    try {
      await logOutcome({ title: `Outcome: ${loop.title}`, body: text, appId: loop.appId });
      toast('success', 'Outcome logged — Garvis will factor it into the next recommendation.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not log outcome.');
    }
  };

  // Regenerate one app's intelligence profile from its repo (read-only).
  const regenProfile = async (id: string) => {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    setProfilingId(id);
    try {
      await generateProfile(app);
      toast('success', `Refreshed Garvis's profile of “${app.name}”.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not profile that app.');
    } finally {
      setProfilingId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* The front door moved: this page is the legacy portfolio plane; the product now wakes
            in Command and works in the altitude stack. Point there so the old page never shadows it. */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-forge-ember/30 bg-forge-ember/5 px-4 py-3">
          <Sparkles size={16} className="shrink-0 text-forge-ember" />
          <p className="text-sm text-forge-ink/90">
            Garvis has a new front door — <Link to="/garvis/command" className="text-forge-ember hover:underline">Command</Link> wakes with what matters,{' '}
            <Link to="/garvis/webs" className="text-forge-ember hover:underline">Work Webs</Link> is where missions live, and the{' '}
            <Link to="/garvis/universe" className="text-forge-ember hover:underline">Universe</Link> shows everything in one sky.
          </p>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Boxes size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Garvis</h1>
            <p className="text-sm text-forge-dim">Your portfolio control plane — every product, in one place.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={askGarvis} loading={thinking} title="Generate a fresh recommendation">
              {advice ? <RefreshCw size={14} /> : <Sparkles size={14} />} {advice ? 'Refresh' : 'What should I work on today?'}
            </Button>
            {apps.length > 0 && (
              <Button variant="ghost" onClick={onTriage} loading={triaging} title="What should I keep, reconsider, or stop doing?">
                <ListChecks size={14} /> Triage
              </Button>
            )}
            {apps.length > 0 && (
              <Button variant="ghost" onClick={onSync} loading={syncing} title="Read repo status from GitHub (read-only)">
                <Github size={14} /> Sync
              </Button>
            )}
            <Button onClick={onAdd} loading={adding}><Plus size={15} /> Add product</Button>
          </div>
        </div>

        {(autoStatus || profileStatus) && (
          <div className="mb-4 rounded-lg border border-forge-ember/30 bg-forge-ember/5 px-3 py-2 animate-fadeInUp">
            <Spinner label={autoStatus ?? profileStatus ?? ''} />
          </div>
        )}

        {advice && (
          <Card className="mb-6 border-forge-ember/40 p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-forge-ember" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-sm font-semibold">Garvis recommends</h2>
                  <Badge tone={advice.status === 'succeeded' ? 'ok' : 'warn'}>{advice.status.replace('_', ' ')}</Badge>
                  <button onClick={() => setAdvice(null)} className="ml-auto text-forge-dim hover:text-forge-ink" title="Dismiss">
                    <X size={14} />
                  </button>
                </div>

                {/* The decision: headline first, reasoning tucked away. */}
                {advice.recommendation ? (
                  <p className="mt-2 text-base font-semibold leading-snug text-forge-ink">{advice.recommendation}</p>
                ) : advice.output ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-forge-ink">{advice.output}</p>
                ) : null}

                {advice.status === 'failed' && advice.error && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-forge-err">{advice.error}</p>
                )}

                {/* Actions: turn it into a goal, or let Garvis act on it. */}
                {advice.status === 'succeeded' && (advice.recommendation || advice.output) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {advice.recommendation && (
                      <Button onClick={makeGoal} disabled={goalAdded} title="Commit this as an active goal Garvis optimizes toward">
                        {goalAdded ? <><Check size={14} /> Goal added</> : <><Target size={14} /> Make this a goal</>}
                      </Button>
                    )}
                    <Button variant="outline" onClick={onAct} loading={acting} title="Let Garvis act on this in act mode (proposals need your approval)">
                      <Zap size={14} /> Act on this
                    </Button>
                    {advice.recommendation && advice.output && (
                      <Button variant="ghost" onClick={() => setShowReasoning((v) => !v)} title="See the grounded reasoning">
                        {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {showReasoning ? 'Hide reasoning' : 'View reasoning'}
                      </Button>
                    )}
                  </div>
                )}

                {/* Collapsed reasoning — the full grounded analysis lives here, not above. */}
                {showReasoning && advice.recommendation && advice.output && (
                  <p className="mt-3 whitespace-pre-wrap rounded border border-forge-border bg-forge-panel/50 p-3 text-xs text-forge-dim animate-fadeInUp">
                    {advice.output}
                  </p>
                )}

                <p className="mt-3 text-[11px] text-forge-dim/70">
                  Read-only · cost {formatUsd(Number(advice.cost_usd))} · {timeAgo(advice.created_at)}
                </p>
              </div>
            </div>
          </Card>
        )}

        <FollowUpPanel loops={openLoops} onDone={onLoopDone} onDrop={onLoopDrop} onLogOutcome={onLoopLogOutcome} />

        {triage && (
          <TriagePanel report={triage} apps={apps} onArchive={onArchiveApp} onSetImportance={onSetImportance} onClose={clearTriage} />
        )}

        <ContentPanel run={actRun} onLogged={() => setActRun(null)} />

        {proposed.length > 0 && (
          <Card className="mb-6 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb size={16} className="text-forge-ember" />
              <h2 className="font-display text-sm font-semibold">Pending knowledge</h2>
              <Badge tone="ember">{proposed.length}</Badge>
              <span className="text-[11px] text-forge-dim/70">Garvis proposes — nothing enters memory until you approve.</span>
            </div>
            <div className="space-y-2">
              {proposed.map((k) => (
                <div key={k.id} className="flex items-start gap-3 rounded border border-forge-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="dim">{k.kind}</Badge>
                      <span className="font-medium text-sm text-forge-ink">{k.title}</span>
                      {typeof k.confidence === 'number' && (
                        <span className="text-[11px] text-forge-dim/70">confidence {k.confidence.toFixed(2)}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-forge-dim">{k.body}</p>
                    {k.source && <p className="mt-1 text-[10px] text-forge-dim/60">source: {k.source}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" onClick={() => onApprove(k.id)} title="Approve — save to memory"><Check size={14} /></Button>
                    <Button variant="ghost" onClick={() => onReject(k.id)} title="Reject — discard"><X size={14} /></Button>
                  </div>
                </div>
              ))}
            </div>
            {approved.length > 0 && (
              <p className="mt-2 text-[11px] text-forge-dim/70">{approved.length} approved item{approved.length === 1 ? '' : 's'} in memory, informing future recommendations.</p>
            )}
          </Card>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <StatCard label="Products" value={String(rollup.total)} hint="Active in portfolio" />
          <StatCard label="Live" value={String(rollup.live)} hint="Launched or growing" />
          <StatCard label="Building" value={String(rollup.building)} hint="In active development" />
          <StatCard label="Portfolio MRR" value={formatUsd(rollup.mrr)} hint="Sum of known revenue" />
        </div>

        {loading || (apps.length === 0 && (seeding || !!autoStatus)) ? (
          <div className="py-20 text-center"><Spinner label={autoStatus ?? 'Loading portfolio…'} /></div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon={<Boxes size={28} />}
            title="Connecting your portfolio"
            body="Garvis pulls every product straight from your GitHub automatically. If nothing showed up, discover them now or add one by hand."
            action={
              <div className="flex gap-2">
                <Button onClick={onDiscover} loading={seeding}><Github size={15} /> Discover from GitHub</Button>
                <Button variant="outline" onClick={onAdd} loading={adding}><Plus size={15} /> Add manually</Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => {
              const profile = profilesByAppId[a.id];
              const purpose = a.description ?? profile?.purpose ?? null;
              const live = classifyLiveness(a.deploy_url, latestByAppId[a.id]);
              return (
              <Card key={a.id} className="group relative flex flex-col p-4 transition-colors hover:border-forge-ember/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${LIVENESS_DOT[live]}`}
                      title={live === 'live' ? 'Deploy reachable' : live === 'down' ? 'Deploy UNREACHABLE' : live === 'not_deployed' ? 'Not deployed' : 'Not checked yet'}
                    />
                    <span className="truncate font-display text-sm font-semibold">{a.name}</span>
                  </span>
                  <Badge tone={STAGE_TONE[a.stage]}>{a.stage}</Badge>
                </div>
                <p className="mt-1.5 line-clamp-3 min-h-[3rem] text-xs text-forge-dim">
                  {purpose ?? (a.repo_url ? 'Not profiled yet — Garvis will analyze the repo.' : 'No description yet.')}
                </p>

                {profile?.next_milestone && (
                  <p className="mt-1.5 line-clamp-2 text-[11px] text-forge-ember/90">
                    <span className="font-medium">Next:</span> {profile.next_milestone}
                  </p>
                )}

                {a.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <span key={t} className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim">{t}</span>
                    ))}
                  </div>
                )}

                {/* Strategic lens — the founder's judgment that triage cannot overrule. */}
                <div className="mt-2 flex items-center gap-1.5">
                  <select
                    value={a.strategic_importance ?? ''}
                    onChange={(e) => onSetImportance(a.id, (e.target.value || null) as StrategicImportance | null)}
                    title="Strategic importance — Garvis will never archive a Core app, whatever the metrics say"
                    className="rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 text-[10px] text-forge-dim focus:border-forge-ember focus:outline-none"
                  >
                    {IMPORTANCE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => onEditRole(a.id, a.strategic_role)}
                    title={a.strategic_role ? `Strategic role: ${a.strategic_role}` : 'Add a strategic role note (why it matters long-term)'}
                    className={`truncate text-left text-[10px] ${a.strategic_role ? 'text-forge-dim hover:text-forge-ink' : 'text-forge-dim/50 hover:text-forge-dim'}`}
                  >
                    {a.strategic_role ? `· ${a.strategic_role}` : '· why it matters?'}
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-3 border-t border-forge-border pt-3 text-[11px] text-forge-dim">
                  {Number(a.monthly_revenue) > 0 && (
                    <span className="inline-flex items-center gap-1"><TrendingUp size={12} /> {formatUsd(Number(a.monthly_revenue))}/mo</span>
                  )}
                  <span className="ml-auto">{timeAgo(a.updated_at)}</span>
                </div>

                <div className="mt-2 flex items-center gap-3 text-xs">
                  {a.repo_url && (
                    <a href={a.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-forge-dim hover:text-forge-ink">
                      <Github size={13} /> Repo
                    </a>
                  )}
                  {a.deploy_url
                    ? <a href={a.deploy_url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 hover:underline ${live === 'down' ? 'text-red-500' : 'text-forge-ember'}`}><Rocket size={13} /> {live === 'down' ? 'Unreachable' : 'Live'}</a>
                    : <span className="inline-flex items-center gap-1 text-forge-dim/60"><Hammer size={13} /> Not deployed</span>}
                  {a.repo_url && (
                    <button
                      onClick={() => regenProfile(a.id)}
                      disabled={profilingId === a.id}
                      title={profile ? `Refresh Garvis's profile (built from ${profile.source ?? 'repo'})` : 'Build a Garvis intelligence profile from the repo'}
                      className="ml-auto inline-flex items-center text-forge-dim hover:text-forge-ember disabled:opacity-50"
                    >
                      <Brain size={13} className={profilingId === a.id ? 'animate-pulse' : ''} />
                    </button>
                  )}
                </div>
              </Card>
              );
            })}
          </div>
        )}

        {/* Goals/constraints/capabilities are judgments only you can set — tucked away as optional
            tuning, not a setup gate. Garvis works without them and proposes them over time. */}
        <div className="mt-8">
          <button
            onClick={() => setShowSetup((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-dim transition-colors hover:text-forge-ink"
            aria-expanded={showSetup}
          >
            {showSetup ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Settings2 size={14} />
            Goals &amp; capabilities
            <span className="text-[11px] text-forge-dim/60">optional — sharpens Garvis's recommendations</span>
          </button>
          {showSetup && (
            <div className="mt-3 animate-fadeInUp">
              <GoalsPanel />
              <CapabilitiesPanel />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
