// src/lib/garvis/autonomyRun.ts
// Impure half of earned autonomy: real streaks from the approvals record, grants CRUD. The UI
// only OFFERS auto mode once the streak has earned it (pure contract in autonomy.ts); granting
// and revoking are the operator's explicit clicks, audited by the table itself.

import { supabase } from '../supabase';
import { classifyApproval, computeStreak, eligibleForAuto, AUTONOMY_CLASSES, type AutonomyClass } from './autonomy';

export interface AutonomyStatus {
  id: AutonomyClass;
  title: string;
  what: string;
  streak: number;
  eligible: boolean;
  mode: 'manual' | 'auto';
  dailyCap: number;
  autoToday: number;
}

export async function autonomyStatus(): Promise<AutonomyStatus[]> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const [{ data: decided }, { data: grants }] = await Promise.all([
    supabase.from('approvals')
      .select('kind, status, payload, decided_at, decided_via')
      .eq('kind', 'send_email').in('status', ['approved', 'rejected'])
      .order('decided_at', { ascending: false, nullsFirst: false }).limit(300),
    supabase.from('autonomy_grants').select('action_class, mode, daily_cap'),
  ]);

  const rows = (decided ?? []) as { status: string; payload: Record<string, unknown> | null; decided_at: string | null; decided_via: string | null }[];
  const grantBy = new Map(((grants ?? []) as { action_class: AutonomyClass; mode: 'manual' | 'auto'; daily_cap: number }[])
    .map((g) => [g.action_class, g]));

  return AUTONOMY_CLASSES.map((c) => {
    const classRows = rows.filter((r) => classifyApproval('send_email', r.payload) === c.id);
    // The streak counts HUMAN decisions only — auto-approved rows prove nothing about trust.
    const streak = computeStreak(classRows.filter((r) => r.decided_via !== 'autonomy_grant'));
    const g = grantBy.get(c.id);
    const autoToday = classRows.filter((r) =>
      r.decided_via === 'autonomy_grant' && r.decided_at && r.decided_at >= dayStart.toISOString()).length;
    return {
      id: c.id, title: c.title, what: c.what, streak, eligible: eligibleForAuto(streak),
      mode: g?.mode ?? 'manual', dailyCap: g?.daily_cap ?? 5, autoToday,
    };
  });
}

export async function setAutonomy(actionClass: AutonomyClass, mode: 'manual' | 'auto', dailyCap = 5): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const now = new Date().toISOString();
  const { error } = await supabase.from('autonomy_grants').upsert({
    owner_id: uid, action_class: actionClass, mode, daily_cap: dailyCap,
    ...(mode === 'auto' ? { granted_at: now, revoked_at: null } : { revoked_at: now }),
    updated_at: now,
  }, { onConflict: 'owner_id,action_class' });
  if (error) throw new Error(error.message);
}
