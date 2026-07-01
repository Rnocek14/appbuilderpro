// src/lib/garvis/content.ts
// Pure helpers to surface content an act-run drafted. The `generate_short_script` tool's result is
// persisted in the run's checkpoint.history as a tool message (runtime.ts pushes
// `{ role:'tool', content: JSON.stringify(result.output).slice(0,4000) }`, and executeTool returns
// `{ short: ShortScriptResult }`). We read it back out here so the UI can show + copy the draft.
// No supabase import → unit-testable without a DB.

import type { AgentRun } from '../../types';
import type { ShortScriptResult } from './knowledge';

function looksLikeScript(v: unknown): v is ShortScriptResult {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.hook === 'string' || typeof o.script === 'string';
}

/**
 * Pull every short-script the run drafted out of its checkpoint history. Degrades gracefully: tool
 * messages that aren't JSON, or are truncated past the 4k slice, are simply skipped (so a long draft
 * never crashes the panel — the caller falls back to the run's summary text).
 */
export function extractGeneratedContent(run: AgentRun | null): ShortScriptResult[] {
  const history = run?.checkpoint?.history ?? [];
  const out: ShortScriptResult[] = [];
  for (const m of history) {
    if (m.role !== 'tool') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(m.content);
    } catch {
      continue; // unparseable / truncated tool result — skip
    }
    const short = (parsed as { short?: unknown })?.short;
    if (looksLikeScript(short)) out.push(short);
  }
  return out;
}

/** Render a short script as a copy/export markdown blob. */
export function shortScriptToMarkdown(s: ShortScriptResult): string {
  const beats = s.visual_beats.length ? s.visual_beats.map((b, i) => `${i + 1}. ${b}`).join('\n') : '(none)';
  return [
    `# Hook\n${s.hook || '(none)'}`,
    `# Script\n${s.script || '(none)'}`,
    `# Caption\n${s.caption || '(none)'}`,
    `# CTA\n${s.cta || '(none)'}`,
    `# Visual beats\n${beats}`,
    `\n_Draft only — script_only, nothing was rendered or published._`,
  ].join('\n\n');
}
