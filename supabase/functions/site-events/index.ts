// supabase/functions/site-events/index.ts
// G5 INSTRUMENTATION INGEST — the endpoint generated websites report to. Deployed with
// --no-verify-jwt because visitors' browsers have no Garvis session; auth is the site channel
// token (an unguessable uuid the build brief embeds in the site's code). Security model:
//   * WRITE-ONLY: a token can insert events/leads for ITS world only — it can never read.
//   * The token maps to (owner_id, world_id) server-side; the caller cannot choose either.
//   * Size caps on every field; email validated; one event per request; revoked tokens 403.
//   * Anyone who views the site source can see the token — same exposure as any public form
//     endpoint. The blast radius is capped at "can submit events/leads", which is exactly what
//     a public form already allows. Revoke + re-mint via site_channels.revoked_at.
// A 'lead' with a valid email also links-or-creates a contact (select-first-insert; an EXISTING
// contact is never modified — email_status, including 'unsubscribed', is sacred) and drops a
// mind_event so the world's waking moment surfaces "a lead came in — answer while it's warm".
//
// Deploy: npx supabase functions deploy site-events --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KINDS = new Set(['visit', 'lead', 'click', 'qr']);
const cap = (v: unknown, n: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, n) : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string; kind?: string; path?: string; source?: string;
      lead?: { name?: string; email?: string; phone?: string; message?: string };
    };
    const token = cap(body.token, 64);
    const kind = (body.kind ?? '').trim();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Bad token.' }, 401);
    if (!KINDS.has(kind)) return json({ error: 'kind must be visit|lead|click|qr.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: channel } = await admin.from('site_channels')
      .select('id, owner_id, world_id, revoked_at').eq('id', token).maybeSingle();
    if (!channel || channel.revoked_at) return json({ error: 'Unknown or revoked token.' }, 403);

    const ownerId = channel.owner_id as string;
    const worldId = channel.world_id as string;

    // RATE LIMIT (deep scan P1): the token is visible in the public site source, so cap the burst —
    // otherwise anyone could flood site_events and, for leads, drive unbounded contact creation and
    // owner webhook spam. Count this channel's recent rows; over the cap, refuse. Fail-open on a
    // count error so a metrics hiccup never blocks a real visitor.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent, error: rlErr } = await admin.from('site_events')
      .select('id', { count: 'exact', head: true }).eq('channel_id', channel.id).gte('created_at', since);
    if (!rlErr && (recent ?? 0) >= 60) return json({ error: 'Too many events — slow down.' }, 429);
    if (kind === 'lead' && !rlErr) {
      const { count: recentLeads } = await admin.from('site_events')
        .select('id', { count: 'exact', head: true }).eq('channel_id', channel.id).eq('kind', 'lead').gte('created_at', since);
      if ((recentLeads ?? 0) >= 10) return json({ error: 'Too many submissions — try again shortly.' }, 429);
    }

    const path = cap(body.path, 300);
    const source = cap(body.source, 60);

    // The raw event row — the honest fact that something happened.
    const { error: evErr } = await admin.from('site_events').insert({
      channel_id: channel.id, owner_id: ownerId, world_id: worldId,
      kind, path, source,
      payload: body.lead ? { has_lead: true } : {},
    });
    if (evErr) return json({ error: 'Could not record the event.' }, 500);

    // Leads: validate, store, link-or-create the contact (never modify an existing one).
    if (kind === 'lead') {
      const email = (cap(body.lead?.email, 200) ?? '').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ ok: true, lead: false, reason: 'invalid_email' });
      }
      const name = cap(body.lead?.name, 200);
      const phone = cap(body.lead?.phone, 60);
      const message = cap(body.lead?.message, 2000);

      let contactId: string | null = null;
      const { data: existing } = await admin.from('contacts')
        .select('id').eq('owner_id', ownerId).eq('email', email).maybeSingle();
      if (existing) {
        contactId = existing.id as string;      // linked as-is; status untouched (suppression sacred)
      } else {
        const { data: c } = await admin.from('contacts')
          .insert({ owner_id: ownerId, email, full_name: name, email_status: 'unknown', is_primary: false })
          .select('id').maybeSingle();
        contactId = (c?.id as string | undefined) ?? null;
      }

      const { data: leadRow, error: leadErr } = await admin.from('leads').insert({
        owner_id: ownerId, world_id: worldId, channel_id: channel.id, contact_id: contactId,
        name, email, phone, message,
        source: source === 'postcard' ? 'postcard-qr' : (source ?? 'website'),
      }).select('id').single();
      if (leadErr || !leadRow) return json({ error: 'Could not record the lead.' }, 500);

      // The waking moment's signal: a warm human raised their hand.
      await admin.from('mind_events').insert({
        owner_id: ownerId, event_type: 'note', source: 'site',
        subject: `Lead from the website: ${name || email}${source ? ` (via ${source})` : ''}`,
        payload: { world_id: worldId, kind: 'lead', email_domain: email.split('@')[1] ?? '' },
      });

      // SPEED-TO-LEAD: the instant first touch (standing rule, opt-in, app_0044). Answering
      // within minutes is the highest-evidence conversion lever there is — and the send STILL
      // flows through the one send path with every gate re-verified (suppression fail-closed,
      // kill switch, daily cap, double-send CAS). Runs before the owner ping so the ping can say
      // whether the lead was already answered.
      const touched = await maybeInstantFirstTouch(admin, ownerId, { id: leadRow.id as string, email, name }, contactId);

      // Reach the owner even when they're not in the app — a lead is the highest-value inbound
      // event; it must never land silently (fire-and-forget, never blocks the response).
      try {
        const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', ownerId).single();
        await notifyText(
          (owner as { webhook_url?: string } | null)?.webhook_url,
          `🌱 NEW LEAD — ${name || email}${source ? ` (via ${source})` : ''}\n` +
          `${email}${phone ? ` · ${phone}` : ''}\n` +
          (message ? `"${message.slice(0, 300)}"\n` : '') +
          (touched ? '⚡ Answered instantly with your first-touch template — the thread is warm for your personal follow-up.' : ''),
        );
      } catch { /* notification is best-effort */ }

      return json({ ok: true, lead: true, first_touch: touched });
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// SPEED-TO-LEAD — the instant first touch (Garvis's first STANDING RULE).
// ---------------------------------------------------------------------------
// The owner pre-authorizes exactly ONE narrow action class: a template acknowledgment to a
// brand-new inbound lead, in their own words ({{first_name}}/{{business}} fills — no AI invention
// at 11pm). The send is a normal approvals row (requested_by 'garvis-auto', decided_via
// 'standing_rule') executed through THE ONE SEND PATH (send-email, x-worker-secret entry), so
// every gate re-runs server-side: fail-closed suppression, kill switch, CAN-SPAM address, daily
// cap + warmup, double-send CAS — and the ledger + mind_event land like any human-clicked send.
// Fail-soft by design: any miss (feature off, no secret, active thread, gate block) returns false
// and the lead flow continues untouched.

const DEFAULT_FT_SUBJECT = 'Got your message — I’ll reply personally shortly';
const DEFAULT_FT_BODY =
  `Hi {{first_name}},\n\nThanks for reaching out to {{business}} — your message just landed and I wanted you to hear back right away.\n\nI’ll read it properly and reply personally within a few hours. If it’s time-sensitive, just reply to this email and it goes straight to me.\n\nTalk soon`;

// deno-lint-ignore no-explicit-any
async function maybeInstantFirstTouch(admin: any, ownerId: string, lead: { id: string; email: string; name: string | null }, contactId: string | null): Promise<boolean> {
  try {
    const workerSecret = Deno.env.get('WORKER_SECRET');
    if (!workerSecret || !contactId) return false;

    // The standing rule + the same floor every send needs (send-email re-verifies all of it).
    const { data: s } = await admin.from('outreach_settings')
      .select('auto_first_touch, outbound_enabled, from_email, physical_address, company_name, from_name, first_touch_subject, first_touch_body')
      .eq('owner_id', ownerId).maybeSingle();
    if (!s?.auto_first_touch || !s.outbound_enabled || !s.from_email || !s.physical_address?.trim()) return false;

    // Never barge into an active conversation: any message SENT to this contact in the last
    // 7 days means a human thread exists — stay out of it.
    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { count: recent } = await admin.from('outreach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).eq('contact_id', contactId).eq('status', 'sent').gte('sent_at', since);
    if ((recent ?? 0) > 0) return false;

    // The owner's template, filled deterministically — never generated.
    const first = (lead.name ?? '').trim().split(/\s+/)[0] || 'there';
    const biz = (s.company_name ?? '').trim() || (s.from_name ?? '').trim() || 'us';
    const fill = (t: string) => t.replaceAll('{{first_name}}', first).replaceAll('{{business}}', biz);
    const subject = fill((s.first_touch_subject ?? '').trim() || DEFAULT_FT_SUBJECT).slice(0, 200);
    const bodyText = fill((s.first_touch_body ?? '').trim() || DEFAULT_FT_BODY).slice(0, 4000);

    // campaign → message → standing-rule approval (the normal spine rows, honestly labeled).
    const { data: camp } = await admin.from('outreach_campaigns').insert({
      owner_id: ownerId, contact_id: contactId, kind: 'auto_first_touch', state: 'pending_approval',
    }).select('id').single();
    if (!camp) return false;
    const { data: msg } = await admin.from('outreach_messages').insert({
      owner_id: ownerId, campaign_id: camp.id, contact_id: contactId,
      sequence_step: 0, subject, body_text: bodyText, to_address: lead.email, status: 'draft',
    }).select('id').single();
    if (!msg) return false;
    const { data: approval } = await admin.from('approvals').insert({
      owner_id: ownerId, kind: 'send_email', status: 'approved',
      requested_by: 'garvis-auto', decided_via: 'standing_rule',
      decided_at: new Date().toISOString(),
      title: `Instant first touch → ${lead.email}`,
      preview: `${subject}\n\n${bodyText.slice(0, 400)}`,
      payload: { message_id: msg.id, standing_rule: 'auto_first_touch', lead_id: lead.id },
    }).select('id').single();
    if (!approval) return false;

    // THE ONE SEND PATH — every gate re-runs there; a block is an honest skipped ledger row.
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': workerSecret,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ approval_id: approval.id }),
    });
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!out?.ok) return false;

    // Stamp the fact on the lead — "answered instantly" is a real timestamp, never a guess.
    await admin.from('leads').update({ first_touch_at: new Date().toISOString() }).eq('id', lead.id);
    return true;
  } catch {
    return false; // the first touch must never break lead capture
  }
}
