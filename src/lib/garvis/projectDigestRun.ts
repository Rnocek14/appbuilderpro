// src/lib/garvis/projectDigestRun.ts
// The digest's impure half: read the project's live rows, compute the fingerprint, and hand back
// the composed context. The FREE layer (name, description, file tree, the operator's own notes)
// is computed from those rows every time, so it is never stale and never costs a token. The AI
// summary is cached in the project itself at /.fableforge/digest.md and regenerated only when the
// fingerprint drifts.
//
// AUTO-REFRESH IS NON-BLOCKING BY DESIGN. A stale digest still answers immediately (labelled
// stale, so nothing out of date is passed off as current) while the refresh runs in the
// background — the operator never waits on a summarizer. Refreshes are deduped per project, and a
// failed one degrades to the free layer instead of breaking the ask.

import { supabase } from '../supabase';
import {
  DIGEST_PATH, composeProjectContext, fingerprintFiles, formatDigest, isDigestStale, parseDigest,
  projectTree, sourceFiles, summaryPrompt, SUMMARY_SYSTEM, type DigestFile,
} from './projectDigest';
import { BRAIN_PATH } from '../projectBrain';

/** Only what a summary needs — far below the edit path's budget, and it runs only on change. */
const SUMMARY_CHAR_BUDGET = 40_000;
const ENTRY = [/^\/src\/(App|main|index)\.(t|j)sx?$/, /^\/(App|index)\.(t|j)sx?$/, /^\/package\.json$/, /^\/src\/(routes?|router)\./];

/** In-flight refreshes, so a burst of asks triggers one summarizer call, not five. */
const refreshing = new Set<string>();

function pickForSummary(files: DigestFile[]): string {
  const src = sourceFiles(files);
  const ranked = [...src].sort((a, b) => {
    const ea = ENTRY.some((re) => re.test(a.path)) ? 0 : 1;
    const eb = ENTRY.some((re) => re.test(b.path)) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path);
  });
  const out: string[] = [];
  let used = 0;
  for (const f of ranked) {
    const block = `--- ${f.path} ---\n${f.content}`;
    if (used + block.length > SUMMARY_CHAR_BUDGET) continue;
    out.push(block);
    used += block.length;
  }
  return out.join('\n\n');
}

interface ProjectRows {
  name: string;
  description: string | null;
  files: DigestFile[];
  brain: string;
  storedDigest: string | null;
}

async function loadRows(projectId: string): Promise<ProjectRows | null> {
  const [{ data: proj }, { data: fileRows }] = await Promise.all([
    supabase.from('projects').select('name, description').eq('id', projectId).maybeSingle(),
    supabase.from('project_files').select('path, content').eq('project_id', projectId)
      .is('deleted_at', null).limit(600),
  ]);
  if (!proj) return null;
  const files = ((fileRows ?? []) as DigestFile[]).filter((f) => typeof f.path === 'string' && typeof f.content === 'string');
  return {
    name: (proj as { name: string }).name,
    description: (proj as { description: string | null }).description,
    files,
    brain: files.find((f) => f.path === BRAIN_PATH)?.content ?? '',
    storedDigest: files.find((f) => f.path === DIGEST_PATH)?.content ?? null,
  };
}

/** Generate and persist a fresh summary. Never throws — a failed refresh just leaves the previous
 *  (labelled-stale) summary in place. */
async function refresh(projectId: string, rows: ProjectRows, fingerprint: string): Promise<string | null> {
  if (refreshing.has(projectId)) return null;
  refreshing.add(projectId);
  try {
    const code = pickForSummary(rows.files);
    if (!code) return null;
    const { data, error } = await supabase.functions.invoke('cluster-chat', {
      body: {
        system: SUMMARY_SYSTEM,
        context: '',
        history: [],
        message: summaryPrompt(rows.name, projectTree(rows.files), code),
        format: 'raw',
      },
    });
    if (error) return null;
    const summary = ((data as { text?: string })?.text ?? '').trim();
    if (!summary) return null;
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: DIGEST_PATH, content: formatDigest(fingerprint, summary), updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
    return summary;
  } catch {
    return null;
  } finally {
    refreshing.delete(projectId);
  }
}

export interface ProjectDigest {
  context: string;
  stale: boolean;
  /** True when a background refresh was kicked off by this read. */
  refreshing: boolean;
}

/**
 * The context for ONE project, always fresh in its free layer.
 * `await`: pass `{ blocking: true }` to wait for a stale summary to regenerate (batch jobs);
 * the default returns immediately and refreshes behind the ask (the dock).
 */
export async function loadProjectDigest(
  projectId: string,
  opts: { blocking?: boolean } = {},
): Promise<ProjectDigest | null> {
  const rows = await loadRows(projectId).catch(() => null);
  if (!rows) return null;

  const fingerprint = fingerprintFiles(rows.files);
  const stored = parseDigest(rows.storedDigest);
  const stale = isDigestStale(stored, fingerprint);

  let summary = stored?.summary ?? null;
  let summaryStale = stale && !!summary;
  let kicked = false;

  if (stale) {
    if (opts.blocking) {
      const fresh = await refresh(projectId, rows, fingerprint);
      if (fresh) { summary = fresh; summaryStale = false; }
    } else {
      kicked = !refreshing.has(projectId);
      void refresh(projectId, rows, fingerprint);
    }
  }

  return {
    context: composeProjectContext({
      name: rows.name,
      description: rows.description,
      brain: rows.brain,
      summary,
      summaryStale,
      files: rows.files,
    }),
    stale,
    refreshing: kicked,
  };
}
