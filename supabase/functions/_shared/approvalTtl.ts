// supabase/functions/_shared/approvalTtl.ts
// HOW LONG A DECISION WAITS — pure core (verified by src/lib/garvis/approvalTtl.verify.ts).
//
// approvals.expires_at has existed since app_0022 and was never stamped, so a pending approval
// waited forever with no visible clock. Every PENDING-capable mint site now stamps a per-kind
// TTL at enqueue, and the Queue card renders the honest countdown.
//
// NOTE: nothing SWEEPS overdue rows to 'expired' yet — deliberately. The sweep lands together
// with the off-app nudge (best-in-class plan SW5.1), because expiring work while the operator
// has no channel that would tell them is a regression for exactly the away-from-the-app case.
// Until then the stamp is honest display: an overdue card says "past its window", and still
// waits for the human.

/** Kinds not listed below wait this many days. */
export const DEFAULT_TTL_DAYS = 7;

export const TTL_DAYS: Record<string, number> = {
  spend: 3,                                   // money intent goes stale fastest
  send_email: 7, send_sms: 7, publish_post: 7, send_batch: 7, content_week: 7, crm_action: 7,
  send_for_signature: 14, deploy_site: 14, deploy_backend: 14, apply_migration: 14,
};

export function ttlDaysFor(kind: string): number {
  return TTL_DAYS[kind] ?? DEFAULT_TTL_DAYS;
}

/** The stamp for a row minted now. Throws on a garbage timestamp — a mint site passing one is
 *  a programming error that must surface, never a silently unstamped row. */
export function expiresAtFor(kind: string, nowIso: string): string {
  const t = Date.parse(nowIso);
  if (Number.isNaN(t)) throw new Error('expiresAtFor needs a valid ISO timestamp');
  return new Date(t + ttlDaysFor(kind) * 86_400_000).toISOString();
}

/** The Queue card's honest countdown. Null when the row predates stamping (no invented clock);
 *  "past its window" once overdue — it does NOT claim expiry, because nothing expires it yet. */
export function expiryCountdown(expiresAt: string | null | undefined, nowIso: string): string | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(t) || Number.isNaN(now)) return null;
  const ms = t - now;
  if (ms <= 0) return 'past its window';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 48) return `decide within ${hours}h`;
  return `decide within ${Math.ceil(hours / 24)}d`;
}
