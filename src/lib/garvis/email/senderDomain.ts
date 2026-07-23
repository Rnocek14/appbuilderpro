// src/lib/garvis/email/senderDomain.ts
// PURE core for per-brand sending domains (no I/O; verified by senderDomain.verify.ts). The edge fn
// (sender-domain) talks to Resend; this is the deterministic half both it and the UI share: normalize a
// domain, parse the provider's domain payload into our shape, map the provider status to a connection
// state, summarize the DNS records for display, and build the from-address. Deno-safe (imported by the
// edge fn) — the only import is the pure domain normalizer.

export type DomainStatus = 'not_started' | 'pending' | 'verified' | 'failure' | 'temporary_failure';
export type DomainConnState = 'connected' | 'pending' | 'error';

export interface DnsRecord {
  record?: string;              // provider label, e.g. 'SPF' | 'DKIM' | 'DMARC'
  name: string;                 // host/name to add
  type: string;                 // 'TXT' | 'MX' | 'CNAME'
  value: string;                // the value to set
  ttl?: string | number;
  status?: string;              // per-record verification status
  priority?: number;            // MX priority
}

export interface ParsedDomain {
  providerDomainId: string | null;
  status: DomainStatus;
  records: DnsRecord[];
}

const STATUSES: DomainStatus[] = ['not_started', 'pending', 'verified', 'failure', 'temporary_failure'];

/** Normalize a sending domain to a bare host (scheme/path/port stripped, lowercased). Null when it isn't
 *  a real domain, so the caller refuses it instead of registering garbage. Kept inline (no import) so
 *  this module stays a dependency-free leaf and is safe to pull into the edge fn under deno-check. */
export function normalizeSenderDomain(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').trim();
  // One-or-more dot-separated labels (alnum + inner hyphens) ending in a 2+ letter TLD, ≤253 chars.
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return host;
}

/** Coerce a provider status string to our enum; anything unrecognized is treated as 'pending' (still
 *  in-flight) rather than a false 'verified' — we never claim delivery-ready on an unknown state. */
export function coerceStatus(raw: unknown): DomainStatus {
  const s = String(raw ?? '').toLowerCase();
  return (STATUSES as string[]).includes(s) ? (s as DomainStatus) : 'pending';
}

/** Parse a Resend domain payload (create/get/verify all return the same shape) into our stored shape.
 *  Tolerant of missing fields — a payload with no records yields an empty list, never throws. */
export function parseResendDomain(resp: unknown): ParsedDomain {
  const r = (resp ?? {}) as { id?: unknown; status?: unknown; records?: unknown };
  const rawRecords = Array.isArray(r.records) ? r.records : [];
  const records: DnsRecord[] = rawRecords.map((x) => {
    const rec = (x ?? {}) as Record<string, unknown>;
    return {
      record: rec.record != null ? String(rec.record) : undefined,
      name: String(rec.name ?? ''),
      type: String(rec.type ?? 'TXT').toUpperCase(),
      value: String(rec.value ?? ''),
      ttl: (rec.ttl as string | number | undefined),
      status: rec.status != null ? String(rec.status) : undefined,
      priority: typeof rec.priority === 'number' ? rec.priority : undefined,
    };
  });
  return {
    providerDomainId: r.id != null ? String(r.id) : null,
    status: coerceStatus(r.status),
    records,
  };
}

/** The checklist state for a domain: verified ⇒ connected (delivery-ready); in-flight ⇒ pending; a hard
 *  or transient failure ⇒ error (the operator needs to look). */
export function domainConnState(status: DomainStatus): DomainConnState {
  if (status === 'verified') return 'connected';
  if (status === 'failure' || status === 'temporary_failure') return 'error';
  return 'pending'; // not_started | pending
}

/** Delivery-ready ⇔ the provider verified the domain. (Some records can lag, but the domain-level
 *  'verified' is Resend's own gate for accepting sends from it.) */
export function isDeliveryReady(status: DomainStatus): boolean {
  return status === 'verified';
}

export interface RecordSummary { total: number; verified: number; pending: number }

/** Count records by verification, for the "3/4 records verified" line under a domain. A record with no
 *  status is counted as pending (not yet confirmed), never as verified. */
export function summarizeRecords(records: DnsRecord[]): RecordSummary {
  let verified = 0;
  for (const r of records) if ((r.status ?? '').toLowerCase() === 'verified') verified++;
  return { total: records.length, verified, pending: records.length - verified };
}

/** A human status line for the UI. */
export function statusLabel(status: DomainStatus): string {
  switch (status) {
    case 'verified': return 'Verified — sending live';
    case 'pending': return 'Pending — add the DNS records, then verify';
    case 'not_started': return 'Not started — add the DNS records, then verify';
    case 'failure': return 'Failed — the DNS records don’t match yet';
    case 'temporary_failure': return 'Checking — DNS is still propagating';
  }
}

const DEFAULT_LOCAL = 'hello';

/** The suggested from-address for a verified domain (hello@domain). The local part is sanitized to a
 *  safe label; a junk input falls back to 'hello' so we never build an invalid address. */
export function fromAddressFor(domain: string, localPart?: string | null): string {
  const local = (localPart ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '');
  return `${local || DEFAULT_LOCAL}@${domain}`;
}
