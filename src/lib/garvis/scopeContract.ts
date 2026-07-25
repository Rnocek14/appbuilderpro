// src/lib/garvis/scopeContract.ts
// THE SCOPE CONTRACT (vertical-slice invariant): every execution and cost-bearing operation
// resolves to either a specific world_id or an EXPLICIT platform/system scope with a documented
// reason. A nullable world_id is never a silent account-wide fallback — if a writer's row can be
// world-null, the writer must appear in this registry with the reason, or it is a defect.
//
// This file is DATA consumed by scopeContract.verify.ts (which pins the writers' source) and by
// the fleet view (which treats registered platform scopes as "not a client's cost"). Adding a
// writer that produces world-null rows without registering it here fails CI.

export type ScopeKind = 'world' | 'platform' | 'system' | 'pre_client' | 'known_debt';

export interface ScopeEntry {
  writer: string;            // the producing site, human-recognizable
  produces: string;          // which table/rows
  scope: ScopeKind;
  reason: string;            // WHY world-null is legitimate here (or the debt being carried)
}

/** Writers whose world-null rows are LEGITIMATE, each with its documented reason. */
export const PLATFORM_SCOPES: ScopeEntry[] = [
  {
    writer: 'standing-worker · client_hunt drain',
    produces: 'standing_orders / discovered_businesses / preview_sites',
    scope: 'pre_client',
    reason: 'Acquisition for the agency itself: a prospect has no world until it is WON (close-won births the world). Hunt costs are the platform\'s cost of sale.',
  },
  {
    writer: 'discover-run · Claude scout + Places',
    produces: 'usage_events / discovered_businesses',
    scope: 'pre_client',
    reason: 'Same acquisition scope as the hunt: pre-client by definition.',
  },
  {
    writer: 'garvis-pulse / garvis-scorecard / garvis-consolidate / garvis-canary',
    produces: 'mind_events / usage_events / system_heartbeat',
    scope: 'system',
    reason: 'These operate ON the machine (brief, self-scoring, lesson distillation, liveness proof) — they have no client; their cost is platform overhead by design.',
  },
  {
    writer: 'embed-worker · VECTORS mode',
    produces: 'usage_events',
    scope: 'system',
    reason: 'Ephemeral vectors for the caller (nothing persisted, no subject) — there is no world to attribute; the subjects mode DOES stamp world_id per subject (app_0114).',
  },
  {
    writer: 'resend-inbound · forward-in alias mail from unknown senders',
    produces: 'inbound_mail (world-null rows only)',
    scope: 'known_debt',
    reason: 'One alias per operator today, so an unknown sender\'s world is genuinely unknowable — stamped best-effort from known contacts (app_0114). Becomes world-scoped when per-world aliases land (T-10 roadmap).',
  },
  {
    writer: 'FableForge builder · generation/edit usage',
    produces: 'usage_events (project-scoped via project_id)',
    scope: 'known_debt',
    reason: 'Builder usage keys on project_id; the apps→worlds reconciliation (operating model D6) will resolve projects to worlds. Until then project_id IS the attribution key — never presented as client-attributable.',
  },
  {
    writer: 'operator\'s own brand/marketing work (no client attached)',
    produces: 'approvals / execution_runs / social_posts (world-null)',
    scope: 'platform',
    reason: 'The operator\'s own outbound (their brand, their newsletter) is legitimately theirs, not a client\'s. Fleet cost views bucket these as "agency (own)".',
  },
];

/** True when a world-null row from `writer` is legitimate under the registry. */
export function isRegisteredPlatformScope(writer: string): boolean {
  return PLATFORM_SCOPES.some((e) => e.writer === writer);
}

/** The writers that MUST stamp world_id (client-attributable by construction). Pinned by the
 *  verify so a regression that drops a stamp fails CI, not a client's ledger. */
export const WORLD_STAMPED_WRITERS = [
  'closeCampaignWon → knowledge_worlds + client_subscriptions.world_id',
  'closeCampaignWon → contacts.world_id (client contact)',
  'pinAndEstablish → standing_orders.world_id (client site watch)',
  'stripe-webhook → standing_orders.world_id (payment-time watch)',
  'standing-worker trigger drain → approvals.world_id (client automations)',
  'execution_runs ← approvals.world_id (app_0114 stamp trigger — every executor inherits)',
  'embed-worker subjects mode → embeddings.world_id (server-resolved)',
  'resend-inbound → inbound_mail.world_id (known contacts)',
] as const;
