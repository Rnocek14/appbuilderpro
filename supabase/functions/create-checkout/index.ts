// supabase/functions/create-checkout/index.ts
// Starts a Stripe Checkout session: subscription (Pro) or one-time credit top-up.
// Deploy: npx supabase functions deploy create-checkout
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID (+ STRIPE_CREDITS_PRICE_ID for top-ups)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { stripeClient, ensureCustomer, PRO_PRICE_ID } from '../_shared/stripe.ts';

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

    const body = (await req.json().catch(() => ({}))) as { kind?: 'subscription' | 'credits'; returnUrl?: string };
    const kind = body.kind === 'credits' ? 'credits' : 'subscription';
    const origin = (body.returnUrl && /^https?:\/\//.test(body.returnUrl)) ? body.returnUrl : (req.headers.get('origin') ?? '');
    if (!origin) return json({ error: 'returnUrl is required.' }, 400);

    const stripe = stripeClient();
    if (!Deno.env.get('STRIPE_SECRET_KEY')) return json({ error: 'Stripe is not configured (STRIPE_SECRET_KEY).' }, 500);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const customer = await ensureCustomer(stripe, admin, user.id, user.email);

    const price = kind === 'credits' ? (Deno.env.get('STRIPE_CREDITS_PRICE_ID') ?? '') : PRO_PRICE_ID();
    if (!price) return json({ error: `Price is not configured (${kind === 'credits' ? 'STRIPE_CREDITS_PRICE_ID' : 'STRIPE_PRO_PRICE_ID'}).` }, 500);

    const session = await stripe.checkout.sessions.create({
      mode: kind === 'credits' ? 'payment' : 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing`,
      client_reference_id: user.id,
      metadata: { user_id: user.id, kind, ...(kind === 'credits' ? { credits: Deno.env.get('STRIPE_CREDITS_AMOUNT') ?? '1000' } : {}) },
      ...(kind === 'subscription' ? { subscription_data: { metadata: { user_id: user.id } } } : {}),
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
