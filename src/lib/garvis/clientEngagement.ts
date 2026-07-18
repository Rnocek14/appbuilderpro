// src/lib/garvis/clientEngagement.ts
// Client engagements, pure core — the logic of "I operate this business FOR someone": what an
// engagement is, and the DETERMINISTIC intake checklist derived from the scope. The checklist is
// deliberately not a model call: what you need from a client to do marketing (brand assets,
// channel access) or paperwork (document samples, signer roster) is domain knowledge that should
// be identical every time, inspectable, and verified. Verified by clientEngagement.verify.ts.

export type EngagementStatus = 'prospect' | 'active' | 'paused' | 'ended';

export interface IntakeItem { item: string; received: boolean }

export interface ClientEngagement {
  id: string;
  owner_id: string;
  world_id: string | null;
  client_name: string;
  client_email: string | null;
  business: string;
  scope: string;
  status: EngagementStatus;
  intake: IntakeItem[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Deterministic intake checklist from the scope. Every engagement starts with the terms item;
 * scope keywords add their pillar's real prerequisites. Unknown scopes still get a workable
 * floor (terms + point of contact) rather than an empty list.
 */
export function intakeFor(scope: string): IntakeItem[] {
  const s = scope.toLowerCase();
  const items: string[] = [
    'Engagement terms confirmed (scope, fee, cadence)',
    'Point of contact + approval turnaround expectations',
  ];
  if (/(market|social|content|brand|ads|email|campaign|promo)/.test(s)) {
    items.push(
      'Brand assets (logo, colors, fonts)',
      'Photo/media library (or a shoot scheduled)',
      'Access or handles for every channel I will run',
      'Past marketing that worked / flopped (their read)',
    );
  }
  if (/(paper|document|contract|listing|docusign|sign|form|admin)/.test(s)) {
    items.push(
      'A sample of every recurring document',
      'The fields that vary per deal/client (the fill list)',
      'Signer roster (names, emails, roles)',
    );
  }
  if (/(site|web|landing|seo)/.test(s)) {
    items.push(
      'Domain access (or registrar contact)',
      'Site content: services, about, testimonials',
    );
  }
  if (/(lead|outreach|prospect|sales|crm)/.test(s)) {
    items.push(
      'Their existing contact/lead list (CSV)',
      'What a qualified lead means to them, in their words',
    );
  }
  return [...new Set(items)].map((item) => ({ item, received: false }));
}

/** The genesis intent for the CLIENT's world — framed as theirs, operated by you, so DNA
 *  synthesis describes their business rather than a venture of the operator's own. */
export function clientWorldIntent(clientName: string, business: string, scope: string): string {
  return `${business} — ${clientName}'s business, operated by me as their ${scope} provider. The company is theirs; my job is the ${scope}.`;
}

/** Honest progress line for an engagement card. */
export function engagementLine(e: Pick<ClientEngagement, 'status' | 'intake' | 'world_id'>): string {
  const got = e.intake.filter((i) => i.received).length;
  const intake = e.intake.length ? `intake ${got}/${e.intake.length}` : 'no intake items';
  const world = e.world_id ? 'world linked' : 'world not linked yet (approve the draft, then link it here)';
  return `${e.status} · ${intake} · ${world}`;
}
