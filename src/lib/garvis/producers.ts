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
import type { PlayArtifact } from './plays';
import type { Charter } from './workweb';
import {
  RESEARCH_SYSTEM, SOCIAL_SYSTEM, VIDEO_SYSTEM, ANGLE_SYSTEM, ADS_SYSTEM,
  researchQueries, formatSources, appendSources, parseSocialPosts, postToDetail, researchContext,
  parseAdAssets, isLaunchReady, metaAdDetail, googleAdDetail,
  type ResearchSource,
} from './producersCore';

export interface ProduceResult { artifacts: PlayArtifact[]; message: string; grounded: boolean }

interface WorldMaterials {
  dna: WorldDNA | null;
  ctx: BusinessContext | null;
  brandTone: string | null;
  photos: { name: string; caption: string | null }[];
}

/** Gather everything a producer reasons over — the world's real identity, voice, and photos. */
async function gather(worldId: string): Promise<WorldMaterials> {
  const [{ data: world }, brand, { data: files }] = await Promise.all([
    supabase.from('knowledge_worlds').select('dna, business_context').eq('id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('name, caption, kind, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(24),
  ]);
  return {
    dna: (world?.dna as WorldDNA | null) ?? null,
    ctx: (world?.business_context as BusinessContext | null) ?? null,
    brandTone: brand?.tone ?? null,
    photos: ((files ?? []) as { name: string; caption: string | null }[]).map((f) => ({ name: f.name, caption: f.caption })),
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

  // Synthesize a cited brief grounded ONLY in the snippets.
  let brief: string;
  try {
    brief = await reason(
      RESEARCH_SYSTEM,
      `${businessContext(m)}\n\nSEARCH RESULTS:\n${formatSources(sources.slice(0, 10))}`,
      'Write the market brief now, grounded only in these results. Cite with [n]. Plain text.',
      1400,
    );
    if (brief.length < 120) throw new Error('thin');
  } catch {
    brief = `MARKET BRIEF (sources found; synthesis unavailable — read the sources directly).`;
  }
  const detail = appendSources(brief, sources.slice(0, 10));
  return {
    artifacts: [{ slug: 'market-research-brief', kind: 'research', title: 'Market research — live, with sources', detail }],
    message: `Researched the market across ${sources.length} live sources and wrote a cited brief.`,
    grounded: true,
  };
}

// ---------------------------------------------------------------------------
// 2. Social — finished, postable content tied to real photos
// ---------------------------------------------------------------------------

export async function produceSocial(worldId: string, charter: Charter): Promise<ProduceResult> {
  const m = await gather(worldId);
  const photoLines = m.photos.length
    ? m.photos.map((p) => `- ${p.caption?.trim() || p.name}`).join('\n')
    : '(no photos uploaded yet — direct a shot for each post)';
  try {
    const text = await reason(
      SOCIAL_SYSTEM,
      `${businessContext(m)}\n\nREAL PHOTOS (use these, by caption):\n${photoLines}`,
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

export async function produceVideo(worldId: string, charter: Charter): Promise<ProduceResult> {
  const m = await gather(worldId);
  const photoLines = m.photos.length ? m.photos.map((p) => `- ${p.caption?.trim() || p.name}`).join('\n') : '(no photos yet)';
  try {
    const script = await reason(
      VIDEO_SYSTEM,
      `${businessContext(m)}\n\nREAL PHOTOS:\n${photoLines}`,
      'Write the shot-by-shot script now. Plain text.',
      1200,
    );
    if (script.length > 120) {
      return {
        artifacts: [{ slug: 'video-script-30s', kind: 'video', title: 'Video script — shot by shot', detail: script }],
        message: 'Wrote a shot-by-shot video script in this world\'s voice.',
        grounded: true,
      };
    }
  } catch { /* fall to the floor */ }
  return { artifacts: expertiseFloor(charter, m), message: 'Added the video formats guide (AI unavailable — press again for a full script).', grounded: false };
}

// ---------------------------------------------------------------------------
// 4. Angle — grounded in the world's own research
// ---------------------------------------------------------------------------

export async function produceAngle(worldId: string, charter: Charter): Promise<ProduceResult> {
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
    const angle = await reason(
      ANGLE_SYSTEM,
      `${businessContext(m)}\n\n${researchContext(findings)}`,
      'Synthesize the one campaign angle now. Plain text.',
      900,
    );
    if (angle.length > 100) {
      return {
        artifacts: [{ slug: 'campaign-angle', kind: 'research', title: findings.length ? 'Campaign angle — grounded in your research' : 'Campaign angle (provisional)', detail: angle }],
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

export async function produceAds(worldId: string, charter: Charter): Promise<ProduceResult> {
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
export function producerFor(toolId: string): ((worldId: string, charter: Charter) => Promise<ProduceResult>) | null {
  switch (toolId) {
    case 'research': return produceResearch;
    case 'gen-social': return produceSocial;
    case 'gen-video-script': return produceVideo;
    case 'gen-angle': return produceAngle;
    case 'gen-ads': return produceAds;
    default: return null;
  }
}
