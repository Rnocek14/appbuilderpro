// src/lib/garvis/producers.ts
// The PRODUCERS — impure half (Supabase + AI). These are what make a studio tool press produce
// FINISHED work instead of a framework: a research brief grounded in real web results with cited
// sources, social posts ready to paste (tied to the world's own photos), a shot-by-shot video
// script, a campaign angle grounded in the world's own research. Each gathers the world's REAL
// materials (DNA, brand voice, vault photos, prior research), reasons over them through the
// existing cluster-chat/discover-media rails, and writes finished artifacts. Fail-soft: when the
// model or search is unavailable, a substantive deterministic version stands — never a stub.

import { supabase } from '../supabase';
import { exploreComplete } from './explorerAI';
import { getBrandKit } from './artifacts';
import { parseSerperOrganic } from './marketIntel';
import { mergeTokens, type WorldDNA, type BusinessContext } from './genesis';
import { expertiseFor, detectVertical } from './expertise';
import { goalLineForWorld } from './goalsRun';
import type { PlayArtifact } from './plays';
import type { Charter } from './workweb';
import {
  RESEARCH_SYSTEM, SOCIAL_SYSTEM, VIDEO_SYSTEM, ANGLE_SYSTEM, ADS_SYSTEM,
  researchQueries, formatSources, appendSources, parseSocialPosts, postToDetail, researchContext,
  parseAdAssets, isLaunchReady, metaAdDetail, googleAdDetail,
  steerBlock, IDEAS_SYSTEM, parseIdeas, ideasToDetail, PLAN_SYSTEM, parsePlan, SPEC_SYSTEM, parseSpec,
  type ResearchSource,
} from './producersCore';

export interface ProduceResult { artifacts: PlayArtifact[]; message: string; grounded: boolean }

/** Creative steering: the owner's direction in their own words, plus prior concepts to diverge
 *  from. When `avoid` is not supplied, producers LOAD IT THEMSELVES from the world's recent
 *  artifacts — so every re-press explores new ground by default instead of re-treading. */
export interface ProduceOpts { direction?: string; avoid?: string[] }

/** Recent creative concepts of the given kinds (titles + a first line), seeds excluded — the
 *  "do not repeat" fuel. Fail-soft: [] on any error. */
async function priorCreative(worldId: string, kinds: string[], limit = 6): Promise<string[]> {
  try {
    const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
    const ids = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
    if (!ids.length) return [];
    const { data } = await supabase.from('knowledge_artifacts')
      .select('title, detail').in('cluster_id', ids).in('kind', kinds)
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as { title: string; detail: string | null }[])
      .map((a) => `${a.title}: ${(a.detail ?? '').replace(/\s+/g, ' ').slice(0, 80)}`);
  } catch { return []; }
}

/** Resolve the steering block for a producer: owner direction + (auto-loaded) prior work. */
async function steer(worldId: string, kinds: string[], opts?: ProduceOpts): Promise<string> {
  const avoid = opts?.avoid ?? await priorCreative(worldId, kinds);
  return steerBlock(opts?.direction, avoid);
}

interface WorldMaterials {
  dna: WorldDNA | null;
  ctx: BusinessContext | null;
  brandTone: string | null;
  photos: { name: string; caption: string | null }[];
  /** The owner's active goal for this world ('' when none) — every producer aims at it. */
  goal: string;
}

/** Gather everything a producer reasons over — the world's real identity, voice, photos, and the
 *  owner's GOAL for it (goalsRun, fail-soft) so produced work aims at what the project is FOR. */
async function gather(worldId: string): Promise<WorldMaterials> {
  const [{ data: world }, brand, { data: files }, goal] = await Promise.all([
    supabase.from('knowledge_worlds').select('dna, business_context').eq('id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('name, caption, kind, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(24),
    goalLineForWorld(worldId),
  ]);
  return {
    dna: (world?.dna as WorldDNA | null) ?? null,
    ctx: (world?.business_context as BusinessContext | null) ?? null,
    brandTone: brand?.tone ?? null,
    photos: ((files ?? []) as { name: string; caption: string | null }[]).map((f) => ({ name: f.name, caption: f.caption })),
    goal,
  };
}

// Free-form generation goes through exploreComplete (the metered plain-completion seam), NOT
// cluster-chat — cluster-chat appends a "return one decision JSON" instruction to every call, which
// would corrupt a market brief or a set of posts. This is the same seam runPlayData enrich uses.
async function reason(system: string, context: string, message: string, maxOut = 1200): Promise<string> {
  const r = await exploreComplete(
    [{ role: 'system', content: system }, { role: 'user', content: `${context}\n\n${message}` }],
    maxOut,
  );
  return r.text.trim();
}

/** The business block every producer prompt shares. */
function businessContext(m: WorldMaterials): string {
  const c = m.ctx;
  const lines = [
    c?.business_name && `Business: ${c.business_name}`,
    c?.craft && `Does: ${c.craft}`,
    c?.offerings?.length && `Offerings: ${c.offerings.join(', ')}`,
    c?.audience && `Audience: ${c.audience}`,
    c?.locale && `Locale: ${c.locale}`,
    (m.brandTone ?? c?.tone) && `Voice: ${m.brandTone ?? c?.tone}`,
    m.dna?.valueProposition && `Value: ${m.dna.valueProposition}`,
    m.goal, // the owner's goal line (already labeled owner-stated; '' when none)
  ].filter(Boolean);
  return lines.join('\n');
}

/** The deterministic floor for a producer: the area's expert pack, token-merged — real structure,
 *  never a stub. Used when search/AI is unavailable so a press still lands substantive work. */
function expertiseFloor(charter: Charter, m: WorldMaterials): PlayArtifact[] {
  const vertical = detectVertical([
    m.dna?.businessType, m.dna?.valueProposition, ...(m.dna?.idealCustomers ?? []),
    m.ctx?.craft, m.ctx?.audience, ...(m.ctx?.offerings ?? []),
  ].filter(Boolean).join(' '));
  const ctx = m.ctx ?? { business_name: '', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null };
  return expertiseFor(charter.archetype, charter.flavor, vertical)
    .map((s) => ({ slug: s.slug, kind: s.kind, title: s.title, detail: mergeTokens(s.detail, ctx) }));
}

// ---------------------------------------------------------------------------
// 1. Research — real web research, cited
// ---------------------------------------------------------------------------

export async function produceResearch(worldId: string, charter: Charter): Promise<ProduceResult> {
  const m = await gather(worldId);
  const queries = researchQueries(m.dna, m.ctx);
  if (!queries.length) {
    return { artifacts: expertiseFloor(charter, m), message: 'This world has no DNA yet — added the research framework to fill.', grounded: false };
  }

  // Real search across the existing metered Serper rail (read-only).
  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  let searchWorked = false;
  for (const q of queries.slice(0, 3)) {
    try {
      const { data, error } = await supabase.functions.invoke('discover-media', { body: { provider: 'serper', path: 'search', q } });
      if (error) continue;
      const payload = data as { available?: boolean; data?: unknown };
      if (!payload?.available) break;               // Serper not configured — fall to the floor
      searchWorked = true;
      for (const c of parseSerperOrganic(payload.data, 6)) {
        const key = c.url ?? c.name.toLowerCase();
        if (c.url && !seen.has(key)) { seen.add(key); sources.push({ title: c.name, url: c.url, snippet: c.snippet }); }
      }
    } catch { /* try the next query */ }
  }

  if (!sources.length) {
    const floor = expertiseFloor(charter, m);
    return {
      artifacts: floor,
      message: searchWorked ? 'Search returned nothing usable — added the research framework instead.' : 'Web search isn\'t configured — added the research framework. Add SERPER_API_KEY for live research.',
      grounded: false,
    };
  }

  // Synthesize a brief grounded ONLY in the snippets. The LABEL must match what actually happened
  // (deep scan theme 6): "cited brief / grounded" only when synthesis succeeded AND the text
  // actually carries [n] citations — never on the stub-failure path, which used to still claim it.
  let brief = '';
  let synthesized = false;
  try {
    brief = await reason(
      RESEARCH_SYSTEM,
      `${businessContext(m)}\n\nSEARCH RESULTS:\n${formatSources(sources.slice(0, 10))}`,
      'Write the market brief now, grounded only in these results. Cite with [n]. Plain text.',
      1400,
    );
    synthesized = brief.trim().length >= 120;
  } catch { synthesized = false; }

  if (!synthesized) {
    // The sources are real, but there is no written brief — say exactly that, and don't count this
    // as grounded research on record (so downstream "grounded in your research" claims stay honest).
    const detail = appendSources('Live sources were found, but the written synthesis was unavailable — read them directly below.', sources.slice(0, 10));
    return {
      artifacts: [{ slug: 'market-research-brief', kind: 'research', title: `Market research — ${sources.length} sources found`, detail }],
      message: `Found ${sources.length} live sources; the written synthesis was unavailable, so the sources are attached to read directly.`,
      grounded: false,
    };
  }

  const cited = /\[\d+\]/.test(brief); // a genuinely cited brief carries [n] markers
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
// 2. Social — finished, postable content tied to real photos
// ---------------------------------------------------------------------------

export async function produceSocial(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  const photoLines = m.photos.length
    ? m.photos.map((p) => `- ${p.caption?.trim() || p.name}`).join('\n')
    : '(no photos uploaded yet — direct a shot for each post)';
  const steering = await steer(worldId, ['post'], opts);
  try {
    const text = await reason(
      SOCIAL_SYSTEM,
      [`${businessContext(m)}\n\nREAL PHOTOS (use these, by caption):\n${photoLines}`, steering].filter(Boolean).join('\n\n'),
      'Write the five finished posts now, in the POST block format. Nothing else.',
      1600,
    );
    const posts = parseSocialPosts(text);
    if (posts.length >= 2) {
      return {
        artifacts: posts.map((p, i) => ({
          slug: `social-post-${i + 1}`, kind: 'post' as const,
          title: `Post ${i + 1} — ${p.caption.split('\n')[0].slice(0, 40)}`,
          detail: postToDetail(p),
        })),
        message: `Wrote ${posts.length} finished, ready-to-post captions in this world's voice.`,
        grounded: true,
      };
    }
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the social playbook (AI unavailable — the plan stands; press again for finished posts).', grounded: false };
}

// ---------------------------------------------------------------------------
// 3. Video — a shot-by-shot script
// ---------------------------------------------------------------------------

export async function produceVideo(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  const photoLines = m.photos.length ? m.photos.map((p) => `- ${p.caption?.trim() || p.name}`).join('\n') : '(no photos yet)';
  const steering = await steer(worldId, ['video'], opts);
  try {
    const script = await reason(
      VIDEO_SYSTEM,
      [`${businessContext(m)}\n\nREAL PHOTOS:\n${photoLines}`, steering].filter(Boolean).join('\n\n'),
      'Write the shot-by-shot script now. Plain text.',
      1200,
    );
    if (script.length > 120) {
      return {
        artifacts: [{ slug: 'video-script-30s', kind: 'video', title: 'Video script — shot by shot', detail: `${script}\n\n— Turn this into a real video in the Video studio below: it builds a timed, captioned storyboard from your photos, plays it in the browser, and renders an mp4.` }],
        message: 'Wrote a shot-by-shot video script — build it into a real video in the Video studio below.',
        grounded: true,
      };
    }
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the video formats guide (AI unavailable — press again for a full script).', grounded: false };
}

// ---------------------------------------------------------------------------
// 4. Angle — grounded in the world's own research
// ---------------------------------------------------------------------------

export async function produceAngle(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  // Read the world's REAL research findings (earned research artifacts, seeds excluded).
  const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  const findings: { title: string; detail: string }[] = [];
  if (clusterIds.length) {
    const { data: research } = await supabase.from('knowledge_artifacts')
      .select('title, detail, source').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(4);
    for (const r of (research ?? []) as { title: string; detail: string | null }[]) {
      findings.push({ title: r.title, detail: r.detail ?? '' });
    }
  }
  try {
    const steering = await steer(worldId, ['research'], opts);
    const angle = await reason(
      ANGLE_SYSTEM,
      [`${businessContext(m)}\n\n${researchContext(findings)}`, steering].filter(Boolean).join('\n\n'),
      'Synthesize the one campaign angle now. Plain text.',
      900,
    );
    if (angle.length > 100) {
      // PROVENANCE (design review P2): name the exact findings this synthesis stood on — the
      // chain existed at generation time and was being discarded. Citations are cheap here and
      // impossible to reconstruct later.
      const sources = findings.length
        ? `\n\n— Sources: ${findings.map((f) => `“${f.title.replace(/\s+/g, ' ').slice(0, 70)}”`).join(' · ')}`
        : '';
      return {
        artifacts: [{ slug: 'campaign-angle', kind: 'research', title: findings.length ? 'Campaign angle — grounded in your research' : 'Campaign angle (provisional)', detail: `${angle}${sources}` }],
        message: findings.length ? 'Synthesized a campaign angle grounded in your research.' : 'Synthesized a provisional angle — run research to confirm it.',
        grounded: findings.length > 0,
      };
    }
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the strategy framework (AI unavailable).', grounded: false };
}

// ---------------------------------------------------------------------------
// 5. Ads — launch-ready Meta + Google assets at real platform limits
// ---------------------------------------------------------------------------

/** The special-category warnings that MUST ride with regulated industries' ads. */
function adComplianceNote(vertical: string): string | null {
  switch (vertical) {
    case 'real_estate': return 'HOUSING is a Special Ad Category — declare it (Meta) / follow housing policy (Google). Targeting restrictions apply; describe the property, never the buyer.';
    case 'finance': return 'CREDIT/FINANCIAL PRODUCTS are restricted categories — declare/verify before running. No promised returns; adviser ads fall under the SEC Marketing Rule.';
    case 'health': return 'No personal-attribute targeting or copy (Meta policy); health claims need substantiation; keep health details out of the lead form.';
    default: return null;
  }
}

export async function produceAds(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  const vertical = detectVertical([
    m.dna?.businessType, m.dna?.valueProposition, ...(m.dna?.idealCustomers ?? []),
    m.ctx?.craft, m.ctx?.audience, ...(m.ctx?.offerings ?? []),
  ].filter(Boolean).join(' '));
  const compliance = adComplianceNote(vertical);
  const landing = Object.values(m.ctx?.links ?? {}).find((v) => typeof v === 'string' && v.trim())?.trim() ?? null;

  // Ground the copy in the world's own research when it exists (earned only).
  const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  let findings = '';
  if (clusterIds.length) {
    const { data: research } = await supabase.from('knowledge_artifacts')
      .select('title, detail').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(3);
    findings = ((research ?? []) as { title: string; detail: string | null }[])
      .map((r) => `- ${r.title}: ${(r.detail ?? '').replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');
  }

  try {
    const text = await reason(
      ADS_SYSTEM,
      [
        businessContext(m),
        m.photos.length ? `REAL PHOTOS: ${m.photos.slice(0, 8).map((p) => p.caption || p.name).join(' | ')}` : '',
        findings ? `RESEARCH FINDINGS:\n${findings}` : '',
        compliance ? `COMPLIANCE (follow exactly): ${compliance}` : '',
        await steer(worldId, ['post'], opts),
      ].filter(Boolean).join('\n\n'),
      'Write the ad assets now, in the labeled sections. Nothing else.',
      1800,
    );
    const assets = parseAdAssets(text);
    if (isLaunchReady(assets)) {
      return {
        artifacts: [
          { slug: 'meta-ad-campaign', kind: 'post', title: 'Meta ads — launch-ready', detail: metaAdDetail(assets, landing, compliance) },
          { slug: 'google-ad-campaign', kind: 'post', title: 'Google ads — launch-ready RSA', detail: googleAdDetail(assets, landing, compliance) },
        ],
        message: `Wrote launch-ready Meta + Google assets (${assets.googleHeadlines.length} headlines, ${assets.keywords.length} keywords) — paste into Ads Manager, log spend in the ledger.`,
        grounded: true,
      };
    }
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the paid-ads playbook (AI unavailable — press again for launch-ready assets).', grounded: false };
}

/** The producer router: which finished-work producer (if any) handles a tool id. */
// ---------------------------------------------------------------------------
// 6. Ideas — a validated batch of DISTINCT campaign ideas, each with its first step
// ---------------------------------------------------------------------------

/** What this studio's ideas should be: mailer concepts in the mail studio, post concepts in the
 *  social studio, and so on — the same engine, flavored by the charter. */
function ideaFraming(charter: Charter): string {
  switch (charter.flavor) {
    case 'direct_mail': return 'DIRECT-MAIL POSTCARD concepts — each idea is a mailable concept: the headline on the card, the offer, and who it goes to.';
    case 'social': return 'SOCIAL CONTENT concepts — each idea is a repeatable post format or mini-series, not a single caption.';
    case 'video': return 'SHORT-VIDEO concepts — each idea is a filmable format using the business\'s real photos/settings.';
    case 'ads': return 'PAID-AD concepts — each idea is a campaign concept: the hook, the audience entry point, the landing promise.';
    case 'feature_lab': return 'PLATFORM FEATURE concepts — each idea is a buildable feature for THIS platform: the user problem it solves, the core interaction in one line, and why this platform specifically wins by having it. Range across power-user tools, onboarding, retention, and integrations — never five variants of one feature.';
    default: return 'MARKETING CAMPAIGN concepts across any channel this business could realistically run.';
  }
}

export async function produceIdeas(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  const steering = await steer(worldId, ['post', 'research', 'video', 'doc'], opts);
  try {
    const text = await reason(
      IDEAS_SYSTEM,
      [businessContext(m), `WHAT TO GENERATE: ${ideaFraming(charter)}`, steering].filter(Boolean).join('\n\n'),
      'Generate 10 distinct ideas now, in the IDEA block format. Nothing else.',
      2000,
    );
    const ideas = parseIdeas(text);
    if (ideas.length >= 5) {
      return {
        artifacts: [{
          slug: 'idea-board', kind: 'doc',
          title: `Idea board — ${ideas.length} ${charter.flavor === 'direct_mail' ? 'mailer' : charter.flavor ?? 'campaign'} concepts${opts?.direction ? ` (direction: ${opts.direction.slice(0, 40)})` : ''}`,
          detail: ideasToDetail(ideas, charter.flavor ?? 'campaign'),
        }],
        message: `Generated ${ideas.length} distinct ideas (diversity-gated — near-duplicates collapsed). Pick one and press the generator with its title as the direction.`,
        grounded: true,
      };
    }
  } catch { /* fall to the floor */ }
  // Deterministic floor: the area's expert pack as idea seeds — structure, honestly labeled
  // (feature labs get the feature-ideation frame, never a marketing playbook).
  return {
    artifacts: expertiseFloor(charter, m),
    message: charter.flavor === 'feature_lab'
      ? 'Added the feature-ideation frame (AI unavailable — press again for generated concepts).'
      : 'Added the channel playbook as idea seeds (AI unavailable — press again for a generated board).',
    grounded: false,
  };
}

// ---------------------------------------------------------------------------
// 7. The business plan — an operator's plan with a substance gate (never thin)
// ---------------------------------------------------------------------------

/** FEATURE SPEC (feature_lab studios): "create features for the platform" ends in a document an
 *  engineer could pick up — grounded in the world's earned research, unknowables as [YOU FILL]
 *  holes, thin sections rejected BY NAME. Steer it with a direction (usually a concept from
 *  gen-features) to spec that specific feature. */
export async function produceFeatureSpec(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  let findings = '';
  let findingTitles: string[] = [];
  if (clusterIds.length) {
    const { data: research } = await supabase.from('knowledge_artifacts')
      .select('title, detail').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(3);
    const rows = (research ?? []) as { title: string; detail: string | null }[];
    findings = rows.map((r) => `- ${r.title}: ${(r.detail ?? '').replace(/\s+/g, ' ').slice(0, 250)}`).join('\n');
    findingTitles = rows.map((r) => r.title.replace(/\s+/g, ' ').slice(0, 70));
  }
  const direction = opts?.direction?.trim();
  try {
    const text = await reason(
      SPEC_SYSTEM,
      [
        businessContext(m),
        findings ? `RESEARCH ON RECORD (ground the spec in this):\n${findings}` : 'RESEARCH: none on record yet — mark user/market claims provisional and name what research would confirm them.',
        steerBlock(direction),
      ].filter(Boolean).join('\n\n'),
      `Write the full feature spec now${direction ? ` for: "${direction.slice(0, 160)}"` : ' for the strongest candidate feature from the context'} — all six == sections ==, each substantive. Plain text.`,
      3000,
    );
    const gate = parseSpec(text);
    if (gate.ok) {
      // PROVENANCE (design review P2): the spec names the findings it stood on, in the artifact.
      const sources = findingTitles.length ? `\n— Sources: ${findingTitles.map((t) => `“${t}”`).join(' · ')}` : '';
      return {
        artifacts: [{
          slug: direction ? `feature-spec-${direction.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}` : 'feature-spec', kind: 'doc',
          title: `Feature spec — ${direction ? direction.slice(0, 60) : 'strongest candidate'}${findings ? '' : ' (user claims provisional)'}`,
          detail: `${text}\n\n— Every [YOU FILL: …] is a fact only someone inside the platform can supply. Steer with a different concept (from the feature ideas) to spec another one; prior specs are never overwritten.${sources}`,
        }],
        message: `Wrote the full feature spec${direction ? ` for "${direction.slice(0, 60)}"` : ''} — six substantive sections, internals marked [YOU FILL], never invented.`,
        grounded: !!findings,
      };
    }
    // ANTI-THIN GATE: a spec with hollow sections is rejected by name, never shipped as "done".
    return { artifacts: [], message: `The generated spec was too thin in: ${gate.thin.join(', ')} — rejected it rather than ship filler. Press again (steering with one concrete feature concept helps).`, grounded: false };
  } catch { /* fall through */ }
  return { artifacts: [], message: 'The spec generator is unavailable right now — press again, or run Research first so the spec has ground to stand on.', grounded: false };
}

export async function produceBusinessPlan(worldId: string, charter: Charter, opts?: ProduceOpts): Promise<ProduceResult> {
  const m = await gather(worldId);
  // Ground in the world's EARNED research when it exists (same discipline as the angle producer).
  const { data: clusterRows } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  let findings = '';
  if (clusterIds.length) {
    const { data: research } = await supabase.from('knowledge_artifacts')
      .select('title, detail').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(3);
    findings = ((research ?? []) as { title: string; detail: string | null }[])
      .map((r) => `- ${r.title}: ${(r.detail ?? '').replace(/\s+/g, ' ').slice(0, 250)}`).join('\n');
  }
  try {
    const text = await reason(
      PLAN_SYSTEM,
      [
        businessContext(m),
        findings ? `RESEARCH ON RECORD (ground the plan in this):\n${findings}` : 'RESEARCH: none on record yet — mark market claims provisional and name the scan that would confirm them.',
        steerBlock(opts?.direction),
      ].filter(Boolean).join('\n\n'),
      'Write the full operator plan now, all six == sections ==, each substantive. Plain text.',
      3200,
    );
    const gate = parsePlan(text);
    if (gate.ok) {
      return {
        artifacts: [{
          slug: 'business-plan', kind: 'doc',
          title: `Business plan — operator's 90-day edition${findings ? '' : ' (market claims provisional)'}`,
          detail: `${text}\n\n— Every [YOU FILL: …] is a number only you can supply; fill them and re-press with a direction to iterate. Grounded in ${findings ? 'your research on record' : 'your business context only — run Research to strengthen it'}.`,
        }],
        message: 'Wrote the full operator plan — six substantive sections, unknowables marked [YOU FILL], never invented.',
        grounded: !!findings,
      };
    }
    // ANTI-THIN GATE: a plan with hollow sections is rejected by name, never shipped as "done".
    return { artifacts: expertiseFloor(charter, m), message: `The generated plan was too thin in: ${gate.thin.join(', ')} — rejected it rather than ship filler. Added the strategy framework; press again (a direction helps).`, grounded: false };
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the strategy framework (AI unavailable — press again for the full plan).', grounded: false };
}

export function producerFor(toolId: string): ((worldId: string, charter: Charter, opts?: ProduceOpts) => Promise<ProduceResult>) | null {
  switch (toolId) {
    case 'research': return produceResearch;
    case 'gen-social': return produceSocial;
    case 'gen-video-script': return produceVideo;
    case 'gen-angle': return produceAngle;
    case 'gen-ads': return produceAds;
    case 'gen-ideas': return produceIdeas;
    case 'gen-plan': return produceBusinessPlan;
    case 'gen-features': return produceIdeas;      // same engine — the feature_lab charter frames it
    case 'gen-spec': return produceFeatureSpec;
    default: return null;
  }
}
