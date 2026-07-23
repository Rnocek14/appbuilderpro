// src/lib/garvis/autonomy.ts
// EARNED AUTONOMY (pure). The trust contract for per-class auto-approval: which recurring
// approval classes exist, how an approval row maps to a class, and when a track record has
// EARNED the right to be offered auto mode. The operator still flips the switch — this module
// only ever says "eligible", never "granted".

export type AutonomyClass = 'followup' | 'invoice_chase' | 'reactivation' | 'inbox_reply';

/** A class earns the OFFER of autonomy after this many consecutive clean approvals. */
export const MIN_CLEAN_STREAK = 5;

export const AUTONOMY_CLASSES: { id: AutonomyClass; title: string; what: string }[] = [
  { id: 'followup', title: 'Follow-ups', what: 'polite bumps on threads YOU started (cadence + opened-3×-silent)' },
  { id: 'invoice_chase', title: 'Invoice chases', what: 'the 4-rung reminder ladder on invoices you queued' },
  { id: 'reactivation', title: 'Reactivation notes', what: 'monthly check-ins on dormant threads (deterministic template)' },
  { id: 'inbox_reply', title: 'Reply drafts', what: 'drafted answers to people who wrote back — the highest-signal class' },
];

/** Map an approval row to its autonomy class from its payload markers — never from free text. */
export function classifyApproval(kind: string, payload: Record<string, unknown> | null | undefined): AutonomyClass | null {
  if (kind !== 'send_email' || !payload) return null;
  // A COLD pitch carries {campaign_id, message_id} exactly like a follow-up — but it must NEVER be
  // classifiable (cold pitches stay manual forever, and must not pollute the followup streak). A cold
  // minter stamps payload.kind='cold_site_pitch'; refuse to classify it.
  if (payload.kind === 'cold_site_pitch') return null;
  if (typeof payload.chase_stage === 'number') return 'invoice_chase';
  if (payload.sweep === 'reactivation') return 'reactivation';
  if (payload.reply_id) return 'inbox_reply';
  // Follow-ups carry campaign_id + message_id and nothing more specific.
  if (payload.campaign_id && payload.message_id && !payload.batch_id && !payload.standing_rule && !payload.invoice_id) return 'followup';
  return null;
}

/** Clean streak from newest → oldest decisions: consecutive approvals; any rejection resets. */
export function computeStreak(decisions: { status: string }[]): number {
  let streak = 0;
  for (const d of decisions) {
    if (d.status === 'approved') streak++;
    else if (d.status === 'rejected') break;
    // pending/other rows don't count either way — skip
  }
  return streak;
}

export function eligibleForAuto(streak: number): boolean {
  return streak >= MIN_CLEAN_STREAK;
}
