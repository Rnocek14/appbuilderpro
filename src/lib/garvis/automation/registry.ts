// src/lib/garvis/automation/registry.ts
// THE CAPABILITY REGISTRY — the honesty backbone of automation detection.
//
// Detection may NOTICE anything about a business (open detection), but it may only PROPOSE an
// automation that resolves to an entry here whose status is not 'not_built' (bounded execution).
// Every deliverable entry maps to a rail that ACTUALLY exists in this codebase; a capability we can
// see the need for but can't yet deliver is documented with status 'not_built' so it is surfaced as
// a roadmap GAP and NEVER proposed. This is what stops the system over-promising — the same
// discipline as siteAudit's "no faked scores." Pure data + pure helpers (verified by detect.verify.ts).

import type { Vertical } from '../verticals';

export type Rail =
  | 'send-email' | 'outreach-followups' | 'outreach-reactivate' | 'invoice-chase'
  | 'social-publish' | 'docusign-send' | 'standing-worker';

export type ConsentBasis = 'warm_transactional' | 'cold_prospecting';
export type CapabilityStatus = 'ga' | 'beta' | 'not_built';
export type TriggerKind = 'event' | 'date' | 'interval' | 'manual';

// The signal taxonomy: the kinds of thing a scrape can OBSERVE about how a business still works by hand.
export type SignalKind = 'manual_process' | 'platform' | 'stack';

export interface Capability {
  id: string;                    // stable id, e.g. 'lead_followup'
  title: string;                 // owner-facing name
  pitch: string;                 // one honest line: what it does for them
  rail: Rail;
  triggerKinds: TriggerKind[];
  consentBasis: ConsentBasis;    // warm (client's own list) vs cold (prospecting)
  matchesSignals: string[];      // signal ids that propose this capability
  verticals: (Vertical | 'any')[];
  monthlyPrice: string;          // honest range
  complianceNote?: string;       // the guardrail that must ride with it
  status: CapabilityStatus;      // 'not_built' is documented but NEVER proposed
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'lead_followup',
    title: 'Lead follow-up & intake',
    pitch: 'Auto-acknowledge every enquiry and follow up the ones that go quiet, so no lead is dropped.',
    rail: 'outreach-followups',
    triggerKinds: ['event'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:manual_intake', 'manual_process:phone_only_booking'],
    verticals: ['any'],
    monthlyPrice: '$300–600/mo',
    complianceNote: 'Sends only to people who contacted the business — approval-gated, suppression-respected.',
    status: 'ga',
  },
  {
    id: 'review_request',
    title: 'Review requests after a job',
    pitch: 'Ask happy customers for a review right after the work is done.',
    rail: 'send-email',
    triggerKinds: ['event'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:no_review_ask'],
    verticals: ['any'],
    monthlyPrice: '$200–500/mo',
    complianceNote: 'Email-first (no SMS). Never gate or filter reviews (FTC).',
    status: 'ga',
  },
  {
    id: 'invoice_chase',
    title: 'Invoice chasing',
    pitch: 'Politely chase unpaid invoices on a schedule so you get paid faster.',
    rail: 'invoice-chase',
    triggerKinds: ['interval'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:manual_invoicing'],
    verticals: ['home_services', 'services', 'health', 'events', 'generic'],
    monthlyPrice: '$300–600/mo',
    status: 'ga',
  },
  {
    id: 'reactivation',
    title: 'Dormant-customer reactivation',
    pitch: 'Win back past customers who have gone quiet.',
    rail: 'outreach-reactivate',
    triggerKinds: ['interval'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:no_reactivation'],
    verticals: ['any'],
    monthlyPrice: '$200–500/mo',
    complianceNote: 'Only the client’s own past customers; suppression sacred.',
    status: 'ga',
  },
  {
    id: 'seasonal_maintenance',
    title: 'Seasonal maintenance reminders',
    pitch: 'Remind customers when it’s time for their seasonal service (tune-up, inspection).',
    rail: 'standing-worker',
    triggerKinds: ['date', 'interval'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:no_recurring_maintenance'],
    verticals: ['home_services'],
    monthlyPrice: '$300–500/mo',
    status: 'beta',
  },
  {
    id: 'hygiene_recall',
    title: '6-month recall reminders',
    pitch: 'Bring patients back on schedule for their routine visit.',
    rail: 'standing-worker',
    triggerKinds: ['interval'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:no_recurring_maintenance'],
    verticals: ['health'],
    monthlyPrice: '$400–800/mo',
    complianceNote: 'Health context — keep copy HIPAA-aware; human approval stays on.',
    status: 'beta',
  },
  // ---- Documented but NOT deliverable yet → surfaced as a roadmap GAP, never proposed. ----
  {
    id: 'online_booking',
    title: 'Self-serve online booking',
    pitch: 'Let customers book themselves instead of playing phone tag.',
    rail: 'standing-worker',
    triggerKinds: ['event'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['platform:no_online_booking', 'manual_process:phone_only_booking'],
    verticals: ['health', 'home_services', 'events', 'food', 'services'],
    monthlyPrice: '$300–500/mo',
    status: 'not_built',
  },
  {
    id: 'missed_call_text_back',
    title: 'Missed-call text-back',
    pitch: 'Text callers you miss so the lead doesn’t evaporate.',
    rail: 'send-email',            // the real channel is SMS, which does not exist in this codebase yet
    triggerKinds: ['event'],
    consentBasis: 'warm_transactional',
    matchesSignals: ['manual_process:phone_only_booking'],
    verticals: ['home_services', 'health', 'services'],
    monthlyPrice: '$200–400/mo',
    complianceNote: 'SMS requires TCPA consent + a sending stack that does not exist yet.',
    status: 'not_built',
  },
];

/** A capability is deliverable (and therefore proposable) only when it is not 'not_built'. */
export function isDeliverable(c: Capability): boolean {
  return c.status !== 'not_built';
}

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

/** Capabilities whose signal-match + vertical apply, split by whether we can actually deliver them. */
export function capabilitiesForSignal(signalId: string, vertical: Vertical | null): Capability[] {
  return CAPABILITIES.filter((c) =>
    c.matchesSignals.includes(signalId) &&
    (c.verticals.includes('any') || (vertical != null && c.verticals.includes(vertical))),
  );
}
