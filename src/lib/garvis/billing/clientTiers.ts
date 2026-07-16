// src/lib/garvis/billing/clientTiers.ts
// The two offers the operator sells to local-business clients — and the pure money math. No I/O, so the
// pricing/MRR logic is fully testable (clientTiers.verify.ts). The Stripe side (Payment Links / prices)
// lives in the operator's Stripe account; this file only describes the offers and totals the book.

export type TierId = 'website' | 'website_automation';
export type Cadence = 'one_time' | 'monthly';

export interface ClientTier {
  id: TierId;
  name: string;
  blurb: string;
  priceHint: string;          // human label for the default ask
  cadence: Cadence;
  includes: string[];
}

export const CLIENT_TIERS: ClientTier[] = [
  {
    id: 'website',
    name: 'New Website',
    blurb: 'A rebuilt, modern, mobile-ready site — live and hosted.',
    priceHint: 'from $1,500 one-time',
    cadence: 'one_time',
    includes: [
      'Full rebuild from your real content + photos',
      'Mobile-ready, secure (HTTPS)',
      'Contact form + search-ready basics',
      'Hosting included',
    ],
  },
  {
    id: 'website_automation',
    name: 'Website + Automation',
    blurb: 'The new site, plus recurring automations that bring customers back — on autopilot.',
    priceHint: 'from $500/mo',
    cadence: 'monthly',
    includes: [
      'Everything in New Website',
      'Recall / seasonal reminders to your customers',
      'Review requests after each job',
      'Lead follow-up + win-back of past customers',
      'Every message approval-gated — nothing sends without your OK',
    ],
  },
];

export function tierById(id: string): ClientTier | undefined {
  return CLIENT_TIERS.find((t) => t.id === id);
}

export function formatUsd(cents: number): string {
  const dollars = Math.round(Number.isFinite(cents) ? cents : 0) / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: dollars % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export interface BillableSub { cadence: Cadence; price_cents: number; status: 'pending' | 'active' | 'canceled' }

/** Monthly recurring revenue (cents): only ACTIVE, MONTHLY subs count — one-time and pending/canceled
 *  never inflate MRR. This is the honest number, not billings. */
export function monthlyRevenueCents(subs: BillableSub[]): number {
  return subs.reduce((sum, s) => (s.status === 'active' && s.cadence === 'monthly' ? sum + (s.price_cents || 0) : sum), 0);
}

/** One-time revenue booked from ACTIVE one-time sales (cents). Reported separately from MRR. */
export function oneTimeRevenueCents(subs: BillableSub[]): number {
  return subs.reduce((sum, s) => (s.status === 'active' && s.cadence === 'one_time' ? sum + (s.price_cents || 0) : sum), 0);
}
