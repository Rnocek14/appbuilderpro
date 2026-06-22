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
