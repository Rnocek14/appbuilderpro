// supabase/functions/resend-webhook/index.ts
// Delivery-status webhook from Resend (Svix-signed). Correlates events to outreach_messages by
// provider_message_id and: (a) advances message/campaign status, (b) adds bounces/complaints/unsubs
// to the owner's suppression list and marks the contact — so a bad address can never be emailed again.
// Ported from swift-prep-pros/resend-webhook.ts (Node crypto → Deno std).
//
// Deploy WITH JWT OFF (Resend can't send a Supabase JWT): supabase functions deploy resend-webhook --no-verify-jwt
// Secret: RESEND_WEBHOOK_SECRET (the whsec_… value from the Resend dashboard).

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, svix-id, svix-timestamp, svix-signature' };

const TYPE_MAP: Record<string, string> = {
  'email.sent': 'sent', 'email.delivered': 'delivered', 'email.opened': 'opened',
  'email.clicked': 'clicked', 'email.bounced': 'bounced', 'email.complained': 'complained',
  'email.delivery_delayed': 'delayed', 'email.failed': 'failed',
};
const SUPPRESS: Record<string, 'bounce' | 'complaint' | 'unsubscribe'> = {
  'email.bounced': 'bounce', 'email.complained': 'complaint',
};
const CONTACT_STATUS: Record<string, string> = { bounce: 'bounced', complaint: 'complained', unsubscribe: 'unsubscribed' };

// Svix signature: base64 HMAC-SHA256 of `${id}.${ts}.${body}` keyed by the base64-decoded secret
// (drop the `whsec_` prefix). Native Web Crypto — no remote import, works offline in `deno check`.
// Per the Svix spec: reject timestamps outside a ±5-minute window (replay protection) and compare
// signatures in constant time.
const SVIX_TOLERANCE_S = 300;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvix(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  try {
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SVIX_TOLERANCE_S) return false;
    const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    // svix-signature header: "v1,<sig> v1,<sig>"
    const sigs = header.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
    return sigs.some((s) => constantTimeEqual(s, expected));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return new Response('Webhook secret not configured', { status: 500, headers: cors });

  const id = req.headers.get('svix-id') ?? '';
  const ts = req.headers.get('svix-timestamp') ?? '';
  const sig = req.headers.get('svix-signature') ?? '';
  const body = await req.text();
  if (!id || !ts || !sig || !(await verifySvix(secret, id, ts, body, sig))) {
    return new Response('Invalid signature', { status: 401, headers: cors });
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string; id?: string; to?: string | string[] } };
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const type = TYPE_MAP[event.type ?? ''] ?? null;
  const resendId = event.data?.email_id ?? event.data?.id ?? null;
  const to = (Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to) ?? null;

  // Find the owning message (gives us owner_id + campaign_id for correct scoping).
  let ownerId: string | null = null;
  let campaignId: string | null = null;
  let messageId: string | null = null;
  if (resendId) {
    const { data: m } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id').eq('provider_message_id', resendId).maybeSingle();
    ownerId = m?.owner_id ?? null;
    campaignId = m?.campaign_id ?? null;
    messageId = m?.id ?? null;
  }

  // ENGAGEMENT (app_0081): delivered/opened/clicked land on the message row instead of being
  // discarded — "opened 3x but silent" becomes a visible follow-up signal.
  if (messageId && type === 'delivered') {
    await admin.from('outreach_messages').update({ delivered_at: event.created_at ?? new Date().toISOString() })
      .eq('id', messageId).is('delivered_at', null);
  }
  if (messageId && type === 'opened') {
    const now = event.created_at ?? new Date().toISOString();
    const { data: cur } = await admin.from('outreach_messages').select('opened_at, open_count').eq('id', messageId).maybeSingle();
    await admin.from('outreach_messages').update({
      opened_at: (cur as { opened_at?: string } | null)?.opened_at ?? now,
      open_count: ((cur as { open_count?: number } | null)?.open_count ?? 0) + 1,
    }).eq('id', messageId);
  }
  if (messageId && type === 'clicked') {
    await admin.from('outreach_messages').update({ clicked_at: event.created_at ?? new Date().toISOString() })
      .eq('id', messageId).is('clicked_at', null);
  }

  // Advance message/campaign status on terminal events.
  if (messageId && (type === 'bounced' || type === 'failed')) {
    await admin.from('outreach_messages').update({ status: 'bounced' }).eq('id', messageId);
    if (campaignId) await admin.from('outreach_campaigns').update({ state: 'bounced', sequence_stopped: true }).eq('id', campaignId);
  }

  // Suppression (bounce/complaint) — owner-scoped, so it only affects that operator's sending.
  const reason = SUPPRESS[event.type ?? ''];
  if (reason && to && ownerId) {
    const lower = to.toLowerCase();
    await admin.from('suppression').upsert(
      { owner_id: ownerId, email: lower, domain: null, reason }, // per-ADDRESS row; domain set only on explicit domain blocks
      { onConflict: 'owner_id,email' },
    );
    await admin.from('contacts').update({ email_status: CONTACT_STATUS[reason] }).eq('owner_id', ownerId).eq('email', lower);
    await admin.from('execution_runs').insert({
      owner_id: ownerId, connector: 'resend', action: 'webhook_suppress',
      request: { resend_id: resendId }, response: { email: lower, reason }, status: 'ok',
    });
  }

  return new Response('ok', { status: 200, headers: cors });
});
