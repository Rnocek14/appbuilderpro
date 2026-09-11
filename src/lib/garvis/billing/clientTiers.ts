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
    // THE CARE PLAN — the monthly tier is deliberately the ZERO-TOUCH bundle: everything in it
    // runs on its own once set up (hosting, missed-call text-back, booking + reminders, the
    // instant reply to a new enquiry, the daily site watch). The "it drafts — you approve"
    // automations (review requests, reactivation, invoice chases) are an add-on the client
    // asks for, because each one puts a decision in front of the operator for every customer
    // touched. Selling the runs-rung bundle by default is what lets ten clients cost the
    // operator nothing after onboarding.
    id: 'website_automation',
    name: 'Website + Care Plan',
    blurb: 'The new site, kept running: hosting, missed-call text-back, online booking, and an instant reply to every enquiry — on autopilot.',
    priceHint: 'from $299/mo',
    cadence: 'monthly',
    includes: [
      'Everything in New Website, hosted and watched daily',
      'Missed-call text-back — a missed call gets a text in seconds',
      'Online booking page + appointment reminders',
      'Every website enquiry answered within a minute',
      'Add-on when you want it: review requests, win-back notes, invoice reminders (each approved by you first)',
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
