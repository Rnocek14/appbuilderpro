// src/lib/mergeBranch.ts
// The readiness-gated merge: bring a feature branch's changes into Main so that Main NEVER
// receives a broken or half-merged state. The pipeline is:
//
//   1. diff     — three-way classify every branch change against Main's current content
//   2. resolve  — conflicts (both sides changed a file) are merged by the model, with the
//                 branch's chat history as intent context
//   3. verify   — the full CANDIDATE (Main + branch changes) runs static QA + the real
//                 TypeScript compiler, BEFORE anything is written
//   4. repair   — if checks fail, the agent fixes the candidate IN MEMORY (no DB writes)
//   5. commit   — only a green candidate is written to Main, then the branch overlay clears
//
// If verification can't be made green, the merge aborts with a report and Main is untouched —
// "get merge-ready first" instead of "merge, break, revert".

import { supabase } from './supabase';
import { validateProject } from './qaCheck';
import { isMetaFile } from './projectBrain';
import { rawComplete } from './aiClient';
import { recordUsage } from './usage';
import { resolveAI } from './aiConfig';
import { AGENT_BUILD_SYSTEM } from './prompts';
import { runAgent, agentAvailable } from './agent/loop';
import type { AgentToolContext } from './agent/tools';
import { threadOf } from './threads';
import {
  loadProjectRows, readBranchState, classifyBranch, buildCandidate, discardBranch,
  type BranchChange,
} from './branches';
import { diffLines } from 'diff';
import type { ProjectFile } from '../types';

export interface MergeProgress {
  step: 'diff' | 'resolve' | 'verify' | 'repair' | 'commit';
  detail: string;
}

export interface MergeReport {
  ok: boolean;
  /** Failure explanation when ok=false (Main untouched in that case). */
  reason?: string;
  /** Paths written to Main. */
  merged: string[];
  /** Paths removed from Main. */
  deletedPaths: string[];
  /** Branch deletes skipped because Main changed the file since the fork (Main's version kept). */
  skippedDeletes: string[];
  /** Conflicted paths the model had to merge. */
  conflictsResolved: string[];
  repairRounds: number;
  /** Human summary of the readiness gate ("tsc clean", "static checks only", …). */
  checks: string;
}

/** Insert a chat message, dropping newer columns (thread_id/changes) if the DB predates them. */
async function insertMergeMessage(row: Record<string, unknown>): Promise<void> {
  const res = await supabase.from('ai_messages').insert(row);
  if (res.error && /thread_id|changes|column|schema cache|does not exist/i.test(res.error.message ?? '')) {
    const { thread_id: _t, changes: _c, ...rest } = row; void _t; void _c;
    await supabase.from('ai_messages').insert(rest);
  }
}

function diffstat(before: string, after: string): { additions: number; deletions: number } {
  let additions = 0, deletions = 0;
  for (const p of diffLines(before, after)) {
    if (p.added) additions += p.count ?? 0;
    else if (p.removed) deletions += p.count ?? 0;
  }
  return { additions, deletions };
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\n([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1] : t;
}

/** Model-merge one conflicted file: base + both sides + the branch's intent → merged content. */
async function resolveConflict(
  change: BranchChange, intent: string, threadTitle: string | undefined,
): Promise<string> {
  const ai = resolveAI();
  const res = await rawComplete([
    {
      role: 'system',
      content: 'You merge two divergent versions of one source file. Produce a single merged file that preserves BOTH sides\' intent: keep every improvement made on MAIN, and integrate the FEATURE BRANCH\'s changes on top. The result must be complete and syntactically valid. Reply with ONLY the merged file content — no fences, no commentary.',
    },
    {
      role: 'user',
      content: [
        `FILE: ${change.path}`,
        threadTitle ? `The feature branch is called "${threadTitle}".` : '',
        intent ? `FEATURE BRANCH INTENT (recent conversation):\n${intent}` : '',
        `--- COMMON ANCESTOR (when the branch forked) ---\n${change.base ?? ''}`,
        `--- MAIN (current) ---\n${change.main ?? ''}`,
        `--- FEATURE BRANCH (current) ---\n${change.branch ?? ''}`,
        'Merged file content:',
      ].filter(Boolean).join('\n\n'),
    },
  ], 16000);
  recordUsage({ provider: ai.provider, model: ai.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheCreation: res.cacheCreation, cacheRead: res.cacheRead });
  const merged = stripFences(res.text);
  if (!merged.trim()) throw new Error(`The model returned an empty merge for ${change.path}.`);
  return merged;
}

/** Readiness gate: static QA always; the real compiler when the runtime can provide it. */
async function verifyCandidate(
  projectId: string, candidate: Map<string, string>,
): Promise<{ errors: string[]; checks: string }> {
  const arr = [...candidate].map(([path, content]) => ({ path, content }));
  const qaErrors = validateProject(arr).filter((i) => i.severity === 'error');
  const errors = qaErrors.map((i) => `${i.path} — ${i.message}`);
  let checks = 'static checks';
  try {
    const wc = await import('./webcontainer');
    const st = wc.getRunnerState();
    if (st.projectId === projectId && st.status === 'ready') {
      await wc.syncFiles(projectId, arr as unknown as ProjectFile[]);
      const diags = await wc.runTypecheck(projectId);
      errors.push(...diags.slice(0, 40).map((d) => `${d.path}:${d.line} — ${d.message}`));
      checks = 'static checks + tsc';
    } else {
      const res = await wc.deepTypecheck(projectId, arr as unknown as ProjectFile[]);
      if (res.ran) {
        errors.push(...res.diags.slice(0, 40).map((d) => `${d.path}:${d.line} — ${d.message}`));
        checks = 'static checks + tsc (headless)';
      }
    }
  } catch { /* best-effort: the compiler needs cross-origin isolation */ }
  return { errors, checks };
}

/**
 * Merge a feature branch into Main. Never leaves Main broken: all resolution and repair happens
 * on an in-memory candidate, and Main is only written once that candidate passes verification.
 */
export async function mergeBranchToMain(
  projectId: string, branchId: string,
  opts?: { threadTitle?: string; onProgress?: (p: MergeProgress) => void },
): Promise<MergeReport> {
  const progress = (step: MergeProgress['step'], detail: string) => opts?.onProgress?.({ step, detail });
  const report: MergeReport = {
    ok: false, merged: [], deletedPaths: [], skippedDeletes: [], conflictsResolved: [], repairRounds: 0, checks: '',
  };

  // 1. DIFF — always against fresh rows, not possibly-stale client state.
  progress('diff', 'Comparing the branch against Main…');
  const rows = await loadProjectRows(projectId);
  const state = readBranchState(rows, branchId);
  const mainApp = new Map<string, string>();
  for (const r of rows) if (!isMetaFile(r.path)) mainApp.set(r.path, r.content);
  const changes = classifyBranch(mainApp, state);
  const active = changes.filter((c) => c.action !== 'noop');
  report.skippedDeletes = active.filter((c) => c.action === 'delete-skipped').map((c) => c.path);

  if (active.every((c) => c.action === 'delete-skipped')) {
    // Nothing (left) to land — clear the overlay so the branch re-forks fresh from Main.
    await discardBranch(projectId, branchId);
    report.ok = true;
    report.checks = 'nothing to merge';
    return report;
  }

  // 2. RESOLVE — model-merge each conflict, with the branch's conversation as intent.
  const conflicts = active.filter((c) => c.action === 'conflict');
  const resolutions = new Map<string, string>();
  if (conflicts.length) {
    if (!agentAvailable()) {
      report.reason = `${conflicts.length} file(s) changed on both Main and this branch, and no Anthropic model is available to merge them. Main was not touched.`;
      return report;
    }
    const { data: history } = await supabase
      .from('ai_messages').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(60);
    const intent = ((history ?? []) as { role: string; content: string; thread_id?: string | null }[])
      .filter((m) => threadOf(m.thread_id) === branchId)
      .slice(0, 6).reverse()
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${(m.content ?? '').slice(0, 400)}`)
      .join('\n');
    for (const c of conflicts) {
      progress('resolve', `Merging both sides of ${c.path}…`);
      resolutions.set(c.path, await resolveConflict(c, intent, opts?.threadTitle));
      report.conflictsResolved.push(c.path);
    }
  }

  // 3. VERIFY the candidate — Main + branch changes, before anything is written.
  progress('verify', 'Running checks on the merged result…');
  const candidate = buildCandidate(mainApp, changes, resolutions);
  let verdict = await verifyCandidate(projectId, candidate);

  // 4. REPAIR in memory — the agent edits the CANDIDATE map only; no DB writes until green.
  for (let round = 0; round < 2 && verdict.errors.length && agentAvailable(); round++) {
    report.repairRounds = round + 1;
    progress('repair', `Checks found ${verdict.errors.length} issue(s) — getting the merge ready (round ${round + 1})…`);
    const ctx: AgentToolContext = {
      projectId,
      files: candidate,
      changed: new Set<string>(),
      deleted: new Set<string>(),
      writeFile: async (path, content) => { candidate.set(path, content); },
      deleteFile: async (path) => { candidate.delete(path); },
      typecheck: async () => {
        const v = await verifyCandidate(projectId, candidate);
        return v.errors.length
          ? { ok: false, summary: `These checks failed:\n${v.errors.join('\n')}\n\nFix the root cause of each, then run run_typecheck again.` }
          : { ok: true, summary: 'run_typecheck: clean.' };
      },
      onActivity: (label) => progress('repair', label),
    };
    const ai = resolveAI();
    const run = await runAgent({
      system: AGENT_BUILD_SYSTEM,
      userContent: [
        'A feature branch is being merged into the main app. The merged file set is in front of you, but verification found problems that MUST be fixed before the merge can land.',
        `PROBLEMS:\n${verdict.errors.slice(0, 40).map((e) => `- ${e}`).join('\n')}`,
        'Fix the root cause of every problem with the smallest correct change, then call run_typecheck. Do not stop until it reports clean.',
      ].join('\n\n'),
      ctx, maxSteps: 12,
    });
    recordUsage({ provider: ai.provider, model: ai.model, inputTokens: run.usage.inputTokens, outputTokens: run.usage.outputTokens, cacheCreation: run.usage.cacheCreation, cacheRead: run.usage.cacheRead });
    verdict = await verifyCandidate(projectId, candidate);
  }
  report.checks = verdict.checks;
  if (verdict.errors.length) {
    report.reason = `The merged result still fails ${verdict.errors.length} check(s) after repair — Main was NOT touched. The branch is intact; fix it there and merge again.\n\n${verdict.errors.slice(0, 10).join('\n')}`;
    return report;
  }

  // 5. COMMIT — the candidate is green; land it and clear the branch overlay.
  progress('commit', 'Checks passed — writing the merge to Main…');
  const messageChanges: { path: string; before: string; after: string; additions: number; deletions: number }[] = [];
  for (const [path, content] of candidate) {
    const before = mainApp.get(path);
    if (before === content) continue;
    const { error } = await supabase.from('project_files').upsert(
      { project_id: projectId, path, content, updated_by_ai: true, deleted_at: null },
      { onConflict: 'project_id,path' },
    );
    if (error) throw new Error(`Merge write failed at ${path}: ${error.message}`);
    report.merged.push(path);
    messageChanges.push({ path, before: before ?? '', after: content, ...diffstat(before ?? '', content) });
  }
  for (const c of active) {
    if (c.action !== 'delete') continue;
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', c.path);
    report.deletedPaths.push(c.path);
    messageChanges.push({ path: c.path, before: mainApp.get(c.path) ?? '', after: '', ...diffstat(mainApp.get(c.path) ?? '', '') });
  }
  await discardBranch(projectId, branchId);

  // Leave a visible record in the branch's chat (with diff cards via `changes`).
  const { data: auth } = await supabase.auth.getUser();
  const skippedNote = report.skippedDeletes.length
    ? `\n\n⚠️ Kept ${report.skippedDeletes.length} file(s) the branch deleted but Main had since changed: ${report.skippedDeletes.join(', ')}.`
    : '';
  await insertMergeMessage({
    project_id: projectId, user_id: auth.user?.id, role: 'assistant',
    content: `✅ Merged this branch into Main — ${report.merged.length} file(s) updated${report.deletedPaths.length ? `, ${report.deletedPaths.length} removed` : ''}${report.conflictsResolved.length ? `, ${report.conflictsResolved.length} conflict(s) resolved` : ''}. Verified before landing (${report.checks}); Main stayed green the whole time. The branch now tracks Main again — new edits here fork fresh.${skippedNote}`,
    files_changed: report.merged, thread_id: branchId,
    changes: messageChanges.length ? messageChanges : null,
  });

  report.ok = true;
  return report;
}
