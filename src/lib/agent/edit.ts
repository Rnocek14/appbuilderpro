// src/lib/agent/edit.ts
// The agentic edit entry point: wire a live project into the tool loop. Instead of the old single-shot
// "here's the whole codebase, emit changes" call, the model gets the file TREE + context and pulls the
// files it needs (read_file), edits them (write_file), researches unknowns (web_search), and verifies
// with the real gate (run_typecheck) — iterating until clean. This is the trust/capability upgrade.

import { diffLines } from 'diff';
import { supabase } from '../supabase';
import { resolveAI } from '../aiConfig';
import { recordUsage, tagUsageSince, estimateCost } from '../usage';
import { AGENT_BUILD_SYSTEM } from '../prompts';
import { runQA, issuesToFixRequest, validateProject } from '../projectQA';
import { readBranchState, writeBranchFile, deleteBranchFile, clearTombstone } from '../branches';
import { ASSETS_PATH, BRAIN_PATH, MAP_PATH, ROADMAP_PATH, brainContext, mapContext, roadmapContext, isMetaFile } from '../projectBrain';
import { PREFS_PATH, prefsContext } from '../preferences';
import { buildKnowledgeDigest } from '../garvis/knowledge';
import type { GarvisKnowledge } from '../../types';
import { previewContext } from '../previewRuntime';
import { MAIN_THREAD_ID, threadOf } from '../threads';
import type { ProjectFile } from '../../types';
import type { EditEvent, EditResult } from '../aiClient';
import { runAgent } from './loop';
import type { AgentToolContext } from './tools';

interface AIMessageRow { role: string; content: string; thread_id?: string | null }

/** One file's before/after for a chat turn — powers per-message diff cards in the chat. */
export interface MessageFileChange { path: string; before: string; after: string; additions: number; deletions: number }

function diffstat(before: string, after: string): { additions: number; deletions: number } {
  let additions = 0, deletions = 0;
  for (const p of diffLines(before, after)) {
    if (p.added) additions += p.count ?? 0;
    else if (p.removed) deletions += p.count ?? 0;
  }
  return { additions, deletions };
}

/** Insert an ai_messages row, gracefully dropping newer columns (thread_id, changes) if the DB predates them. */
async function insertMessage(row: Record<string, unknown>): Promise<string | undefined> {
  const res = await supabase.from('ai_messages').insert(row).select('id').single();
  if (res.error && /thread_id|changes|column|schema cache|does not exist/i.test(res.error.message ?? '')) {
    const { thread_id: _t, changes: _c, ...rest } = row; void _t; void _c;
    const retry = await supabase.from('ai_messages').insert(rest).select('id').single();
    return (retry.data as { id?: string } | null)?.id;
  }
  return (res.data as { id?: string } | null)?.id;
}

function imageBlockFromDataUrl(dataUrl: string): { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | null {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
}

/**
 * Verification gate for the agent's run_typecheck tool. Static QA (import resolution, exports, dead
 * links, node-builtins) always runs off the DB — and reflects the writes the agent just made. Real
 * `tsc` runs when the WebContainer runtime is already up for this project — and in DEEP mode
 * (generation verify) it is booted headlessly on demand (mount + install + tsc, no dev server) so
 * every fresh generation is compiler-verified even with the preview closed.
 */
async function verifyProject(projectId: string, files: Map<string, string>, deep = false, qaFromFiles = false): Promise<{ ok: boolean; summary: string }> {
  // On a feature branch the DB's Main files aren't what the agent is editing — QA must run over
  // the branch's composed view (the live `files` map the tool executor keeps current).
  const qaIssues = qaFromFiles
    ? validateProject([...files].map(([path, content]) => ({ path, content })))
    : await runQA(projectId);
  const qaErrors = qaIssues.filter((i) => i.severity === 'error');
  let tscErrors: string | null = null; // null = not run, '' = clean, else the error list
  try {
    const wc = await import('../webcontainer');
    const arr = [...files].map(([path, content]) => ({ path, content })) as unknown as ProjectFile[];
    const st = wc.getRunnerState();
    if (st.projectId === projectId && st.status === 'ready') {
      await wc.syncFiles(projectId, arr);
      const diags = await wc.runTypecheck(projectId);
      tscErrors = diags.length ? diags.slice(0, 40).map((d) => `${d.path}:${d.line} — ${d.message}`).join('\n') : '';
    } else if (deep) {
      const res = await wc.deepTypecheck(projectId, arr);
      if (res.ran) {
        tscErrors = res.diags.length ? res.diags.slice(0, 40).map((d) => `${d.path}:${d.line} — ${d.message}`).join('\n') : '';
      }
    }
  } catch { /* best-effort: real tsc only when the runtime is available */ }

  const parts: string[] = [];
  if (qaErrors.length) parts.push(`Static checks found ${qaErrors.length} issue(s):\n${issuesToFixRequest(qaErrors)}`);
  if (tscErrors) parts.push(`TypeScript compiler reported errors:\n${tscErrors}`);
  if (!parts.length) {
    return { ok: true, summary: tscErrors === '' ? 'run_typecheck: clean — tsc passed and all imports/exports resolve.' : 'run_typecheck: clean — static checks passed (imports/exports/links OK).' };
  }
  return { ok: false, summary: parts.join('\n\n') + '\n\nFix the root cause of each error, then run run_typecheck again.' };
}

/**
 * The generation COMPILE GATE: load the project's files and run the deep compiler check (headless
 * boot when the preview isn't open). Returns the number of type errors, or null when this
 * environment can't run the compiler (no cross-origin isolation) — callers fall back to
 * static-only verification and say so honestly.
 */
export async function generationCompileGate(projectId: string): Promise<number | null> {
  const { data: fileRows } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const arr = ((fileRows ?? []) as { path: string; content: string }[]).filter((f) => !isMetaFile(f.path));
  try {
    const wc = await import('../webcontainer');
    const res = await wc.deepTypecheck(projectId, arr as unknown as ProjectFile[]);
    return res.ran ? res.diags.length : null;
  } catch {
    return null;
  }
}

/**
 * Generation-time agentic VERIFY + FIX: after a fresh app is generated (streamed in one pass), hand it
 * to the tool loop to make it actually compile/run. The agent runs run_typecheck, reads the offending
 * files, researches if unsure, fixes the root cause, and re-checks until clean. Silent (writes no chat
 * messages) so a generation stays clean in the conversation — this is what makes "generated" mean
 * "verified". Best-effort: the caller swallows failures and reports the residual issue count.
 */
export async function agenticVerifyAndFix(
  projectId: string, opts?: { onActivity?: (label: string) => void; maxSteps?: number },
): Promise<{ verified: boolean | null; changed: string[]; deleted: string[] }> {
  const { data: fileRows } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const files = new Map<string, string>();
  for (const f of (fileRows ?? []) as { path: string; content: string }[]) {
    if (!isMetaFile(f.path)) files.set(f.path, f.content);
  }

  const ctx: AgentToolContext = {
    projectId,
    files,
    changed: new Set<string>(),
    deleted: new Set<string>(),
    writeFile: async (path, content) => {
      await supabase.from('project_files').upsert(
        { project_id: projectId, path, content, updated_by_ai: true, deleted_at: null },
        { onConflict: 'project_id,path' },
      );
    },
    deleteFile: async (path) => {
      await supabase.from('project_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('project_id', projectId).eq('path', path);
    },
    typecheck: () => verifyProject(projectId, files, true), // deep: boot the compiler even with the preview closed
    onActivity: opts?.onActivity,
  };

  const tree = [...files.keys()].sort().join('\n') || '(empty project)';
  const userContent = [
    'A React app was just generated in this project. Your job is to make sure it actually compiles and runs, and fix anything that does not.',
    'Steps:',
    '1. Call run_typecheck.',
    '2. If it reports ANY error, read the offending file(s), fix the ROOT cause (use web_search if you are unsure of the correct approach), then call run_typecheck again.',
    '3. Repeat until run_typecheck is clean. Keep changes minimal — only what is needed for the app to be correct.',
    'When run_typecheck is clean, stop and reply with one short line confirming it.',
    `\nPROJECT FILES (call read_file to see any):\n${tree}`,
  ].join('\n');

  const ai = resolveAI();
  let result = await runAgent({ system: AGENT_BUILD_SYSTEM, userContent, ctx, maxSteps: opts?.maxSteps ?? 12, webSearch: true });
  recordUsage({ provider: ai.provider, model: ai.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheCreation: result.usage.cacheCreation, cacheRead: result.usage.cacheRead });

  // RELENTLESS: a fresh build that ships with known issues is the worst possible look. Keep
  // granting fresh step budget while the agent is still MAKING PROGRESS (touching new files —
  // ctx.changed/deleted are cumulative, so growth = progress), up to 3 extra rounds.
  let prevTouched = result.changed.length + result.deleted.length;
  for (let round = 0; round < 3 && result.verified === false; round++) {
    opts?.onActivity?.(`still failing — repair round ${round + 2}…`);
    const cont = await runAgent({
      system: AGENT_BUILD_SYSTEM,
      userContent: 'Your previous pass ended with verification still FAILING. Continue the repair: call run_typecheck, fix EVERY remaining error (truncated/malformed files must be rewritten COMPLETELY), and do not stop until it reports clean.',
      ctx, maxSteps: opts?.maxSteps ?? 12, webSearch: true,
    });
    recordUsage({ provider: ai.provider, model: ai.model, inputTokens: cont.usage.inputTokens, outputTokens: cont.usage.outputTokens, cacheCreation: cont.usage.cacheCreation, cacheRead: cont.usage.cacheRead });
    result = cont;
    const touched = result.changed.length + result.deleted.length;
    if (touched === prevTouched) break; // stalled — no new files touched; more budget won't help
    prevTouched = touched;
  }
  return { verified: result.verified, changed: result.changed, deleted: result.deleted };
}

/**
 * Run an agentic edit turn. Same public shape as the classic edit path so it drops into sendEdit.
 * planFirst / reviewMode are handled by the caller (they route to the classic path); this path makes
 * confident, verified changes directly.
 */
export async function agenticEdit(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void, image?: string, threadId: string = MAIN_THREAD_ID,
  branchId: string | null = null, signal?: AbortSignal,
): Promise<EditResult> {
  const startedAt = Date.now(); // usage recorded during this turn is tagged to the message below
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: fileRows } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const all = (fileRows ?? []) as { path: string; content: string }[];

  // The agent operates on real source files; meta (brain/map/prefs) is context, not editable source.
  // (isMetaFile also hides branch bookkeeping rows — Main's view never sees other branches.)
  const mainApp = new Map<string, string>();
  for (const f of all) if (!isMetaFile(f.path)) mainApp.set(f.path, f.content);

  // FEATURE BRANCH: the agent sees and edits the branch's composed view — Main's files with this
  // branch's copy-on-write overlay applied. All writes go to the overlay; Main is untouched.
  const branch = branchId ? readBranchState(all, branchId) : null;
  let files = mainApp;
  if (branch) {
    files = new Map(mainApp);
    for (const p of branch.deleted) files.delete(p);
    for (const [p, c] of branch.overrides) files.set(p, c);
  }

  const brain = all.find((f) => f.path === BRAIN_PATH)?.content ?? '';
  const map = all.find((f) => f.path === MAP_PATH)?.content ?? '';
  const roadmap = all.find((f) => f.path === ROADMAP_PATH)?.content ?? '';
  const assetsMd = all.find((f) => f.path === ASSETS_PATH)?.content?.trim() ?? '';
  const prefs = all.find((f) => f.path === PREFS_PATH)?.content ?? '';

  const { data: history } = await supabase
    .from('ai_messages').select('*')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(120);
  const historyText = ((history ?? []) as AIMessageRow[])
    .filter((m) => threadOf(m.thread_id) === threadId)
    .slice(0, 8).reverse()
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${(m.content ?? '').slice(0, 600)}`)
    .join('\n');

  // THE OPERATOR'S LESSONS. Approved knowledge (outcomes, decisions, lessons) previously reached
  // only Garvis agent runs — the builder never saw it, so hard-won lessons didn't shape builds.
  // Inject the same approved-only digest here. Best-effort: an un-applied migration = no digest.
  let knowledgeDigest = '';
  try {
    const { data: kRows } = await supabase
      .from('garvis_knowledge').select('*')
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(24);
    knowledgeDigest = buildKnowledgeDigest((kRows ?? []) as GarvisKnowledge[]);
  } catch { /* table absent → builder simply runs without the digest */ }

  await insertMessage({ project_id: projectId, user_id: userId, role: 'user', content: message, thread_id: threadId });
  onEvent?.({ type: 'start' });

  // Build the opening turn: context + the file TREE (not contents — the agent pulls what it needs).
  const tree = [...files.keys()].sort().join('\n') || '(empty project)';
  const preamble = [
    brainContext(brain), mapContext(map), roadmapContext(roadmap), assetsMd, prefsContext(prefs),
    knowledgeDigest,
    previewContext(),
    historyText ? `RECENT CONVERSATION:\n${historyText}` : '',
    `PROJECT FILES (call read_file to see any of these):\n${tree}`,
    previewError ? `\nThe preview has a runtime error to fix — diagnose the ROOT cause, then fix it:\n${previewError}` : '',
    `\nTASK:\n${message}`,
  ].filter(Boolean).join('\n\n');

  const imgBlock = image ? imageBlockFromDataUrl(image) : null;
  const userContent = imgBlock ? [{ type: 'text', text: preamble }, imgBlock] : preamble;

  // Per-turn before/after capture: first-write-wins on "before" so multiple writes to one file
  // diff cleanly from the turn's start. (ctx.files still holds the OLD content here — the tool
  // executor updates it after writeFile returns.)
  const turnChanges = new Map<string, { before: string; after: string }>();
  const recordChange = (path: string, after: string) => {
    const prev = turnChanges.get(path);
    turnChanges.set(path, { before: prev?.before ?? files.get(path) ?? '', after });
  };

  const ctx: AgentToolContext = {
    projectId,
    files,
    changed: new Set<string>(),
    deleted: new Set<string>(),
    writeFile: async (path, content) => {
      recordChange(path, content);
      if (branch && branchId) {
        // First write to a Main file freezes its merge base (copy-on-write).
        const freeze = !branch.bases.has(path) ? (mainApp.get(path) ?? null) : null;
        if (freeze !== null) branch.bases.set(path, freeze);
        await writeBranchFile(projectId, branchId, path, content, freeze);
        if (branch.deleted.has(path)) {
          branch.deleted.delete(path);
          await clearTombstone(projectId, branchId, path);
        }
      } else {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path, content, updated_by_ai: true, deleted_at: null },
          { onConflict: 'project_id,path' },
        );
      }
      onEvent?.({ type: 'file-done', path });
    },
    deleteFile: async (path) => {
      recordChange(path, '');
      if (branch && branchId) {
        const onMain = mainApp.has(path);
        const freeze = onMain && !branch.bases.has(path) ? mainApp.get(path)! : null;
        if (freeze !== null) branch.bases.set(path, freeze);
        await deleteBranchFile(projectId, branchId, path, freeze, onMain);
        if (onMain) branch.deleted.add(path);
      } else {
        await supabase.from('project_files')
          .update({ deleted_at: new Date().toISOString() })
          .eq('project_id', projectId).eq('path', path);
      }
      onEvent?.({ type: 'deletion', path });
    },
    typecheck: () => verifyProject(projectId, files, false, !!branch),
    onActivity: (label) => onEvent?.({ type: 'activity', text: label }),
  };

  const ai = resolveAI();
  let turnIn = 0, turnOut = 0; // whole-turn token totals (initial run + repair rounds)
  let result = await runAgent({
    system: AGENT_BUILD_SYSTEM,
    userContent,
    ctx,
    signal,
    onEvent: (e) => { if (e.text) onEvent?.({ type: 'explanation', text: e.text }); },
  });
  turnIn += result.usage.inputTokens; turnOut += result.usage.outputTokens;
  recordUsage({ provider: ai.provider, model: ai.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, cacheCreation: result.usage.cacheCreation, cacheRead: result.usage.cacheRead });

  // RELENTLESS REPAIR: never end a turn mid-surgery. If verification was still failing when the
  // step budget ran out, continue with fresh budget while the agent is still MAKING PROGRESS
  // (ctx.changed/deleted are cumulative — growth = new files touched), up to 4 rounds. Only a
  // genuinely stalled repair (a full round that touched nothing new) gives up.
  let prevTouched = result.changed.length + result.deleted.length;
  for (let round = 0; round < 4 && result.verified === false && (result.changed.length || result.deleted.length); round++) {
    onEvent?.({ type: 'activity', text: `Verification still failing — repair round ${round + 2}…` });
    const cont = await runAgent({
      system: AGENT_BUILD_SYSTEM,
      userContent: 'Your previous pass ended with verification still FAILING. Continue the repair: call run_typecheck, fix EVERY remaining error (truncated/malformed files must be rewritten COMPLETELY), and do not stop until it reports clean.',
      ctx,
      signal,
      maxSteps: 12,
      onEvent: (e) => { if (e.text) onEvent?.({ type: 'explanation', text: e.text }); },
    });
    turnIn += cont.usage.inputTokens; turnOut += cont.usage.outputTokens;
    recordUsage({ provider: ai.provider, model: ai.model, inputTokens: cont.usage.inputTokens, outputTokens: cont.usage.outputTokens, cacheCreation: cont.usage.cacheCreation, cacheRead: cont.usage.cacheRead });
    result = { ...cont, text: cont.text || result.text };
    const touched = result.changed.length + result.deleted.length;
    if (touched === prevTouched) break; // stalled — no new files touched this round
    prevTouched = touched;
  }

  const changed = result.changed;
  const deleted = result.deleted;
  const didEdit = changed.length > 0 || deleted.length > 0;
  // NEVER surface internal tool/verification dumps as the reply — the user reads this.
  const rawText = (result.text || '').trim();
  const looksInternal = /^these static checks failed/i.test(rawText) || /^run_typecheck:/i.test(rawText) || /^- \[error\]/im.test(rawText.slice(0, 200));
  const verifyNote = didEdit && result.verified === false
    ? '\n\n⚠️ I used my full repair budget and some checks still fail. Say "continue fixing" and I\'ll pick up exactly where I left off.'
    : '';
  const explanation = ((!rawText || looksInternal) ? (didEdit ? 'Done — changes applied and verified where possible.' : 'Here you go.') : rawText) + verifyNote;

  // Persist this turn's per-file before/after + diffstat — the chat renders them as diff cards.
  const messageChanges: MessageFileChange[] = [...turnChanges.entries()]
    .filter(([, c]) => c.before !== c.after)
    .map(([path, c]) => ({ path, before: c.before, after: c.after, ...diffstat(c.before, c.after) }));

  const id = await insertMessage({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: explanation, files_changed: changed, thread_id: threadId,
    changes: messageChanges.length ? messageChanges : null,
  });
  // Attribute this turn's model calls (initial run + repair rounds) to the message so the chat's
  // cost chip shows. (The old zero-token recordUsage here was a no-op — recordUsage skips 0/0.)
  if (id) tagUsageSince(id, startedAt);
  // Direct-mode usage event: the browser made the calls, so the client must log the 'edit' event
  // the monthly generation counter + Billing history read from (edge mode logs server-side).
  if (didEdit) {
    void supabase.from('usage_events').insert({
      user_id: userId, project_id: projectId, event_type: 'edit',
      provider: ai.provider, model: ai.model,
      input_tokens: turnIn, output_tokens: turnOut,
      cost_usd: Math.round(estimateCost(ai.provider, ai.model, turnIn, turnOut) * 1e5) / 1e5,
    }).then(() => {}, () => { /* best-effort — needs the app_0019 insert policy */ });
  }

  onEvent?.({ type: 'done' });
  return {
    action: didEdit ? 'edit' : 'discuss',
    explanation,
    changed,
    deleted,
  };
}
