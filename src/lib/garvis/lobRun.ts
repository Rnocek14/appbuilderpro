// src/lib/garvis/lobRun.ts
// The mail-drop request seam (SW10.3) — turns a territory + a finished postcard design into an
// approval-gated, executable Lob drop. Mirrors deployRun: the partition runs fail-closed at
// staging (do-not-mail, undeliverable, incomplete addresses all held back and counted), the
// pieces are snapshotted with per-household qr_tokens, and ONE send_mail approval binds the
// piece count, the design, and est_total_usd — the executor's hard ceiling — under the payload
// hash. On approval, lob-send (SW10.4) re-verifies every gate server-side and drains the pieces.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { hashPayload } from './payloadHash';
import { partitionMailable, farmMath, type FarmRecipient, type MergePartition } from './farm';
import { listRecipients, loadDoNotMailKeys } from './farmRun';
import { specHoles, LOB_POSTCARD_UNIT_USD, lobBrandFromKit } from './lobCore';
import type { MailerSpec } from './mailer';

export interface MailDropRequest {
  approvalId: string;
  dropId: string;
  pieces: number;
  estTotalUsd: number;
  suppressed: Record<string, number>;
}

/** Group the partition's held-back households by reason family, for the card + the drop row. */
export function suppressionBreakdown(suppressed: MergePartition['suppressed']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of suppressed) {
    const key = s.reason.startsWith('do-not-mail') ? 'do_not_mail'
      : s.reason.startsWith('undeliverable') ? 'undeliverable'
      : 'incomplete_address';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

const bd = (b: Record<string, number>) => {
  const parts: string[] = [];
  if (b.do_not_mail) parts.push(`${b.do_not_mail} do-not-mail`);
  if (b.undeliverable) parts.push(`${b.undeliverable} undeliverable`);
  if (b.incomplete_address) parts.push(`${b.incomplete_address} incomplete`);
  return parts.join(', ');
};

/** Stage a Lob drop + enqueue its ONE approval. Refuses an unfinished design (EDIT holes named)
 *  and an empty partition — a drop that would print nothing or print placeholders never stages. */
export async function requestMailDrop(input: {
  worldId: string;
  territoryId: string;
  territoryName: string;
  spec: MailerSpec;
  absenteeOnly?: boolean;
  pieceCostUsd?: number;
}): Promise<MailDropRequest> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const holes = specHoles(input.spec);
  if (holes.length) {
    throw new Error(`The design still has ${holes.length} unfinished edit${holes.length === 1 ? '' : 's'} (${holes.slice(0, 3).join(', ')}${holes.length > 3 ? '…' : ''}) — finish it before staging a drop.`);
  }

  // BRAND ON MAIL: stamp the world's brand kit onto the spec HERE, before anything snapshots or
  // hashes — the approved card and the printed card carry the same brand by construction. A
  // missing/empty kit leaves the neutral house design; a kit-load hiccup never blocks a drop.
  const kitRow = await supabase.from('brand_kits').select('name, palette, fonts, logo_url')
    .eq('world_id', input.worldId).maybeSingle().then((r) => r.data, () => null);
  const spec: MailerSpec = { ...input.spec, brand: (kitRow ? lobBrandFromKit(kitRow) : null) ?? input.spec.brand ?? null };

  const all = await listRecipients(input.territoryId);
  const pool = input.absenteeOnly ? all.filter((r) => r.isAbsentee) : all;
  const part = partitionMailable(pool, await loadDoNotMailKeys());
  if (!part.mailable.length) {
    throw new Error(pool.length === 0
      ? 'No households on file in this area — import a list first.'
      : `Nothing mailable: all ${pool.length} households were held back (${bd(suppressionBreakdown(part.suppressed)) || 'suppressed'}).`);
  }

  const pieceUsd = input.pieceCostUsd && input.pieceCostUsd > 0 ? input.pieceCostUsd : LOB_POSTCARD_UNIT_USD;
  // The REAL farm arithmetic prices the drop — one drop of exactly these pieces.
  const math = farmMath({ homes: part.mailable.length, pieceCostUsd: pieceUsd, dropsPerYear: 1, soldLast12: null });
  const estTotalUsd = math.perDropUsd;
  const breakdown = suppressionBreakdown(part.suppressed);

  const { data: drop, error: dErr } = await supabase.from('mail_drops').insert({
    owner_id: uid, world_id: input.worldId, territory_id: input.territoryId,
    spec, status: 'staged', pieces: part.mailable.length,
    est_piece_usd: pieceUsd, est_total_usd: estTotalUsd,
    suppressed_count: part.suppressed.length, suppressed_reasons: breakdown,
  }).select('id').single();
  if (dErr || !drop) throw new Error(`Could not stage the drop: ${dErr?.message ?? 'unknown error'}`);
  const dropId = (drop as { id: string }).id;

  const cleanup = async () => { await supabase.from('mail_drops').delete().eq('id', dropId).then(() => {}, () => {}); };
  try {
    // Snapshot every piece with its per-household attribution token. Address = where mail goes
    // (owner mailing address when present — the partition already guaranteed completeness).
    const pieceRows = part.mailable.map((r: FarmRecipient) => {
      const a = r.mail ?? r.situs;
      return {
        owner_id: uid, drop_id: dropId, household_key: r.householdKey,
        full_name: r.fullName || 'Current Resident',
        address1: a.address1, city: a.city, state: a.state, zip5: a.zip5,
        is_absentee: r.isAbsentee, qr_token: crypto.randomUUID(), status: 'staged',
      };
    });
    for (let i = 0; i < pieceRows.length; i += 500) {
      const { error } = await supabase.from('mail_pieces').insert(pieceRows.slice(i, i + 500));
      if (error) throw new Error(`Could not snapshot the pieces (row ${i + 1}): ${error.message}`);
    }

    // The payload binds the drop, the exact design, and the exact addressed list — the executor
    // re-derives both hashes from the rows and refuses on drift. Sorted by household_key so the
    // server can reconstruct the exact hash input regardless of row-return order.
    const piecesHash = await hashPayload(pieceRows
      .map((p) => ({
        household_key: p.household_key, full_name: p.full_name,
        address1: p.address1, city: p.city, state: p.state, zip5: p.zip5,
      }))
      // Plain codepoint order — localeCompare could disagree between the browser and Deno.
      .sort((a, b) => (a.household_key < b.household_key ? -1 : a.household_key > b.household_key ? 1 : 0)));
    const specHash = await hashPayload(spec as unknown as Record<string, unknown>);
    const approvalId = await enqueueApproval({
      kind: 'send_mail',
      title: `Mail drop: ${part.mailable.length} postcard${part.mailable.length === 1 ? '' : 's'} — ${input.territoryName}`,
      preview:
        `${part.mailable.length.toLocaleString()} pieces × $${pieceUsd.toFixed(2)} ≈ $${estTotalUsd.toFixed(2)} (the hard ceiling)` +
        `${part.suppressed.length ? ` · ${part.suppressed.length} held back (${bd(breakdown)})` : ''}` +
        ` · Approving submits through Lob (the one mail path) — every gate re-checked at send time.`,
      payload: {
        drop_id: dropId, territory_id: input.territoryId, world_id: input.worldId,
        pieces: part.mailable.length, est_piece_usd: pieceUsd, est_total_usd: estTotalUsd,
        pieces_hash: piecesHash, spec_hash: specHash,
      },
      requestedBy: 'user',
      worldId: input.worldId,
    });
    await supabase.from('mail_drops').update({ approval_id: approvalId }).eq('id', dropId).then(() => {}, () => {});
    return { approvalId, dropId, pieces: part.mailable.length, estTotalUsd, suppressed: breakdown };
  } catch (e) {
    await cleanup(); // pieces cascade with the drop
    throw e;
  }
}
