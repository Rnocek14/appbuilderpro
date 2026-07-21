// supabase/functions/customer-portal/index.ts
// Opens the Stripe customer portal (manage/cancel subscription, payment method, invoices).
// NOTE: a portal configuration must be saved in the Stripe Dashboard (sandbox AND live) first.
// Deploy: npx supabase functions deploy customer-portal

import { createClient } from 'npm:@supabase/supabase-js@2';
import { stripeClient, ensureCustomer } from '../_shared/stripe.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as { returnUrl?: string };
    // Same-origin only (scan B18): this mirrored create-checkout's open-redirect fix — any
    // http(s) URL used to be accepted, making the portal link an open-redirect primitive.
    const origin = req.headers.get('origin') ?? '';
    let returnUrl = origin;
    if (body.returnUrl) {
      try {
        const u = new URL(body.returnUrl);
        if (origin && u.origin === origin) returnUrl = body.returnUrl;
      } catch { /* malformed → fall back to the caller's origin */ }
    }
    if (!returnUrl) return json({ error: 'returnUrl is required.' }, 400);

    const stripe = stripeClient();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const customer = await ensureCustomer(stripe, admin, user.id, user.email);
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
