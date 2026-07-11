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

      const { error: leadErr } = await admin.from('leads').insert({
        owner_id: ownerId, world_id: worldId, channel_id: channel.id, contact_id: contactId,
        name, email, phone, message,
        source: source === 'postcard' ? 'postcard-qr' : (source ?? 'website'),
      });
      if (leadErr) return json({ error: 'Could not record the lead.' }, 500);

      // The waking moment's signal: a warm human raised their hand.
      await admin.from('mind_events').insert({
        owner_id: ownerId, event_type: 'note', source: 'site',
        subject: `Lead from the website: ${name || email}${source ? ` (via ${source})` : ''}`,
        payload: { world_id: worldId, kind: 'lead', email_domain: email.split('@')[1] ?? '' },
      });
      return json({ ok: true, lead: true });
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
