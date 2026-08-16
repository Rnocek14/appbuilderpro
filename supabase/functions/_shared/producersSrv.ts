// supabase/functions/_shared/producersSrv.ts — SW6.2: the producer trio, server-side.
// The standing worker's mirror of the client producers (src/lib/garvis/producers.ts: research +
// business plan) and the campaign compiler (marketingRun.ts): the SAME pure cores, the SAME
// artifact shapes and grounding markers, the SAME honesty seams — only the I/O differs (admin
// client + the metered complete() seam instead of the browser rails). Field-level parity with
// the client path is pinned by arcParity.verify; drift between the two is a CI failure.
//
// Spend discipline: callers gate with checkCredits BEFORE invoking a producer; every model call
// in here RECORDS its real cost with spendCredits (the caps are computed from recorded spend).

import { complete, modelForPlan } from './ai.ts';
import { spendCredits, getUserPlan } from './credits.ts';
import {
  RESEARCH_SYSTEM, PLAN_SYSTEM, researchQueries, formatSources, appendSources, steerBlock, parsePlan,
  type ResearchSource,
} from '../../../src/lib/garvis/producersCore.ts';
import { CRITIQUE_SYSTEM, REFINE_SYSTEM, parseCritique, needsRefine, refineInstruction, depthNote, type Critique } from '../../../src/lib/garvis/depth.ts';
import { parseSerperOrganic } from '../../../src/lib/garvis/marketIntel.ts';
import { mergeTokens, type WorldDNA, type BusinessContext } from '../../../src/lib/garvis/genesis.ts';
import { expertiseFor, detectVertical } from '../../../src/lib/garvis/expertise.ts';
import { goalContextLine, type WorldGoal } from '../../../src/lib/garvis/goals.ts';
import type { Charter } from '../../../src/lib/garvis/workweb.ts';
import type { PlayArtifact } from '../../../src/lib/garvis/plays.ts';
import {
  STRATEGY_SYSTEM, POSTS_SYSTEM, ASSETS_SYSTEM,
  buildStrategyUser, buildPostsUser, buildAssetsUser,
  parseStrategy, parsePosts, parseAssets, verifyAsset,
} from '../../../src/lib/garvis/marketing.ts';

// The full supabase-js builder type trips TS's depth guard at every call site (same rationale as
// credits.ts) — the admin client is threaded loosely on purpose.
// deno-lint-ignore no-explicit-any
type Admin = any;

export interface ProduceResultSrv { artifacts: PlayArtifact[]; message: string; grounded: boolean }

const SERPER_COST = 0.002; // per search call — the same rate discover-media records

// ---------------------------------------------------------------------------
// The world's real materials (mirror of producers.gather) + shared helpers
// ---------------------------------------------------------------------------

interface Materials {
  dna: WorldDNA | null;
  ctx: BusinessContext | null;
  brandTone: string | null;
  photos: { name: string; caption: string | null }[];
  goal: string;
}

export async function gatherSrv(admin: Admin, worldId: string): Promise<Materials> {
  const [{ data: world }, { data: kit }, { data: files }, { data: goals }] = await Promise.all([
    admin.from('knowledge_worlds').select('dna, business_context').eq('id', worldId).maybeSingle(),
    admin.from('brand_kits').select('tone').eq('world_id', worldId).maybeSingle(),
    admin.from('cluster_files')
      .select('name, caption, kind, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(24),
    admin.from('world_goals')
      .select('id, world_id, title, why, metric_kind, target_value, current_manual, target_date, status, created_at')
      .eq('world_id', worldId).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
  ]);
  const goal = (goals ?? [])[0] as WorldGoal | undefined;
  return {
    dna: (world?.dna as WorldDNA | null) ?? null,
    ctx: (world?.business_context as BusinessContext | null) ?? null,
    brandTone: (kit as { tone?: string | null } | null)?.tone ?? null,
    photos: ((files ?? []) as { name: string; caption: string | null }[]).map((f) => ({ name: f.name, caption: f.caption })),
    // Progress is measured client-side; here only the STATED goal rides along — never a fake number.
    goal: goal ? goalContextLine(goal, null) : '',
  };
}

/** The business block every producer prompt shares — byte-mirror of producers.businessContext. */
function businessContext(m: Materials): string {
  const c = m.ctx;
  const lines = [
    c?.business_name && `Business: ${c.business_name}`,
    c?.craft && `Does: ${c.craft}`,
    c?.offerings?.length && `Offerings: ${c.offerings.join(', ')}`,
    c?.audience && `Audience: ${c.audience}`,
    c?.locale && `Locale: ${c.locale}`,
    (m.brandTone ?? c?.tone) && `Voice: ${m.brandTone ?? c?.tone}`,
    m.dna?.valueProposition && `Value: ${m.dna.valueProposition}`,
    m.goal,
  ].filter(Boolean);
  return lines.join('\n');
}

/** The deterministic floor: the area's expert pack, token-merged — real structure, never a stub. */
function expertiseFloor(charter: Charter, m: Materials): PlayArtifact[] {
  const vertical = detectVertical([
    m.dna?.businessType, m.dna?.valueProposition, ...(m.dna?.idealCustomers ?? []),
    m.ctx?.craft, m.ctx?.audience, ...(m.ctx?.offerings ?? []),
  ].filter(Boolean).join(' '));
  const ctx = m.ctx ?? { business_name: '', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null };
  return expertiseFor(charter.archetype, charter.flavor, vertical)
    .map((s) => ({ slug: s.slug, kind: s.kind, title: s.title, detail: mergeTokens(s.detail, ctx) }));
}

/** One metered reasoning call: plan-tier model, real cost recorded under the producer's kind. */
async function reasonSrv(
  admin: Admin, ownerId: string, kind: 'research' | 'plan',
  system: string, user: string, maxOut: number,
): Promise<string> {
  const m = modelForPlan(await getUserPlan(admin, ownerId));
  const r = await complete(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { provider: m.provider, model: m.model, maxTokens: maxOut },
  );
  await spendCredits(admin, ownerId, { costUsd: r.costUsd, kind, provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
  return r.text.trim();
}

// ---------------------------------------------------------------------------
// 1. Research — real web research, cited (mirror of produceResearch)
// ---------------------------------------------------------------------------

export async function produceResearchSrv(admin: Admin, ownerId: string, worldId: string, charter: Charter): Promise<ProduceResultSrv> {
  const m = await gatherSrv(admin, worldId);
  const queries = researchQueries(m.dna, m.ctx);
  if (!queries.length) {
    return { artifacts: expertiseFloor(charter, m), message: 'This world has no DNA yet — added the research framework to fill.', grounded: false };
  }

  const serperKey = Deno.env.get('SERPER_API_KEY');
  if (!serperKey) {
    return { artifacts: expertiseFloor(charter, m), message: 'Web search isn\'t configured — added the research framework. Add SERPER_API_KEY for live research.', grounded: false };
  }

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  for (const q of queries.slice(0, 3)) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST', headers: { 'X-API-KEY': serperKey, 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      if (!res.ok) continue;
      const payload = await res.json();
      await spendCredits(admin, ownerId, { costUsd: SERPER_COST, kind: 'discover', provider: 'serper', model: 'search' });
      for (const c of parseSerperOrganic(payload, 6)) {
        const key = c.url ?? c.name.toLowerCase();
        if (c.url && !seen.has(key)) { seen.add(key); sources.push({ title: c.name, url: c.url, snippet: c.snippet }); }
      }
    } catch { /* try the next query */ }
  }

  if (!sources.length) {
    return { artifacts: expertiseFloor(charter, m), message: 'Search returned nothing usable — added the research framework instead.', grounded: false };
  }

  // Synthesize grounded ONLY in the snippets; the LABEL must match what actually happened.
  let brief = '';
  let synthesized = false;
  try {
    brief = await reasonSrv(
      admin, ownerId, 'research', RESEARCH_SYSTEM,
      `${businessContext(m)}\n\nSEARCH RESULTS:\n${formatSources(sources.slice(0, 10))}\n\nWrite the market brief now, grounded only in these results. Cite with [n]. Plain text.`,
      1400,
    );
    synthesized = brief.trim().length >= 120;
  } catch { synthesized = false; }

  if (!synthesized) {
    const detail = appendSources('Live sources were found, but the written synthesis was unavailable — read them directly below.', sources.slice(0, 10));
    return {
      artifacts: [{ slug: 'market-research-brief', kind: 'research', title: `Market research — ${sources.length} sources found`, detail }],
      message: `Found ${sources.length} live sources; the written synthesis was unavailable, so the sources are attached to read directly.`,
      grounded: false,
    };
  }

  const cited = /\[\d+\]/.test(brief);
  const detail = appendSources(brief, sources.slice(0, 10));
  return {
    artifacts: [{ slug: 'market-research-brief', kind: 'research', title: cited ? 'Market research — live, with sources' : 'Market research — live sources, brief attached', detail }],
    message: cited
      ? `Researched the market across ${sources.length} live sources and wrote a cited brief.`
      : `Researched the market across ${sources.length} live sources and wrote a brief (uncited — the sources are attached to check).`,
    grounded: true,
  };
}

// ---------------------------------------------------------------------------
// 2. The business plan — draft → red-team → refine (mirror of produceBusinessPlan)
// ---------------------------------------------------------------------------

export async function produceBusinessPlanSrv(admin: Admin, ownerId: string, worldId: string, charter: Charter): Promise<ProduceResultSrv> {
  const m = await gatherSrv(admin, worldId);
  const { data: clusterRows } = await admin.from('knowledge_clusters').select('id').eq('world_id', worldId);
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  const loadFindings = async (): Promise<string> => {
    if (!clusterIds.length) return '';
    const { data: research } = await admin.from('knowledge_artifacts')
      .select('title, detail').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(4);
    return ((research ?? []) as { title: string; detail: string | null }[])
      .map((r) => `- ${r.title}: ${(r.detail ?? '').replace(/\s+/g, ' ').slice(0, 1200)}`).join('\n');
  };
  let findings = await loadFindings();

  // DEPTH: no research on record → run the real research producer FIRST (same discipline as the
  // client). Only grounded research counts; its artifacts ride along for the caller to persist.
  const autoResearch: PlayArtifact[] = [];
  if (!findings) {
    try {
      const res = await produceResearchSrv(admin, ownerId, worldId, charter);
      if (res.grounded && res.artifacts.length) {
        autoResearch.push(...res.artifacts);
        findings = res.artifacts.map((a) => `- ${a.title}: ${(a.detail ?? '').replace(/\s+/g, ' ').slice(0, 1200)}`).join('\n');
      }
    } catch { /* research unavailable → the plan proceeds honestly ungrounded */ }
  }

  try {
    const planContext = [
      businessContext(m),
      findings ? `RESEARCH ON RECORD (ground the plan in this):\n${findings}` : 'RESEARCH: none on record yet — mark market claims provisional and name the scan that would confirm them.',
      steerBlock(undefined),
    ].filter(Boolean).join('\n\n');
    const draft = await reasonSrv(
      admin, ownerId, 'plan', PLAN_SYSTEM,
      `${planContext}\n\nWrite the full operator plan now, all six == sections ==, each substantive. Plain text.`,
      3200,
    );
    const gate = parsePlan(draft);
    if (gate.ok) {
      // Red-team then refine — an upgrade path, never a gate: unparseable critique ships the draft.
      let text = draft;
      let critique: Critique | null = null;
      let refined = false;
      try {
        const critRaw = await reasonSrv(
          admin, ownerId, 'plan', CRITIQUE_SYSTEM,
          `${[findings ? `RESEARCH PROVIDED TO THE AUTHOR:\n${findings}` : 'RESEARCH PROVIDED: none.', `THE DOCUMENT:\n${draft}`].join('\n\n')}\n\nRed-team this business plan now. Strict JSON.`,
          1400,
        );
        critique = parseCritique(critRaw);
        if (critique && needsRefine(critique)) {
          const revised = await reasonSrv(
            admin, ownerId, 'plan', REFINE_SYSTEM,
            `${[`THE FIXES:\n${refineInstruction(critique)}`, findings ? `RESEARCH (for grounding fixes):\n${findings}` : '', `THE DOCUMENT TO REVISE:\n${draft}`].filter(Boolean).join('\n\n')}\n\nOutput the full revised document now.`,
            3200,
          );
          if (parsePlan(revised).ok) { text = revised; refined = true; }
        }
      } catch { /* depth unavailable → the gated draft ships as-is */ }

      return {
        artifacts: [...autoResearch, {
          slug: 'business-plan', kind: 'doc',
          title: `Business plan — operator's 90-day edition${findings ? '' : ' (market claims provisional)'}`,
          detail: `${text}\n\n— Every [YOU FILL: …] is a number only you can supply; fill them and re-press with a direction to iterate. Grounded in ${findings ? 'your research on record' : 'your business context only — run Research to strengthen it'}. ${depthNote(critique, refined)}`,
        }],
        message: refined
          ? 'Wrote, red-teamed, and refined the operator plan — critique applied, unknowables stay [YOU FILL], never invented.'
          : 'Wrote the full operator plan — six substantive sections, unknowables marked [YOU FILL], never invented.',
        grounded: !!findings,
      };
    }
    return { artifacts: expertiseFloor(charter, m), message: `The generated plan was too thin in: ${gate.thin.join(', ')} — rejected it rather than ship filler. Added the strategy framework; press again (a direction helps).`, grounded: false };
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the strategy framework (AI unavailable — press again for the full plan).', grounded: false };
}

// ---------------------------------------------------------------------------
// 3. The campaign compiler — 3 chained stages (mirror of marketingRun.generateCampaign)
// ---------------------------------------------------------------------------

const DEFAULT_CHANNEL: Record<string, string | null> = {
  strategy: null, calendar: null, social_post: 'x', email: 'email', landing_page: 'manual',
};

export interface CampaignResultSrv { campaignId: string; summary: string; assetCount: number }

export async function produceCampaignSrv(
  admin: Admin, ownerId: string,
  input: { subject: string; brief?: string | null; research?: string | null },
): Promise<CampaignResultSrv> {
  const { data: created, error } = await admin.from('marketing_campaigns')
    .insert({ owner_id: ownerId, app_id: null, subject: input.subject, brief: input.brief ?? null, status: 'generating' })
    .select().single();
  if (error || !created) throw new Error(error?.message ?? 'Could not open the campaign.');
  const campaignId = (created as { id: string }).id;
  let assetCount = 0;

  const insertAsset = async (kind: string, title: string, content: Record<string, unknown>) => {
    await admin.from('marketing_assets').insert({
      owner_id: ownerId, campaign_id: campaignId, kind, title, content,
      channel: DEFAULT_CHANNEL[kind] ?? null, status: 'draft', verify: verifyAsset(kind as Parameters<typeof verifyAsset>[0], content),
    });
    assetCount++;
  };
  const stage = (system: string, user: string, maxOut: number) =>
    reasonSrv(admin, ownerId, 'plan', system, user, maxOut);

  try {
    // Research rides in through the profile context block — grounded findings shape the strategy.
    const research = (input.research ?? '').trim();
    const profile = research
      ? `RESEARCH ON RECORD (ground the strategy in this — never contradict it):\n${research.slice(0, 5000)}`
      : null;

    const r1 = await stage(STRATEGY_SYSTEM, buildStrategyUser(input.subject, input.brief ?? null, profile), 1600);
    const strat = parseStrategy(r1);
    if (!strat) throw new Error('The strategy stage returned nothing usable.');
    const strategyJson = JSON.stringify(strat);
    await insertAsset('strategy', 'Strategy', { ...strat.strategy });
    await insertAsset('calendar', '2-week content calendar', { entries: strat.calendar });
    await admin.from('marketing_campaigns').update({ summary: strat.summary }).eq('id', campaignId);

    const r2 = await stage(POSTS_SYSTEM, buildPostsUser(strategyJson, 5), 1800);
    const posts = parsePosts(r2);
    for (let i = 0; i < posts.length; i++) await insertAsset('social_post', `${posts[i].platform} post ${i + 1}`, { ...posts[i] });

    const r3 = await stage(ASSETS_SYSTEM, buildAssetsUser(strategyJson), 2000);
    const built = parseAssets(r3);
    if (built) {
      await insertAsset('email', 'Launch email', { ...built.email });
      await insertAsset('landing_page', 'Landing page copy', { ...built.landing });
    }

    await admin.from('marketing_campaigns').update({ status: 'review' }).eq('id', campaignId);
    return { campaignId, summary: strat.summary, assetCount };
  } catch (e) {
    await admin.from('marketing_campaigns').update({ status: 'failed' }).eq('id', campaignId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Persistence — mirror of workwebRun's writeArtifacts + versionCreativeSlugs
// ---------------------------------------------------------------------------

export const SEED_SOURCE = 'garvis-seed';

/** Grounded work gets a VERSIONED slug (a re-run ADDS a take); framework floors keep their fixed
 *  slugs (a playbook refresh replaces itself). Same anchored match as the client. */
async function versionCreativeSlugsSrv(admin: Admin, clusterId: string, artifacts: PlayArtifact[]): Promise<PlayArtifact[]> {
  const out: PlayArtifact[] = [];
  for (const a of artifacts) {
    try {
      const { data } = await admin.from('knowledge_artifacts')
        .select('slug').eq('cluster_id', clusterId)
        .or(`slug.eq.${a.slug},slug.like.${a.slug}-v%`).limit(50);
      const existing = ((data ?? []) as { slug: string }[]).map((r) => r.slug);
      if (!existing.length) { out.push(a); continue; }
      let n = existing.length + 1;
      while (existing.includes(n === 1 ? a.slug : `${a.slug}-v${n}`)) n++;
      out.push({ ...a, slug: `${a.slug}-v${n}`, title: `${a.title} · take ${n}` });
    } catch { out.push(a); }
  }
  return out;
}

/** Upsert a producer's artifacts onto the area. Grounded work is EARNED activity (source
 *  'garvis'); a framework floor is context, tagged seed so it never inflates momentum. */
export async function persistProducedSrv(admin: Admin, ownerId: string, clusterId: string, r: ProduceResultSrv): Promise<number> {
  if (!r.artifacts.length) return 0;
  const arts = r.grounded ? await versionCreativeSlugsSrv(admin, clusterId, r.artifacts) : r.artifacts;
  const rows = arts.map((a) => ({
    owner_id: ownerId, cluster_id: clusterId, slug: a.slug,
    kind: a.kind, title: a.title, detail: a.detail, source: r.grounded ? 'garvis' : SEED_SOURCE,
  }));
  const { error } = await admin.from('knowledge_artifacts').upsert(rows, { onConflict: 'cluster_id,slug' });
  return error ? 0 : rows.length;
}
