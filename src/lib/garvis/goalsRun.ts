// src/lib/garvis/goalsRun.ts
// The impure half of the goals spine (pure core: goals.ts). CRUD on world_goals + HONEST
// measurement: progress counts come only from this account's real rows (leads, site_events)
// since the goal was set — or the owner's own manual number, labeled as such. Loaders here are
// fail-soft ('' / [] on any error) so goals never break the surfaces they steer.

import { supabase } from '../supabase';
import { goalProgress, goalContextLine, type WorldGoal, type GoalFacts, type GoalProgress } from './goals';

export type { WorldGoal, GoalProgress } from './goals';

const GOAL_COLS = 'id, world_id, title, why, metric_kind, target_value, current_manual, target_date, status, created_at';

// ---------------------------------------------------------------------------
// CRUD (owner-scoped by RLS; explicit owner stamp on writes)
// ---------------------------------------------------------------------------

export async function listGoals(worldId?: string, status: 'active' | 'all' = 'active'): Promise<WorldGoal[]> {
  let q = supabase.from('world_goals').select(GOAL_COLS).order('created_at', { ascending: false }).limit(50);
  if (worldId) q = q.eq('world_id', worldId);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as WorldGoal[];
}

export async function addGoal(input: {
  worldId: string; title: string; why?: string;
  metricKind?: WorldGoal['metric_kind']; targetValue?: number | null; targetDate?: string | null;
}): Promise<WorldGoal> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.title.trim()) throw new Error('Say what the goal is — your words.');
  const { data, error } = await supabase.from('world_goals').insert({
    owner_id: uid, world_id: input.worldId, title: input.title.trim(), why: (input.why ?? '').trim(),
    metric_kind: input.metricKind ?? 'none', target_value: input.targetValue ?? null,
    target_date: input.targetDate || null,
  }).select(GOAL_COLS).single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the goal.');
  // The record notes the commitment (append-only; fail-soft).
  await supabase.from('mind_events').insert({
    owner_id: uid, event_type: 'note', source: 'user',
    subject: `Set a goal: ${input.title.trim().slice(0, 120)}`,
    payload: { world_id: input.worldId, goal_id: (data as { id: string }).id },
  }).then(() => {}, () => {});
  return data as WorldGoal;
}

export async function updateGoal(id: string, patch: Partial<Pick<WorldGoal, 'title' | 'why' | 'metric_kind' | 'target_value' | 'current_manual' | 'target_date' | 'status'>>): Promise<void> {
  const { error } = await supabase.from('world_goals')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('world_goals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Honest measurement — real rows since the goal was set, or null (not instrumented)
// ---------------------------------------------------------------------------

/** Count the goal-relevant facts for a world SINCE the goal was created. A world with no site
 *  channel has never had reporting wired — its counts are null (an honest state), never zero
 *  pretending to be data. */
export async function measureGoal(goal: WorldGoal): Promise<GoalProgress> {
  let facts: GoalFacts = { leads: null, visits: null };
  if (goal.metric_kind === 'leads' || goal.metric_kind === 'visits') {
    try {
      // Instrumented at all? (site_channels row = the site was built with reporting wired)
      const { count: channels } = await supabase.from('site_channels')
        .select('id', { count: 'exact', head: true }).eq('world_id', goal.world_id);
      if ((channels ?? 0) > 0) {
        const [{ count: leads }, { count: visits }] = await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true })
            .eq('world_id', goal.world_id).gte('created_at', goal.created_at),
          supabase.from('site_events').select('id', { count: 'exact', head: true })
            .eq('world_id', goal.world_id).eq('kind', 'visit').gte('created_at', goal.created_at),
        ]);
        facts = { leads: leads ?? 0, visits: visits ?? 0 };
      }
    } catch { /* fail-soft: stays uninstrumented, shown honestly */ }
  }
  return goalProgress(goal, facts);
}

// ---------------------------------------------------------------------------
// Steering loaders — fail-soft, used by nextMoveRun / producers / Ask
// ---------------------------------------------------------------------------

/** All ACTIVE goals for the focus pass (Next Move). [] on any failure. */
export async function activeGoals(): Promise<WorldGoal[]> {
  try { return await listGoals(undefined, 'active'); } catch { return []; }
}

/** One prompt-ready goal line for a world ('' when no active goal — callers skip injection).
 *  Includes measured progress only when it's real. */
export async function goalLineForWorld(worldId: string): Promise<string> {
  try {
    const goals = await listGoals(worldId, 'active');
    if (!goals.length) return '';
    const progress = await measureGoal(goals[0]);
    return goalContextLine(goals[0], progress);
  } catch { return ''; }
}

/** ALL active project goals as one labeled block for the front-door brain — so every project the
 *  owner runs steers Garvis toward what it's FOR. Progress lines appear only with a real basis.
 *  '' when none / on any failure (never blocks a conversation). */
export async function goalsDigest(): Promise<string> {
  try {
    const goals = await listGoals(undefined, 'active');
    if (!goals.length) return '';
    const { data: worlds } = await supabase.from('knowledge_worlds')
      .select('id, title').in('id', [...new Set(goals.map((g) => g.world_id))]);
    const names = new Map(((worlds ?? []) as { id: string; title: string }[]).map((w) => [w.id, w.title]));
    const lines = await Promise.all(goals.slice(0, 8).map(async (g) => {
      const p = await measureGoal(g);
      const prog = p.measurable && p.current != null ? ` — ${p.current}${p.target ? ` of ${p.target}` : ''} (${p.basis})` : '';
      return `- ${names.get(g.world_id) ?? 'A world'}: ${g.title}${g.target_date ? ` (by ${g.target_date})` : ''}${prog}`;
    }));
    return `PROJECT GOALS (owner-stated — adapt every recommendation toward these):\n${lines.join('\n')}`;
  } catch { return ''; }
}
