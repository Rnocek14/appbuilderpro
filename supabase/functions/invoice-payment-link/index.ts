// supabase/functions/invoice-payment-link/index.ts — SW7.1: one button turns an invoice into a
// Stripe Payment Link whose metadata carries OUR invoice id, so the webhook can mark it paid the
// moment the client pays — no UI touch, no guessing. Creating a link is a RECORD, not a send:
// nothing reaches the client until the invoice email goes out through the approval queue (the
// link simply rides in it as payment_url — the same field the hand-paste fallback fills).
//
// Honest degrade: without STRIPE_SECRET_KEY this returns { available: false } naming the setup
// step — never a fake link. Idempotent-ish: an invoice that already has a payment_url returns it
// unchanged (a second press must not mint a second live link).
// Deploy: supabase functions deploy invoice-payment-link

import { createClient } from 'npm:@supabase/supabase-js@2';
import { stripeClient } from '../_shared/stripe.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Operator-only: the signed-in owner mints links for their OWN invoices.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!bearer) return json({ error: 'Unauthorized' }, 401);
  const { data: u } = await admin.auth.getUser(bearer);
  if (!u.user) return json({ error: 'Unauthorized' }, 401);
  const ownerId = u.user.id;

  const body = (await req.json().catch(() => ({}))) as { invoice_id?: string };
  if (!body.invoice_id) return json({ error: 'invoice_id required' }, 400);

  if (!Deno.env.get('STRIPE_SECRET_KEY')) {
    return json({ available: false, error: 'Stripe isn\'t connected — set the STRIPE_SECRET_KEY secret (and STRIPE_WEBHOOK_SECRET for auto-reconciliation), then this button works.' });
  }

  const { data: inv, error: invErr } = await admin.from('invoices')
    .select('id, number, title, amount_usd, status, payment_url')
    .eq('id', body.invoice_id).eq('owner_id', ownerId).maybeSingle();
  if (invErr) return json({ error: invErr.message }, 500);
  if (!inv) return json({ error: 'Invoice not found.' }, 404);
  if (!['draft', 'sent'].includes(inv.status as string)) {
    return json({ error: `Only a draft or sent invoice needs a payment link — this one is ${inv.status}.` }, 400);
  }
  const amountCents = Math.round(Number(inv.amount_usd) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return json({ error: 'This invoice has no billable amount.' }, 400);
  }
  // A second press returns the SAME link — never a second live payment surface for one bill.
  if (inv.payment_url) return json({ ok: true, available: true, url: inv.payment_url, existing: true });

  try {
    const stripe = stripeClient();
    const price = await stripe.prices.create({
      currency: 'usd', unit_amount: amountCents,
      product_data: { name: `${inv.number} — ${String(inv.title).slice(0, 120)}` },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      // ONE bill, ONE payment: the link deactivates itself after a single completed session —
      // a reusable link invites silent double-charges (deep review 2026-08 #8).
      restrictions: { completed_sessions: { limit: 1 } },
      // THE RECONCILIATION KEY: Payment Link metadata is copied onto every Checkout Session it
      // spawns — stripe-webhook routes on metadata.invoice_id (stripeRouteCore) and marks THIS
      // invoice paid server-side.
      metadata: { invoice_id: inv.id as string },
    });
    const { error: upErr } = await admin.from('invoices')
      .update({ payment_url: link.url, updated_at: new Date().toISOString() })
      .eq('id', inv.id).eq('owner_id', ownerId);
    if (upErr) return json({ error: `The link was created but could not be saved: ${upErr.message}` }, 500);
    return json({ ok: true, available: true, url: link.url });
  } catch (e) {
    return json({ error: `Stripe refused the link: ${e instanceof Error ? e.message : 'unknown error'}` }, 502);
  }
});
