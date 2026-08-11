// supabase/functions/claim-submit/index.ts
// The claim bell — AND the demo sites' lead rail. The public preview's "Claim this website" form
// and every generated/published client site's quote form post here (anon — the people filling
// them in aren't logged in). Two things happen, in order:
//   1. The publish_request lands in the operator's Claims lane and their webhook rings — a raised
//      hand is the conversion event and must never land silently. This part can never be lost to
//      anything downstream.
//   2. When the contact is an email, THE ONE LEAD-CAPTURE RAIL runs (_shared/leadIntake.ts — the
//      same rail site-events uses): contact link-or-create with suppression sacred, a real lead
//      row (world-less, attributed to the preview site), a mind_event for the waking moment, and
//      the opt-in instant first touch through the one send path — which is what makes "captured,
//      instantly acknowledged, chased when it goes quiet" TRUE on the sites the cold pitch sells,
//      not just on world-bound sites. The {{business}} fill is the SITE's business name, so a
//      client's customer is acknowledged in the client's voice. A phone-only contact still lands
//      as a publish_request + webhook — there is just no address to acknowledge.
//
// Deploy: npx supabase functions deploy claim-submit

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';
import { captureLead } from '../_shared/leadIntake.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { previewSiteId, name, contact, message } = (await req.json().catch(() => ({}))) as
      { previewSiteId?: string; name?: string; contact?: string; message?: string };
    if (!previewSiteId || !name?.trim() || !contact?.trim()) {
      return json({ error: 'previewSiteId, name, and contact are required.' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: site } = await admin.from('preview_sites')
      .select('id, slug, business_name, user_id').eq('id', previewSiteId).single();
    if (!site) return json({ error: 'Preview not found.' }, 404);

    // RATE LIMIT (deep scan P1): this is anon and rings the owner's webhook, so cap the burst per
    // preview — otherwise anyone with a preview id could flood publish_requests and spam the owner.
    // Fail-open on a count error so a real claim never gets blocked by a metrics hiccup.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent, error: rlErr } = await admin.from('publish_requests')
      .select('id', { count: 'exact', head: true }).eq('preview_site_id', previewSiteId).gte('created_at', since);
    if (!rlErr && (recent ?? 0) >= 5) return json({ error: 'Too many requests — try again shortly.' }, 429);

    const cleanName = name.trim().slice(0, 120);
    const cleanContact = contact.trim().slice(0, 200);
    const cleanMessage = (message ?? '').trim().slice(0, 2000);

    const { error: insErr } = await admin.from('publish_requests').insert({
      preview_site_id: previewSiteId,
      name: cleanName,
      contact: cleanContact,
      message: cleanMessage,
      status: 'new',
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // THE LEAD RAIL — same rail as site-events, world-less, attributed to this preview site.
    // Fail-soft: the claim above is already saved and the bell below still rings either way.
    const bizName = (site as { business_name: string }).business_name;
    let touched = false;
    let leadCaptured = false;
    if (EMAIL_RE.test(cleanContact)) {
      const { leadId, touched: t } = await captureLead(admin, {
        ownerId: (site as { user_id: string }).user_id,
        worldId: null, channelId: null, previewSiteId,
        name: cleanName, email: cleanContact, phone: null, message: cleanMessage || null,
        source: 'demo-site',
        businessName: bizName,
        mindSubject: `Lead from the demo site: ${cleanName} (${bizName})`,
      });
      leadCaptured = !!leadId;
      touched = t;
    }

    // Ring the bell — fire-and-forget, the claim is already saved.
    const { data: owner } = await admin.from('profiles')
      .select('webhook_url').eq('id', (site as { user_id: string }).user_id).single();
    const origin = req.headers.get('origin') ?? '';
    await notifyText(
      (owner as { webhook_url?: string } | null)?.webhook_url,
      `💰 CLAIM REQUEST — ${bizName}\n` +
      `From: ${cleanName} (${cleanContact})\n` +
      (cleanMessage ? `"${cleanMessage.slice(0, 400)}"\n` : '') +
      (touched ? '⚡ Answered instantly with your first-touch template — the thread is warm for your personal follow-up.\n' : '') +
      (origin ? `${origin}/preview-site/${(site as { slug: string }).slug}` : ''),
    );

    return json({ ok: true, lead: leadCaptured, first_touch: touched });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
