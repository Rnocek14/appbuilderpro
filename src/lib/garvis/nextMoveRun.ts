// src/lib/garvis/nextMoveRun.ts
// Impure half of the Next Move engine: fetch the rows the pure collectors need, compose the waking
// digest, manage last-seen + dismissals (localStorage v1 — a table can follow when cross-device
// matters). Every query is owner-scoped by RLS; every line the digest shows exists as a row.

import { supabase } from '../supabase';
import {
  collectReplies, collectApprovals, collectStagedFollowups, collectInsights, collectFloor,
  collectNaturalNext, collectWorldIntel, rankMoves, greetingFor, awayLines, COLD_SKY_LINE,
  type NextMove, type Dismissals, type AwayLine, type FloorIn, type WorldIntelIn,
} from './nextMove';
import { reflectionDue } from './worldIntel';
import { parseCharter } from './workweb';

const KEY_LAST_SEEN = 'ff:waking:last-seen';
const KEY_DISMISS = 'ff:waking:dismissed';

export interface WakingDigest {
  greeting: string;
  awayLines: AwayLine[];
  coldSky: boolean;       // first run — nothing has ever happened
  moves: NextMove[];      // ALL positive moves, ranked; UI caps display at 3
}

function readDismissals(): Dismissals {
  try { return JSON.parse(localStorage.getItem(KEY_DISMISS) ?? '{}') as Dismissals; } catch { return {}; }
}

export function dismissMove(key: string): void {
  const d = readDismissals();
  d[key] = new Date().toISOString();
  try { localStorage.setItem(KEY_DISMISS, JSON.stringify(d)); } catch { /* best-effort */ }
}

/** Call when the digest has been SEEN (not on every render — on real arrival). */
export function markSeen(): void {
  try { localStorage.setItem(KEY_LAST_SEEN, new Date().toISOString()); } catch { /* best-effort */ }
}

export interface RankedMoves {
  moves: NextMove[];
  events: { event_type: string; subject: string; occurred_at: string; payload: Record<string, unknown> | null }[];
}

/** ONE Next Move engine, two altitudes: the waking moment consumes all of this; the System
 *  altitude scopes `moves` to its world (comets) via movesForWorld(). Never fork the ranking. */
export async function loadRankedMoves(now = new Date()): Promise<RankedMoves> {
  const [approvalsQ, repliesQ, eventsQ, insightsQ, campsQ, clustersQ, missionsQ] = await Promise.all([
    supabase.from('approvals').select('id, kind, title, created_at').eq('status', 'pending').limit(50),
    supabase.from('replies').select('id, from_address, subject, classification, received_at, campaign_id').order('received_at', { ascending: false }).limit(25),
    supabase.from('mind_events').select('event_type, subject, occurred_at, payload').order('occurred_at', { ascending: false }).limit(60),
    supabase.from('insights').select('id, title, body, score, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(10),
    supabase.from('outreach_campaigns').select('id, world_id, state, sequence_stopped').limit(200),
    supabase.from('knowledge_clusters').select('id, world_id, title, charter').not('charter', 'is', null).limit(300),
    supabase.from('garvis_missions').select('id, world_id, subject, status, updated_at').eq('status', 'review').order('updated_at', { ascending: false }).limit(10),
  ]);

  const approvals = approvalsQ.data ?? [];
  const replies = repliesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const insights = insightsQ.data ?? [];
  const camps = campsQ.data ?? [];
  const clusters = clustersQ.data ?? [];
  const missions = missionsQ.data ?? [];

  const worldByCampaign = new Map(camps.map((c) => [c.id as string, (c.world_id as string | null) ?? null]));

  // Replies: "has a next touch" = a draft/approved message exists on the same campaign beyond step 0.
  const replyCampaigns = [...new Set(replies.map((r) => r.campaign_id as string | null).filter(Boolean))] as string[];
  const nextTouchByCampaign = new Map<string, boolean>();
  const stagedRows: { campaign_id: string; world_id: string | null; to_address: string | null; steps: number; oldest_created_at: string }[] = [];
  const sentCampaignIds = camps.filter((c) => c.state === 'sent').map((c) => c.id as string);
  const msgCampaigns = [...new Set([...replyCampaigns, ...sentCampaignIds])];
  if (msgCampaigns.length) {
    const { data: msgs } = await supabase.from('outreach_messages')
      .select('campaign_id, sequence_step, status, to_address, created_at')
      .in('campaign_id', msgCampaigns).limit(500);
    const byCamp = new Map<string, { step: number; status: string; to: string | null; created: string }[]>();
    for (const m of msgs ?? []) {
      const cid = m.campaign_id as string;
      if (!byCamp.has(cid)) byCamp.set(cid, []);
      byCamp.get(cid)!.push({ step: m.sequence_step as number, status: m.status as string, to: m.to_address as string | null, created: m.created_at as string });
    }
    for (const cid of replyCampaigns) {
      const rows = byCamp.get(cid) ?? [];
      nextTouchByCampaign.set(cid, rows.some((m) => m.step > 0 && ['draft', 'approved', 'scheduled', 'sent'].includes(m.status) &&
        // a draft counts as "handled" only if it was created AFTER the reply — approximated by existence; keep simple v1
        true));
    }
    for (const cid of sentCampaignIds) {
      const drafts = (byCamp.get(cid) ?? []).filter((m) => m.step > 0 && m.status === 'draft');
      if (drafts.length) {
        stagedRows.push({
          campaign_id: cid, world_id: worldByCampaign.get(cid) ?? null,
          to_address: drafts[0].to, steps: drafts.length,
          oldest_created_at: drafts.reduce((a, b) => (a.created < b.created ? a : b)).created,
        });
      }
    }
  }

  // Structural floor: per world with chartered clusters — audience empty (no contacts at all, v1
  // owner-global), brand vault present but no kit, launch/loop area has artifacts.
  const worldIds = [...new Set(clusters.map((c) => c.world_id as string))];
  const floors: FloorIn[] = [];
  const artsByWorld = new Map<string, number>();
  const titleOfWorld = new Map<string, string>();
  if (worldIds.length) {
    const [{ count: contactCount }, { data: kits }, { data: worlds }, { data: arts }] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('brand_kits').select('world_id'),
      supabase.from('knowledge_worlds').select('id, title').in('id', worldIds),
      supabase.from('knowledge_artifacts').select('cluster_id').in('cluster_id', clusters.map((c) => c.id as string)).limit(1000),
    ]);
    const kitWorlds = new Set((kits ?? []).map((k) => k.world_id as string));
    const titleByWorld = new Map((worlds ?? []).map((w) => [w.id as string, w.title as string]));
    for (const [k, v] of titleByWorld) titleOfWorld.set(k, v);
    const artCount = new Map<string, number>();
    const worldByCluster = new Map(clusters.map((c) => [c.id as string, c.world_id as string]));
    for (const a of arts ?? []) {
      const cid = a.cluster_id as string;
      artCount.set(cid, (artCount.get(cid) ?? 0) + 1);
      const wid = worldByCluster.get(cid);
      if (wid) artsByWorld.set(wid, (artsByWorld.get(wid) ?? 0) + 1);
    }
    for (const wid of worldIds) {
      const wc = clusters.filter((c) => c.world_id === wid);
      const charters = wc.map((c) => ({ c, ch: parseCharter(c.charter) })).filter((x) => x.ch);
      const hasAudience = charters.some((x) => x.ch!.archetype === 'audience');
      const hasBrandVault = charters.some((x) => x.ch!.archetype === 'vault');
      const launchActive = charters.some((x) => (x.ch!.archetype === 'launch' || x.ch!.archetype === 'loop') && (artCount.get(x.c.id as string) ?? 0) > 0);
      floors.push({
        worldId: wid,
        worldTitle: titleByWorld.get(wid) ?? 'A mission',
        audienceEmpty: hasAudience && (contactCount ?? 0) === 0,
        brandEmpty: hasBrandVault && !kitWorlds.has(wid),
        launchActive,
        asOf: now.toISOString(),
      });
    }
  }

  // Natural next: reviewed missions bound to a world — REAL artifacts exist, no campaigns queued.
  const naturals = missions.filter((m) => m.world_id).map((m) => {
    const wid = m.world_id as string;
    return {
      missionId: m.id as string, worldId: wid, subject: m.subject as string | null,
      artifactCount: artsByWorld.get(wid) ?? 0,
      sendsQueued: camps.filter((c) => c.world_id === wid).length,
      updated_at: m.updated_at as string,
    };
  });

  // World intelligence (Sprint M): reflection nudges + stale-intel risks, from the persisted rows.
  const intelMoves: WorldIntelIn[] = [];
  if (worldIds.length) {
    const { data: intel } = await supabase.from('world_intelligence')
      .select('world_id, last_reflected_at, signals, open_questions').in('world_id', worldIds);
    const eventsByWorld = new Map<string, number>();
    for (const e of events) {
      const p = (e as { payload?: Record<string, unknown> | null }).payload;
      const wid = p && typeof p.world_id === 'string' ? p.world_id : null;
      if (wid && now.getTime() - new Date(e.occurred_at as string).getTime() < 7 * 24 * 3_600_000) {
        eventsByWorld.set(wid, (eventsByWorld.get(wid) ?? 0) + 1);
      }
    }
    for (const row of intel ?? []) {
      const wid = row.world_id as string;
      const signals = (row.signals as { intelAgeDays?: number | null } | null) ?? {};
      const ev7 = eventsByWorld.get(wid) ?? 0;
      intelMoves.push({
        worldId: wid,
        worldTitle: titleOfWorld.get(wid) ?? 'A mission',
        reflectionDueNow: reflectionDue((row.last_reflected_at as string | null) ?? null, ev7, now),
        events7d: ev7,
        intelAgeDays: signals.intelAgeDays ?? null,
        topOpenQuestion: ((row.open_questions as string[] | null) ?? [])[0] ?? null,
        asOf: now.toISOString(),
      });
    }
  }

  const moves = rankMoves([
    ...collectWorldIntel(intelMoves),
    ...collectReplies(replies.map((r) => ({
      id: r.id as string, from_address: r.from_address as string | null, subject: r.subject as string | null,
      classification: r.classification as string, received_at: r.received_at as string,
      world_id: r.campaign_id ? worldByCampaign.get(r.campaign_id as string) ?? null : null,
      has_next_touch: r.campaign_id ? nextTouchByCampaign.get(r.campaign_id as string) ?? false : false,
    }))),
    ...collectApprovals(approvals.map((a) => ({ id: a.id as string, kind: a.kind as string, title: a.title as string, created_at: a.created_at as string }))),
    ...collectStagedFollowups(stagedRows),
    ...collectInsights(insights.map((i) => ({ id: i.id as string, title: i.title as string, body: i.body as string, score: Number(i.score), created_at: i.created_at as string }))),
    ...collectFloor(floors),
    ...collectNaturalNext(naturals),
  ], now, readDismissals());

  return {
    moves,
    events: events.map((e) => ({
      event_type: e.event_type as string, subject: e.subject as string, occurred_at: e.occurred_at as string,
      payload: (e.payload as Record<string, unknown> | null) ?? null,
    })),
  };
}

export async function loadWakingDigest(name: string): Promise<WakingDigest> {
  const now = new Date();
  const lastSeen = localStorage.getItem(KEY_LAST_SEEN);
  const { moves, events } = await loadRankedMoves(now);

  const lines = awayLines(events, lastSeen);
  const coldSky = events.length === 0 && moves.length === 0;

  return { greeting: greetingFor(now.getHours(), name), awayLines: coldSky ? [{ text: COLD_SKY_LINE, occurredAt: now.toISOString() }] : lines, coldSky, moves };
}
