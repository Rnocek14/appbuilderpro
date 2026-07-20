// src/lib/garvis/studioChat.ts
// Impure dispatcher for the Cluster Studio chat: compile context (pure) → call the cluster-chat edge
// fn → parse the decision (pure) → EXECUTE it through owner-scoped paths → persist the transcript.
// The chat can only ever reply, create an artifact, or revise one (new version). Consequential
// actions use dedicated controls that can construct and validate a real executable payload.

import { supabase } from '../supabase';
import { createArtifact, reviseArtifact, listClusterArtifacts, listClusterFiles, getBrandKit, listStudioMessages, saveStudioMessage } from './artifacts';
import {
  STUDIO_SYSTEM, compileStudioContext, parseStudioDecision,
  type StudioContextInput, type StudioBusinessCtx, type StudioDecision, type StudioTurn,
} from './clusterChat';
import type { Charter, WorkTool } from './workweb';
import type { BusinessContext, WorldDNA } from './genesis';
import { beliefEvidence } from './mind';

/**
 * Assemble the full studio context for a cluster: static bits from the loaded web + async loads of
 * files, brand kit, artifacts (fresh, with revisions), and audience stats. One call the UI can await.
 */
export async function loadStudioContext(input: {
  worldId: string;
  webTitle: string;
  objective?: string | null;
  cluster: { title: string; summary: string; charter: Charter };
  clusterId: string;
  tools: WorkTool[];
  results?: { sent: number; replies: number; pendingApprovals: number } | null;
}): Promise<StudioContextInput> {
  const [arts, files, brandKit, worldRow, intelRow, beliefRows] = await Promise.all([
    listClusterArtifacts(input.clusterId).catch(() => []),
    listClusterFiles(input.clusterId).catch(() => []),
    getBrandKit(input.worldId).catch(() => null),
    // THE WORLD's identity — without this the studio was writing for "a business" instead of
    // THIS business (the audit's biggest gap: DNA/context existed but never reached the chat).
    (async () => {
      try { return (await supabase.from('knowledge_worlds').select('business_context, dna').eq('id', input.worldId).maybeSingle()).data; }
      catch { return null; }
    })(),
    (async () => {
      try { return (await supabase.from('world_intelligence').select('open_questions').eq('world_id', input.worldId).maybeSingle()).data; }
      catch { return null; }
    })(),
    // CIRCULATION (design review P2): the Mind's active beliefs were write-only — maintained with
    // counted evidence, read by nobody who drafts. The strongest few now ground every studio turn,
    // labeled with their evidence verdict so the model weighs, not obeys.
    (async () => {
      try {
        return (await supabase.from('mind_beliefs')
          .select('statement, supporting_event_ids, contradicting_event_ids')
          .eq('status', 'active').order('updated_at', { ascending: false }).limit(8)).data;
      } catch { return null; }
    })(),
  ]);
  const bc = (worldRow as { business_context?: BusinessContext | null } | null)?.business_context ?? null;
  const dna = (worldRow as { dna?: WorldDNA | null } | null)?.dna ?? null;
  const business: StudioBusinessCtx | null = bc
    ? {
        name: bc.business_name, principal: bc.principal, craft: bc.craft,
        offerings: bc.offerings, audience: bc.audience, locale: bc.locale, tone: bc.tone,
        dnaLines: dna
          ? [
              dna.valueProposition && `value: ${dna.valueProposition}`,
              dna.revenueModel && `model: ${dna.revenueModel}`,
              dna.idealCustomers.length ? `ideal customers: ${dna.idealCustomers.slice(0, 4).join('; ')}` : null,
              dna.constraints.length ? `constraints: ${dna.constraints.slice(0, 3).join('; ')}` : null,
            ].filter((l): l is string => !!l)
          : [],
      }
    : null;
  const openQuestions = ((intelRow as { open_questions?: string[] } | null)?.open_questions ?? []).filter((q) => typeof q === 'string');
  // Audience stats are web-wide (contacts aren't per-cluster yet); count owner lists + contacts.
  let audience: { lists: number; contacts: number } | null = null;
  try {
    const [{ count: lists }, { count: contacts }] = await Promise.all([
      supabase.from('mailing_lists').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
    ]);
    if ((lists ?? 0) > 0 || (contacts ?? 0) > 0) audience = { lists: lists ?? 0, contacts: contacts ?? 0 };
  } catch { /* mailing_lists may not exist yet (pre-audience migration) — fine */ }

  return {
    webTitle: input.webTitle,
    objective: input.objective ?? null,
    cluster: input.cluster,
    tools: input.tools,
    artifacts: arts.map((a) => ({ slug: a.slug ?? a.id, kind: a.kind, title: a.title, detail: a.detail, revision: a.revision })),
    files: files.map((f) => ({ name: f.name, kind: f.kind, caption: f.caption ?? null })),
    business,
    openQuestions,
    beliefs: ((beliefRows ?? []) as { statement: string; supporting_event_ids: string[]; contradicting_event_ids: string[] }[])
      .map((b) => `[${beliefEvidence(b).verdict}] ${b.statement}`)
      .slice(0, 4),
    brandKit: brandKit ? { name: brandKit.name, tone: brandKit.tone, palette: brandKit.palette, fonts: brandKit.fonts, compliance_line: brandKit.compliance_line } : null,
    audience,
    results: input.results ?? null,
  };
}

export interface StudioTurnResult {
  decision: StudioDecision;
  reply: string;                 // what to show the user
  changed: boolean;              // did an artifact get created/revised (caller should refresh)
  costUsd: number;
}

/**
 * Run one studio chat turn. `ctx` is everything the pure compiler needs; `clusterId` is where
 * artifacts/proposals attach. History is loaded from the transcript so a studio remembers itself.
 */
export async function runStudioTurn(clusterId: string, ctx: StudioContextInput, message: string): Promise<StudioTurnResult> {
  const priorMsgs = await listStudioMessages(clusterId, 12).catch(() => []);
  const history: StudioTurn[] = priorMsgs.map((m) => ({ role: m.role, content: m.content }));
  const context = compileStudioContext(ctx);

  // Persist the user's turn immediately (best-effort).
  await saveStudioMessage(clusterId, 'user', message);

  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system: STUDIO_SYSTEM, context, history, message },
  });
  if (error) throw new Error(error.message);
  const raw = (data as { text?: string; costUsd?: number })?.text ?? '';
  const costUsd = (data as { costUsd?: number })?.costUsd ?? 0;

  const decision = parseStudioDecision(raw);
  const result = await executeDecision(clusterId, decision);

  // Persist the SAME text the user saw (result.reply), not describeDecision — the revise-fallback
  // path produces reply text that differs from the raw note, and the transcript must match the bubble.
  await saveStudioMessage(clusterId, 'garvis', result.reply, decision, costUsd);
  return { decision, ...result, costUsd };
}

async function executeDecision(clusterId: string, decision: StudioDecision): Promise<Omit<StudioTurnResult, 'decision' | 'costUsd'>> {
  switch (decision.kind) {
    case 'reply':
      return { reply: decision.text, changed: false };

    case 'create_artifact': {
      await createArtifact({
        clusterId, slug: decision.artifact.slug, kind: decision.artifact.kind,
        title: decision.artifact.title, detail: decision.artifact.detail,
      });
      return { reply: decision.note, changed: true };
    }

    case 'revise_artifact': {
      // Find the artifact by slug within this cluster; revise (the DB trigger snapshots v-prev).
      // Match id too: loadStudioContext advertises slug-less artifacts by their uuid, so the model
      // may return the uuid as "slug" — matching only raw slug would miss them and duplicate.
      const arts = await listClusterArtifacts(clusterId);
      const target = arts.find((a) => a.slug === decision.slug || a.id === decision.slug);
      if (!target) {
        // Slug didn't match — fall back to creating it so the work isn't lost.
        await createArtifact({ clusterId, slug: decision.slug, kind: 'doc', title: decision.title ?? decision.slug, detail: decision.detail });
        return { reply: `${decision.note} (created — no existing "${decision.slug}" to revise)`, changed: true };
      }
      await reviseArtifact(target.id, { title: decision.title, detail: decision.detail });
      return { reply: decision.note, changed: true };
    }

  }
}
