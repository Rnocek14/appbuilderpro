// src/lib/garvis/autonomy.ts
// EARNED AUTONOMY (pure). The trust contract for per-class auto-approval: which recurring
// approval classes exist, how an approval row maps to a class, and when a track record has
// EARNED the right to be offered auto mode. The operator still flips the switch — this module
// only ever says "eligible", never "granted".

export type AutonomyClass = 'followup' | 'invoice_chase' | 'reactivation' | 'inbox_reply' | 'cold_pitch';

/** A class earns the OFFER of autonomy after this many consecutive clean approvals. */
export const MIN_CLEAN_STREAK = 5;
/** The cold pitch is the one class that emails a stranger first, so its bar is five times higher:
 *  the operator reads twenty-five of the machine's pitches and rejects none before the offer even
 *  appears. Opt-in, capped per day, revoked in one click — never granted by default. */
export const COLD_PITCH_CLEAN_STREAK = 25;

export function minStreakFor(cls: AutonomyClass): number {
  return cls === 'cold_pitch' ? COLD_PITCH_CLEAN_STREAK : MIN_CLEAN_STREAK;
}

export const AUTONOMY_CLASSES: { id: AutonomyClass; title: string; what: string }[] = [
  { id: 'followup', title: 'Follow-ups', what: 'polite bumps on threads YOU started (cadence + opened-3×-silent)' },
  { id: 'invoice_chase', title: 'Invoice chases', what: 'the 4-rung reminder ladder on invoices you queued' },
  { id: 'reactivation', title: 'Reactivation notes', what: 'monthly check-ins on dormant threads (deterministic template)' },
  { id: 'inbox_reply', title: 'Reply drafts', what: 'drafted answers to people who wrote back — the highest-signal class' },
  { id: 'cold_pitch', title: 'Cold pitches', what: 'the first email to a business the hunt found — demo link + screenshot. Highest bar (25 clean), lowest default cap' },
];

/** The classes the trust dial can actually GRANT today. The cold pitch is classified (its streak
 *  is counted and shown, and the slate reads it) but is not grantable: the server never
 *  self-approves a first email to a stranger. Turning that on is a deliberate, separate decision. */
export const GRANTABLE_CLASSES: AutonomyClass[] = ['followup', 'invoice_chase', 'reactivation', 'inbox_reply'];

/** Default daily cap when a class is first granted. Cold pitches start low on purpose; the
 *  operator raises it deliberately, and the send path's own daily cap + warm-up still apply. */
export function defaultDailyCap(cls: AutonomyClass): number {
  return cls === 'cold_pitch' ? 3 : 5;
}

/** Map an approval row to its autonomy class from its payload markers — never from free text. */
export function classifyApproval(kind: string, payload: Record<string, unknown> | null | undefined): AutonomyClass | null {
  if (kind !== 'send_email' || !payload) return null;
  // A COLD pitch carries {campaign_id, message_id} exactly like a follow-up, so it is classified by
  // its explicit marker FIRST — it is its own class (never pollutes the followup streak), with its
  // own, much higher, bar. The minter stamps payload.kind='cold_site_pitch'.
  if (payload.kind === 'cold_site_pitch') return 'cold_pitch';
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

export function eligibleForAuto(streak: number, cls: AutonomyClass = 'followup'): boolean {
  return streak >= minStreakFor(cls);
}
