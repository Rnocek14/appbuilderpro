// supabase/functions/unsubscribe/index.ts
// The working one-click opt-out (RFC 8058). Every outbound mail carries an HTTPS List-Unsubscribe
// pointing here with ?m=<outreach_messages.id>. That id is an unguessable per-send UUID and IS the
// capability — the endpoint can only ever suppress the actual recipient of that message, so there
// is no third-party griefing surface even though it runs unauthenticated (Gmail/Yahoo POST it, and
// the recipient clicks it, neither with a session).
//   POST  → RFC 8058 one-click from the mailbox provider: suppress + 200 OK, no page.
//   GET   → a human clicked the link: suppress + a small confirmation page.
//
// Deploy: supabase functions deploy unsubscribe --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<body style="font-family:system-ui,-apple-system,sans-serif;background:#0c0e13;color:#eef1f6;display:grid;place-items:center;min-height:100vh;margin:0">` +
    `<div style="text-align:center;max-width:30rem;padding:2rem"><h1 style="font-size:1.25rem;font-weight:650;margin:0 0 .6rem">${title}</h1>` +
    `<p style="color:#9aa0b0;line-height:1.5;margin:0">${body}</p></div>`,
    { status: 200, headers: { ...cors, 'content-type': 'text/html; charset=utf-8' } },
  );

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const ok = () => new Response('ok', { status: 200, headers: cors }); // RFC 8058: one-click always 200

  const messageId = new URL(req.url).searchParams.get('m') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) {
    // Never leak whether an id is valid — a bad/expired link still 200s for POST, shows a notice for GET.
    return req.method === 'POST' ? ok() : page('Unsubscribe', 'This link is invalid or has expired. If you keep receiving mail, reply with the word “unsubscribe”.');
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: msg } = await admin.from('outreach_messages')
    .select('owner_id, to_address, campaign_id').eq('id', messageId).maybeSingle();

  if (msg?.owner_id && msg.to_address) {
    const email = String(msg.to_address).toLowerCase(); // suppression keys are lowercased everywhere
    // Fail-closed on the important write: if suppression can't be written we still 200 the provider
    // (retries are theirs), but we surface the failure in the ledger rather than pretending success.
    const { error: supErr } = await admin.from('suppression').upsert(
      { owner_id: msg.owner_id, email, domain: null, reason: 'unsubscribe' }, // per-address; never the whole domain
      { onConflict: 'owner_id,email' },
    );
    await admin.from('contacts').update({ email_status: 'unsubscribed' }).eq('owner_id', msg.owner_id).eq('email', email).then(() => {}, () => {});
    if (msg.campaign_id) {
      await admin.from('outreach_campaigns').update({ state: 'unsubscribed', sequence_stopped: true }).eq('id', msg.campaign_id).then(() => {}, () => {});
    }
    await admin.from('execution_runs').insert({
      owner_id: msg.owner_id, connector: 'resend', action: 'list_unsubscribe',
      request: { message_id: messageId }, response: { email }, status: supErr ? 'failed' : 'ok', error: supErr?.message ?? null,
    }).then(() => {}, () => {});
    await admin.from('mind_events').insert({
      owner_id: msg.owner_id, event_type: 'note', source: 'outreach',
      subject: `Unsubscribed: ${email}`, payload: { email, via: 'list-unsubscribe' },
    }).then(() => {}, () => {});
  }

  return req.method === 'POST'
    ? ok()
    : page('You’re unsubscribed', 'You won’t receive any more emails from this sender. You can close this tab.');
});
