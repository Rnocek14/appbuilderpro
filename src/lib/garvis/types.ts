// src/lib/garvis/types.ts
// The shared Garvis agent runtime — portable contracts lifted from fableforge-core and
// adapted from a filesystem app-builder to the portfolio control plane. The Node-specific
// pieces of fableforge-core (fs/execSync tools, ws host, Anthropic SDK adapter) do NOT port;
// the runtime-agnostic core does: modes, a per-mode tool gate, a session loop, and the
// ModelClient seam. Tools here operate on apps / app_metrics / agent_runs, not files.

/**
 * Execution mode, mirroring fableforge-core's DISCUSS/PLAN/BUILD. The tool set is recomputed
 * from the mode every step, so "read before you write" is enforced structurally, not by prose:
 *  - observe: read-only (list/inspect the portfolio and its metrics)
 *  - plan:    + propose a recommendation (still no writes)
 *  - act:     + mutate the portfolio / enqueue follow-up work
 */
export type GarvisMode = 'observe' | 'plan' | 'act';

/** A JSON-schema-ish description; the Week-4 ModelClient translates this to the provider format. */
export interface GarvisTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
  /** Modes in which this tool is exposed — THE GATE. */
  modes: GarvisMode[];
}

export interface GarvisToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface GarvisToolResult {
  id: string;
  name: string;
  /** JSON-serializable result, or an { error } object on failure. */
  output: unknown;
}

export interface GarvisMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

/** What a tool implementation gets. RLS scopes every query to the owner; ownerId is for inserts. */
export interface GarvisToolContext {
  ownerId: string;
  /** The app this run is scoped to, if any (null = portfolio-wide). */
  appId: string | null;
}

/**
 * One decision from the model. Either call tools, finish with a result, or pause for human
 * approval — the same three control-flow shapes as the job-worker (work / report / waiting_approval).
 */
export type GarvisDecision =
  | { kind: 'tools'; calls: GarvisToolCall[]; costUsd?: number }
  | { kind: 'finish'; output: string; recommendation?: string; costUsd?: number }
  | { kind: 'await_approval'; question: string; options?: string[]; costUsd?: number };

/** The reasoning seam. Week 4 implements an LLM-backed client; diagnosticModel proves the plumbing. */
export interface GarvisModelClient {
  decide(input: {
    mode: GarvisMode;
    task: { title: string; input: string | null };
    history: GarvisMessage[];
    tools: GarvisTool[];
    context: GarvisToolContext;
  }): Promise<GarvisDecision>;
}

export interface RuntimeEvent {
  runId: string;
  step: number;
  phase: GarvisMode;
  status: 'started' | 'tool' | 'finished' | 'paused' | 'awaiting_approval' | 'error' | 'stopped';
  detail?: string;
}

export interface RunOptions {
  model: GarvisModelClient;
  /** Checked between steps so the run can be stopped/paused. */
  shouldStop?: () => boolean;
  onEvent?: (e: RuntimeEvent) => void;
  /** Safety cap on loop iterations (defense-in-depth alongside the budget cap). */
  maxSteps?: number;
}
