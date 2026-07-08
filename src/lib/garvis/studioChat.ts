// src/lib/garvis/studioChat.ts
// Impure dispatcher for the Cluster Studio chat: compile context (pure) → call the cluster-chat edge
// fn → parse the decision (pure) → EXECUTE it through owner-scoped paths → persist the transcript.
// The chat can only ever: reply, create an artifact, revise one (new version), or PROPOSE an
// approval. It never sends — that boundary is the same one send-email enforces.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { createArtifact, reviseArtifact, listClusterArtifacts, listClusterFiles, getBrandKit, listStudioMessages, saveStudioMessage } from './artifacts';
import {
  STUDIO_SYSTEM, compileStudioContext, parseStudioDecision, describeDecision,
  type StudioContextInput, type StudioDecision, type StudioTurn,
} from './clusterChat';
import type { Charter, WorkTool } from './workweb';

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
  const [arts, files, brandKit] = await Promise.all([
    listClusterArtifacts(input.clusterId).catch(() => []),
    listClusterFiles(input.clusterId).catch(() => []),
    getBrandKit(input.worldId).catch(() => null),
  ]);
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
    files: files.map((f) => ({ name: f.name, kind: f.kind })),
    brandKit: brandKit ? { name: brandKit.name, tone: brandKit.tone, palette: brandKit.palette, fonts: brandKit.fonts, compliance_line: brandKit.compliance_line } : null,
    audience,
    results: input.results ?? null,
  };
}

export interface StudioTurnResult {
  decision: StudioDecision;
  reply: string;                 // what to show the user
  changed: boolean;              // did an artifact get created/revised (caller should refresh)
  approvalId?: string;
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

  await saveStudioMessage(clusterId, 'garvis', describeDecision(decision), decision, costUsd);
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
      const arts = await listClusterArtifacts(clusterId);
      const target = arts.find((a) => a.slug === decision.slug);
      if (!target) {
        // Slug didn't match — fall back to creating it so the work isn't lost.
        await createArtifact({ clusterId, slug: decision.slug, kind: 'doc', title: decision.title ?? decision.slug, detail: decision.detail });
        return { reply: `${decision.note} (created — no existing "${decision.slug}" to revise)`, changed: true };
      }
      await reviseArtifact(target.id, { title: decision.title, detail: decision.detail });
      return { reply: decision.note, changed: true };
    }

    case 'propose_approval': {
      const approvalId = await enqueueApproval({
        kind: decision.approval_kind,
        title: decision.title,
        preview: decision.preview,
        payload: { source: 'studio-chat', cluster_id: clusterId },
        requestedBy: 'worker',
      });
      return { reply: `${decision.note} — waiting in Approvals.`, changed: false, approvalId };
    }
  }
}
