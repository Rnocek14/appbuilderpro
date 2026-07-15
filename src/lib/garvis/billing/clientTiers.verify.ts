// src/lib/garvis/billing/clientTiers.verify.ts — run: npx tsx src/lib/garvis/billing/clientTiers.verify.ts
// Proves the money math is honest: MRR counts only active monthly subs, one-time revenue is separate,
// and pending/canceled never inflate either.

import { monthlyRevenueCents, oneTimeRevenueCents, formatUsd, tierById, type BillableSub } from './clientTiers';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const subs: BillableSub[] = [
  { cadence: 'monthly', price_cents: 50000, status: 'active' },   // $500/mo — counts
  { cadence: 'monthly', price_cents: 90000, status: 'active' },   // $900/mo — counts
  { cadence: 'monthly', price_cents: 40000, status: 'pending' },  // not active — excluded
  { cadence: 'monthly', price_cents: 30000, status: 'canceled' }, // canceled — excluded
  { cadence: 'one_time', price_cents: 200000, status: 'active' }, // one-time — not MRR
];

ok('MRR counts only active monthly subs', monthlyRevenueCents(subs) === 140000);
ok('pending never inflates MRR', monthlyRevenueCents([{ cadence: 'monthly', price_cents: 99900, status: 'pending' }]) === 0);
ok('canceled never inflates MRR', monthlyRevenueCents([{ cadence: 'monthly', price_cents: 99900, status: 'canceled' }]) === 0);
ok('one-time revenue is tracked separately from MRR', oneTimeRevenueCents(subs) === 200000);
ok('one-time does not leak into MRR', monthlyRevenueCents([{ cadence: 'one_time', price_cents: 500000, status: 'active' }]) === 0);

ok('formatUsd whole dollars', formatUsd(50000) === '$500');
ok('formatUsd thousands separator', formatUsd(140000) === '$1,400');
ok('formatUsd cents when needed', formatUsd(49950) === '$499.50');

ok('tierById resolves a known tier', tierById('website_automation')?.cadence === 'monthly');
ok('tierById is undefined for junk', tierById('nope') === undefined);

console.log(`${fail === 0 ? '✓' : '✗'} clientTiers.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
