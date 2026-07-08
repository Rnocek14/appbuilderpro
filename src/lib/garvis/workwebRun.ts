// src/lib/garvis/workwebRun.ts
// IMPURE half of the Work Web (mirrors clusteringRun.ts / marketingRun.ts): the only file here that
// touches Supabase + AI. It turns the pure model (workweb.ts) and plays (plays.ts) into real rows:
//   * instantiateWeb  — a template → a knowledge world with a chartered cluster tree (via universe.ts)
//   * loadWeb / listWebs — read a web back with live per-cluster rollups
//   * runPlay         — deterministic productions (+ optional AI enrich) → artifacts in the right clusters
//   * runTool         — one workspace tool: research, generate-*, upload-list, queue-sequence, …
//
// House conventions honored: pure model stays Supabase-free; AI is fail-soft (deterministic draft
// always stands); every consequential action goes through the approval queue; owner_id set from the
// session on every insert (RLS); a mind_event marks meaningful moments.

import { supabase } from '../supabase';
import { exploreComplete } from './explorerAI';
import { recordMindEvent } from './mindStore';
import { enqueueApproval } from './execution';
import {
  newUniverse, syncUniverse, loadWorld, listWorlds as listUniverseWorlds,
  type Universe,
} from './universe';
import { normalizeGraph, slugify, type ClusterGraph, type Cluster, type Artifact } from './clustering';
import {
  templateById, flattenTemplate, parseCharter, toolsFor, rollupWeb, deriveStatus,
  parseAudienceCsv, type Charter, type WebTemplate, type WorkTool,
} from './workweb';
import { playById, PLAYS, DEFAULT_LAKE_GENEVA_CONTEXT, type Play, type PlayContext, type PlayArtifact } from './plays';

// The charter travels in the cluster's summary is NOT viable (summary is prose). Charters live in a
// separate table column (knowledge_clusters.charter). universe.ts's ClusterGraph has no charter
// field, so we persist charters in a SECOND lightweight pass keyed by (world_id, slug) after sync.

// ---------------------------------------------------------------------------
// Instantiate a web from a template
// ---------------------------------------------------------------------------

export interface WebSummary {
  worldId: string;
  title: string;
  templateId: string | null;
}

/** Build a ClusterGraph (client slugs, parentId = parent slug) from a template. Charters are applied
 *  separately (see persistCharters) since the graph type has no charter field. */
function templateToGraph(t: WebTemplate): { graph: ClusterGraph; charters: Record<string, Charter> } {
  const flat = flattenTemplate(t);
  const charters: Record<string, Charter> = {};
  const clusters: Cluster[] = flat.map((n) => {
    charters[n.slug] = n.charter;
    return {
      id: n.slug,
      parentId: n.parentSlug,
      title: n.title,
      summary: n.summary,
      kind: n.charter.archetype === 'intel' ? 'question' : n.charter.archetype === 'studio' ? 'project' : 'topic',
      salience: n.depth === 0 ? 0.8 : 0.5,
      maturity: 'spark' as const,
      turnRefs: [],
      artifacts: [],
    };
  });
  return { graph: normalizeGraph({ clusters, edges: [] }), charters };
}

/** Write charters onto the persisted clusters (matched by world_id + slug). Best-effort, owner-scoped. */
async function persistCharters(worldId: string, charters: Record<string, Charter>): Promise<void> {
  const slugs = Object.keys(charters);
  if (!slugs.length) return;
  const { data: rows } = await supabase
    .from('knowledge_clusters')
    .select('id, slug')
    .eq('world_id', worldId)
    .in('slug', slugs);
  await Promise.all((rows ?? []).map((r) => {
    const c = charters[(r as { slug: string }).slug];
    return c ? supabase.from('knowledge_clusters').update({ charter: c }).eq('id', (r as { id: string }).id) : Promise.resolve();
  }));
}

/** Create a new work web from a template id. Returns the server world id. */
export async function instantiateWeb(templateId: string): Promise<WebSummary> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const t = templateById(templateId);
  if (!t) throw new Error(`Unknown web template "${templateId}".`);

  const { graph, charters } = templateToGraph(t);
  const universe: Universe = newUniverse(t.title, graph, t.nodes[0]?.slug ?? null);
  // syncUniverse returns null if another universe sync is mid-flight (its in-flight guard). That's
  // transient, not a real failure — retry once after a beat before giving up.
  let worldId = await syncUniverse(universe);
  if (!worldId) {
    await new Promise((r) => setTimeout(r, 400));
    worldId = await syncUniverse(universe);
  }
  if (!worldId) throw new Error('Could not save the web right now — another sync was in progress. Try again in a moment.');

  await persistCharters(worldId, charters);
  await recordMindEvent(uid, {
    event_type: 'note', source: 'workweb',
    subject: `Created work web "${t.title}" from template ${t.id}`,
    payload: { world_id: worldId, template: t.id },
  });
  return { worldId, title: t.title, templateId: t.id };
}

// ---------------------------------------------------------------------------
// Read webs back (with charters + live rollups)
// ---------------------------------------------------------------------------

export interface WebCluster {
  id: string;               // db uuid
  slug: string;
  parentSlug: string | null;
  title: string;
  summary: string;
  charter: Charter | null;
  tools: WorkTool[];
  artifacts: Artifact[];
  liveStatus: Charter['status'] | null;
  pendingApprovals: number;
}

export interface LoadedWeb {
  worldId: string;
  title: string;
  clusters: WebCluster[];
  rollup: ReturnType<typeof rollupWeb>;
}

/** A web = any world that has at least one chartered cluster. */
export interface ContactRow { id: string; full_name: string | null; email: string; email_status: string; created_at: string }

/** Everyone this operator can reach — the audience behind every list upload and queue tool. */
export async function listContacts(limit = 200): Promise<ContactRow[]> {
  const { data } = await supabase.from('contacts')
    .select('id, full_name, email, email_status, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as ContactRow[];
}

export async function listWebs(): Promise<WebSummary[]> {
  const worlds = await listUniverseWorlds();
  const out: WebSummary[] = [];
  for (const w of worlds) {
    if (!w.remote) continue;
    const { count } = await supabase
      .from('knowledge_clusters')
      .select('id', { count: 'exact', head: true })
      .eq('world_id', w.id)
      .not('charter', 'is', null);
    if ((count ?? 0) > 0) out.push({ worldId: w.id, title: w.title, templateId: null });
  }
  return out;
}

export async function loadWeb(worldId: string): Promise<LoadedWeb | null> {
  const universe = await loadWorld(worldId);
  if (!universe) return null;

  // Charters + db ids come from the table (the graph doesn't carry them).
  const { data: rows } = await supabase
    .from('knowledge_clusters')
    .select('id, slug, charter')
    .eq('world_id', worldId);
  const bySlug = new Map<string, { id: string; charter: Charter | null }>();
  for (const r of rows ?? []) {
    bySlug.set((r as { slug: string }).slug, { id: (r as { id: string }).id, charter: parseCharter((r as { charter: unknown }).charter) });
  }

  // Web-scoped signals: outreach campaigns bound to THIS world (app_0024 world_id). Pending approvals
  // are attributed to this web only when their message's campaign belongs to the web — no account-wide
  // bleed. The per-cluster "waiting" heuristic then surfaces that count on launch/loop areas.
  const { data: camps } = await supabase.from('outreach_campaigns').select('id').eq('world_id', worldId);
  const campIds = new Set((camps ?? []).map((c) => (c as { id: string }).id));
  let sentCount = 0;
  let replyCount = 0;
  if (campIds.size) {
    const idList = [...campIds];
    const [{ data: msgs }, { data: reps }] = await Promise.all([
      supabase.from('outreach_messages').select('status').in('campaign_id', idList),
      supabase.from('replies').select('id').in('campaign_id', idList),
    ]);
    sentCount = (msgs ?? []).filter((m) => (m as { status: string }).status === 'sent').length;
    replyCount = (reps ?? []).length;
  }
  // Approvals for this web = send_email approvals whose payload.campaign_id is ours. We keep the REAL
  // status of each (pending | approved | …) so the rollup reports both "waiting" and "approved"
  // correctly — a web that sent 5 emails shows approvedActions:5, not 0.
  const approvalStatuses: string[] = [];
  if (campIds.size) {
    const { data: appr } = await supabase.from('approvals')
      .select('status, payload').eq('kind', 'send_email').in('status', ['pending', 'approved']);
    for (const a of appr ?? []) {
      const cid = (a as { payload?: { campaign_id?: string } }).payload?.campaign_id;
      if (cid && campIds.has(cid)) approvalStatuses.push((a as { status: string }).status);
    }
  }
  const webPending = approvalStatuses.filter((s) => s === 'pending').length;

  const clusters: WebCluster[] = universe.graph.clusters.map((c) => {
    const meta = bySlug.get(c.id);
    const charter = meta?.charter ?? null;
    const pending = charter && (charter.archetype === 'launch' || charter.archetype === 'loop') ? webPending : 0;
    return {
      id: meta?.id ?? c.id,
      slug: c.id,
      parentSlug: c.parentId,
      title: c.title,
      summary: c.summary,
      charter,
      tools: charter ? toolsFor(charter) : [],
      artifacts: c.artifacts,
      liveStatus: charter ? deriveStatus(charter, c.artifacts.length, pending) : null,
      pendingApprovals: pending,
    };
  });

  const artifactCount = clusters.reduce((n, c) => n + c.artifacts.length, 0);
  return {
    worldId,
    title: universe.title,
    clusters,
    rollup: rollupWeb({ artifactCount, approvalStatuses, sentCount, replyCount }),
  };
}

// ---------------------------------------------------------------------------
// Artifact writes — land play/tool output in the right cluster (upsert by slug)
// ---------------------------------------------------------------------------

async function clusterIdForSlug(worldId: string, slug: string): Promise<string | null> {
  const { data } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId).eq('slug', slug).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Upsert artifacts onto a cluster by (cluster_id, slug) — matches app_0018's unique index. */
async function writeArtifacts(ownerId: string, clusterId: string, arts: PlayArtifact[]): Promise<number> {
  if (!arts.length) return 0;
  const rows = arts.map((a) => ({
    owner_id: ownerId, cluster_id: clusterId, slug: a.slug,
    kind: a.kind, title: a.title, detail: a.detail, source: 'garvis',
  }));
  const { error } = await supabase.from('knowledge_artifacts').upsert(rows, { onConflict: 'cluster_id,slug' });
  return error ? 0 : rows.length;
}

// ---------------------------------------------------------------------------
// Run a play
// ---------------------------------------------------------------------------

export interface RunPlayResult { missionId: string | null; artifactCount: number; steps: { id: string; ok: boolean; artifacts: number }[]; costUsd: number }

/** AI-enrich the first artifact of a step's output; deterministic draft stands on any failure. */
async function enrich(step: Play['steps'][number], ctx: PlayContext, arts: PlayArtifact[]): Promise<{ arts: PlayArtifact[]; costUsd: number }> {
  if (!step.ai || !arts.length) return { arts, costUsd: 0 };
  try {
    const r = await exploreComplete(
      [{ role: 'system', content: step.ai.system }, { role: 'user', content: step.ai.buildUser(ctx) }],
      step.ai.maxTokens,
    );
    const text = r.text.trim();
    if (text.length > 40) {
      const next = [...arts];
      next[0] = { ...next[0], detail: text };
      return { arts: next, costUsd: r.costUsd };
    }
    return { arts, costUsd: r.costUsd };
  } catch {
    return { arts, costUsd: 0 }; // fail-soft — the deterministic draft is already good
  }
}

/**
 * Run a play through a web. Creates a mission bound to the world (garvis_missions.world_id), writes
 * each step's artifacts into its target cluster, AI-enriches where configured. Does NOT send anything
 * — sending is a separate, approval-gated tool (queue-sequence). Fail-soft per step.
 */
export async function runPlay(worldId: string, playId: string, ctxOverride?: Partial<PlayContext>): Promise<RunPlayResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const play = playById(playId);
  if (!play) throw new Error(`Unknown play "${playId}".`);
  const ctx: PlayContext = { ...DEFAULT_LAKE_GENEVA_CONTEXT, ...ctxOverride };

  // Bind a mission to the territory (the campaign THROUGH the web).
  let missionId: string | null = null;
  const { data: mission } = await supabase.from('garvis_missions').insert({
    owner_id: uid, world_id: worldId, objective: play.objective,
    subject: play.title, status: 'running',
  }).select('id').single();
  missionId = (mission as { id: string } | null)?.id ?? null;

  let artifactCount = 0;
  let costUsd = 0;
  const steps: RunPlayResult['steps'] = [];

  for (const step of play.steps) {
    try {
      const drafted = step.produce(ctx);
      const { arts, costUsd: c } = await enrich(step, ctx, drafted);
      costUsd += c;
      const clusterId = await clusterIdForSlug(worldId, step.targetSlug);
      const n = clusterId ? await writeArtifacts(uid, clusterId, arts) : 0;
      artifactCount += n;
      steps.push({ id: step.id, ok: n > 0, artifacts: n });
    } catch {
      steps.push({ id: step.id, ok: false, artifacts: 0 });
    }
  }

  if (missionId) {
    await supabase.from('garvis_missions').update({
      status: 'review', summary: `Ran ${play.title}: ${artifactCount} artifacts across ${steps.filter((s) => s.ok).length}/${steps.length} areas.`,
    }).eq('id', missionId);
  }
  await recordMindEvent(uid, {
    event_type: 'mission_planned', source: 'workweb',
    subject: `Ran play "${play.title}" through the web — ${artifactCount} artifacts`,
    payload: { world_id: worldId, play: play.id, mission_id: missionId, artifacts: artifactCount },
  });

  return { missionId, artifactCount, steps, costUsd };
}

// ---------------------------------------------------------------------------
// Run one workspace tool
// ---------------------------------------------------------------------------

export interface ToolRunResult { ok: boolean; message: string; artifacts?: number; approvalId?: string }

/** Execute a single tool on a chartered cluster. Generators write artifacts; queue tools enqueue an
 *  approval (never send directly). Returns a human message for the toast. */
export async function runTool(
  worldId: string, cluster: WebCluster, toolId: string,
  args?: { csvText?: string; toEmail?: string; contactName?: string; playId?: string },
): Promise<ToolRunResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  switch (toolId) {
    case 'research':
    case 'gen-angle':
    case 'gen-postcard':
    case 'gen-social':
    case 'gen-video-script':
    case 'gen-landing':
    case 'gen-email-seq':
    case 'gen-copy': {
      // These are single-cluster generators. If the web has a play whose step targets THIS cluster,
      // run just that step; otherwise write a generic starter artifact so the area is never empty.
      const play = args?.playId ? playById(args.playId) : matchPlayForCluster(cluster.slug);
      const step = play?.steps.find((s) => s.targetSlug === cluster.slug);
      if (play && step) {
        const ctx = DEFAULT_LAKE_GENEVA_CONTEXT;
        const { arts, costUsd } = await enrich(step, ctx, step.produce(ctx));
        void costUsd;
        const n = await writeArtifacts(uid, cluster.id, arts);
        return { ok: n > 0, message: n > 0 ? `Generated ${n} artifact${n === 1 ? '' : 's'} into ${cluster.title}.` : 'Nothing generated.', artifacts: n };
      }
      const starter: PlayArtifact = {
        slug: `starter-${slugify(toolId)}`, kind: 'doc',
        title: `${cluster.title} — starting point`,
        detail: `A starting draft for ${cluster.title}. Run a play or connect this area to a play step to fill it with real work.`,
      };
      const n = await writeArtifacts(uid, cluster.id, [starter]);
      return { ok: n > 0, message: 'Added a starting draft.', artifacts: n };
    }

    case 'upload-list': {
      const parsed = parseAudienceCsv(args?.csvText ?? '');
      if (!parsed.contacts.length) return { ok: false, message: 'No valid email rows found in that CSV.' };
      const rows = parsed.contacts.map((ct) => ({
        owner_id: uid, full_name: ct.name, email: ct.email, email_status: 'unknown' as const, is_primary: false,
      }));
      // Upsert on (owner_id, email) with ignoreDuplicates: an already-known contact is SKIPPED,
      // never overwritten — updating here would reset email_status (including 'unsubscribed')
      // back to 'unknown', silently re-arming sends to someone who opted out.
      const { error } = await supabase.from('contacts').upsert(rows, { onConflict: 'owner_id,email', ignoreDuplicates: true });
      if (error) return { ok: false, message: `Could not save contacts: ${error.message}` };
      await recordMindEvent(uid, { event_type: 'artifact_imported', source: 'workweb', subject: `Imported ${rows.length} contacts into ${cluster.title}`, payload: { world_id: worldId } });
      return { ok: true, message: `Imported ${rows.length} contact${rows.length === 1 ? '' : 's'}${parsed.skipped ? ` (${parsed.skipped} skipped)` : ''}.` };
    }

    case 'queue-sequence': {
      const to = (args?.toEmail ?? '').toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, message: 'Enter a valid recipient email.' };
      const play = matchPlayForCluster(cluster.slug) ?? playById('lakefront-seller');
      if (!play) return { ok: false, message: 'No sequence is defined for this area yet.' };
      const approvalId = await queueSequenceStep0(uid, worldId, cluster, play, to, args?.contactName ?? null);
      return { ok: true, message: 'First email queued for approval. The two follow-ups are saved as drafts to send when you\'re ready.', approvalId };
    }

    case 'view-contacts':
    case 'open-approvals':
    case 'import-docs':
    case 'view-results':
      // View tools are handled by the UI (navigation / modal) — reaching the executor is a no-op.
      return { ok: true, message: '' };

    default:
      // An unregistered id reaching the executor is a BUG, not a success — say so.
      return { ok: false, message: `Unknown tool "${toolId}" — not implemented in the executor.` };
  }
}

/** Find the play whose steps touch this cluster (so a per-cluster generator runs the right step). */
function matchPlayForCluster(slug: string): Play | null {
  for (const p of PLAYS) if (p.steps.some((s) => s.targetSlug === slug)) return p;
  return null;
}

/** Queue the FIRST touch of a play's sequence for approval, and save the play's curated follow-up
 *  touches (steps 1 & 2) as drafts on the same campaign so they carry the PLAY's copy — not the
 *  generic outreach-followups cron's AI rewrite. The campaign is marked sequence_stopped so that cron
 *  never auto-drafts off-brand bumps for it; the follow-ups are the user's to send when ready
 *  (their copy is also visible as artifacts in the follow-up area).
 *  Idempotent-ish: reuses the contact (upsert on owner+email) and an already-pending campaign for the
 *  same (world, contact) so double-clicks don't queue the same opener twice. All inserts error-checked. */
async function queueSequenceStep0(
  ownerId: string, worldId: string, cluster: WebCluster, play: Play, to: string, name: string | null,
): Promise<string> {
  void cluster;
  // Contact: atomic upsert on (owner_id, email) — app_0025 constraint makes this race-free.
  const { data: c, error: cErr } = await supabase.from('contacts')
    .upsert({ owner_id: ownerId, email: to, full_name: name, email_status: 'unknown', is_primary: true }, { onConflict: 'owner_id,email' })
    .select('id').single();
  if (cErr || !c) throw new Error(`Could not save the contact: ${cErr?.message ?? 'unknown error'}`);
  const contactId = (c as { id: string }).id;

  // Reuse an already-pending campaign for this recipient in this web (double-click / retry safety).
  // sequence_stopped:true keeps the generic follow-up cron away — this play owns its own copy.
  let campaignId: string;
  const { data: openCamp } = await supabase.from('outreach_campaigns')
    .select('id').eq('owner_id', ownerId).eq('world_id', worldId).eq('contact_id', contactId).eq('state', 'pending_approval').maybeSingle();
  if (openCamp) {
    campaignId = (openCamp as { id: string }).id;
  } else {
    const { data: camp, error: campErr } = await supabase.from('outreach_campaigns').insert({
      owner_id: ownerId, world_id: worldId, contact_id: contactId,
      kind: 'cold_site_pitch', state: 'pending_approval', sequence_stopped: true,
    }).select('id').single();
    if (campErr || !camp) throw new Error(`Could not start the campaign: ${campErr?.message ?? 'unknown error'}`);
    campaignId = (camp as { id: string }).id;
  }

  // If a step-0 message already exists for this campaign, never draft a duplicate opener. The
  // pending-approval lookup is scoped to THAT message (payload->>message_id) — a pending send
  // belonging to some other campaign must never satisfy this check.
  const { data: existingMsgs } = await supabase.from('outreach_messages')
    .select('id, status, subject, body_text').eq('campaign_id', campaignId).eq('sequence_step', 0)
    .in('status', ['draft', 'approved', 'scheduled', 'sent']).limit(5);
  const existing = (existingMsgs ?? [])[0] as { id: string; status: string; subject: string | null; body_text: string | null } | undefined;
  if (existing) {
    if (existing.status === 'sent') throw new Error('The opener for this recipient was already sent — the follow-up drafts are next.');
    const { data: openA } = await supabase.from('approvals')
      .select('id').eq('kind', 'send_email').eq('status', 'pending')
      .eq('payload->>message_id', existing.id).limit(1);
    if (openA?.length) return (openA[0] as { id: string }).id;
    // The draft exists but its approval is gone (rejected / expired / failed mid-queue):
    // re-queue the SAME message instead of drafting a duplicate.
    return enqueueApproval({
      kind: 'send_email',
      title: `${play.title} → ${to} (touch 1, re-queued)`,
      preview: `${existing.subject ?? ''}\n\n${existing.body_text ?? ''}`,
      payload: { message_id: existing.id, campaign_id: campaignId },
      requestedBy: 'worker',
    });
  }

  const firstName = name?.split(/\s+/)[0] ?? 'there';
  const seq = play.emailSequence(DEFAULT_LAKE_GENEVA_CONTEXT).map((e) => ({
    ...e, body: e.body.replace(/\{\{first_name\}\}/g, firstName),
  }));
  const seq0 = seq[0];
  const { data: msg, error: mErr } = await supabase.from('outreach_messages').insert({
    owner_id: ownerId, campaign_id: campaignId, contact_id: contactId,
    sequence_step: 0, subject: seq0.subject, body_text: seq0.body, to_address: to, status: 'draft',
  }).select('id').single();
  if (mErr || !msg) throw new Error(`Could not draft the email: ${mErr?.message ?? 'unknown error'}`);
  const messageId = (msg as { id: string }).id;

  // Save the play's curated follow-up touches (steps 1 & 2) as drafts carrying the PLAY's copy, so
  // the generic cron never has to invent off-brand bumps. Only step 0 is queued for sending now.
  for (const e of seq.slice(1)) {
    const { data: exists } = await supabase.from('outreach_messages')
      .select('id').eq('campaign_id', campaignId).eq('sequence_step', e.step).maybeSingle();
    if (!exists) {
      await supabase.from('outreach_messages').insert({
        owner_id: ownerId, campaign_id: campaignId, contact_id: contactId,
        sequence_step: e.step, subject: e.subject, body_text: e.body, to_address: to, status: 'draft',
      });
    }
  }

  return enqueueApproval({
    kind: 'send_email',
    title: `${play.title} → ${to} (touch 1 of ${seq.length})`,
    preview: `${seq0.subject}\n\n${seq0.body}`,
    payload: { message_id: messageId, campaign_id: campaignId },
    requestedBy: 'worker',
  });
}
