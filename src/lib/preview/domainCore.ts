// src/lib/preview/domainCore.ts
// PURE domain-migration helpers (verified by domainCore.verify.ts). Connecting a client's EXISTING
// domain to their hosted site = pointing DNS at the host; this computes the exact records to hand the
// client and classifies apex vs subdomain (CNAME is illegal at a root, so an apex needs an A record).
// No I/O — the Netlify calls + status live in the connect-domain edge function. Deno-safe.

// Netlify's published anycast load-balancer IP for apex A-records, and the ALIAS/ANAME target for
// registrars that support flattening. (Netlify docs; stable values.)
export const NETLIFY_APEX_IP = '75.2.60.5';
export const NETLIFY_ALIAS_TARGET = 'apex-loadbalancer.netlify.com';

// A small set of common two-label public suffixes so e.g. example.co.uk is treated as an apex, not a
// subdomain of "co.uk". Not exhaustive (no full public-suffix list) — uncommon TLDs fall back to the
// 2-label assumption, which the UI notes.
const TWO_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk',
  'co.nz', 'org.nz', 'net.nz', 'com.au', 'net.au', 'org.au', 'co.za',
  'co.jp', 'com.br', 'com.mx', 'co.in', 'com.sg',
]);

export interface DomainParts { registrable: string; sub: string | null; isApex: boolean }

/** Split a normalized hostname into its registrable domain + subdomain label(s). `isApex` is true
 *  when there's no subdomain (example.com, example.co.uk). Returns null for a non-domain. Expects an
 *  already-normalized host (see publishCore.normalizeCustomDomain). */
export function classifyDomain(domain: string): DomainParts | null {
  const host = (domain ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join('.');
  const suffixLen = TWO_PART_TLDS.has(last2) ? 3 : 2;   // registrable = last `suffixLen` labels
  if (labels.length < suffixLen) return null;
  const registrable = labels.slice(-suffixLen).join('.');
  const sub = labels.length > suffixLen ? labels.slice(0, labels.length - suffixLen).join('.') : null;
  return { registrable, sub, isApex: sub === null };
}

export interface DnsRecord { type: 'A' | 'CNAME'; host: string; value: string; note?: string }

/** The DNS records the client adds at their registrar to point `domain` at the Netlify-hosted site.
 *   - apex (example.com): an A record at the root (CNAME is illegal there) + a www CNAME so both the
 *     root and www work.
 *   - subdomain (go.example.com / www.example.com): a single CNAME.
 *  `netlifyHost` is the site's default <name>.netlify.app. Only web records — never MX, so the
 *  client's email is untouched. */
export function dnsRecordsFor(domain: string, netlifyHost: string): DnsRecord[] {
  const parts = classifyDomain(domain);
  const target = (netlifyHost ?? '').trim().toLowerCase();
  if (!parts || !target) return [];
  if (parts.isApex) {
    return [
      { type: 'A', host: '@', value: NETLIFY_APEX_IP, note: 'The root domain (host “@”, or leave it blank).' },
      { type: 'CNAME', host: 'www', value: target, note: `So www.${parts.registrable} works too.` },
    ];
  }
  return [{ type: 'CNAME', host: parts.sub as string, value: target, note: `Points ${domain} at the site.` }];
}

/** True when a live DNS A-record set already points the apex at Netlify (used by the status check to
 *  report "DNS verified" without waiting on SSL). Pure so it's testable; the edge fn feeds it the
 *  resolved records. */
export function apexPointsAtNetlify(aRecords: string[]): boolean {
  return Array.isArray(aRecords) && aRecords.includes(NETLIFY_APEX_IP);
}
