// supabase/functions/client-checkout/index.ts
// "MAKE IT MINE" — public, anon-callable (like claim-submit). A prospect on their demo picks a tier;
// we create a PENDING client_subscriptions row and hand back the operator's Stripe Payment Link with
// our sale id as client_reference_id (so stripe-webhook can find the row on payment) + their email
// prefilled. The owner is resolved server-side from preview_sites.user_id — never trusted from the
// client. Nothing charges here; Stripe's hosted page does that.
//
// Deploy: npx supabase functions deploy client-checkout

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeTier, tierTerms, buildPaymentUrl } from '../../../src/lib/garvis/billing/clientSale.ts';

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
    const { previewSiteId, tier: rawTier, email } = (await req.json().catch(() => ({}))) as
      { previewSiteId?: string; tier?: string; email?: string };
    if (!previewSiteId) return json({ error: 'previewSiteId is required.' }, 400);
    const tier = normalizeTier(rawTier);
    if (!tier) return json({ error: 'Pick a valid plan.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: site } = await admin.from('preview_sites')
      .select('id, user_id, business_name, profile_id').eq('id', previewSiteId).single();
    if (!site) return json({ error: 'Preview not found.' }, 404);
    const ownerId = (site as { user_id: string }).user_id;
    const businessName = (site as { business_name: string }).business_name;
    const terms = tierTerms(tier);

    // The operator must have configured the Payment Link for this tier. Honest: no link → not for sale
    // yet (never fabricate a checkout).
    const { data: settings } = await admin.from('agency_billing_settings')
      .select('website_payment_link, automation_payment_link').eq('owner_id', ownerId).maybeSingle();
    const link = (settings as Record<string, string | null> | null)?.[terms.linkField] ?? null;

    const cleanEmail = (email ?? '').trim().toLowerCase().slice(0, 200) || null;

    // Anon burst cap (fail-open): at most 5 pending sales per preview per minute.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: rlErr } = await admin.from('client_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).eq('preview_site_id', previewSiteId).eq('status', 'pending').gte('created_at', since);
    if (!rlErr && (count ?? 0) >= 5) return json({ error: 'Too many attempts — try again shortly.' }, 429);

    // Record the intent as a pending sale (the operator sees it in their Client Billing book).
    const { data: sub, error: subErr } = await admin.from('client_subscriptions').insert({
      owner_id: ownerId, business_name: businessName, email: cleanEmail,
      business_profile_id: (site as { profile_id?: string | null }).profile_id ?? null,
      preview_site_id: previewSiteId, tier, cadence: terms.cadence, price_cents: terms.defaultCents,
      status: 'pending', notes: 'Started checkout from the demo.',
    }).select('id').single();
    if (subErr || !sub) return json({ error: 'Could not start checkout.' }, 500);

    const url = buildPaymentUrl(link, (sub as { id: string }).id, cleanEmail);
    if (!url) {
      // No usable Payment Link configured — surface honestly instead of a dead button, and let the
      // operator know a real buyer is waiting.
      await admin.from('mind_events').insert({
        owner_id: ownerId, source: 'site', event_type: 'note',
        subject: `A demo visitor wanted to BUY ${businessName} (${terms.name}) but no payment link is set`,
        payload: { kind: 'checkout_no_link', preview_site_id: previewSiteId, tier, email: cleanEmail },
      }).then(() => {}, () => {});
      return json({ error: 'Checkout isn’t set up yet — the owner has been notified and will be in touch.' }, 503);
    }

    return json({ ok: true, url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
