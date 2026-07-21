// src/pages/Orchestrate.tsx  (/garvis/orchestrate)
// THE FRONT DOOR FOR WHOLE INTENTS — say the entire thing ("found the agency, research the
// market, write the plan, watch these grant pages, build the site") and Garvis compiles it into
// ONE reviewable plan over its real capabilities, then executes it step by step on approval.
//
// The review card is the contract: every step shows its why, its risk, and what it produces;
// what the system CANNOT do yet shows as amber holes (never silently dropped); missing info
// shows as questions (never invented). Approving runs the steps live — outcomes link to where
// each result lives, and outbound machinery stays behind its own downstream approvals.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, Loader2, Check, X, ExternalLink, TriangleAlert, CircleHelp, SkipForward, Play, RotateCcw, Hourglass, Trash2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { planProgress, type CompiledPlan, type StepStatus } from '../lib/garvis/orchestrator';
import { compileIntent, savePlan, runArc, listArcs, abandonArc, type RunReport, type ArcRow } from '../lib/garvis/orchestratorRun';
import { actionById } from '../lib/garvis/actionRegistry';

const RISK_LABEL = { safe: 'safe', spend: 'uses credits', outbound: 'can send' } as const;

const STATUS_META: Record<StepStatus['kind'], { icon: typeof Check; cls: string }> = {
  pending: { icon: CircleHelp, cls: 'text-forge-dim' },
  running: { icon: Loader2, cls: 'text-forge-ember animate-spin' },
  done: { icon: Check, cls: 'text-forge-ok' },
  needs_review: { icon: Check, cls: 'text-forge-ember' },
  handoff: { icon: ExternalLink, cls: 'text-forge-ember' },
  waiting: { icon: Hourglass, cls: 'text-forge-warn' },
  failed: { icon: X, cls: 'text-forge-err' },
  skipped: { icon: SkipForward, cls: 'text-forge-dim' },
};

const ARC_TONE: Record<ArcRow['status'], 'dim' | 'ember' | 'ok' | 'warn' | 'err'> = {
  draft: 'dim', running: 'ember', waiting: 'warn', ready: 'ember', done: 'ok', failed: 'err', abandoned: 'dim',
};

export default function Orchestrate() {
  const { toast } = useToast();
  const [intent, setIntent] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [plan, setPlan] = useState<CompiledPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<StepStatus[] | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<RunReport | null>(null);
  // Durable arcs — every approved plan persists, waits at seams, and resumes here.
  const [arcs, setArcs] = useState<ArcRow[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const refreshArcs = () => { void listArcs().then(setArcs).catch(() => {}); };
  useEffect(refreshArcs, []);

  // AUTO-RESUME (app_0095): the worker's wake sweep flips unblocked arcs to 'ready'; the moment
  // this page sees one, it continues the work by itself — the operator's approval already
  // happened, presence is the only thing that was missing. One at a time, then re-check.
  useEffect(() => {
    const ready = arcs.find((a) => a.status === 'ready');
    if (!ready || resumingId) return;
    setResumingId(ready.id);
    void runArc(ready.id, () => {})
      .then((rep) => {
        toast(rep.state === 'done' ? 'success' : 'info',
          rep.state === 'done' ? `▶ Arc "${ready.title}" was unblocked — finished on its own.`
            : rep.state === 'waiting' ? `▶ Arc "${ready.title}" advanced, now waiting: ${rep.waitingReason ?? 'a prerequisite'}.`
            : `▶ Arc "${ready.title}" resumed → ${rep.state}.`);
      })
      .catch(() => { /* claim contention or transient — the arc stays ready for the next look */ })
      .finally(() => { setResumingId(null); refreshArcs(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcs]);

  const compile = async () => {
    if (compiling || running) return;
    setCompiling(true);
    setPlan(null); setStatuses(null); setReport(null); setWarnings([]);
    try {
      const res = await compileIntent(intent);
      setWarnings(res.warnings);
      if (!res.plan) { toast('error', res.problems[0] ?? 'Could not compile that — say more.'); return; }
      setPlan(res.plan);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Compile failed.');
    } finally {
      setCompiling(false);
    }
  };

  const run = async () => {
    if (!plan || running) return;
    setRunning(true);
    setReport(null);
    try {
      const planId = await savePlan(intent, plan);
      const rep = await runArc(planId, setStatuses);
      setReport(rep);
      const p = planProgress(rep.statuses);
      toast(rep.state === 'done' ? 'success' : 'info',
        rep.state === 'waiting'
          ? `Arc parked: ${rep.waitingReason ?? 'waiting on you'} — resume it below when ready.`
          : `${p.succeeded} of ${p.total} step${p.total === 1 ? '' : 's'} completed${p.failed ? `, ${p.failed} failed` : ''}.`);
      refreshArcs();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The run stopped unexpectedly — completed steps stand and the arc is resumable below.');
      refreshArcs();
    } finally {
      setRunning(false);
    }
  };

  const resume = async (arc: ArcRow) => {
    if (resumingId) return;
    setResumingId(arc.id);
    try {
      const rep = await runArc(arc.id, () => {});
      toast(rep.state === 'done' ? 'success' : 'info',
        rep.state === 'done' ? `Arc "${arc.title}" finished.`
          : rep.state === 'waiting' ? `Still waiting: ${rep.waitingReason ?? 'a prerequisite'}.`
          : `Arc "${arc.title}" → ${rep.state}.`);
      refreshArcs();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Resume failed — the arc is unchanged.');
    } finally {
      setResumingId(null);
    }
  };

  const reset = () => { setPlan(null); setStatuses(null); setReport(null); setWarnings([]); };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Wand2 size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Orchestrate</h1>
            <p className="text-sm text-forge-dim">Say the whole thing — a venture, its plans, its watches, its apps. Garvis compiles one reviewable plan over everything it can actually do, and runs it on your approval.</p>
          </div>
        </div>

        {/* Intent box */}
        <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={3}
            placeholder={'e.g. "Found a marketing agency for home-service companies. Research the market, write the business plan, spin up a launch campaign for a website-audit offer, and watch these two grant pages weekly: <url> <url>"'}
            className="w-full resize-y rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none focus:ring-2 focus:ring-forge-ember/30"
            disabled={running}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={compile} loading={compiling} disabled={running}>
              <Wand2 size={13} /> Compile the plan
            </Button>
            {plan && !running && (
              <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={13} /> Start over</Button>
            )}
            <span className="ml-auto text-[10px] text-forge-dim">Nothing executes until you approve the compiled plan.</span>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3 text-xs text-forge-warn">
            {warnings.map((w, i) => <p key={i}>· {w}</p>)}
          </div>
        )}

        {plan && (
          <div className="mt-5 rounded-2xl border border-forge-ember/40 bg-forge-panel/40 p-4">
            <h2 className="font-display text-sm font-semibold text-forge-ink">{plan.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-forge-dim">{plan.summary}</p>

            {/* Steps */}
            <ul className="mt-4 space-y-2">
              {plan.steps.map((s, i) => {
                const def = actionById(s.action);
                const st = statuses?.[i];
                const M = st ? STATUS_META[st.kind] : null;
                const Icon = M?.icon ?? CircleHelp;
                return (
                  <li key={i} className="rounded-xl border border-forge-border bg-forge-raised/40 p-3">
                    <div className="flex items-center gap-2">
                      {st
                        ? <Icon size={14} className={cn('shrink-0', M!.cls)} />
                        : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forge-ember/15 font-mono text-[10px] font-semibold text-forge-ember">{i + 1}</span>}
                      <span className="text-sm font-medium text-forge-ink">{def?.title ?? s.action}</span>
                      <span className={cn('ml-auto rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
                        def?.risk === 'safe' ? 'border-forge-border text-forge-dim' : 'border-forge-warn/40 text-forge-warn')}>
                        {def ? RISK_LABEL[def.risk] : ''}
                      </span>
                    </div>
                    <p className="mt-1 pl-7 text-xs text-forge-dim">{s.why}</p>
                    {Object.keys(s.params).length > 0 && (
                      <p className="mt-1 pl-7 font-mono text-[10px] text-forge-dim/80">
                        {Object.entries(s.params).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    )}
                    {def && !st && <p className="mt-1 pl-7 text-[10px] text-forge-dim/70">→ {def.produces}</p>}
                    {st && st.note && (
                      <p className={cn('mt-1.5 pl-7 text-xs', st.kind === 'failed' ? 'text-forge-err' : 'text-forge-ink/80')}>
                        {st.note}
                        {st.link && <Link to={st.link} className="ml-2 inline-flex items-center gap-0.5 text-forge-ember hover:underline">open <ExternalLink size={10} /></Link>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Honesty: holes + questions are first-class, never buried. */}
            {plan.holes.length > 0 && (
              <div className="mt-3 rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-forge-warn"><TriangleAlert size={13} /> Asked for, but not in Garvis's hands yet</p>
                <ul className="mt-1 space-y-0.5 text-xs text-forge-dim">
                  {plan.holes.map((h, i) => <li key={i}>· {h}</li>)}
                </ul>
              </div>
            )}
            {plan.questions.length > 0 && (
              <div className="mt-3 rounded-xl border border-forge-border bg-forge-raised/40 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-forge-ink"><CircleHelp size={13} className="text-forge-ember" /> It needs from you</p>
                <ul className="mt-1 space-y-0.5 text-xs text-forge-dim">
                  {plan.questions.map((q, i) => <li key={i}>· {q}</li>)}
                </ul>
              </div>
            )}

            {/* Approve & run */}
            {!report && (
              <div className="mt-4 flex items-center gap-2">
                <Button onClick={run} loading={running} disabled={plan.steps.length === 0}>
                  <Play size={14} /> {running ? 'Running…' : `Approve & run ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}`}
                </Button>
                <span className="text-[10px] text-forge-dim">Sends and posts still require their own approvals in the Queue.</span>
              </div>
            )}
            {report && (
              <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-3 text-xs text-forge-ink">
                <p className="font-medium">
                  {report.state === 'done' && `Done — all ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} completed.`}
                  {report.state === 'waiting' && `Arc parked — ${report.waitingReason ?? 'waiting on a prerequisite you approve'}. It resumes from the list below.`}
                  {report.state === 'failed' && 'Some steps did not complete — their notes say why. Completed work stands.'}
                  {report.state === 'running' && 'The arc has pending steps — resume it below.'}
                </p>
                <p className="mt-0.5 text-forge-dim">Every approved plan is a durable arc now — it survives reloads and waits at approval seams instead of dying there.</p>
              </div>
            )}
          </div>
        )}

        {/* THE ARCS — every approved plan, alive until done. Waiting arcs say exactly what for. */}
        {arcs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Arcs</h2>
            <ul className="mt-2 space-y-2">
              {arcs.map((a) => {
                const p = planProgress(a.statuses);
                return (
                  <li key={a.id} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-forge-ink">{a.title}</span>
                      <Badge tone={ARC_TONE[a.status]}>{a.status}</Badge>
                      <span className="text-[11px] text-forge-dim">{p.succeeded}/{p.total} steps · {timeAgo(a.last_activity_at)}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {(a.status === 'waiting' || a.status === 'running' || a.status === 'draft' || a.status === 'ready') && (
                          <Button size="sm" variant="outline" onClick={() => void resume(a)} loading={resumingId === a.id}>
                            <Play size={12} /> {a.status === 'draft' ? 'Run' : 'Resume'}
                          </Button>
                        )}
                        <button title="Abandon this arc" onClick={() => { void abandonArc(a.id).then(refreshArcs); }}
                          className="rounded-md p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-err"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {a.status === 'waiting' && a.waiting_reason && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-forge-warn"><Hourglass size={12} className="mt-0.5 shrink-0" /> {a.waiting_reason}</p>
                    )}
                    {a.status === 'ready' && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-forge-ember"><Play size={12} className="mt-0.5 shrink-0" /> Unblocked — the prerequisite landed; resuming automatically.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
