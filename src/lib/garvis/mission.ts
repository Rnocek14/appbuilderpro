// src/lib/garvis/mission.ts
// Pure helpers for the Mission orchestrator's PLANNER — the Jarvis front door. Given an objective and
// the worker catalog, the Planner decomposes it into a focused, ordered list of worker-typed tasks.
// This module owns the prompt + the tolerant parse/validation (drops unknown workers, caps the plan);
// the model call + persistence + dispatch live in useMissions. Orchestrator-workers, per the research.

import type { WorkerKind } from '../../types';

export interface PlannedTask { worker: WorkerKind; title: string; brief: string }
export interface MissionPlan { summary: string; tasks: PlannedTask[] }

const MAX_TASKS = 6;

export function buildPlannerSystem(catalog: string): string {
  return `You are Garvis's Chief of Staff, planning how to accomplish an objective by delegating to your worker team.

YOUR WORKERS (assign each task to exactly one):
${catalog}

HOW TO PLAN:
- Decompose the objective into 2-${MAX_TASKS} concrete tasks, each handled by ONE worker.
- Sequence sensibly: understand before you act (research / analytics first; marketing / builder after).
- Be lean — fewer, higher-leverage tasks beat a long list. Don't pad.
- Only plan what a worker can actually do (see the catalog + its safety). Don't promise auto-publishing or
  auto-editing external code; marketing produces drafts, bug/builder produce diagnoses/plans.
- Each task needs a short, specific brief telling its worker exactly what to produce.

OUTPUT exactly one JSON object, no prose, no fences:
{
  "summary": "one sentence: the plan of attack",
  "tasks": [ { "worker": "research", "title": "Scan the local market", "brief": "..." } ]
}`;
}

export function buildPlannerUser(objective: string, subject: string, isExternal: boolean): string {
  return [
    `OBJECTIVE: ${objective}`,
    `SUBJECT: ${subject}${isExternal ? ' (external — not a portfolio app; no repo/code access)' : ' (a portfolio app)'}`,
    '',
    'Return the single JSON plan now.',
  ].join('\n');
}

function extractJson<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    return JSON.parse(clean.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}

/** Tolerant parse: keep only tasks assigned to a known worker, require a title, cap the plan length. */
export function parsePlan(raw: string, validKinds: Set<string>): MissionPlan {
  const o = extractJson<Record<string, unknown>>(raw);
  if (!o) return { summary: '', tasks: [] };
  const rawTasks = Array.isArray(o.tasks) ? (o.tasks as Record<string, unknown>[]) : [];
  const tasks: PlannedTask[] = [];
  for (const t of rawTasks) {
    const worker = typeof t.worker === 'string' ? t.worker : '';
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    if (!validKinds.has(worker) || !title) continue;
    tasks.push({ worker: worker as WorkerKind, title, brief: typeof t.brief === 'string' ? t.brief.trim() : '' });
    if (tasks.length >= MAX_TASKS) break;
  }
  return { summary: typeof o.summary === 'string' ? o.summary : '', tasks };
}
