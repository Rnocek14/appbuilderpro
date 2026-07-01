// src/lib/garvis/tools.ts
// The Garvis tool surface + the per-mode gate. This is the single source of truth for what the
// agent can do in each mode — `toolsFor(mode)` is re-applied every step by the runtime, so the
// model structurally cannot write to the portfolio until it is in `act` mode.

import type { GarvisMode, GarvisTool } from './types';

export const GARVIS_TOOLS: GarvisTool[] = [
  {
    name: 'list_apps',
    description: 'List the products in the portfolio with stage, revenue, tags, and deploy URL.',
    inputSchema: { type: 'object', properties: { include_archived: { type: 'boolean' } } },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'get_app',
    description: 'Get one product by id or slug, including goals and description.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, slug: { type: 'string' } },
    },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'query_metrics',
    description: 'Recent app_metrics rows for a product (visitors/signups/active_users/revenue), newest first.',
    inputSchema: {
      type: 'object',
      properties: { app_id: { type: 'string' }, days: { type: 'number' } },
      required: ['app_id'],
    },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'recent_runs',
    description: 'Recent agent_runs across the portfolio (what Garvis already did, and outcomes).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' }, app_id: { type: 'string' } } },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'get_repo_state',
    description:
      "Live, read-only GitHub state for a product's repo: description, last push, language, open " +
      'issues (with titles), recent commit messages, archived/fork flags, and homepage/deploy URL. ' +
      'Use this to judge whether an app is alive, stalled, or shipping. Pass app_id (preferred) or repo_url.',
    inputSchema: {
      type: 'object',
      properties: { app_id: { type: 'string' }, repo_url: { type: 'string' } },
    },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'get_app_profile',
    description:
      "Get a product's intelligence profile — what it does, who it serves, its business model, an " +
      'honest read of its current state, the top blocker, and the single next milestone. This is ' +
      'durable product context (generated from the repo), distinct from live repo activity. Pass app_id.',
    inputSchema: { type: 'object', properties: { app_id: { type: 'string' } }, required: ['app_id'] },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'propose_recommendation',
    description: 'Propose a recommended next action (no side effects — the runtime records it on finish).',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, rationale: { type: 'string' }, app_id: { type: 'string' } },
      required: ['title', 'rationale'],
    },
    modes: ['plan', 'act'],
  },
  {
    name: 'recall_knowledge',
    description:
      'Recall your accumulated, HUMAN-APPROVED knowledge — past decisions, outcomes, and lessons. ' +
      'Only approved knowledge is returned (proposals awaiting approval are never visible). Use this ' +
      'to avoid repeating mistakes and to honor prior decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string' },
        kinds: { type: 'array', items: { type: 'string', enum: ['decision', 'outcome', 'lesson'] } },
        limit: { type: 'number' },
      },
    },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'log_decision',
    description:
      'Propose a DECISION to remember (e.g. "focus Traction Engine on onboarding"). Written as a ' +
      'PROPOSAL awaiting the owner\'s approval — it does NOT enter memory or influence future reasoning ' +
      'until approved. Include the reasoning in body and a confidence 0..1.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        app_id: { type: 'string' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body'],
    },
    modes: ['act'],
  },
  {
    name: 'record_outcome',
    description:
      'Propose an OUTCOME or LESSON to remember (what happened, what worked, what to do differently). ' +
      'Written as a PROPOSAL awaiting approval — inert until the owner approves it.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        app_id: { type: 'string' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body'],
    },
    modes: ['act'],
  },
  {
    name: 'generate_short_script',
    description:
      'Draft a short-form video SCRIPT (hook, script, caption, CTA, suggested visual beats). This ' +
      'produces TEXT ONLY — it does NOT render or publish any video (fidelity: script_only). The owner ' +
      'reviews/edits before anything is produced downstream.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        audience: { type: 'string' },
        goal: { type: 'string' },
        source_material: { type: 'string' },
        tone: { type: 'string' },
        platform: { type: 'string' },
        length: { type: 'string' },
      },
      required: ['topic'],
    },
    modes: ['act'],
  },
  {
    name: 'list_goals',
    description:
      'List the owner\'s goals — what Garvis is optimizing for. Defaults to active goals. Weigh ' +
      'recommendations against these (priority 1 = highest).',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['proposed', 'active', 'achieved', 'paused', 'abandoned'] },
        app_id: { type: 'string' },
      },
    },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'list_capabilities',
    description:
      'List approved capabilities — what each app/tool can do (with maturity + safety). Use this to ' +
      'pick the right resource for a task. Some may not be directly callable yet but can be recommended.',
    inputSchema: { type: 'object', properties: { app_id: { type: 'string' } } },
    modes: ['observe', 'plan', 'act'],
  },
  {
    name: 'propose_goal',
    description:
      'Propose a GOAL for the owner to consider (e.g. "Get FableForge to $5k MRR"). Written as a ' +
      'PROPOSAL awaiting approval — it does NOT become an active objective until approved.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'number' },
        success_metric: { type: 'string' },
        target_date: { type: 'string' },
        app_id: { type: 'string' },
      },
      required: ['title'],
    },
    modes: ['act'],
  },
  {
    name: 'register_capability',
    description:
      'Propose registering a capability an app/tool provides. Written as a PROPOSAL awaiting approval. ' +
      'Be honest about maturity (stub|draft|working|production) and safety (read_only|writes_data|external_action).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        app_id: { type: 'string' },
        input_spec: { type: 'string' },
        output_spec: { type: 'string' },
        safety_level: { type: 'string', enum: ['read_only', 'writes_data', 'external_action'] },
        approval_required: { type: 'boolean' },
        maturity: { type: 'string', enum: ['stub', 'draft', 'working', 'production'] },
      },
      required: ['name', 'description'],
    },
    modes: ['act'],
  },
  {
    name: 'update_app',
    description: 'Update a product (stage, goals, monthly_revenue, deploy_url, tags).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: { type: 'object' },
      },
      required: ['id', 'patch'],
    },
    modes: ['act'],
  },
  {
    name: 'enqueue_run',
    description: 'Queue a follow-up agent run (kind research|content|build|analyze|recommend) for later execution.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        title: { type: 'string' },
        app_id: { type: 'string' },
        input: { type: 'string' },
      },
      required: ['kind', 'title'],
    },
    modes: ['act'],
  },
];

/** The gate: tools exposed in the given mode. */
export function toolsFor(mode: GarvisMode): GarvisTool[] {
  return GARVIS_TOOLS.filter((t) => t.modes.includes(mode));
}

/** Defense-in-depth: also enforced inside executeTool, not just at the loop boundary. */
export function isToolAllowed(name: string, mode: GarvisMode): boolean {
  const tool = GARVIS_TOOLS.find((t) => t.name === name);
  return !!tool && tool.modes.includes(mode);
}
