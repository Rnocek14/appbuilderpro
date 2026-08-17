// supabase/functions/lob-send/index.ts
// THE ONE MAIL PATH (SW10.4). Nothing else in Garvis submits postal mail. Takes an APPROVED
// send_mail approval, re-checks every safety gate at send time, and submits the drop's staged
// pieces to Lob — mirroring send-email gate for gate:
//   kind/status/owner → payload_hash 409 → replay short-circuit → kill switch → design-hash and
//   addressed-list-hash 409 → EDIT-hole refusal → cost-ceiling refusal → do-not-mail re-check at
//   send time → atomic expiring claim → per-piece CAS + Idempotency-Key → ledger + mind_event.
// Big drops drain in slices: each invocation submits up to PIECES_PER_RUN pieces, then re-invokes
// itself (forwarding the caller's own Authorization) until nothing staged remains. Per-piece CAS
// plus Lob's Idempotency-Key make overlapping drains harmless — a piece can only ever submit once.
//
// Deploy: npx supabase functions deploy lob-send
// Secrets: LOB_API_KEY (a test_ key drops nothing physical — Lob's own test mode).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { payloadMatches, hashPayload } from '../_shared/payloadHash.ts';
import { compileLobHtml, PIECES_PER_RUN, type LobPostcardSpec } from '../_shared/lobCore.ts';

interface PieceRow {
  id: string; household_key: string; full_name: string;
  address1: string; city: string; state: string; zip5: string;
  status: string; qr_token: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let releaseOnThrow: (() => PromiseLike<unknown>) | null = null;
  try {
    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };
    if (!approval_id) return json({ error: 'approval_id is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const authHeader = req.headers.get('Authorization') ?? '';
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const uid = user.id;

    // The approval is the authority to mail. Correct kind, approved, owned, and untampered.
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== uid) return json({ error: 'Approval not found' }, 404);
    if (approval.kind !== 'send_mail') return json({ error: 'Approval is not a send_mail.' }, 400);
    if (approval.status !== 'approved') return json({ error: `Approval is ${approval.status}, not approved.` }, 409);
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed since it was approved — refusing to mail.' }, 409);
    }
    const payload = (approval.payload ?? {}) as {
      drop_id?: string; pieces?: number; est_piece_usd?: number; est_total_usd?: number;
      pieces_hash?: string; spec_hash?: string;
    };
    const dropId = payload.drop_id;
    if (!dropId) return json({ error: 'Approval payload is missing drop_id.' }, 400);

    const previous = (approval.result as Record<string, unknown> | null) ?? {};
    if (previous.executed) {
      return json({ ok: true, replayed: true, ...previous });
    }

    const { data: drop } = await admin.from('mail_drops')
      .select('id, owner_id, world_id, territory_id, spec, status, pieces, est_piece_usd, est_total_usd')
      .eq('id', dropId).maybeSingle();
    if (!drop || drop.owner_id !== uid) return json({ error: 'The approved drop is missing.' }, 409);
    if (!['approved', 'submitted', 'partial'].includes(drop.status as string)) {
      return json({ error: `The drop is ${drop.status} — only an approved drop mails.` }, 409);
    }

    const apiKey = Deno.env.get('LOB_API_KEY');
    if (!apiKey) return json({ error: 'Lob is not connected — set the LOB_API_KEY secret.' }, 400);

    const ledger = (row: Record<string, unknown>) =>
      admin.from('execution_runs').insert({ owner_id: uid, approval_id, connector: 'lob', action: 'send_mail', ...row });
    const releaseClaim = (extra: Record<string, unknown> = {}) =>
      admin.from('approvals').update({ result: { ...previous, ...extra, send_claimed_at: null } }).eq('id', approval_id);
    const block = async (reason: string, claimed: boolean): Promise<Response> => {
      await ledger({ status: 'skipped', request: { drop_id: dropId }, error: reason });
      if (claimed) await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- safety gates (owner-scoped), re-checked at send time -----
    const { data: settings } = await admin.from('outreach_settings')
      .select('mail_enabled').eq('owner_id', uid).maybeSingle();
    if (!settings?.mail_enabled) return await block('Direct mail is DISABLED (the mail kill switch is off).', false);

    // TAMPER-EVIDENCE beyond the payload hash: the design and the addressed list must still hash
    // to what was approved. The spec snapshot lives on the drop row; the list lives in mail_pieces.
    const spec = drop.spec as LobPostcardSpec | null;
    if (!spec || (await hashPayload(spec)) !== payload.spec_hash) {
      return json({ error: 'The postcard design changed after approval — stage the drop again.' }, 409);
    }
    const { data: allPieces } = await admin.from('mail_pieces')
      .select('id, household_key, full_name, address1, city, state, zip5, status, qr_token')
      .eq('drop_id', dropId).eq('owner_id', uid);
    const pieces = (allPieces ?? []) as PieceRow[];
    if (!pieces.length) return json({ error: 'The approved drop has no pieces.' }, 409);
    const derived = await hashPayload(pieces
      .map((p) => ({
        household_key: p.household_key, full_name: p.full_name,
        address1: p.address1, city: p.city, state: p.state, zip5: p.zip5,
      }))
      .sort((a, b) => (a.household_key < b.household_key ? -1 : a.household_key > b.household_key ? 1 : 0)));
    if (derived !== payload.pieces_hash) {
      return json({ error: 'The addressed list changed after approval — stage the drop again.' }, 409);
    }

    // An unfinished design is a refusal, never a printed placeholder (compileLobHtml throws).
    let html: { front: string; back: string };
    try { html = compileLobHtml(spec); } catch (e) {
      return await block(e instanceof Error ? e.message : String(e), false);
    }

    // COST CEILING: the approved est_total_usd is hard. The piece count and unit price must still
    // multiply to at most what the owner approved (a cent of rounding slack, nothing more).
    const unit = Number(drop.est_piece_usd ?? payload.est_piece_usd ?? 0);
    const ceiling = Number(payload.est_total_usd ?? 0);
    if (!(unit > 0) || !(ceiling > 0)) return await block('The approved drop has no usable price — stage it again.', false);
    if (pieces.length * unit > ceiling + 0.01) {
      return await block(`Submitting ${pieces.length} pieces × $${unit.toFixed(2)} would exceed the approved $${ceiling.toFixed(2)} ceiling — stage the drop again.`, false);
    }

    // DO-NOT-MAIL RE-CHECK at send time: a household suppressed after staging must not mail.
    const dnm = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: keys } = await admin.from('do_not_mail')
        .select('household_key').eq('owner_id', uid).range(from, from + 999);
      for (const k of (keys ?? []) as { household_key: string }[]) dnm.add(k.household_key);
      if (!keys || keys.length < 1000) break;
    }
    for (const p of pieces) {
      if (p.status === 'staged' && dnm.has(p.household_key)) {
        await admin.from('mail_pieces')
          .update({ status: 'canceled', last_event: 'do-not-mail at send time' })
          .eq('id', p.id).eq('status', 'staged').then(() => {}, () => {});
        p.status = 'canceled';
      }
    }

    // Atomic expiring claim (the send-email pattern): one drain at a time; a dead invocation's
    // claim expires after an hour instead of stranding the drop.
    const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: claimRows, error: claimErr } = await admin.from('approvals')
      .update({ result: { ...previous, send_claimed_at: new Date().toISOString() } })
      .eq('id', approval_id).eq('status', 'approved')
      .or(`result->>send_claimed_at.is.null,result->>send_claimed_at.lt.${staleBefore}`)
      .select('id');
    if (claimErr || !claimRows?.length) return json({ error: 'This drop is already draining.' }, 409);
    releaseOnThrow = () => releaseClaim({ failed: 'executor threw unexpectedly — claim released for retry' });

    // ----- the drain slice: per-piece CAS + Idempotency-Key -----
    const basic = 'Basic ' + btoa(`${apiKey}:`);
    const staged = pieces.filter((p) => p.status === 'staged').slice(0, PIECES_PER_RUN);
    let submitted = 0; let failedNow = 0;
    for (const p of staged) {
      // Claim THIS piece (CAS staged→submitted happens only after Lob accepts; the Idempotency-Key
      // means a crashed run that already POSTed re-POSTs the same key and Lob dedupes).
      const qr = spec.back.qrUrl
        ? {
            position: 'relative', pages: 'back', width: '1',
            bottom: '0.25', left: '0.25',
            redirect_url: `${spec.back.qrUrl}${spec.back.qrUrl.includes('?') ? '&' : '?'}pt=${p.qr_token}`,
          }
        : undefined;
      try {
        const resp = await fetch('https://api.lob.com/v1/postcards', {
          method: 'POST',
          headers: { Authorization: basic, 'Content-Type': 'application/json', 'Idempotency-Key': p.id },
          body: JSON.stringify({
            description: `garvis drop ${dropId}`,
            to: {
              name: p.full_name || 'Current Resident',
              address_line1: p.address1, address_city: p.city, address_state: p.state, address_zip: p.zip5,
            },
            size: '6x9', use_type: 'marketing',
            front: html.front, back: html.back,
            ...(qr ? { qr_code: qr } : {}),
          }),
        });
        const body = await resp.json().catch(() => ({})) as { id?: string; price?: string; error?: { message?: string } };
        if (resp.ok && body.id) {
          const { data: cas } = await admin.from('mail_pieces')
            .update({ status: 'submitted', lob_id: body.id, cost_usd: body.price ? Number(body.price) : null, last_event: 'submitted to Lob' })
            .eq('id', p.id).eq('status', 'staged').select('id');
          if (cas?.length) submitted++;
        } else {
          failedNow++;
          await admin.from('mail_pieces')
            .update({ status: 'failed', last_event: (body.error?.message ?? `Lob ${resp.status}`).slice(0, 300) })
            .eq('id', p.id).eq('status', 'staged').then(() => {}, () => {});
        }
      } catch (e) {
        failedNow++;
        await admin.from('mail_pieces')
          .update({ status: 'failed', last_event: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
          .eq('id', p.id).eq('status', 'staged').then(() => {}, () => {});
      }
    }

    // More staged? Release the claim and re-invoke ourselves with the caller's own authorization —
    // the next slice re-runs every gate. Per-piece CAS makes any overlap harmless.
    const { count: stagedLeft } = await admin.from('mail_pieces')
      .select('id', { count: 'exact', head: true }).eq('drop_id', dropId).eq('status', 'staged');
    if ((stagedLeft ?? 0) > 0) {
      await releaseClaim({ draining: true });
      releaseOnThrow = null;
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/lob-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
        body: JSON.stringify({ approval_id }),
      }).catch(() => {});
      return json({ ok: true, draining: true, submitted, failed: failedNow, remaining: stagedLeft });
    }

    // Drain complete — count the truth, stamp everything, and say exactly what happened.
    const countBy = async (status: string) => {
      const { count } = await admin.from('mail_pieces')
        .select('id', { count: 'exact', head: true }).eq('drop_id', dropId).eq('status', status);
      return count ?? 0;
    };
    const totalSubmitted = await countBy('submitted');
    const totalFailed = await countBy('failed');
    const totalCanceled = await countBy('canceled');
    const finalStatus = totalSubmitted === 0 ? 'failed' : totalFailed > 0 ? 'partial' : 'submitted';
    await admin.from('mail_drops').update({ status: finalStatus }).eq('id', dropId).then(() => {}, () => {});
    await ledger({
      status: totalSubmitted > 0 ? 'ok' : 'failed',
      request: { drop_id: dropId, submitted: totalSubmitted, failed: totalFailed, canceled: totalCanceled },
      error: totalSubmitted > 0 ? null : 'no pieces were accepted by Lob',
    });
    // Durable result (drops the claim key by construction) — replays return this from now on.
    await admin.from('approvals').update({
      result: { executed: true, submitted: totalSubmitted, failed: totalFailed, canceled: totalCanceled, finished_at: new Date().toISOString() },
    }).eq('id', approval_id);
    releaseOnThrow = null;
    await admin.from('mind_events').insert({
      owner_id: uid, event_type: 'note', source: 'execution',
      subject: totalSubmitted > 0
        ? `Mailed ${totalSubmitted} postcard${totalSubmitted === 1 ? '' : 's'}${totalFailed ? ` (${totalFailed} failed)` : ''}${totalCanceled ? ` (${totalCanceled} held back at send time)` : ''}`
        : 'A mail drop failed — no pieces were accepted by Lob',
      payload: { drop_id: dropId, world_id: drop.world_id, submitted: totalSubmitted, failed: totalFailed },
    }).then(() => {}, () => {});

    return json({ ok: totalSubmitted > 0, submitted: totalSubmitted, failed: totalFailed, canceled: totalCanceled, status: finalStatus });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (releaseOnThrow) { try { await releaseOnThrow(); } catch { /* the stale-claim expiry recovers */ } }
    return json({ error: msg }, 500);
  }
});
