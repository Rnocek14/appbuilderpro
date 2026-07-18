// src/lib/threads.ts
// Conversation threads — separate chat flows within one project (e.g. "dark mode" vs "billing"),
// so working on multiple ideas doesn't tangle their histories or muddy the model's context.
//
// Threads organize the CONVERSATION, not the code: every thread still edits the same project
// files (like Cursor's composer threads over one repo). Thread metadata lives in a project meta
// file (no DB table); each ai_messages row carries a thread_id (NULL/'main' = the default thread).

import { supabase } from './supabase';

export const THREADS_PATH = '/.fableforge/threads.json';
export const MAIN_THREAD_ID = 'main';

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  /**
   * 'branch' = a FEATURE BRANCH: this thread also forks the code (copy-on-write overlay on Main,
   * see lib/branches.ts) and can be merged back. Absent/'chat' = classic conversation-only thread.
   */
  kind?: 'chat' | 'branch';
}

/** The always-present default thread. */
function mainThread(): Thread {
  return { id: MAIN_THREAD_ID, title: 'Main', createdAt: '1970-01-01T00:00:00.000Z' };
}

/** Normalize a message's thread id (NULL / missing column → the Main thread). */
export function threadOf(thread_id: string | null | undefined): string {
  return thread_id ?? MAIN_THREAD_ID;
}

export async function getThreads(projectId: string): Promise<Thread[]> {
  const { data } = await supabase
    .from('project_files').select('content')
    .eq('project_id', projectId).eq('path', THREADS_PATH).is('deleted_at', null).maybeSingle();
  let extra: Thread[] = [];
  try { extra = data?.content ? (JSON.parse(data.content) as Thread[]) : []; } catch { extra = []; }
  // Main is always first and can't be removed; user threads follow in creation order.
  const seen = new Set<string>([MAIN_THREAD_ID]);
  const list = [mainThread()];
  for (const t of extra) {
    if (t && t.id && t.id !== MAIN_THREAD_ID && !seen.has(t.id)) { seen.add(t.id); list.push(t); }
  }
  return list;
}

async function saveThreads(projectId: string, threads: Thread[]): Promise<void> {
  // Persist only the non-Main threads (Main is implicit).
  const extra = threads.filter((t) => t.id !== MAIN_THREAD_ID);
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: THREADS_PATH, content: JSON.stringify(extra, null, 2), updated_by_ai: false },
    { onConflict: 'project_id,path' },
  );
}

/** Mint a thread id without Date.now()/Math.random restrictions (this is app code, both allowed). */
function newId(): string {
  try { return crypto.randomUUID(); } catch { return `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}

export async function createThread(projectId: string, title = 'New thread', kind: 'chat' | 'branch' = 'chat'): Promise<Thread> {
  const threads = await getThreads(projectId);
  const thread: Thread = { id: newId(), title: title.trim() || 'New thread', createdAt: new Date().toISOString(), ...(kind === 'branch' ? { kind } : {}) };
  await saveThreads(projectId, [...threads, thread]);
  return thread;
}

export async function renameThread(projectId: string, id: string, title: string): Promise<void> {
  if (id === MAIN_THREAD_ID) return; // Main isn't renamable
  const threads = await getThreads(projectId);
  await saveThreads(projectId, threads.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)));
}

export async function deleteThread(projectId: string, id: string): Promise<void> {
  if (id === MAIN_THREAD_ID) return;
  const threads = await getThreads(projectId);
  await saveThreads(projectId, threads.filter((t) => t.id !== id));
  // Reassign that thread's messages to Main so they're not orphaned/hidden.
  await supabase.from('ai_messages').update({ thread_id: MAIN_THREAD_ID }).eq('project_id', projectId).eq('thread_id', id);
}

// ---- active-thread selection (per project, this browser) ----
const ACTIVE_KEY = (projectId: string) => `ff:thread:${projectId}`;

/**
 * Probe whether the thread_id migration has been applied. If the column is missing, threads
 * can't truly separate messages (they all fall back to Main) — the UI uses this to warn the user
 * instead of letting them hit a confusing "my new thread is empty" state.
 */
export async function threadsEnabled(): Promise<boolean> {
  const { error } = await supabase.from('ai_messages').select('thread_id').limit(1);
  return !error;
}

export function getActiveThread(projectId: string): string {
  try { return localStorage.getItem(ACTIVE_KEY(projectId)) || MAIN_THREAD_ID; } catch { return MAIN_THREAD_ID; }
}
export function setActiveThread(projectId: string, id: string): void {
  try { localStorage.setItem(ACTIVE_KEY(projectId), id); } catch { /* ignore */ }
}
