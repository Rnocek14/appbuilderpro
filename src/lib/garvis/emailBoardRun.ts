// src/lib/garvis/emailBoardRun.ts
// Impure half of the email board: load the real business identity (signer, business, phone, area),
// SEND a draft to a contact segment (one send_batch approval the clock drains under the daily cap — the
// loop closes), and save a draft as a reusable template. Nothing sends here; createBatch enqueues the
// approval and the honest reachable count.

import { getBrandKit, createArtifact } from './artifacts';
import { loadWeb } from './workwebRun';
import { loadClusterWorkingState } from './clusterState';
import { inferRealEstate } from './studioKit';
import { createBatch, segmentCount, type BatchSegment } from './outreachBatchRun';
import { composeEmailText, type EmailContent, type EmailMaterials } from './emailBoard';

export type { BatchSegment };

/** Load the business identity the drafts are written from. Signer/phone/area come from the brand kit +
 *  the campaign the owner set on the canvas (if any); anything absent stays an honest [EDIT] hole. */
export async function loadEmailMaterials(worldId: string, clusterId: string | null): Promise<EmailMaterials> {
  const [web, brand, ws] = await Promise.all([
    loadWeb(worldId).catch(() => null),
    getBrandKit(worldId).catch(() => null),
    clusterId ? loadClusterWorkingState(clusterId).catch(() => ({})) : Promise.resolve({}),
  ]);
  const businessName = web?.title || brand?.name || '';
  const camp = (ws as { campaign?: { agentName?: string | null; agentPhone?: string | null; area?: string | null } }).campaign;
  return {
    businessName,
    agentName: (camp?.agentName || brand?.name || businessName || '').trim(),
    phone: camp?.agentPhone ?? null,
    area: camp?.area ?? null,
    realEstate: inferRealEstate(businessName || brand?.name || null),
  };
}

/** Send a draft to a contact segment: one send_batch approval, drained by the clock under the daily cap,
 *  every recipient re-checking suppression at send time. Returns the honest reachable count + exclusions. */
export async function queueEmailToSegment(args: {
  content: EmailContent; segment: BatchSegment; worldId: string | null;
}): Promise<{ queued: number; excluded: { email: string; reason: string }[]; truncatedFrom: number | null }> {
  const res = await createBatch({ segment: args.segment, subject: args.content.subject, body: args.content.body, worldId: args.worldId });
  return { queued: res.queued, excluded: res.excluded, truncatedFrom: res.truncatedFrom };
}

/** Live reachable counts per segment, so the owner sees who a send would reach before approving. */
export async function emailSegmentCounts(): Promise<Record<BatchSegment, number>> {
  const segs: BatchSegment[] = ['all', 'new', 'contacted', 'qualified', 'customer'];
  const out = {} as Record<BatchSegment, number>;
  await Promise.all(segs.map(async (s) => { out[s] = await segmentCount(s).catch(() => 0); }));
  return out;
}

export async function saveEmailTemplate(clusterId: string, content: EmailContent, title: string): Promise<void> {
  await createArtifact({ clusterId, kind: 'doc', title, detail: composeEmailText(content), source: 'garvis' });
}
