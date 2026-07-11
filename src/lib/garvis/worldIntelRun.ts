// src/lib/garvis/worldIntelRun.ts
// Impure half of World Intelligence: gather rows for one world, compile the deterministic Living
// State, persist the intelligence row, and run REFLECTION through the existing cluster-chat seam
// (no new edge function — reflection is a prompt + a tolerant, evidence-gated parser).
// Refresh is called whenever the world is opened (the heartbeat updates when observed) and before
// every reflection; the reflection itself is on-demand or nudged by the waking moment (Rule 6).

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import { SEED_SOURCE } from './workwebRun';
import {
  compileLivingState, parseReflection, buildReflectionContext, REFLECT_SYSTEM,
  type LivingState, type Reflection, type MomentumSignals, type Implication,
} from './worldIntel';

export interface WorldIntelligenceRow {
  id: string;
  world_id: string;
  objective: string | null;
  state: LivingState | null;
  implications: Implication[];
  recommendation: string | null;
  open_questions: string[];
  reflection: (Reflection & { at: string }) | null;
  signals: (MomentumSignals & { intelAgeDays: number | null }) | null;
  last_reflected_at: string | null;
  updated_at: string;
}

export async function getWorldIntelligence(worldId: string): Promise<WorldIntelligenceRow | null> {
  const { data } = await supabase.from('world_intelligence')
    .select('id, world_id, objective, state, implications, recommendation, open_questions, reflection, signals, last_reflected_at, updated_at')
    .eq('world_id', worldId).maybeSingle();
  return (data as WorldIntelligenceRow | null) ?? null;
}

interface Gathered {
  worldTitle: string;
  objective: string | null;
  activePlayTitle: string | null;
  events: { subject: string; occurred_at: string }[];
  artifacts: { title: string; kind: string; created_at: string }[];
  sent: number; replies: number; approvalsDecided: number; pendingApprovals: number; oldestPendingHours: number | null;
  signals: MomentumSignals & { intelAgeDays: number | null };
  audienceEmpty: boolean; brandEmpty: boolean;
  openQuestions: string[];
}

const DAY = 86_400_000;

async function gather(worldId: string): Promise<Gathered | null> {
  const now = Date.now();
  const [worldQ, missionQ, clustersQ, campsQ, intelQ] = await Promise.all([
    supabase.from('knowledge_worlds').select('id, title').eq('id', worldId).maybeSingle(),
    supabase.from('garvis_missions').select('objective, subject, updated_at').eq('world_id', worldId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('knowledge_clusters').select('id, charter').eq('world_id', worldId).not('charter', 'is', null),
    supabase.from('outreach_campaigns').select('id').eq('world_id', worldId),
    supabase.from('world_intelligence').select('open_questions').eq('world_id', worldId).maybeSingle(),
  ]);
  if (!worldQ.data) return null;

  const clusterIds = (clustersQ.data ?? []).map((c) => c.id as string);
  const campIds = (campsQ.data ?? []).map((c) => c.id as string);

  const [artsQ, eventsQ, msgsQ, repliesQ, apprQ, contactsQ, kitQ] = await Promise.all([
    // EARNED artifacts only: seeded playbooks are knowledge the world was born with — counting
    // them here would fake momentum ("N artifacts this week"), fake research recency (a seeded
    // framework is NOT market intel), and let reflection "learn" from a template.
    clusterIds.length
      ? supabase.from('knowledge_artifacts').select('title, kind, created_at').in('cluster_id', clusterIds).neq('source', SEED_SOURCE).order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as { title: string; kind: string; created_at: string }[] }),
    supabase.from('mind_events').select('subject, occurred_at, payload').order('occurred_at', { ascending: false }).limit(120),
    campIds.length ? supabase.from('outreach_messages').select('status, sent_at').in('campaign_id', campIds) : Promise.resolve({ data: [] as { status: string; sent_at: string | null }[] }),
    campIds.length ? supabase.from('replies').select('received_at').in('campaign_id', campIds) : Promise.resolve({ data: [] as { received_at: string }[] }),
    supabase.from('approvals').select('status, created_at, decided_at, payload'),
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    supabase.from('brand_kits').select('id').eq('world_id', worldId).maybeSingle(),
  ]);

  // World-tagged events: workweb/studio flows stamp payload.world_id. Untagged events are NOT
  // counted toward this world (undercounting is honest; guessing is not).
  const worldEvents = (eventsQ.data ?? []).filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    return p && p.world_id === worldId;
  }).map((e) => ({ subject: e.subject as string, occurred_at: e.occurred_at as string }));

  const arts = (artsQ.data ?? []) as { title: string; kind: string; created_at: string }[];
  const msgs = (msgsQ.data ?? []) as { status: string; sent_at: string | null }[];
  const reps = (repliesQ.data ?? []) as { received_at: string }[];
  const within7 = (iso: string | null) => !!iso && now - new Date(iso).getTime() < 7 * DAY;

  // Approvals scoped to this world's campaigns via payload.campaign_id.
  const campSet = new Set(campIds);
  const worldApprovals = ((apprQ.data ?? []) as { status: string; created_at: string; decided_at: string | null; payload: Record<string, unknown> | null }[])
    .filter((a) => a.payload && typeof a.payload.campaign_id === 'string' && campSet.has(a.payload.campaign_id as string));
  const pending = worldApprovals.filter((a) => a.status === 'pending');
  const oldestPendingHours = pending.length
    ? (now - Math.min(...pending.map((a) => new Date(a.created_at).getTime()))) / 3_600_000
    : null;

  const newestIntel = arts.find((a) => a.kind === 'research');
  const intelAgeDays = newestIntel ? (now - new Date(newestIntel.created_at).getTime()) / DAY : null;

  const charters = (clustersQ.data ?? []).map((c) => c.charter as { archetype?: string } | null);
  const hasAudience = charters.some((c) => c?.archetype === 'audience');
  const hasVault = charters.some((c) => c?.archetype === 'vault');

  return {
    worldTitle: worldQ.data.title as string,
    objective: (missionQ.data?.objective as string | undefined) ?? null,
    activePlayTitle: (missionQ.data?.subject as string | undefined) ?? null,
    events: worldEvents,
    artifacts: arts,
    sent: msgs.filter((m) => m.status === 'sent').length,
    replies: reps.length,
    approvalsDecided: worldApprovals.filter((a) => a.status === 'approved').length,
    pendingApprovals: pending.length,
    oldestPendingHours,
    signals: {
      events7d: worldEvents.filter((e) => within7(e.occurred_at)).length,
      artifacts7d: arts.filter((a) => within7(a.created_at)).length,
      sends7d: msgs.filter((m) => within7(m.sent_at)).length,
      replies7d: reps.filter((r) => within7(r.received_at)).length,
      intelAgeDays,
    },
    audienceEmpty: hasAudience && (contactsQ.count ?? 0) === 0,
    brandEmpty: hasVault && !kitQ.data,
    openQuestions: ((intelQ.data?.open_questions as string[] | undefined) ?? []),
  };
}

/** Refresh the deterministic half (Living State + signals). Called on world open — the heartbeat
 *  updates when observed. Returns the fresh state, or null when the world doesn't exist. */
export async function refreshWorldIntelligence(worldId: string): Promise<LivingState | null> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return null;
  const g = await gather(worldId);
  if (!g) return null;

  const state = compileLivingState({
    objective: g.objective, activePlayTitle: g.activePlayTitle,
    audienceEmpty: g.audienceEmpty, brandEmpty: g.brandEmpty,
    pendingApprovals: g.pendingApprovals, oldestPendingHours: g.oldestPendingHours,
    intelAgeDays: g.signals.intelAgeDays, signals: g.signals, openQuestions: g.openQuestions,
  });

  await supabase.from('world_intelligence').upsert({
    owner_id: uid, world_id: worldId,
    objective: g.objective, state, signals: g.signals,
  }, { onConflict: 'world_id' });
  return state;
}

export interface ReflectResult { ok: boolean; reflection?: Reflection; message: string }

/** Run a reflection: compile the evidence pack, reason via cluster-chat, evidence-gate the output,
 *  persist. Fail-soft: a failed reflection changes nothing and says so. */
export async function reflectOnWorld(worldId: string): Promise<ReflectResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return { ok: false, message: 'Not signed in.' };
  const g = await gather(worldId);
  if (!g) return { ok: false, message: 'World not found.' };
  // Manual reflection is always allowed — reflectionDue() gates only the waking-moment NUDGE.

  const state = compileLivingState({
    objective: g.objective, activePlayTitle: g.activePlayTitle,
    audienceEmpty: g.audienceEmpty, brandEmpty: g.brandEmpty,
    pendingApprovals: g.pendingApprovals, oldestPendingHours: g.oldestPendingHours,
    intelAgeDays: g.signals.intelAgeDays, signals: g.signals, openQuestions: g.openQuestions,
  });
  const context = buildReflectionContext({
    worldTitle: g.worldTitle, objective: g.objective,
    events: g.events, artifacts: g.artifacts,
    results: { sent: g.sent, replies: g.replies, approvals: g.approvalsDecided },
    state,
  });

  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system: REFLECT_SYSTEM, context, history: [], message: 'Reflect on this world now. JSON only.' },
  });
  if (error) return { ok: false, message: error.message };
  const reflection = parseReflection((data as { text?: string })?.text ?? '');
  const substance = reflection.tried.length + reflection.learned.length + reflection.implications.length;
  if (!substance && !reflection.recommendation) {
    return { ok: false, message: 'Not enough evidence survived the honesty gate to reflect on yet.' };
  }

  const at = new Date().toISOString();
  const existing = await getWorldIntelligence(worldId);
  const mergedImplications = [...reflection.implications, ...(existing?.implications ?? [])].slice(0, 12);
  const mergedQuestions = [...new Set([...reflection.openQuestions, ...(existing?.open_questions ?? [])])].slice(0, 5);

  await supabase.from('world_intelligence').upsert({
    owner_id: uid, world_id: worldId,
    objective: g.objective, state, signals: g.signals,
    implications: mergedImplications,
    recommendation: reflection.recommendation ?? existing?.recommendation ?? null,
    open_questions: mergedQuestions,
    reflection: { ...reflection, at },
    last_reflected_at: at,
  }, { onConflict: 'world_id' });

  await recordMindEvent(uid, {
    event_type: 'note', source: 'reflection',
    subject: `Reflected on ${g.worldTitle}: ${reflection.learned[0]?.text ?? reflection.recommendation ?? 'reviewed the record'}`,
    payload: { world_id: worldId, tried: reflection.tried.length, learned: reflection.learned.length },
  });

  return { ok: true, reflection, message: `Reflected: ${reflection.learned.length} lesson${reflection.learned.length === 1 ? '' : 's'}, ${reflection.implications.length} implication${reflection.implications.length === 1 ? '' : 's'}.` };
}
