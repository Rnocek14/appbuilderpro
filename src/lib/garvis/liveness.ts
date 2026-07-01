// src/lib/garvis/liveness.ts
// Pure, supabase-free helpers for the Garvis liveness signal. The actual ping uses fetch (lives in the
// useLiveness hook); this module owns the classification + context-digest logic so it's unit-testable.
//
// Honesty note: a browser ping is no-cors, so `reachable` means "the host responded with something",
// not "returned HTTP 200". We classify and label accordingly — never claim "healthy".

import type { AppLiveness } from '../../types';

export type LivenessClass = 'live' | 'down' | 'not_deployed' | 'unknown';

/** Classify an app's liveness from its deploy_url + its latest check (if any). */
export function classifyLiveness(deployUrl: string | null | undefined, latest: AppLiveness | null | undefined): LivenessClass {
  if (!deployUrl) return 'not_deployed';
  if (!latest) return 'unknown';
  return latest.reachable ? 'live' : 'down';
}

const CLASS_LABEL: Record<LivenessClass, string> = {
  live: 'reachable',
  down: 'UNREACHABLE',
  not_deployed: 'not deployed',
  unknown: 'not yet checked',
};

export function livenessLabel(c: LivenessClass): string {
  return CLASS_LABEL[c];
}

/** Reduce a flat list of checks (any order) to the most recent check per app_id. */
export function latestByApp(rows: AppLiveness[]): Record<string, AppLiveness> {
  const out: Record<string, AppLiveness> = {};
  for (const r of rows) {
    const cur = out[r.app_id];
    if (!cur || Date.parse(r.checked_at) > Date.parse(cur.checked_at)) out[r.app_id] = r;
  }
  return out;
}

interface AppLite {
  id: string;
  name: string;
  deploy_url: string | null;
}

/**
 * The liveness context digest: a line per DEPLOYED app saying whether it's actually reachable — the
 * brain's first non-self-reported fact. Apps with no deploy URL are omitted (their "not deployed" state
 * is already obvious from the app row). Returns '' when no app is deployed.
 */
export function buildLivenessDigest(apps: AppLite[], latest: Record<string, AppLiveness>): string {
  const deployed = apps.filter((a) => a.deploy_url);
  if (deployed.length === 0) return '';
  const lines = deployed.map((a) => {
    const c = classifyLiveness(a.deploy_url, latest[a.id]);
    const row = latest[a.id];
    const when = row ? ` (checked ${row.checked_at.slice(0, 10)})` : '';
    return `- ${a.name}: ${livenessLabel(c)}${when}`;
  });
  return `LIVENESS (are the deployed apps actually reachable? "reachable" = host responded, not necessarily healthy):\n${lines.join('\n')}`;
}
