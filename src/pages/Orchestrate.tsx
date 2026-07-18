// src/pages/Orchestrate.tsx  (/garvis/orchestrate)
// THE FRONT DOOR FOR WHOLE INTENTS — say the entire thing ("found the agency, research the
// market, write the plan, watch these grant pages, build the site") and Garvis compiles it into
// ONE reviewable plan over its real capabilities, then executes it step by step on approval.
//
// The review card is the contract: every step shows its why, its risk, and what it produces;
// what the system CANNOT do yet shows as amber holes (never silently dropped); missing info
// shows as questions (never invented). Approving runs the steps live — outcomes link to where
// each result lives, and outbound machinery stays behind its own downstream approvals.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, Loader2, Check, X, ExternalLink, TriangleAlert, CircleHelp, SkipForward, Play, RotateCcw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import type { CompiledPlan, StepStatus } from '../lib/garvis/orchestrator';
import { compileIntent, executePlan, type RunReport } from '../lib/garvis/orchestratorRun';
import { actionById } from '../lib/garvis/actionRegistry';

const RISK_LABEL = { safe: 'safe', spend: 'uses credits', outbound: 'can send' } as const;

const STATUS_META: Record<StepStatus['kind'], { icon: typeof Check; cls: string }> = {
  pending: { icon: CircleHelp, cls: 'text-forge-dim' },
  running: { icon: Loader2, cls: 'text-forge-ember animate-spin' },
  done: { icon: Check, cls: 'text-forge-ok' },
  needs_review: { icon: Check, cls: 'text-forge-ember' },
  handoff: { icon: ExternalLink, cls: 'text-forge-ember' },
  failed: { icon: X, cls: 'text-forge-err' },
  skipped: { icon: SkipForward, cls: 'text-forge-dim' },
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
      const rep = await executePlan(plan, setStatuses);
      setReport(rep);
      toast(rep.failed === 0 ? 'success' : 'info',
        `${rep.succeeded} of ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} completed${rep.failed ? `, ${rep.failed} failed` : ''}${rep.skipped ? `, ${rep.skipped} skipped` : ''}.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The run stopped unexpectedly — completed steps stand.');
    } finally {
      setRunning(false);
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
                  Done — {report.succeeded} of {plan.steps.length} completed{report.failed ? `, ${report.failed} failed (their notes say why)` : ''}{report.skipped ? `, ${report.skipped} skipped` : ''}.
                </p>
                <p className="mt-0.5 text-forge-dim">Completed work stands regardless of failures — follow each step's link to where its result lives.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
