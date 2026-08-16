// Run: npx tsx src/lib/garvis/stripeRoute.verify.ts
// Pins the money router: which branch a Stripe checkout session tries FIRST, and the webhook
// contract around it — the operator's invoice reconciles server-side, a settled bill is never
// chased, and a void invoice is never resurrected by a payment.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeCheckoutSession, isUuid } from './stripeRoute';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const U1 = '3f2b6a1e-9c4d-4e8f-a1b2-c3d4e5f60789';
const U2 = '00000000-0000-4000-8000-000000000001';
const facts = (over: Partial<Parameters<typeof routeCheckoutSession>[0]> = {}) =>
  ({ paid: true, invoiceId: null, clientReferenceId: null, ...over });

// THE ROUTING TABLE — every combination the plan named, plus the order pin.
{
  check('an unpaid session routes nowhere, even with invoice metadata',
    routeCheckoutSession(facts({ paid: false, invoiceId: U1 })) === 'ignore');
  check('metadata.invoice_id (uuid) routes to the invoice branch',
    routeCheckoutSession(facts({ invoiceId: U1 })) === 'invoice');
  check('a uuid client_reference_id routes to the client-sale branch',
    routeCheckoutSession(facts({ clientReferenceId: U1 })) === 'client_sale');
  check('BOTH present → the invoice wins (checked BEFORE client_reference_id)',
    routeCheckoutSession(facts({ invoiceId: U1, clientReferenceId: U2 })) === 'invoice');
  check('neither present → the FableForge SaaS branches',
    routeCheckoutSession(facts()) === 'saas');
  check('a non-uuid invoice_id is not an invoice — it falls to the ref',
    routeCheckoutSession(facts({ invoiceId: 'not-a-uuid', clientReferenceId: U1 })) === 'client_sale');
  check('a non-uuid ref is not a client sale — it falls to saas',
    routeCheckoutSession(facts({ invoiceId: 'INV-2026-001', clientReferenceId: 'user@example.com' })) === 'saas');
  check('the uuid guard is strict (the thing that keeps garbage off uuid columns)',
    isUuid(U1) && !isUuid('') && !isUuid(null) && !isUuid(`${U1} `) && !isUuid(U1.replace('-', '')));
  check('the routing is deterministic', routeCheckoutSession(facts({ invoiceId: U1 })) === routeCheckoutSession(facts({ invoiceId: U1 })));
}

// ---- the webhook honors the route (textual contract, workerParity-style) ----
const here = dirname(fileURLToPath(import.meta.url));
const webhook = readFileSync(join(here, '../../../supabase/functions/stripe-webhook/index.ts'), 'utf8');
{
  check('the webhook routes through the pure core, not ad-hoc ifs',
    webhook.includes("from '../_shared/stripeRouteCore.ts'") && webhook.includes('routeCheckoutSession({'));
  check('the invoice branch is tried BEFORE the client sale',
    webhook.indexOf("route === 'invoice' && await handleInvoicePaid") > 0
    && webhook.indexOf("route === 'invoice' && await handleInvoicePaid") < webhook.indexOf('await handleClientSale(admin, session)'));
  check('mark-paid is a CAS on draft/sent — a void invoice is never resurrected',
    webhook.includes(".in('status', ['draft', 'sent'])"));
  check('…and stamps HOW it was paid', webhook.includes("paid_via: 'stripe'"));
  check('a FRESH payment on a settled invoice is surfaced, never swallowed (double-charge alarm)',
    webhook.includes('another $') && webhook.includes('duplicate: true'));
  check('…while a manual-mark crossover reconciles provenance without a false alarm',
    webhook.includes('provenance reconciled') && webhook.includes("reconciled: true"));
  check('a CAS miss RE-READS the status before any VOID alarm (a raced mark-paid is not a void)',
    webhook.indexOf('const { data: recheck }') > 0
    && webhook.indexOf('const { data: recheck }') < webhook.indexOf('VOIDED ${inv.number}'));
  check('a settled bill never gets a final notice — pending chase approvals auto-reject',
    webhook.includes("decided_via: 'auto'") && webhook.includes('.contains(\'payload\', { invoice_id: invoiceId })'));
  check('the PAID record lands in the mind (same shape the manual path writes)',
    webhook.includes('PAID: ${inv.number} — ${inv.title}'));
  check('a payment against a VOIDED invoice is surfaced, never silently booked',
    webhook.includes('refund it or un-void the invoice'));
  check('a transient invoice lookup fault retries (throw → 500 → Stripe redelivers)',
    webhook.includes('invoice lookup failed'));
  check('the webhook FAILS CLOSED with no signing secret (empty-key HMAC is forgeable)',
    webhook.includes('refusing all events until it is') && !webhook.includes("STRIPE_WEBHOOK_SECRET') ?? ''"));
}

// ---- the link minter (invoice-payment-link) ----
const minter = readFileSync(join(here, '../../../supabase/functions/invoice-payment-link/index.ts'), 'utf8');
{
  check('the link carries the reconciliation key', minter.includes('metadata: { invoice_id: inv.id'));
  check('unconfigured Stripe names the setup step, never fakes a link',
    minter.includes('available: false') && minter.includes('STRIPE_SECRET_KEY'));
  check('the invoice lookup is owner-scoped', minter.includes(".eq('owner_id', ownerId).maybeSingle()"));
  check('a second press returns the SAME link — one live payment surface per bill',
    minter.includes('existing: true'));
  check('the link is single-use — it deactivates after one completed payment',
    minter.includes('completed_sessions: { limit: 1 }'));
  check('only a draft or sent invoice mints a link', minter.includes("['draft', 'sent'].includes(inv.status"));
}

// ---- the manual path survives (payment truth by hand stays possible) ----
const moneyRun = readFileSync(join(here, 'moneyRun.ts'), 'utf8');
{
  check('markInvoicePaid (your own confirmation) still exists', moneyRun.includes('export async function markInvoicePaid'));
  check('the hand-paste payment_url fallback still exists on create', moneyRun.includes('paymentUrl?: string | null'));
  check('the client seam degrades honestly when Stripe is unconfigured',
    moneyRun.includes('available: false') && moneyRun.includes('createPaymentLink'));
}

console.log(`\nstripeRoute.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} stripe route check(s) failed`);
