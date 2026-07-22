// src/lib/garvis/automationStats.ts
// PURE core of the automation SALES PROOF (no I/O; verified by automationStats.verify.ts). The ROI
// stats that go next to the "add automations for $X/mo" offer to justify the price and close the sale.
//
// HONESTY RULE (the whole product's spine): these are INDUSTRY stats, labeled and sourced as such —
// never a fabricated "YOU are losing $X" about a specific prospect (we don't know their number). Framed
// as industry proof + a clear value prop, they're persuasive AND true. Each stat carries its source.
//
// Zero runtime imports — a leaf; keyed by the automation capability id (registry.ts).

export interface StatPoint { stat: string; note?: string }
export interface StatBlock { headline: string; points: StatPoint[]; source: string }

/** ROI proof per capability. Numbers are industry figures (2026 home-services data), shown as
 *  industry facts — see HONESTY RULE above. */
export const AUTOMATION_STATS: Record<string, StatBlock> = {
  missed_call_text_back: {
    headline: 'Every missed call is a job walking to a competitor.',
    points: [
      { stat: '30–40%', note: 'of calls go unanswered at peak season for the average home-service business' },
      { stat: '$3,000–$10,000', note: 'the job value behind a single missed call' },
      { stat: '$50k–$200k/yr', note: 'lost to missed calls alone, industry-wide' },
    ],
    source: '2026 home-services industry data',
  },
  lead_followup: {
    headline: 'The business that replies first usually wins the job.',
    points: [
      { stat: 'Minutes, not hours', note: 'responding fast multiplies the odds a lead books' },
      { stat: 'Every lead', note: 'gets an instant reply + a follow-up nudge — automatically' },
    ],
    source: 'Lead-response industry benchmarks',
  },
  review_request: {
    headline: 'Reviews are the #1 thing that turns a search into a call.',
    points: [
      { stat: '78%', note: 'of homeowners check reviews before hiring a contractor' },
      { stat: '3–5×', note: 'review growth within 90 days once requests are automated' },
    ],
    source: '2026 home-services industry data',
  },
  reactivation: {
    headline: 'Your past customers are the cheapest jobs you’ll ever book.',
    points: [
      { stat: '90+ days', note: 'a quick "we’d love to have you back" text to lapsed customers is one of the highest-ROI campaigns there is' },
      { stat: 'Your list', note: 'is a bigger asset than any ad — this puts it to work' },
    ],
    source: 'Re-engagement campaign benchmarks',
  },
  seasonal_maintenance: {
    headline: 'Turn one-time jobs into a recurring schedule.',
    points: [{ stat: 'On the clock', note: 'seasonal reminders bring lapsed customers back before they call someone else' }],
    source: 'Recurring-service industry data',
  },
  hygiene_recall: {
    headline: 'Bring people back before they drift.',
    points: [{ stat: 'Automatic', note: 'recall reminders keep the calendar full without you chasing anyone' }],
    source: 'Recall-program benchmarks',
  },
  invoice_chase: {
    headline: 'Get paid faster, without the awkward phone calls.',
    points: [{ stat: 'Hands-off', note: 'polite automated reminders shorten the time an invoice sits unpaid' }],
    source: 'Accounts-receivable benchmarks',
  },
};

/** The stat block for one capability, or null when we have no honest proof to show for it. */
export function statsFor(capabilityId: string): StatBlock | null {
  return AUTOMATION_STATS[capabilityId] ?? null;
}

/** Stat blocks for the automations actually being offered, in offer order, de-duped, skipping any
 *  capability we have no data for (never a blank/placeholder stat). */
export function offerStatsFor(capabilityIds: string[]): StatBlock[] {
  const seen = new Set<string>();
  const out: StatBlock[] = [];
  for (const id of capabilityIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const block = AUTOMATION_STATS[id];
    if (block) out.push(block);
  }
  return out;
}

/** A single headline proof line for a compact surface (e.g. the pitch email upsell) — the strongest
 *  stat for the lead automation being offered, with its source. Null when there's nothing to cite. */
export function leadProofLine(capabilityIds: string[]): { line: string; source: string } | null {
  const block = offerStatsFor(capabilityIds)[0];
  if (!block) return null;
  const p = block.points[0];
  return { line: p.note ? `${p.stat} — ${p.note}` : p.stat, source: block.source };
}
