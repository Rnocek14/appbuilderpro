// supabase/functions/stripe-webhook/index.ts
// Stripe webhook receiver. Deploy with JWT verification OFF (Stripe has no Supabase JWT):
//   npx supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Rules encoded: raw body BEFORE parsing; constructEventAsync (sync version fails in edge
// runtime); event-id idempotency; webhooks are triggers only — state re-fetched via
// syncSubscription; respond 2xx fast.

import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { stripeClient, syncSubscription } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const body = await req.text(); // RAW body first — parsing breaks the signature
  const sig = req.headers.get('stripe-signature') ?? '';
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, cryptoProvider,
    );
  } catch (e) {
    return new Response(`Bad signature: ${e instanceof Error ? e.message : e}`, { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Idempotency: a redelivered event id is a no-op (still 2xx so Stripe stops retrying).
  const { error: dupErr } = await admin.from('stripe_events').insert({ id: event.id });
  if (dupErr) {
    if (dupErr.code === '23505') return new Response('already processed', { status: 200 });
    return new Response('event store failed', { status: 500 }); // let Stripe retry
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
        if (session.mode === 'payment' && paid) {
          // Credit top-up: grant once (event idempotency above protects against replays).
          const userId = session.metadata?.user_id ?? session.client_reference_id;
          const credits = Number(session.metadata?.credits ?? 0);
          if (userId && credits > 0) {
            // Atomic increment (deep scan): the old read-modify-write could interleave with a
            // concurrent grant and lose credits. grant_credits does it in one UPDATE.
            await admin.rpc('grant_credits', { p_user: userId, p_credits: credits });
            await admin.from('usage_events').insert({
              user_id: userId, event_type: 'credit_topup', provider: 'stripe',
              model: null, input_tokens: 0, output_tokens: 0, cost_usd: 0,
            }).then(() => undefined, () => undefined); // ledger note, best-effort
          }
        }
        if (session.mode === 'subscription' && typeof session.customer === 'string') {
          await syncSubscription(stripe, admin, session.customer);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        if (typeof sub.customer === 'string') await syncSubscription(stripe, admin, sub.customer);
        break;
      }
      case 'invoice.paid': {
        // Renewal — plan stays fresh; monthly credit grants roll from the plan in credits.ts.
        const invoice = event.data.object as Stripe.Invoice;
        const customer = invoice.customer;
        if (typeof customer === 'string') await syncSubscription(stripe, admin, customer);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (typeof invoice.customer === 'string') await syncSubscription(stripe, admin, invoice.customer);
        break;
      }
      default:
        break; // unhandled event types are fine
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Processing failed — remove the idempotency marker so Stripe's retry can reprocess.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return new Response(`processing failed: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
