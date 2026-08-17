// supabase/functions/_shared/approvalTtl.ts
// HOW LONG A DECISION WAITS — pure core (verified by src/lib/garvis/approvalTtl.verify.ts).
//
// approvals.expires_at has existed since app_0022 and was never stamped, so a pending approval
// waited forever with no visible clock. Every PENDING-capable mint site now stamps a per-kind
// TTL at enqueue, and the Queue card renders the honest countdown.
//
// The SWEEP is live (SW5.1, standing-worker tick): overdue pending rows flip to 'expired'
// with a mind_event, and a half-life nudge (reminderDue below) reaches the owner off-app
// first — webhook or their own email — so work never lapses in silence.

/** Kinds not listed below wait this many days. */
export const DEFAULT_TTL_DAYS = 7;

export const TTL_DAYS: Record<string, number> = {
  spend: 3,                                   // money intent goes stale fastest
  send_email: 7, send_sms: 7, publish_post: 7, send_batch: 7, content_week: 7, crm_action: 7,
  send_for_signature: 14, deploy_site: 14, deploy_backend: 14, apply_migration: 14, ship_repo: 14,
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

/** Is this pending approval due its ONE half-life nudge (SW5.1)? True past the midpoint of its
 *  decision window, when it has never been nudged. Rows without a stamped window never nag. */
export function reminderDue(createdAt: string, expiresAt: string | null | undefined, remindedAt: string | null | undefined, nowIso: string): boolean {
  if (remindedAt) return false;
  const c = Date.parse(createdAt);
  const e = Date.parse(expiresAt ?? '');
  const now = Date.parse(nowIso);
  if (Number.isNaN(c) || Number.isNaN(e) || Number.isNaN(now)) return false;
  return now >= c + (e - c) / 2;
}

/** The Queue card's honest countdown. Null when the row predates stamping (no invented clock);
 *  "past its window" once overdue — the sweep flips it to expired on the next worker tick. */
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
