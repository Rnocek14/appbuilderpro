// supabase/functions/claim-submit/index.ts
// The claim bell. The public preview's "Claim this website" form posts here (anon — business
// owners aren't logged in). Inserts the publish_request server-side AND immediately notifies the
// agency owner's webhook — a raised hand is the conversion event and must never land silently.
//
// Deploy: npx supabase functions deploy claim-submit

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { error: insErr } = await admin.from('publish_requests').insert({
      preview_site_id: previewSiteId,
      name: name.trim().slice(0, 120),
      contact: contact.trim().slice(0, 200),
      message: (message ?? '').trim().slice(0, 2000),
      status: 'new',
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // Ring the bell — fire-and-forget, the claim is already saved.
    const { data: owner } = await admin.from('profiles')
      .select('webhook_url').eq('id', (site as { user_id: string }).user_id).single();
    const origin = req.headers.get('origin') ?? '';
    await notifyText(
      (owner as { webhook_url?: string } | null)?.webhook_url,
      `💰 CLAIM REQUEST — ${(site as { business_name: string }).business_name}\n` +
      `From: ${name.trim().slice(0, 120)} (${contact.trim().slice(0, 200)})\n` +
      ((message ?? '').trim() ? `"${(message ?? '').trim().slice(0, 400)}"\n` : '') +
      (origin ? `${origin}/preview-site/${(site as { slug: string }).slug}` : ''),
    );

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
