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
  newUniverse, syncUniverseImmediate, loadWorld, listWorlds as listUniverseWorlds,
  type Universe,
} from './universe';
import { normalizeGraph, slugify, type ClusterGraph, type Cluster, type Artifact } from './clustering';
import {
  templateById, flattenTemplate, parseCharter, toolsFor, rollupWeb, deriveStatus,
  parseAudienceCsv, validateTemplate, type Charter, type WebTemplate, type WorkTool,
} from './workweb';
import { playById, PLAYS, DEFAULT_LAKE_GENEVA_CONTEXT, type Play, type PlayContext, type PlayArtifact } from './plays';
import { mergeTokens, type PlayData, type BusinessContext, type PlayEmail, type WorldDNA } from './genesis';
import { expertiseFor, productLabExpertiseFor, isProductLab, detectVertical, type Vertical } from './expertise';
import { producerFor } from './producers';

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

/** Write charters onto the persisted clusters (matched by world_id + slug). ERROR-CHECKED: an
 *  unchartered cluster is invisible to the workweb UI and unprotected by the sync guard, so a
 *  partial failure here must surface, never pass silently. */
async function persistCharters(worldId: string, charters: Record<string, Charter>): Promise<void> {
  const slugs = Object.keys(charters);
  if (!slugs.length) return;
  const { data: rows, error: readErr } = await supabase
    .from('knowledge_clusters')
    .select('id, slug')
    .eq('world_id', worldId)
    .in('slug', slugs);
  if (readErr) throw new Error(`Could not read the new clusters to charter them: ${readErr.message}`);
  const found = new Set((rows ?? []).map((r) => (r as { slug: string }).slug));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length) throw new Error(`${missing.length} area(s) were not persisted (${missing.slice(0, 3).join(', ')}) — the web is incomplete; try again.`);
  const results = await Promise.all((rows ?? []).map((r) => {
    const c = charters[(r as { slug: string }).slug];
    return c ? supabase.from('knowledge_clusters').update({ charter: c }).eq('id', (r as { id: string }).id) : Promise.resolve({ error: null });
  }));
  const failed = results.filter((r) => (r as { error: unknown }).error).length;
  if (failed) throw new Error(`${failed} charter write(s) failed — the web is partially chartered; open it and retry.`);
}

/** Create a new work web from a template id. Returns the server world id.
 *  voiceCtx: the world's own business context (genesis drafts pass theirs) — used to seed every
 *  chartered area with its expert playbook in the right voice. Builtin templates get a minimal
 *  context (title only; unknown tokens stay visible — honest about what isn't known yet).
 *  dna: the World DNA (genesis drafts pass theirs) — its words drive deterministic industry
 *  detection so the seeds include the DOMAIN pack (real estate, finance, food, …), not just the
 *  functional one. */
export async function instantiateWeb(templateOrId: WebTemplate | string, voiceCtx?: BusinessContext | null, dna?: WorldDNA | null): Promise<WebSummary> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  // GENESIS SEAM: a template may be a builtin id OR a runtime object (an approved generated
  // draft). Either way it passes the SAME structural validation — generated structures earn
  // instantiation through the same gate the builtins were tested against.
  const t = typeof templateOrId === 'string' ? templateById(templateOrId) : templateOrId;
  if (!t) throw new Error(`Unknown web template "${String(templateOrId)}".`);
  const structural = validateTemplate(t, PLAYS.map((p) => p.id));
  if (structural.length) throw new Error(`Template failed validation: ${structural[0]}`);

  const { graph, charters } = templateToGraph(t);
  const universe: Universe = newUniverse(t.title, graph, t.nodes[0]?.slug ?? null);
  // A NEW world touches only its own rows, so it bypasses the explorer's one-at-a-time sync
  // guard entirely (syncUniverseImmediate) — creating a web never waits behind a background
  // save of some other world. Retries with backoff cover transient network failures.
  let worldId: string | null = null;
  for (const wait of [0, 600, 1500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    worldId = await syncUniverseImmediate(universe);
    if (worldId) break;
  }
  if (!worldId) throw new Error('Could not save the web — check your connection and try again.');

  await persistCharters(worldId, charters);
  // BORN FULL, NOT BLANK: every chartered area starts with its expert playbook (fail-soft —
  // a seeding hiccup never fails creation; the packs regenerate from any area's tools).
  const seeded = await seedWorld(worldId, voiceCtx ?? minimalContext(t.title), dna);
  await recordMindEvent(uid, {
    event_type: 'note', source: 'workweb',
    subject: `Created work web "${t.title}" from template ${t.id}${seeded ? ` — seeded ${seeded} playbook doc${seeded === 1 ? '' : 's'}` : ''}`,
    payload: { world_id: worldId, template: t.id, seeded },
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
  earnedArtifacts: number;   // artifacts EXCLUDING seeded playbooks — the honest activity count
  playbookArtifacts: number; // seeded playbooks — knowledge the area was born with, shown as such
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
  const remoteIds = worlds.filter((w) => w.remote).map((w) => w.id);
  if (!remoteIds.length) return [];
  // ONE query instead of a count-per-world N+1: fetch all chartered clusters for the remote
  // worlds at once, then a world "is a web" if it has ≥1 chartered cluster.
  const { data: rows } = await supabase
    .from('knowledge_clusters')
    .select('world_id')
    .in('world_id', remoteIds)
    .not('charter', 'is', null)
    .limit(5000);
  const charteredWorlds = new Set((rows ?? []).map((r) => (r as { world_id: string }).world_id));
  return worlds
    .filter((w) => w.remote && charteredWorlds.has(w.id))
    .map((w) => ({ worldId: w.id, title: w.title, templateId: null }));
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

  // Per-cluster artifact counts split by provenance. NO THEATER: seeded playbooks (SEED_SOURCE)
  // are knowledge the world was born with — they must not light an area 'active' or inflate the
  // rollup. Status and rollup count EARNED artifacts only; playbooks are surfaced separately.
  const totalByCluster = new Map<string, number>();
  const seedsByCluster = new Map<string, number>();
  const clusterDbIds = (rows ?? []).map((r) => (r as { id: string }).id);
  if (clusterDbIds.length) {
    const { data: artRows } = await supabase.from('knowledge_artifacts')
      .select('cluster_id, source').in('cluster_id', clusterDbIds).limit(2000);
    for (const a of artRows ?? []) {
      const cid = (a as { cluster_id: string }).cluster_id;
      totalByCluster.set(cid, (totalByCluster.get(cid) ?? 0) + 1);
      if ((a as { source: string | null }).source === SEED_SOURCE) seedsByCluster.set(cid, (seedsByCluster.get(cid) ?? 0) + 1);
    }
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
    const total = meta ? (totalByCluster.get(meta.id) ?? c.artifacts.length) : c.artifacts.length;
    const playbooks = meta ? (seedsByCluster.get(meta.id) ?? 0) : 0;
    const earned = Math.max(0, total - playbooks);
    return {
      id: meta?.id ?? c.id,
      slug: c.id,
      parentSlug: c.parentId,
      title: c.title,
      summary: c.summary,
      charter,
      tools: charter ? toolsFor(charter) : [],
      artifacts: c.artifacts,
      earnedArtifacts: earned,
      playbookArtifacts: playbooks,
      // Status counts EARNED work only — a newborn world full of playbooks is still dormant
      // until something actually happens in it.
      liveStatus: charter ? deriveStatus(charter, earned, pending) : null,
      pendingApprovals: pending,
    };
  });

  const artifactCount = clusters.reduce((n, c) => n + c.earnedArtifacts, 0);
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

/** The source tag for seeded playbook docs. NO-THEATER LOAD-BEARING: every derived signal that
 *  counts artifacts (area status, momentum, intel age, planet size/glow, launch-active floors)
 *  EXCLUDES this source — a playbook is knowledge the world was born with, not work that
 *  happened. Counting seeds as activity would make a newborn world glow, which is exactly the
 *  theater the system forbids. */
export const SEED_SOURCE = 'garvis-seed';

/** Upsert artifacts onto a cluster by (cluster_id, slug) — matches app_0018's unique index. */
async function writeArtifacts(ownerId: string, clusterId: string, arts: PlayArtifact[], source = 'garvis'): Promise<number> {
  if (!arts.length) return 0;
  const rows = arts.map((a) => ({
    owner_id: ownerId, cluster_id: clusterId, slug: a.slug,
    kind: a.kind, title: a.title, detail: a.detail, source,
  }));
  const { error } = await supabase.from('knowledge_artifacts').upsert(rows, { onConflict: 'cluster_id,slug' });
  return error ? 0 : rows.length;
}

// ---------------------------------------------------------------------------
// Born full, not blank — seed every chartered area with its expert playbook
// ---------------------------------------------------------------------------

/** The voice a world speaks with when it has no synthesized business context (builtin templates):
 *  the title fills {{business_name}}; every other token stays visibly unmerged, marking exactly
 *  what Garvis doesn't know yet — never a guess, never another world's context. */
function minimalContext(title: string): BusinessContext {
  return { business_name: title, principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null };
}

/** Everything the world knows about itself, as one detection string — the vertical (real estate /
 *  finance / food / …) is derived DETERMINISTICALLY from these words; same world, same vertical. */
function worldVertical(ctx: BusinessContext, dna?: WorldDNA | null): Vertical {
  return detectVertical([
    dna?.businessType, dna?.valueProposition, ...(dna?.idealCustomers ?? []),
    ctx.business_name, ctx.craft, ctx.audience, ...ctx.offerings,
  ].filter(Boolean).join(' '));
}

/** Write the expert playbook pack (expertise.ts + verticals.ts) into every chartered area of a
 *  world: the functional playbooks (30-day social plan, direct-mail plan + concepts, KPI tree)
 *  COMPOSED with the industry overlay detected from the World DNA (CMA method for real estate,
 *  due-diligence ladder for finance, menu engineering for restaurants, the compliance flags each
 *  industry actually gets burned by) — deterministic (zero AI keys), token-merged into the
 *  world's own voice, honestly labeled as frameworks that defer real numbers to scans/records.
 *  FAIL-SOFT by design: a seeding failure never fails world creation — the world just starts
 *  emptier, and any area's generator tool writes the same pack on demand. Idempotent (upsert on
 *  cluster_id+slug), so re-running never duplicates. */
export async function seedWorld(worldId: string, ctx: BusinessContext, dna?: WorldDNA | null): Promise<number> {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return 0;
    const vertical = worldVertical(ctx, dna);
    const { data: rows } = await supabase.from('knowledge_clusters')
      .select('id, charter').eq('world_id', worldId).not('charter', 'is', null);
    const parsed = (rows ?? []).map((r) => ({ id: (r as { id: string }).id, charter: parseCharter((r as { charter: unknown }).charter) }));
    // PRODUCT LABS get product knowledge (flow audit H1): a feature lab born full of marketing
    // playbooks and finance go-to-market advice ("trust is the product — referrals first") is
    // noise wearing an expert costume. Product variants for intel/vault/ledger, no industry overlay.
    const productLab = isProductLab(parsed.filter((p) => p.charter).map((p) => p.charter!));
    let seeded = 0;
    for (const r of parsed) {
      if (!r.charter) continue;
      const pack = productLab
        ? productLabExpertiseFor(r.charter.archetype, r.charter.flavor)
        : expertiseFor(r.charter.archetype, r.charter.flavor, vertical);
      const arts: PlayArtifact[] = pack
        .map((s) => ({ slug: s.slug, kind: s.kind, title: s.title, detail: mergeTokens(s.detail, ctx) }));
      seeded += await writeArtifacts(uid, r.id, arts, SEED_SOURCE);
    }
    return seeded;
  } catch {
    return 0;
  }
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
/** RENDITIONS: give grounded creative artifacts a versioned slug (base, base-v2, base-v3 …) so a
 *  re-press ADDS a take to the library instead of silently overwriting the last one (the artifact
 *  upsert conflicts on cluster_id+slug). Titles gain "· take N" so the shelf reads honestly. */
async function versionCreativeSlugs(clusterId: string, artifacts: PlayArtifact[]): Promise<PlayArtifact[]> {
  const out: PlayArtifact[] = [];
  for (const a of artifacts) {
    try {
      // ANCHORED match (exact slug or its -vN versions) — an open prefix LIKE made sibling slugs
      // that merely share a stem ('feature-spec' vs 'feature-spec-alerts') inflate each other's
      // take numbers.
      const { data } = await supabase.from('knowledge_artifacts')
        .select('slug').eq('cluster_id', clusterId)
        .or(`slug.eq.${a.slug},slug.like.${a.slug}-v%`).limit(50);
      const existing = ((data ?? []) as { slug: string }[]).map((r) => r.slug);
      if (!existing.length) { out.push(a); continue; }
      let n = existing.length + 1;
      while (existing.includes(n === 1 ? a.slug : `${a.slug}-v${n}`)) n++;
      out.push({ ...a, slug: `${a.slug}-v${n}`, title: `${a.title} · take ${n}` });
    } catch { out.push(a); } // fail-soft: worst case is the old refresh behavior
  }
  return out;
}

export async function runTool(
  worldId: string, cluster: WebCluster, toolId: string,
  args?: { csvText?: string; toEmail?: string; contactName?: string; playId?: string; direction?: string },
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
    case 'gen-ideas':
    case 'gen-plan':
    case 'gen-features':
    case 'gen-spec':
    case 'gen-ads':
    case 'gen-copy': {
      // FINISHED-WORK PRODUCERS FIRST (research/gen-social/gen-video-script/gen-angle): these
      // reason over the world's REAL materials (DNA, brand voice, vault photos, prior research)
      // and do real web search — producing a cited market brief, ready-to-post captions, a
      // shot-by-shot script, a grounded angle. Strictly better than any template, so they lead;
      // each falls to the area's expert pack if AI/search is unavailable (never a stub). Routed
      // by TOOL ID (fixing the slug-collision where research and gen-angle produced the same doc).
      if (cluster.charter) {
        const producer = producerFor(toolId);
        if (producer) {
          const r = await producer(worldId, cluster.charter, { direction: args?.direction });
          if (r.artifacts.length) {
            // RENDITIONS, not replacements: grounded creative work gets a VERSIONED slug so a
            // re-press ADDS a take instead of overwriting the last one (the upsert-by-slug that
            // silently ate prior work). Framework fallbacks keep their fixed slugs — a playbook
            // refresh should replace itself.
            const arts = r.grounded ? await versionCreativeSlugs(cluster.id, r.artifacts) : r.artifacts;
            // Grounded finished work (real research / posts / script) is EARNED activity; a
            // framework fallback (AI/search down) is context, not activity — tag it as seed so
            // it never inflates momentum/status (the same No-Theater rule as birth seeding).
            const n = await writeArtifacts(uid, cluster.id, arts, r.grounded ? 'garvis' : SEED_SOURCE);
            if (n > 0) return { ok: true, message: r.message, artifacts: n };
          } else {
            // THE PRODUCER'S EMPTY RESULT IS THE HONEST OUTCOME (no-theater): a rejected-thin or
            // AI-down spec must surface ITS message — falling through to the legacy generators
            // wrote a generic playbook with a green "success" toast over a real failure.
            return { ok: false, message: r.message };
          }
        }
      }

      // Single-cluster generators. Resolution order — and the honesty rule that governs it:
      // a generator speaks THE WORLD's voice or none. (1) A genesis world's own data play step
      // for this cluster; (2) a genesis world with context but no matching step → a context-
      // framed starter; (3) legacy builtin worlds (no business_context) keep the code-play path;
      // (4) otherwise a plain starter. DEFAULT_LAKE_GENEVA_CONTEXT never leaks across worlds.
      const voice = await worldVoice(worldId);
      if (voice.ctx) {
        const dataStep = voice.play?.steps.find((s) => s.targetSlug === cluster.slug);
        if (voice.play && dataStep) {
          const r = await runPlayData(worldId, { ...voice.play, steps: [dataStep] }, voice.ctx);
          return { ok: r.artifactCount > 0, message: r.artifactCount > 0 ? `Generated ${r.artifactCount} artifact${r.artifactCount === 1 ? '' : 's'} into ${cluster.title}.` : 'Nothing generated.', artifacts: r.artifactCount };
        }
        // No matching play step → the area's EXPERT PLAYBOOK (functional + industry overlay),
        // in this world's voice — never a vague stub. (Seeded at creation too; upsert by slug
        // makes this a refresh, not a dupe.)
        if (cluster.charter) {
          const vertical = worldVertical(voice.ctx, voice.dna);
          const arts: PlayArtifact[] = expertiseFor(cluster.charter.archetype, cluster.charter.flavor, vertical)
            .map((s) => ({ slug: s.slug, kind: s.kind, title: s.title, detail: mergeTokens(s.detail, voice.ctx!) }));
          const n = await writeArtifacts(uid, cluster.id, arts, SEED_SOURCE);
          return { ok: n > 0, message: n > 0 ? `Wrote the ${cluster.title} playbook (${n} doc${n === 1 ? '' : 's'}) in this world's voice.` : 'Nothing generated.', artifacts: n };
        }
        const framed: PlayArtifact = {
          slug: `starter-${slugify(toolId)}`, kind: 'doc',
          title: `${cluster.title} — starting point`,
          detail: mergeTokens(
            `A starting draft for ${cluster.title} at {{business_name}}.\n\nBusiness: {{craft}}. Audience: {{audience}}. Voice: {{tone}}.\n\nUse the studio chat in this area to turn this into real work — it knows the brand kit and the files here.`,
            voice.ctx,
          ),
        };
        const n = await writeArtifacts(uid, cluster.id, [framed]);
        return { ok: n > 0, message: 'Added a starting draft in this world\'s own voice.', artifacts: n };
      }
      const play = args?.playId ? playById(args.playId) : matchPlayForCluster(cluster.slug);
      const step = play?.steps.find((s) => s.targetSlug === cluster.slug);
      if (play && step) {
        const ctx = DEFAULT_LAKE_GENEVA_CONTEXT;
        const { arts, costUsd } = await enrich(step, ctx, step.produce(ctx));
        void costUsd;
        const n = await writeArtifacts(uid, cluster.id, arts);
        return { ok: n > 0, message: n > 0 ? `Generated ${n} artifact${n === 1 ? '' : 's'} into ${cluster.title}.` : 'Nothing generated.', artifacts: n };
      }
      // Builtin world, no matching play → the expert playbook with a minimal voice (world title
      // fills {{business_name}}; other tokens stay visible — honest about what isn't known yet).
      // The title's own words still drive industry detection ("Mom's Real Estate Marketing"
      // gets the CMA method and Fair Housing checklist, not a generic pack).
      if (cluster.charter) {
        const ctx = minimalContext(voice.title ?? cluster.title);
        const vertical = worldVertical(ctx, voice.dna);
        const arts: PlayArtifact[] = expertiseFor(cluster.charter.archetype, cluster.charter.flavor, vertical)
          .map((s) => ({ slug: s.slug, kind: s.kind, title: s.title, detail: mergeTokens(s.detail, ctx) }));
        const n = await writeArtifacts(uid, cluster.id, arts, SEED_SOURCE);
        return { ok: n > 0, message: n > 0 ? `Wrote the ${cluster.title} playbook (${n} doc${n === 1 ? '' : 's'}).` : 'Nothing generated.', artifacts: n };
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
      const { data: inserted, error } = await supabase.from('contacts').upsert(rows, { onConflict: 'owner_id,email', ignoreDuplicates: true }).select('id');
      if (error) return { ok: false, message: `Could not save contacts: ${error.message}` };
      const added = inserted?.length ?? 0;                    // rows actually inserted — the honest count
      const dupes = rows.length - added;
      await recordMindEvent(uid, { event_type: 'artifact_imported', source: 'workweb', subject: `Imported ${added} contacts into ${cluster.title}`, payload: { world_id: worldId } });
      return { ok: true, message: `Imported ${added} new contact${added === 1 ? '' : 's'}${dupes ? ` (${dupes} already known)` : ''}${parsed.skipped ? ` (${parsed.skipped} rows skipped)` : ''}.` };
    }

    case 'queue-sequence': {
      const to = (args?.toEmail ?? '').toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, message: 'Enter a valid recipient email.' };
      // Same honesty rule as the generators: THE WORLD's emails or a plain refusal — never
      // another world's copy. Genesis worlds use their generated sequence (token-merged);
      // legacy builtin worlds keep the code play.
      const voice = await worldVoice(worldId);
      let seq: { title: string; emails: PlayEmail[] };
      if (voice.ctx) {
        if (!voice.play?.emails.length) {
          return { ok: false, message: 'This web has no email sequence yet — draft one in its follow-up area first (the studio chat can write it in this world\'s voice).' };
        }
        seq = {
          title: voice.play.title,
          emails: voice.play.emails.map((e) => ({ ...e, subject: mergeTokens(e.subject, voice.ctx!), body: mergeTokens(e.body, voice.ctx!) })),
        };
      } else {
        // No cross-world fallback — a builtin world whose cluster matches no play gets a plain
        // refusal, never another world's copy (the same rule the genesis branch enforces).
        const play = matchPlayForCluster(cluster.slug);
        if (!play) return { ok: false, message: 'No sequence is defined for this area yet — draft one in its follow-up area first.' };
        seq = { title: play.title, emails: play.emailSequence(DEFAULT_LAKE_GENEVA_CONTEXT).map((e) => ({ step: e.step, subject: e.subject, body: e.body })) };
      }
      const approvalId = await queueSequenceStep0(uid, worldId, cluster, seq, to, args?.contactName ?? null);
      return { ok: true, message: 'First email queued for approval. The follow-ups are saved as drafts to send when you\'re ready.', approvalId };
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

// ---------------------------------------------------------------------------
// The world's own voice (genesis worlds) — generators read THE WORLD's context,
// never another world's. This is what killed the Lake Geneva fallback.
// ---------------------------------------------------------------------------

interface WorldVoice { ctx: BusinessContext | null; play: PlayData | null; dna: WorldDNA | null; title: string | null }

async function worldVoice(worldId: string): Promise<WorldVoice> {
  const [{ data: w }, { data: t }] = await Promise.all([
    supabase.from('knowledge_worlds').select('business_context, dna, title').eq('id', worldId).maybeSingle(),
    supabase.from('web_templates').select('play').eq('world_id', worldId).eq('status', 'instantiated').limit(1).maybeSingle(),
  ]);
  const row = w as { business_context?: BusinessContext | null; dna?: WorldDNA | null; title?: string | null } | null;
  return {
    ctx: row?.business_context ?? null,
    play: ((t as { play?: PlayData | null } | null)?.play) ?? null,
    dna: row?.dna ?? null,
    title: row?.title ?? null,
  };
}

/** Run a DATA-DRIVEN play (genesis worlds): deterministic token-merged drafts land first (the
 *  zero-keys floor), then fail-soft AI enrichment where a step carries an aiPrompt. */
export async function runPlayData(worldId: string, play: PlayData, ctx: BusinessContext): Promise<RunPlayResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const { data: mission } = await supabase.from('garvis_missions').insert({
    owner_id: uid, world_id: worldId, objective: play.objective, subject: play.title, status: 'running',
  }).select('id').single();
  const missionId = (mission as { id: string } | null)?.id ?? null;

  let artifactCount = 0;
  let costUsd = 0;
  const steps: RunPlayResult['steps'] = [];
  for (const step of play.steps) {
    try {
      let detail = mergeTokens(step.draft, ctx);
      if (step.aiPrompt) {
        try {
          const r = await exploreComplete([
            { role: 'system', content: 'You are the studio writer for one business. Improve the draft per the instruction, in the business\'s own voice. Keep it directly usable; never invent facts the context does not contain.' },
            { role: 'user', content: `BUSINESS:\n${JSON.stringify(ctx)}\n\nDRAFT:\n${detail}\n\nINSTRUCTION: ${step.aiPrompt}` },
          ], 900);
          if (r.text.trim().length > 40) { detail = r.text.trim(); costUsd += r.costUsd; }
        } catch { /* fail-soft — the deterministic draft stands */ }
      }
      const clusterId = await clusterIdForSlug(worldId, step.targetSlug);
      const n = clusterId
        ? await writeArtifacts(uid, clusterId, [{ slug: step.artifact.slug, kind: step.artifact.kind, title: step.artifact.title, detail }])
        : 0;
      artifactCount += n;
      steps.push({ id: step.artifact.slug, ok: n > 0, artifacts: n });
    } catch {
      steps.push({ id: step.artifact.slug, ok: false, artifacts: 0 });
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
    payload: { world_id: worldId, play: 'generated', mission_id: missionId, artifacts: artifactCount },
  });
  return { missionId, artifactCount, steps, costUsd };
}

/** Queue the FIRST touch of a play's sequence for approval, and save the play's curated follow-up
 *  touches (steps 1 & 2) as drafts on the same campaign so they carry the PLAY's copy — not the
 *  generic outreach-followups cron's AI rewrite. The campaign is marked sequence_stopped so that cron
 *  never auto-drafts off-brand bumps for it; the follow-ups are the user's to send when ready
 *  (their copy is also visible as artifacts in the follow-up area).
 *  Idempotent-ish: reuses the contact (upsert on owner+email) and an already-pending campaign for the
 *  same (world, contact) so double-clicks don't queue the same opener twice. All inserts error-checked. */
async function queueSequenceStep0(
  ownerId: string, worldId: string, cluster: WebCluster,
  playSeq: { title: string; emails: PlayEmail[] }, to: string, name: string | null,
): Promise<string> {
  if (!playSeq.emails.length) throw new Error('This sequence has no emails.');
  void cluster;
  // Contact: select-first, insert-if-missing. NEVER an overwriting upsert here — that would
  // reset email_status (including 'unsubscribed') back to 'unknown' and silently re-arm sends
  // to someone who opted out (the exact hazard upload-list documents and avoids).
  let contactId: string;
  const { data: existingContact } = await supabase.from('contacts')
    .select('id, email_status').eq('owner_id', ownerId).eq('email', to).maybeSingle();
  if (existingContact) {
    const st = (existingContact as { email_status: string }).email_status;
    if (['unsubscribed', 'bounced', 'complained', 'invalid'].includes(st)) {
      throw new Error(`This contact is marked ${st} — Garvis won't queue mail to them.`);
    }
    contactId = (existingContact as { id: string }).id;
  } else {
    const { data: c, error: cErr } = await supabase.from('contacts')
      .insert({ owner_id: ownerId, email: to, full_name: name, email_status: 'unknown', is_primary: true })
      .select('id').single();
    if (cErr || !c) throw new Error(`Could not save the contact: ${cErr?.message ?? 'unknown error'}`);
    contactId = (c as { id: string }).id;
  }

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
      title: `${playSeq.title} → ${to} (touch 1, re-queued)`,
      preview: `${existing.subject ?? ''}\n\n${existing.body_text ?? ''}`,
      payload: { message_id: existing.id, campaign_id: campaignId },
      requestedBy: 'worker',
    });
  }

  const firstName = name?.split(/\s+/)[0] ?? 'there';
  const seq = playSeq.emails.map((e) => ({
    ...e,
    subject: e.subject.replace(/\{\{first_name\}\}/g, firstName),
    body: e.body.replace(/\{\{first_name\}\}/g, firstName),
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
    title: `${playSeq.title} → ${to} (touch 1 of ${seq.length})`,
    preview: `${seq0.subject}\n\n${seq0.body}`,
    payload: { message_id: messageId, campaign_id: campaignId },
    requestedBy: 'worker',
  });
}
