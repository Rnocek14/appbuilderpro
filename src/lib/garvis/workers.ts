// src/lib/garvis/workers.ts
// The Garvis WORKER POOL — the "hands". Each worker takes a task (a brief + the mission's subject/app)
// and returns a real work-product (a report/diagnosis/plan, and for marketing, a full campaign). The
// Mission orchestrator dispatches tasks to these by `kind`. Honest autonomy ceiling: research /
// analytics / marketing produce complete artifacts on anything; bug / builder produce diagnoses + plans
// (auto-execution against code stays gated to FableForge-native projects + the existing approval flows).

import { supabase } from '../supabase';
import { rawComplete } from '../aiClient';
import { estimateCostUsd } from './directBrain';
import { fetchRepoState } from './github';
import { classifyLiveness, latestByApp } from './liveness';
import { generateCampaign } from './marketingRun';
import type { AppLiveness, TaskArtifact, WorkerKind } from '../../types';

export interface WorkerContext { ownerId: string; missionId: string; taskId: string; appId: string | null; subject: string }
export interface WorkerResult {
  summary: string;
  artifacts: TaskArtifact[];
  link?: string | null;
  verify: { ok: boolean; issues: string[]; warnings: string[] };
  costUsd: number;
}

export interface Worker {
  kind: WorkerKind;
  label: string;
  description: string; // shown to the Planner so it can choose this worker
  safety: 'read_only' | 'writes_data' | 'external_action';
  autonomy: string;
  run(brief: string, ctx: WorkerContext): Promise<WorkerResult>;
}

// ---- shared helpers ----

function reportVerify(body: string): { ok: boolean; issues: string[]; warnings: string[] } {
  if (body.trim().length < 150) return { ok: false, issues: ['the worker produced little or no usable output'], warnings: [] };
  return { ok: true, issues: [], warnings: [] };
}

/** A compact, DB-only context block about the app being worked on (or a note that it's external). */
async function appContextBlock(appId: string | null, subject: string): Promise<string> {
  if (!appId) return `SUBJECT: ${subject}\nNOTE: external — not a portfolio app, so no repo/profile/metrics are available. Reason from the brief.`;
  const [{ data: app }, { data: prof }, { data: live }] = await Promise.all([
    supabase.from('apps').select('name, repo_url, deploy_url, stage, monthly_revenue, strategic_importance, strategic_role').eq('id', appId).maybeSingle(),
    supabase.from('garvis_app_profiles').select('purpose, audience, business_model, current_state, blocker, next_milestone').eq('app_id', appId).maybeSingle(),
    supabase.from('app_liveness').select('*').eq('app_id', appId).order('checked_at', { ascending: false }).limit(20),
  ]);
  const a = app as Record<string, unknown> | null;
  const p = prof as Record<string, unknown> | null;
  const liveness = a ? classifyLiveness((a.deploy_url as string) ?? null, latestByApp((live as AppLiveness[]) ?? [])[appId]) : 'unknown';
  return [
    `APP: ${a?.name ?? subject}`,
    `stage: ${a?.stage ?? '?'} | deployed: ${a?.deploy_url ? 'yes' : 'no'} | liveness: ${liveness} | revenue: $${a?.monthly_revenue ?? 0}`,
    a?.strategic_importance ? `strategic importance: ${a.strategic_importance}${a.strategic_role ? ` (${a.strategic_role})` : ''}` : '',
    p?.purpose ? `purpose: ${p.purpose}` : '',
    p?.audience ? `audience: ${p.audience}` : '',
    p?.current_state ? `current state: ${p.current_state}` : '',
    p?.blocker ? `blocker: ${p.blocker}` : '',
    p?.next_milestone ? `next milestone: ${p.next_milestone}` : '',
  ].filter(Boolean).join('\n');
}

/** A worker whose output is a single markdown report from one model call (research/bug/builder share this). */
async function reportWorker(system: string, brief: string, ctx: WorkerContext, artifactKind: string, artifactTitle: string): Promise<WorkerResult> {
  const context = await appContextBlock(ctx.appId, ctx.subject);
  const user = [`CONTEXT:\n${context}`, '', `TASK: ${brief || ctx.subject}`, '', 'Write the deliverable now as clean markdown.'].join('\n');
  const r = await rawComplete([{ role: 'system', content: system }, { role: 'user', content: user }], 1800);
  const body = r.text.trim();
  const firstLine = body.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))?.slice(0, 200) ?? body.slice(0, 200);
  return {
    summary: firstLine,
    artifacts: [{ kind: artifactKind, title: artifactTitle, body }],
    verify: reportVerify(body),
    costUsd: estimateCostUsd(r.inputTokens, r.outputTokens),
  };
}

// ---- worker system prompts ----

const RESEARCH_SYSTEM = `You are Garvis's research analyst. Produce a tight, honest market & competitor brief for the subject.
Cover: the market and who the buyers are, 3-5 likely competitors and how the subject differs, the clearest
opportunities, and the risks. Ground claims in the context given; where you're inferring, say so. You do NOT
have live web access here — reason from the context and general knowledge, and flag anything that needs
live verification. Output clean markdown with short sections. No preamble.`;

const BUG_SYSTEM = `You are Garvis's debugging engineer. From the context (deploy/liveness state, open issues, the app's
known blocker), produce a prioritized DIAGNOSIS: the most likely problems, each with a probable root cause
and a concrete recommended fix, ordered by severity. Be specific and honest; if you lack the code to be
certain, say what you'd need to confirm. Note that actual code fixes are applied in the app's workspace (or,
for FableForge-native projects, by the build pipeline) — your job is the accurate diagnosis + fix recipe.
Output clean markdown. No preamble.`;

const BUILDER_SYSTEM = `You are Garvis's product engineer. Produce a phased BUILD PLAN to accomplish the task for this app:
the single most important thing to build first, then a short Now / Next / Later breakdown with an effort tag
(small/moderate/large) per item, grounded in the app's current state and next milestone. Be concrete about
files/features where you can infer them. Note that execution happens in the app's workspace / build
pipeline — this is the plan that drives it. Output clean markdown. No preamble.`;

const ANALYTICS_NARRATIVE = `You are Garvis's analyst. Given the hard signals below about an app, write a 3-4 sentence honest read of
its real-world health and the one number or signal that matters most right now. No fluff, no invented
metrics. Output plain prose.`;

// ---- the registry ----

export const WORKERS: Record<WorkerKind, Worker> = {
  research: {
    kind: 'research', label: 'Research', safety: 'read_only',
    description: 'Market & competitor research: who the buyers are, competitors, opportunities, risks. Works on any subject. Produces a research brief.',
    autonomy: 'Fully autonomous (read-only).',
    run: (brief, ctx) => reportWorker(RESEARCH_SYSTEM, brief, ctx, 'research', 'Research brief'),
  },

  bug: {
    kind: 'bug', label: 'Bug / QA', safety: 'writes_data',
    description: "Diagnose what's broken: reads liveness, open issues, and the app's known blocker, then produces a prioritized root-cause diagnosis with recommended fixes. (Auto-applying fixes is gated to the app workspace.)",
    autonomy: 'Diagnosis is autonomous; code fixes are applied in the workspace.',
    run: async (brief, ctx) => {
      // Enrich the brief with live repo issues when we have a repo.
      let extra = '';
      if (ctx.appId) {
        const { data: app } = await supabase.from('apps').select('repo_url').eq('id', ctx.appId).maybeSingle();
        const repoUrl = (app as { repo_url?: string } | null)?.repo_url;
        if (repoUrl) {
          try {
            const state = await fetchRepoState(repoUrl);
            if (state.topIssues.length) extra = `\nOPEN ISSUES:\n${state.topIssues.map((i) => `- #${i.number} ${i.title}`).join('\n')}`;
          } catch { /* best-effort */ }
        }
      }
      return reportWorker(BUG_SYSTEM, `${brief}${extra}`, ctx, 'diagnosis', 'Bug diagnosis');
    },
  },

  builder: {
    kind: 'builder', label: 'Builder', safety: 'writes_data',
    description: 'Produce a phased build plan (what to build first, Now/Next/Later with effort) for a feature or goal, grounded in the app. (Execution happens in the workspace / build pipeline.)',
    autonomy: 'Plan is autonomous; building executes in the workspace.',
    run: (brief, ctx) => reportWorker(BUILDER_SYSTEM, brief, ctx, 'plan', 'Build plan'),
  },

  analytics: {
    kind: 'analytics', label: 'Analytics', safety: 'read_only',
    description: 'A health read of an app from real signals — liveness, deploy status, revenue, recent activity. Works on portfolio apps. Produces a health report.',
    autonomy: 'Fully autonomous (read-only).',
    run: async (brief, ctx) => {
      const context = await appContextBlock(ctx.appId, ctx.subject);
      let repoLine = '';
      if (ctx.appId) {
        const { data: app } = await supabase.from('apps').select('repo_url').eq('id', ctx.appId).maybeSingle();
        const repoUrl = (app as { repo_url?: string } | null)?.repo_url;
        if (repoUrl) {
          try { const s = await fetchRepoState(repoUrl); repoLine = `\nrecent commits: ${s.recentCommits.length}; last push: ${s.pushedAt?.slice(0, 10) ?? '?'}; open issues: ${s.openIssues}`; } catch { /* ignore */ }
        }
      }
      const r = await rawComplete([{ role: 'system', content: ANALYTICS_NARRATIVE }, { role: 'user', content: `${context}${repoLine}\n\nTASK: ${brief || 'Assess current health.'}` }], 500);
      const body = `## Health read\n\n${context}${repoLine}\n\n**Garvis's read:** ${r.text.trim()}`;
      return { summary: r.text.trim().slice(0, 200), artifacts: [{ kind: 'health', title: 'Health report', body }], verify: reportVerify(body), costUsd: estimateCostUsd(r.inputTokens, r.outputTokens) };
    },
  },

  marketing: {
    kind: 'marketing', label: 'Marketing', safety: 'writes_data',
    description: 'Produce a full marketing campaign: strategy, content calendar, social posts, launch email, landing-page copy — all as reviewable drafts. Works on any subject.',
    autonomy: 'Generates drafts autonomously; publishing is one-click approve (you fire it).',
    run: async (brief, ctx) => {
      const res = await generateCampaign({ ownerId: ctx.ownerId, subject: ctx.subject, brief, appId: ctx.appId });
      const body = `Generated a full campaign for **${ctx.subject}** — ${res.assetCount} draft assets (strategy, calendar, posts, email, landing page).\n\nReview & publish them on the **Marketing** page.`;
      return {
        summary: res.summary,
        artifacts: [{ kind: 'campaign', title: 'Marketing campaign', body }],
        link: `/garvis/marketing`,
        verify: { ok: res.assetCount > 0, issues: res.assetCount > 0 ? [] : ['no assets were produced'], warnings: [] },
        costUsd: res.costUsd,
      };
    },
  },
};

export const WORKER_KINDS = Object.keys(WORKERS) as WorkerKind[];

/** The catalog the Planner sees so it can assign the right worker to each task. */
export function workerCatalog(): string {
  return WORKER_KINDS.map((k) => `- ${k}: ${WORKERS[k].description} [${WORKERS[k].safety}]`).join('\n');
}
