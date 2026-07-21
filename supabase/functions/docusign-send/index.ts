// supabase/functions/docusign-send/index.ts
// THE ONE E-SIGNATURE SEND PATH — clones send-email's approval spine: nothing goes to DocuSign
// without an owned, APPROVED approvals row (kind 'send_for_signature'), re-verified server-side,
// with an atomic double-send claim (an envelope POST is not idempotent — a retry without the claim
// would email the signer twice). Also serves 'status': an owner-scoped poll that updates the
// envelope row from DocuSign — the honest fallback when the webhook isn't configured.
//
// Environment is CONFIG, never code: DOCUSIGN_AUTH_BASE defaults to the developer sandbox
// (account-d.docusign.com — signatures there are NOT legally binding); production flips the env.
// Deploy: in package.json functions:deploy (user-JWT). Secrets: DOCUSIGN_OAUTH_CLIENT_ID/SECRET
// (+ optional DOCUSIGN_AUTH_BASE, DOCUSIGN_WEBHOOK_SECRET).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { freshProviderToken } from '../_shared/oauth.ts';
import {
  mergePaperwork, decideSendable, chunkedBase64, docHtml, envelopeRequest,
  mapDocusignStatus, mapRecipientStatus, type EsignRecipient,
} from '../_shared/esignCore.ts';
import { payloadMatches } from '../_shared/payloadHash.ts';

const AUTH_BASE = Deno.env.get('DOCUSIGN_AUTH_BASE') ?? 'https://account-d.docusign.com';

interface Account { account_id: string; base_uri: string; is_default: boolean }

async function resolveAccount(token: string): Promise<{ ok: true; accountId: string; baseUri: string } | { ok: false; error: string }> {
  // userinfo-based resolution (harvested from lakegen's one good idea here): the account and
  // base_uri come from the CONNECTED token, so env/account drift can't 401 every call.
  const r = await fetch(`${AUTH_BASE}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return { ok: false, error: `DocuSign userinfo ${r.status} — reconnect DocuSign.` };
  const u = await r.json() as { accounts?: Account[] };
  const acct = (u.accounts ?? []).find((a) => a.is_default) ?? (u.accounts ?? [])[0];
  if (!acct) return { ok: false, error: 'No DocuSign account on this connection.' };
  return { ok: true, accountId: acct.account_id, baseUri: acct.base_uri };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { approval_id?: string; action?: string; row_id?: string };
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Owner JWT only — there is no worker path for signatures; a human approves every envelope.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const uid = user.id;

    // ---------- action: status (owner-scoped poll; the webhook's honest fallback) ----------
    if (body.action === 'status') {
      if (!body.row_id) return json({ error: 'row_id is required.' }, 400);
      const { data: row } = await admin.from('esign_envelopes')
        .select('id, owner_id, envelope_id, status, recipients').eq('id', body.row_id).single();
      if (!row || row.owner_id !== uid) return json({ error: 'Envelope not found' }, 404);
      if (!row.envelope_id) return json({ ok: true, status: row.status, note: 'Not sent yet — nothing to poll.' });

      const token = await freshProviderToken(admin, uid, 'docusign');
      if (!token) return json({ error: 'DocuSign is not connected.' }, 400);
      const acct = await resolveAccount(token);
      if (!acct.ok) return json({ error: acct.error }, 502);

      const [envRes, recRes] = await Promise.all([
        fetch(`${acct.baseUri}/restapi/v2.1/accounts/${acct.accountId}/envelopes/${row.envelope_id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${acct.baseUri}/restapi/v2.1/accounts/${acct.accountId}/envelopes/${row.envelope_id}/recipients`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!envRes.ok) return json({ error: `DocuSign envelope lookup failed (${envRes.status}).` }, 502);
      const env = await envRes.json() as { status?: string; completedDateTime?: string };
      const mapped = mapDocusignStatus(env.status ?? '');

      let recipients = (row.recipients ?? []) as EsignRecipient[];
      if (recRes.ok) {
        const rec = await recRes.json() as { signers?: { email?: string; status?: string; signedDateTime?: string }[] };
        recipients = recipients.map((r) => {
          const match = (rec.signers ?? []).find((s) => (s.email ?? '').toLowerCase() === r.email.toLowerCase());
          if (!match) return r;
          const st = mapRecipientStatus(match.status ?? '');
          return { ...r, status: st ?? r.status, signedAt: match.signedDateTime ?? r.signedAt };
        });
      }
      const patch: Record<string, unknown> = { recipients };
      if (mapped) {
        patch.status = mapped;
        if (mapped === 'completed') patch.completed_at = env.completedDateTime ?? new Date().toISOString();
      }
      await admin.from('esign_envelopes').update(patch).eq('id', row.id);
      return json({ ok: true, status: mapped ?? row.status, recipients, rawStatus: env.status ?? null });
    }

    // ---------- action: send (default — the approval executor) ----------
    const approvalId = body.approval_id;
    if (!approvalId) return json({ error: 'approval_id is required.' }, 400);

    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result').eq('id', approvalId).single();
    if (!approval || approval.owner_id !== uid) return json({ error: 'Approval not found' }, 404);
    if (approval.kind !== 'send_for_signature') return json({ error: 'Approval is not a send_for_signature.' }, 400);
    if (approval.status !== 'approved') return json({ error: `Approval is ${approval.status}, not approved.` }, 409);
    // Tamper-evidence: refuse if the payload changed since it was approved (null hash = grandfathered).
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed since it was approved — refusing to send.' }, 409);
    }

    const rowId = (approval.payload as { envelope_row_id?: string })?.envelope_row_id;
    if (!rowId) return json({ error: 'Approval payload is missing envelope_row_id.' }, 400);

    const { data: row } = await admin.from('esign_envelopes')
      .select('id, owner_id, title, merged_body, recipients, status, envelope_id').eq('id', rowId).single();
    if (!row || row.owner_id !== uid) return json({ error: 'Envelope not found' }, 404);
    if (row.envelope_id || row.status !== 'queued') return json({ error: `Envelope already ${row.status}.` }, 409);

    // Atomic double-send claim — an envelope POST is not idempotent.
    const priorResult = (approval.result as Record<string, unknown> | null) ?? {};
    const { data: claimRows, error: claimErr } = await admin.from('approvals')
      .update({ result: { ...priorResult, send_claimed_at: new Date().toISOString() } })
      .eq('id', approvalId).eq('status', 'approved').is('result->>send_claimed_at', null)
      .select('id');
    if (claimErr || !claimRows?.length) return json({ error: 'This send is already in flight (or was already claimed).' }, 409);
    const releaseClaim = (extra: Record<string, unknown> = {}) =>
      admin.from('approvals').update({ result: { ...priorResult, ...extra, send_claimed_at: null } }).eq('id', approvalId);

    const ledger = (r: Record<string, unknown>) =>
      admin.from('execution_runs').insert({ owner_id: uid, approval_id: approvalId, connector: 'docusign', action: 'send_for_signature', ...r });
    const block = async (reason: string): Promise<Response> => {
      await ledger({ status: 'skipped', request: { envelope_row_id: rowId }, error: reason });
      await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- gates -----
    const recipients = (row.recipients ?? []) as EsignRecipient[];
    // Server-side re-check of the honesty gate: a doc with holes NEVER goes out.
    const sendable = decideSendable({ body: row.merged_body, gaps: [] }, recipients);
    if (!sendable.ok) return await block(sendable.reason ?? 'Not sendable.');

    const token = await freshProviderToken(admin, uid, 'docusign');
    if (!token) return await block('DocuSign is not connected — connect it in the paperwork studio first.');
    const acct = await resolveAccount(token);
    if (!acct.ok) return await block(acct.error);

    // From-line: the operator's own configured identity only — never invented.
    const { data: settings } = await admin.from('outreach_settings')
      .select('from_name, company_name').eq('owner_id', uid).maybeSingle();
    const fromLine = settings?.from_name || settings?.company_name || null;

    const html = docHtml({ title: row.title, body: row.merged_body, signers: recipients, fromLine });
    const docBase64 = chunkedBase64(new TextEncoder().encode(html));
    const webhookUrl = Deno.env.get('DOCUSIGN_WEBHOOK_SECRET')
      ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/docusign-webhook`
      : null; // no secret → the webhook would reject everything (fail closed); poll covers status
    const envReq = envelopeRequest({ title: row.title, docBase64, signers: recipients, webhookUrl });

    const res = await fetch(`${acct.baseUri}/restapi/v2.1/accounts/${acct.accountId}/envelopes`, {
      method: 'POST', signal: AbortSignal.timeout(60_000),
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(envReq),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      await ledger({ status: 'failed', request: { envelope_row_id: rowId }, response: { status: res.status, body: txt.slice(0, 500) }, error: `docusign ${res.status}` });
      await releaseClaim({ failed: `docusign ${res.status}` });
      return json({ ok: false, error: `DocuSign error ${res.status}: ${txt.slice(0, 300)}` }, 502);
    }
    const out = await res.json() as { envelopeId?: string };
    const sentAt = new Date().toISOString();

    await admin.from('esign_envelopes').update({
      envelope_id: out.envelopeId ?? null, status: 'sent', sent_at: sentAt,
      recipients: recipients.map((r) => ({ ...r, status: r.status ?? 'sent' })),
    }).eq('id', rowId);
    await ledger({ status: 'ok', request: { envelope_row_id: rowId, signers: recipients.map((r) => r.email) }, response: { envelope_id: out.envelopeId } });
    await admin.from('approvals').update({ result: { ...priorResult, send_claimed_at: sentAt, envelope_id: out.envelopeId, sent_at: sentAt } }).eq('id', approvalId);
    await admin.from('mind_events').insert({
      owner_id: uid, source: 'execution', event_type: 'note',
      subject: `Sent for signature: "${row.title.slice(0, 100)}" → ${recipients.map((r) => r.email).join(', ').slice(0, 140)}`,
      payload: { key: `esign-sent:${rowId}`, envelope_row_id: rowId, envelope_id: out.envelopeId },
    }).then(() => {}, () => {});

    return json({ ok: true, envelope_id: out.envelopeId, sent_at: sentAt });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
