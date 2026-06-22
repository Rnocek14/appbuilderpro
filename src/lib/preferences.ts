// src/lib/preferences.ts
// Learned preferences — the durable rules the user teaches FableForge so it improves over time.
//
// Two layers (the user picked both):
//   • PROJECT prefs — specific to one app (its look, conventions, decisions). Stored as a file
//     in project_files at PREFS_PATH, like the Brain, so no migration is needed and it travels
//     with the project. Injected into every edit for that project.
//   • GLOBAL prefs — universal personal taste ("always pure-black dark mode") that should apply
//     to every project. Stored in localStorage (per-browser, consistent with the model config and
//     spend ledger in direct mode) and injected into every project's edits.
//
// Capture is feedback-triggered and visible: the user adds/removes rules in the Remember panel;
// nothing is written silently. PREFS_PATH lives under /.fableforge/ so it's hidden from the file
// tree and excluded from app-code context (isMetaFile).

import { supabase } from './supabase';

export const PREFS_PATH = '/.fableforge/preferences.md';
const GLOBAL_KEY = 'fableforge.prefs.global.v1';
const CHANGE_EVENT = 'fableforge:prefs';

function emit(): void {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* no window */ }
}

/** One preference per line; '-'/'*' bullets and markdown headings are tolerated and stripped. */
function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#'));
}

function serializeList(items: string[]): string {
  return ['# Remembered preferences', '', ...items.map((i) => `- ${i}`)].join('\n') + '\n';
}

// ---------------- Project preferences (stored as a project file) ----------------

export async function getProjectPrefs(projectId: string): Promise<string[]> {
  const { data } = await supabase
    .from('project_files').select('content')
    .eq('project_id', projectId).eq('path', PREFS_PATH).is('deleted_at', null).maybeSingle();
  return parseList(data?.content ?? '');
}

async function saveProjectPrefs(projectId: string, items: string[]): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: PREFS_PATH, content: serializeList(items), updated_by_ai: true },
    { onConflict: 'project_id,path' },
  );
  emit();
}

export async function addProjectPref(projectId: string, pref: string): Promise<void> {
  const clean = pref.trim();
  if (!clean) return;
  const items = await getProjectPrefs(projectId);
  if (!items.some((i) => i.toLowerCase() === clean.toLowerCase())) items.push(clean);
  await saveProjectPrefs(projectId, items);
}

export async function removeProjectPref(projectId: string, pref: string): Promise<void> {
  const items = (await getProjectPrefs(projectId)).filter((p) => p !== pref);
  await saveProjectPrefs(projectId, items);
}

// ---------------- Global preferences (localStorage, per-browser) ----------------

export function getGlobalPrefs(): string[] {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveGlobalPrefs(items: string[]): void {
  try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(items)); } catch { /* fail silent */ }
  emit();
}

export function addGlobalPref(pref: string): void {
  const clean = pref.trim();
  if (!clean) return;
  const items = getGlobalPrefs();
  if (!items.some((i) => i.toLowerCase() === clean.toLowerCase())) items.push(clean);
  saveGlobalPrefs(items);
}

export function removeGlobalPref(pref: string): void {
  saveGlobalPrefs(getGlobalPrefs().filter((p) => p !== pref));
}

// ---------------- Context injection ----------------

/**
 * Build the REMEMBERED PREFERENCES context block for an edit. Takes the project prefs file
 * content (already loaded with the project's other files, so no extra fetch) and merges the
 * global prefs from localStorage. Returns '' when there's nothing to inject.
 */
export function prefsContext(projectPrefsText: string): string {
  const project = parseList(projectPrefsText);
  const global = getGlobalPrefs();
  if (!project.length && !global.length) return '';
  const lines: string[] = [];
  if (global.length) { lines.push("Across all the user's projects:"); global.forEach((p) => lines.push(`- ${p}`)); }
  if (project.length) { lines.push('For this project specifically:'); project.forEach((p) => lines.push(`- ${p}`)); }
  return (
    'REMEMBERED PREFERENCES — durable rules the user has taught you. Apply them by default in ' +
    'every change unless the user explicitly overrides one this turn:\n' + lines.join('\n') + '\n\n'
  );
}

export function subscribePrefs(cb: () => void): () => void {
  const onChange = () => cb();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
