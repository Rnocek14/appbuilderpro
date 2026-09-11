// Run: npx tsx src/lib/garvis/lobSend.verify.ts
// The mail executor + tracking contract (SW10.4): lob-send mirrors send-email gate for gate,
// the webhook is HMAC-verified/fail-closed and applies events MONOTONICALLY (delivered never
// regresses; replays rejected), a returned piece marks its household undeliverable, and a piece
// token on a site visit attributes the lead to the exact household.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapLobEvent, advancePiece, PIECE_RANK, PIECES_PER_RUN } from './lobCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- the pure event mapping: monotonic, replay-proof, regression-proof ----
check('tracking events map to lifecycle targets',
  mapLobEvent('postcard.in_transit') === 'in_transit'
  && mapLobEvent('postcard.in_local_area') === 'in_transit'
  && mapLobEvent('postcard.processed_for_delivery') === 'delivered'
  && mapLobEvent('postcard.returned_to_sender') === 'returned');
check('unknown events map to null — ignored, never guessed',
  mapLobEvent('postcard.created') === null && mapLobEvent('letter.delivered') === null && mapLobEvent(undefined) === null);
check('a piece only ever advances', advancePiece('submitted', 'in_transit') === 'in_transit'
  && advancePiece('in_transit', 'delivered') === 'delivered');
check('DELIVERED NEVER REGRESSES: a late in_transit is rejected', advancePiece('delivered', 'in_transit') === null);
check('a replayed event is rejected as already applied', advancePiece('in_transit', 'in_transit') === null);
check('returned applies from any live state (a came-back piece is a fact)',
  advancePiece('submitted', 'returned') === 'returned' && advancePiece('delivered', 'returned') === 'returned');
check('returned is terminal — nothing follows it', advancePiece('returned', 'delivered') === null);
check('canceled and failed pieces never advance',
  advancePiece('canceled', 'delivered') === null && advancePiece('failed', 'in_transit') === null);
check('the rank ladder is strictly increasing',
  PIECE_RANK.staged < PIECE_RANK.submitted && PIECE_RANK.submitted < PIECE_RANK.in_transit && PIECE_RANK.in_transit < PIECE_RANK.delivered);
check('the drain slice is bounded', PIECES_PER_RUN > 0 && PIECES_PER_RUN <= 100);

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const send = readFileSync(join(root, 'supabase/functions/lob-send/index.ts'), 'utf8');
const hook = readFileSync(join(root, 'supabase/functions/lob-webhook/index.ts'), 'utf8');
const site = readFileSync(join(root, 'supabase/functions/site-events/index.ts'), 'utf8');
const brief = readFileSync(join(here, 'websiteBrief.ts'), 'utf8');

// lob-send: send-email's gates, gate for gate.
{
  check('executor verifies kind, status, owner, and the payload hash (tamper → 409)',
    send.includes("approval.kind !== 'send_mail'") && send.includes("approval.status !== 'approved'")
    && send.includes('approval.owner_id !== user.id') && send.includes('payloadMatches(approval.payload'));
  check('the pieces read is paginated and ordered — big drops re-derive whole, never truncated-409',
    send.includes(".order('household_key', { ascending: true })") && send.includes('.range(from, from + 999)'));
  check('the ceiling unit comes from the HASH-BOUND payload, never the mutable drop row',
    send.includes('Number(payload.est_piece_usd ?? 0)') && !send.includes('drop.est_piece_usd ?? payload.est_piece_usd'));
  check("Lob's REAL billed prices accumulate against the ceiling across the whole drain",
    send.includes('spentUsd + unit > ceiling') && send.includes('spent_usd: Math.round(spentUsd * 100) / 100'));
  check('the do-not-mail re-check runs INSIDE the claim (only the claim holder cancels)',
    send.indexOf('send_claimed_at: new Date().toISOString()') < send.indexOf("'do-not-mail at send time'"));
  check('the mail kill switch is re-checked at send time, fail-closed',
    send.includes('!settings?.mail_enabled') && send.includes('kill switch'));
  check('the design hash is re-derived from the drop snapshot (tamper → 409)',
    send.includes('hashPayload(spec)) !== payload.spec_hash'));
  check('the addressed list re-hashes from the pieces (tamper → 409)',
    send.includes('derived !== payload.pieces_hash'));
  check('an EDIT hole is a refusal at send time too',
    /try \{ html = compileLobHtml\(spec\); \} catch/.test(send));
  check('the approved total is a HARD ceiling',
    send.includes('would exceed the approved') && send.includes('ceiling'));
  check('do-not-mail is re-checked per household at send time',
    send.includes("'do-not-mail at send time'"));
  check('atomic expiring claim (one drain at a time; dead claims expire)',
    send.includes('send_claimed_at') && send.includes("or(`result->>send_claimed_at.is.null,result->>send_claimed_at.lt."));
  check('per-piece CAS + Idempotency-Key make double-submission impossible',
    send.includes("'Idempotency-Key': p.id") && send.includes(".eq('id', p.id).eq('status', 'staged')"));
  check('big drops drain in slices and the chain SURVIVES: waitUntil + the worker secret (never a dying JWT)',
    send.includes('functions/v1/lob-send') && send.includes('EdgeRuntime.waitUntil(next)')
    && send.includes("'x-worker-secret': workerSecret ?? ''"));
  check('every outcome lands in the one ledger under the lob connector',
    send.includes("connector: 'lob', action: 'send_mail'"));
  check('replays return the durable result, never a second drop',
    send.includes('previous.executed') && send.includes('replayed: true'));
  check('the per-piece QR carries the household token', send.includes('pt=${p.qr_token}'));
  check('an unexpected throw releases the claim for retry', send.includes('releaseOnThrow'));
}

// lob-webhook: verified, fresh, monotonic.
{
  check('with no secret the webhook refuses ALL events (fail-closed 500)',
    hook.includes('LOB_WEBHOOK_SECRET is not set — refusing all events'));
  check('the HMAC compare is constant-time', hook.includes('timingSafeEqualHex') && /diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/.test(hook));
  check('stale timestamps are rejected (replay window)', hook.includes('FRESHNESS_MS') && hook.includes('Stale or invalid timestamp'));
  check('events apply through the pure monotonic mapping',
    hook.includes('mapLobEvent(event.event_type?.id)') && hook.includes('advancePiece(piece.status'));
  check('the status write is CAS on the exact status read',
    hook.includes(".eq('id', piece.id).eq('status', piece.status)"));
  check('returned-to-sender marks the household undeliverable with the reason named',
    hook.includes("verify_status: 'undeliverable'") && hook.includes('returned-to-sender'));
}

// site-events: the piece token attributes the household.
{
  check('the piece token is validated and OWNER-MATCHED before it attributes anything',
    site.includes("p.owner_id === ownerId"));
  check('a valid token lands the household on the event row',
    site.includes('piece_id: piece.id, household_key: piece.household_key'));
  check('a postcard lead names the household in the mind event',
    site.includes('the postcard household at'));
  check('the scan is stamped on the piece', site.includes('qr scanned'));
  check('the site brief teaches generated sites to forward the token',
    brief.includes('ptParam()') && brief.includes('"pt":ptParam()'));
}

console.log(`\nlobSend.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} lob send check(s) failed`);
