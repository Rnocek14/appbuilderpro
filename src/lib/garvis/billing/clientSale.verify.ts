// Run: npx tsx src/lib/garvis/billing/clientSale.verify.ts
import { normalizeTier, tierTerms, buildPaymentUrl, saleActionOnPaid } from './clientSale';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('clientSale.verify');

// --- normalizeTier: only the two real tiers -----------------------------------------------------
{
  check('website is accepted', normalizeTier('website') === 'website');
  check('website_automation is accepted', normalizeTier(' website_automation ') === 'website_automation');
  check('anything else → null', normalizeTier('premium') === null && normalizeTier('') === null && normalizeTier(null) === null);
}

// --- tierTerms: cadence + link column + a sane default price ------------------------------------
{
  const w = tierTerms('website');
  check('website is one-time via the website link', w.cadence === 'one_time' && w.linkField === 'website_payment_link' && w.defaultCents === 150000);
  const a = tierTerms('website_automation');
  check('automation is monthly via the automation link', a.cadence === 'monthly' && a.linkField === 'automation_payment_link' && a.defaultCents === 50000);
  check('names come from the shared tier catalog', w.name.length > 0 && a.name.length > 0);
}

// --- buildPaymentUrl: reference + email appended, only to a real Stripe link --------------------
{
  const u = buildPaymentUrl('https://buy.stripe.com/abc123', 'sub-9', 'joe@roof.com');
  check('reference id + prefilled email are appended', u === 'https://buy.stripe.com/abc123?client_reference_id=sub-9&prefilled_email=joe%40roof.com');
  check('an existing query uses & not ?', buildPaymentUrl('https://buy.stripe.com/abc?x=1', 'sub-9') === 'https://buy.stripe.com/abc?x=1&client_reference_id=sub-9');
  check('no email → no prefilled_email param', buildPaymentUrl('https://buy.stripe.com/abc', 'sub-9') === 'https://buy.stripe.com/abc?client_reference_id=sub-9');
  check('email is URL-encoded', (buildPaymentUrl('https://buy.stripe.com/x', 'r', 'a b+c@d.com') ?? '').includes('prefilled_email=a%20b%2Bc%40d.com'));
  check('a non-http link → null (never send to garbage)', buildPaymentUrl('javascript:alert(1)', 'r') === null && buildPaymentUrl('', 'r') === null && buildPaymentUrl(null, 'r') === null);
  check('a reference id with specials is encoded', (buildPaymentUrl('https://buy.stripe.com/x', 'a/b c') ?? '').includes('client_reference_id=a%2Fb%20c'));
}

// --- saleActionOnPaid: honest — never claims live when it couldn't publish ----------------------
{
  check('already live → just convert (record the sale)', saleActionOnPaid({ alreadyLive: true, hasStashedHtml: true }) === 'convert');
  check('not live but rendered → auto-publish', saleActionOnPaid({ alreadyLive: false, hasStashedHtml: true }) === 'publish');
  check('nothing rendered → notify the operator to Go Live', saleActionOnPaid({ alreadyLive: false, hasStashedHtml: false }) === 'notify');
  check('already live wins even with no stash', saleActionOnPaid({ alreadyLive: true, hasStashedHtml: false }) === 'convert');
}

console.log(`\nclientSale.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clientSale check(s) failed`);
