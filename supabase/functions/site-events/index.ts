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
import { captureLead } from '../_shared/leadIntake.ts';

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

    // Leads: validate, then run THE ONE LEAD-CAPTURE RAIL (_shared/leadIntake.ts — contact
    // link-or-create with suppression sacred, lead row, mind_event, instant first touch through
    // the one send path). Shared with claim-submit so every intake endpoint has the same rail.
    if (kind === 'lead') {
      const email = (cap(body.lead?.email, 200) ?? '').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ ok: true, lead: false, reason: 'invalid_email' });
      }
      const name = cap(body.lead?.name, 200);
      const phone = cap(body.lead?.phone, 60);
      const message = cap(body.lead?.message, 2000);

      const { leadId, touched } = await captureLead(admin, {
        ownerId, worldId, channelId: channel.id, previewSiteId: null,
        name, email, phone, message,
        source: source === 'postcard' ? 'postcard-qr' : (source ?? 'website'),
        mindSubject: `Lead from the website: ${name || email}${source ? ` (via ${source})` : ''}`,
      });
      if (!leadId) return json({ error: 'Could not record the lead.' }, 500);

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
