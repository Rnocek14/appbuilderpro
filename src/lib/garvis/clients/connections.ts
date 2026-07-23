// src/lib/garvis/clients/connections.ts
// PURE core for the per-client connections checklist (no I/O; verified by connections.verify.ts).
// This is the "organize the connectors" brain: the connector catalog, what each AUTOMATION requires to
// run, how a client's connectors are SEEDED from the tier they bought, how a status is DERIVED from
// evidence in the connector's own table, and whether an automation is READY to turn on. The impure
// store (connectionsStore.ts) gathers evidence and calls these; the UI renders the result. Deno-safe
// (imported by no edge fn today, but keep it dependency-free) — a leaf module, zero runtime imports.

export type ConnectorId =
  | 'domain' | 'email_sender' | 'sms_number' | 'voice_number'
  | 'booking' | 'payments' | 'google_business' | 'calendar' | 'esign';

export type ConnectionStatus = 'needed' | 'pending' | 'connected' | 'error' | 'not_needed';

export interface ConnectorMeta {
  id: ConnectorId;
  title: string;
  what: string;                 // one-line operator-facing description
  built: boolean;               // false ⇒ the connector isn't wired yet; shown honestly as "coming soon"
  setupRoute: string | null;    // where the "Connect" button sends the operator (null ⇒ handled inline)
  setupLabel: string;           // the connect CTA label
}

// The full connector catalog. Order here is the checklist order. `built:false` entries are shown but
// never block an automation the client actually bought (they map to nothing required today).
export const CONNECTORS: ConnectorMeta[] = [
  { id: 'domain',          title: 'Domain',            what: 'their web address points at the live site',            built: true,  setupRoute: '/garvis/setup',        setupLabel: 'Set up domain' },
  { id: 'email_sender',    title: 'Email sender',      what: 'sends from their verified domain, not a shared one',     built: true,  setupRoute: '/garvis/email-domains', setupLabel: 'Verify domain' },
  { id: 'sms_number',      title: 'Text number',       what: 'reminders + replies come from their own number',       built: true,  setupRoute: null,                   setupLabel: 'Add their number' },
  { id: 'voice_number',    title: 'Missed-call line',  what: 'a missed call auto-texts the caller back',             built: true,  setupRoute: '/garvis/missed-call',  setupLabel: 'Set up line' },
  { id: 'booking',         title: 'Online booking',    what: 'customers self-book from the site',                    built: true,  setupRoute: '/garvis/booking',      setupLabel: 'Set up booking' },
  { id: 'payments',        title: 'Payments',          what: 'their recurring plan is billing on Stripe',            built: true,  setupRoute: '/garvis/client-billing', setupLabel: 'Send payment link' },
  { id: 'google_business', title: 'Google Business',   what: 'manage reviews + posts on their listing',             built: false, setupRoute: null,                   setupLabel: 'Coming soon' },
  { id: 'calendar',        title: 'Calendar sync',     what: 'bookings land on their real calendar',                built: false, setupRoute: null,                   setupLabel: 'Coming soon' },
  { id: 'esign',           title: 'E-signatures',      what: 'contracts signed under their identity',               built: false, setupRoute: null,                   setupLabel: 'Coming soon' },
];

export const CONNECTOR_META: Record<ConnectorId, ConnectorMeta> =
  Object.fromEntries(CONNECTORS.map((c) => [c.id, c])) as Record<ConnectorId, ConnectorMeta>;

/** The sender connector for a delivery channel: SMS rides their text number, everything else their
 *  email sender. The single place the email/SMS split is decided, so readiness and seeding agree. */
export function connectorForChannel(channel: 'email' | 'sms'): ConnectorId {
  return channel === 'sms' ? 'sms_number' : 'email_sender';
}

/** What an automation needs hooked up before it can run. Keyed by the capability registry id. Message
 *  automations depend on the delivery channel's sender; the two device automations depend on their
 *  hardware line. Unknown/not-yet-built capabilities need nothing (never block). */
export function requiredConnectors(capabilityId: string, channel: 'email' | 'sms' = 'email'): ConnectorId[] {
  if (capabilityId === 'missed_call_text_back') return ['voice_number'];
  if (capabilityId === 'online_booking') return ['booking'];
  // lead_followup / review_request / invoice_chase / reactivation / seasonal_maintenance / hygiene_recall
  // are all templated messages sent to the client's own warm list → the channel's sender.
  return [connectorForChannel(channel)];
}

// Which connectors a tier needs the operator to set up. The site tier needs a home + a voice; the
// automation tier adds the recurring-message + booking rails. Connectors NOT listed for a tier seed as
// 'not_needed' (visible but not nagged) — the operator flips one to 'needed' if that client will use it.
const TIER_NEEDS: Record<'website' | 'website_automation', ConnectorId[]> = {
  website: ['domain', 'email_sender', 'payments'],
  website_automation: ['domain', 'email_sender', 'payments', 'sms_number', 'voice_number', 'booking'],
};

export interface SeedRow { connector: ConnectorId; status: ConnectionStatus }

/** The connector rows to create when a client is won. Every connector gets a row (so the checklist is
 *  complete); the tier decides which start as 'needed' vs 'not_needed'. Deterministic, in catalog order.
 *  Never-built connectors are always 'not_needed' — we don't nag for something we can't deliver yet. */
export function seedForTier(tier: 'website' | 'website_automation'): SeedRow[] {
  const needs = new Set(TIER_NEEDS[tier] ?? TIER_NEEDS.website);
  return CONNECTORS.map((c) => ({
    connector: c.id,
    status: (c.built && needs.has(c.id) ? 'needed' : 'not_needed') as ConnectionStatus,
  }));
}

// ── status derivation (pure) ────────────────────────────────────────────────
// The impure store reads each connector's own table and reduces it to this small evidence shape; we turn
// it into a status without any I/O so the mapping is testable and identical everywhere.
export interface ConnectionEvidence {
  domain?: boolean;         // preview_sites.custom_domain present + live
  emailSender?: boolean;    // world_sender_identities.from_email set for the client's world
  smsNumber?: boolean;      // client_subscriptions.twilio_number set
  voiceNumber?: boolean;    // a missed_call_configs row exists for this client
  voiceEnabled?: boolean;   // …and it's enabled
  booking?: boolean;        // a booking_pages row exists for this client
  bookingEnabled?: boolean; // …and it's enabled
  payments?: boolean;       // client_subscriptions.stripe_subscription_id present (or status active)
}

/** Derive a connector's status from evidence, PRESERVING an operator's explicit 'not_needed'. We only
 *  ever move a row between 'needed' and 'connected' automatically: a human's "not needed" (or a manual
 *  'pending'/'error') is never overwritten by a refresh, so the checklist reflects their intent. */
export function deriveStatus(connector: ConnectorId, ev: ConnectionEvidence, current: ConnectionStatus): ConnectionStatus {
  if (current === 'not_needed' || current === 'pending' || current === 'error') return current;
  const connected =
    connector === 'domain' ? !!ev.domain :
    connector === 'email_sender' ? !!ev.emailSender :
    connector === 'sms_number' ? !!ev.smsNumber :
    connector === 'voice_number' ? !!(ev.voiceNumber && ev.voiceEnabled) :
    connector === 'booking' ? !!(ev.booking && ev.bookingEnabled) :
    connector === 'payments' ? !!ev.payments :
    false; // google_business / calendar / esign: not derivable yet
  return connected ? 'connected' : 'needed';
}

// ── readiness + rollup (pure) ───────────────────────────────────────────────
export interface Readiness { ready: boolean; missing: ConnectorId[] }

/** Is an automation ready to turn on for this client? Ready ⇔ every connector it requires is 'connected'.
 *  `byConnector` is the client's current status per connector. Missing lists the not-yet-connected ones,
 *  so the UI can say exactly what to hook up. A required connector with no row at all counts as missing. */
export function automationReady(
  capabilityId: string, channel: 'email' | 'sms', byConnector: Partial<Record<ConnectorId, ConnectionStatus>>,
): Readiness {
  const missing = requiredConnectors(capabilityId, channel).filter((c) => byConnector[c] !== 'connected');
  return { ready: missing.length === 0, missing };
}

export interface ConnectionRollup { connected: number; needed: number; total: number }

/** Header rollup: how many connectors are hooked up vs still needed. 'not_needed' rows are excluded from
 *  both counts (they're not part of this client's setup), so "3/4 connected" reads honestly. */
export function connectionRollup(rows: { connector: ConnectorId; status: ConnectionStatus }[]): ConnectionRollup {
  let connected = 0; let needed = 0;
  for (const r of rows) {
    if (r.status === 'connected') connected++;
    else if (r.status !== 'not_needed') needed++;   // needed / pending / error all count as "still to do"
  }
  return { connected, needed, total: connected + needed };
}
