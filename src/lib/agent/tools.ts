// src/lib/agent/tools.ts
// The tools the agentic build loop can call, in Anthropic tool-use format, plus a client-side
// executor. Tool SIDE EFFECTS (writing/deleting files, running the type-check) are provided by the
// caller via AgentToolContext, so this module stays dependency-light and testable. web_search is NOT
// here — it's Anthropic's server-side tool, added by the loop and executed by Anthropic itself.

/** Anthropic tool schema. */
export interface AgentToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}

/** Everything a tool needs to act on the live project. The loop threads one of these through. */
export interface AgentToolContext {
  projectId: string;
  /** Live view of the project's app files (path → content), kept in sync as the agent writes. */
  files: Map<string, string>;
  /** Paths the agent created/overwrote and paths it deleted, accumulated across the run. */
  changed: Set<string>;
  deleted: Set<string>;
  /** Persist a file (DB upsert + preview sync). */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Soft-delete a file. */
  deleteFile: (path: string) => Promise<void>;
  /** Run the real verification gate; ok=false means errors the agent must fix. */
  typecheck: () => Promise<{ ok: boolean; summary: string }>;
  /** Surface a short "what the agent is doing" label to the UI. */
  onActivity?: (label: string) => void;
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: 'list_files',
    description: 'List every file path in the project. Call this first on an unfamiliar codebase to understand its layout before editing.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_file',
    description: 'Read the full current contents of one file by absolute project path (e.g. "/src/App.tsx"). Always read a file before editing it so you edit its real current content.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute project path, e.g. /src/App.tsx' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with its COMPLETE new contents (never a diff, fragment, or "// ... unchanged" — always the entire file). Keep changes focused on the task.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'delete_file',
    description: 'Delete a file by its absolute project path.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'run_typecheck',
    description: 'Compile the project (real TypeScript compiler + static checks) and return any errors. Run this after editing to verify your work, and fix every error it reports before finishing.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

/** Normalize a model-supplied path to the project's absolute-with-leading-slash convention. */
function normalizePath(p: unknown): string {
  let s = String(p ?? '').trim().replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/{2,}/g, '/');
}

/** A short, human label for a path (last two segments) for the activity feed. */
function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || p;
}

/** Execute one tool call and return the string result fed back to the model as a tool_result. */
export async function executeAgentTool(
  name: string, input: Record<string, unknown>, ctx: AgentToolContext,
): Promise<string> {
  switch (name) {
    case 'list_files': {
      ctx.onActivity?.('Reading the project');
      const paths = [...ctx.files.keys()].sort();
      return paths.length ? paths.join('\n') : '(no files yet)';
    }
    case 'read_file': {
      const path = normalizePath(input.path);
      ctx.onActivity?.(`Reading ${shortPath(path)}`);
      const content = ctx.files.get(path);
      if (content === undefined) {
        const near = [...ctx.files.keys()].filter((p) => p.toLowerCase().includes(shortPath(path).toLowerCase().split('/').pop() ?? '')).slice(0, 8);
        return `File not found: ${path}` + (near.length ? `\nDid you mean one of:\n${near.join('\n')}` : '');
      }
      return content;
    }
    case 'write_file': {
      const path = normalizePath(input.path);
      const content = typeof input.content === 'string' ? input.content : String(input.content ?? '');
      ctx.onActivity?.(`Writing ${shortPath(path)}`);
      await ctx.writeFile(path, content);
      ctx.files.set(path, content);
      ctx.changed.add(path);
      ctx.deleted.delete(path);
      return `Wrote ${path} (${content.length} chars).`;
    }
    case 'delete_file': {
      const path = normalizePath(input.path);
      ctx.onActivity?.(`Deleting ${shortPath(path)}`);
      await ctx.deleteFile(path);
      ctx.files.delete(path);
      ctx.deleted.add(path);
      ctx.changed.delete(path);
      return `Deleted ${path}.`;
    }
    case 'run_typecheck': {
      ctx.onActivity?.('Type-checking');
      const r = await ctx.typecheck();
      return r.summary;
    }
    default:
      return `Unknown tool: ${name}. Available: ${AGENT_TOOLS.map((t) => t.name).join(', ')}, web_search.`;
  }
}
