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
import { notifyText } from '../_shared/notify.ts';
import { saleActionOnPaid } from '../../../src/lib/garvis/billing/clientSale.ts';
import { publishedHtmlPath } from '../../../src/lib/preview/publishCore.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** A CLIENT paying the OPERATOR for their website (Payment Link, client_reference_id = our
 *  client_subscriptions id). Returns true when the session WAS a client sale (so the caller skips the
 *  FableForge SaaS branches below — critical, since a $/mo client sale is mode:'subscription' and
 *  would otherwise be mis-handled as the operator's own Pro plan). Marks the sale active and, when the
 *  demo can be published without a browser, auto-publishes it — honestly: it never claims a site is
 *  live that it couldn't publish. */
// deno-lint-ignore no-explicit-any
async function handleClientSale(admin: any, session: Stripe.Checkout.Session): Promise<boolean> {
  const ref = session.client_reference_id;
  // Guard the uuid column: a non-uuid ref (a FableForge session may carry none, or a non-uuid) must
  // NOT reach .eq('id', …) — that throws "invalid input syntax for uuid", 500s the webhook, and makes
  // Stripe retry forever. A non-uuid ref is definitively not one of our sales → let FableForge handle it.
  if (!ref || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return false;
  const { data: sub, error: lookupErr } = await admin.from('client_subscriptions')
    .select('id, owner_id, business_name, tier, preview_site_id, status').eq('id', ref).maybeSingle();
  // A REAL lookup error (transient DB fault) must retry — throw so the outer catch 500s and Stripe
  // redelivers. Only a clean "no row" (error null, sub null) falls through to the FableForge branches.
  if (lookupErr) throw new Error(`client sale lookup failed: ${lookupErr.message}`);
  if (!sub) return false;

  await admin.from('client_subscriptions')
    .update({ status: 'active', activated_at: new Date().toISOString() }).eq('id', sub.id);

  const ownerId = sub.owner_id as string;
  const previewId = sub.preview_site_id as string | null;
  let liveUrl: string | null = null;
  let outcome = 'recorded';

  if (previewId) {
    const { data: prev } = await admin.from('preview_sites')
      .select('id, live_url, status').eq('id', previewId).maybeSingle();
    liveUrl = (prev?.live_url as string | null) ?? null;
    // Mark the demo SOLD (never downgraded from here on).
    await admin.from('preview_sites').update({ status: 'purchased', updated_at: new Date().toISOString() }).eq('id', previewId);

    const alreadyLive = !!liveUrl;
    // Is a rendered index.html stashed? (Then we can publish with no browser.)
    const { data: files } = await admin.storage.from('project-assets')
      .list(`${ownerId}/published`, { search: `${previewId}.html`, limit: 1 });
    const hasStashedHtml = Array.isArray(files) && files.some((f: { name?: string }) => f.name === `${previewId}.html`);

    const action = saleActionOnPaid({ alreadyLive, hasStashedHtml });
    if (action === 'convert') { outcome = `already live at ${liveUrl}`; }
    else if (action === 'publish') {
      // Server-to-server publish (worker secret) — re-publishes the stashed html.
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-preview`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-worker-secret': Deno.env.get('WORKER_SECRET') ?? '',
            authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          },
          body: JSON.stringify({ previewSiteId: previewId }),
        });
        const body = await r.json().catch(() => ({}));
        if (r.ok && (body as { url?: string }).url) { liveUrl = (body as { url: string }).url; outcome = `auto-published → ${liveUrl}`; }
        else outcome = 'paid — click Go Live to publish';
      } catch { outcome = 'paid — click Go Live to publish'; }
    } else { outcome = 'paid — click Go Live to publish'; }   // 'notify'
  }

  // Tell the operator, in-app + webhook. This is a raised hand that paid — never let it land silently.
  await admin.from('mind_events').insert({
    owner_id: ownerId, source: 'execution', event_type: 'note',
    subject: `💰 SOLD — ${sub.business_name} bought ${sub.tier} (${outcome})`,
    payload: { kind: 'client_sale_paid', client_subscription_id: sub.id, preview_site_id: previewId, live_url: liveUrl },
  }).then(() => {}, () => {});
  const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', ownerId).maybeSingle();
  await notifyText(
    (owner as { webhook_url?: string } | null)?.webhook_url,
    `💰 SOLD — ${sub.business_name}\nPlan: ${sub.tier}\n${liveUrl ? `Live: ${liveUrl}` : outcome}`,
  );
  return true;
}

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
        // A CLIENT paying the operator (Payment Link) is intercepted FIRST — it must never fall through
        // to the FableForge SaaS branches (a $/mo client sale is mode:'subscription' and would corrupt
        // the operator's own plan). Only paid sessions convert a sale.
        if (paid && await handleClientSale(admin, session)) break;
        if (session.mode === 'payment' && paid) {
          // Credit top-up: grant once (event idempotency above protects against replays).
          const userId = session.metadata?.user_id ?? session.client_reference_id;
          const credits = Number(session.metadata?.credits ?? 0);
          if (userId && credits > 0) {
            // Atomic increment (deep scan): the old read-modify-write could interleave with a
            // concurrent grant and lose credits. grant_credits does it in one UPDATE. THROW on error
            // so the outer catch deletes the idempotency marker and returns 500 — otherwise a DB
            // fault would silently drop a PAID top-up while the event is marked processed (verify REG).
            const { error: grantErr } = await admin.rpc('grant_credits', { p_user: userId, p_credits: credits });
            if (grantErr) throw new Error(`grant_credits failed: ${grantErr.message}`);
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
