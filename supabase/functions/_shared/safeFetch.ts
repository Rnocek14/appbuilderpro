// supabase/functions/_shared/safeFetch.ts
// ONE hardened outbound-fetch path for anything that fetches a user-supplied URL (fetch-url,
// shot-worker). The audit found the old guard checked only the INITIAL hostname string and then
// followed redirects blindly — so a public page could 302 to cloud metadata (169.254.169.254) or an
// internal service, and DNS names resolving to private IPs passed entirely.
//
// Defense here is layered and fail-closed at every hop:
//   1) scheme must be http(s); hostname literals (localhost/.internal/…) rejected
//   2) IP-literal hostnames validated against the full private/reserved table (incl. CGNAT,
//      decimal/hex single-number forms, IPv6 loopback/link-local/ULA/IPv4-mapped)
//   3) DNS names are RESOLVED (A + AAAA) and EVERY record must be public — one private record
//      rejects the host (rebinding defense)
//   4) redirects are followed MANUALLY, re-running 1–3 on every hop (default cap 5)

const BLOCKED_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home|.*\.lan|metadata\.google\.internal)$/i;

/** Is a parsed IPv4 quad public? (fail-closed on anything reserved) */
function publicV4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return false;                    // this-net, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false;                    // CGNAT 100.64/10
  if (a === 169 && b === 254) return false;                              // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;                     // private 172.16/12
  if (a === 192 && b === 168) return false;                              // private 192.168/16
  if (a === 192 && b === 0) return false;                                // 192.0.0/24 special + 192.0.2 doc
  if (a === 198 && (b === 18 || b === 19)) return false;                 // benchmarking 198.18/15
  if (a >= 224) return false;                                            // multicast + reserved 224/3
  return true;
}

/** Validate one IP string (v4 dotted-quad or v6). Unparseable → NOT public (fail closed). */
export function isPublicIp(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b, c, d] = [Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])];
    if ([a, b, c, d].some((n) => n > 255)) return false;
    return publicV4(a, b);
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    if (v6 === '::' || v6 === '::1') return false;                       // unspecified, loopback
    if (v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return false; // link-local fe80::/10
    if (v6.startsWith('fc') || v6.startsWith('fd')) return false;        // ULA fc00::/7
    const mapped = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v6); // IPv4-mapped
    if (mapped) return isPublicIp(mapped[1]);
    return true;
  }
  // A bare number (decimal/hex/octal IP form like 2130706433 or 0x7f000001) — reject outright:
  // browsers/fetch parse these as IPs and they dodge the dotted-quad check.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(ip)) return false;
  return false; // not an IP at all — caller should have resolved it first
}

/** Static checks on a URL: scheme + hostname literals + IP-literal hostnames. */
export function urlStaticOk(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const h = url.hostname.toLowerCase();
  if (BLOCKED_HOST.test(h)) return false;
  // IP-literal (or number-form) hostname → must be a public IP.
  if (/^\[?[0-9a-f:.]+\]?$/i.test(h) && (h.includes(':') || /^[\d.]+$/.test(h) || /^0x/i.test(h))) {
    return isPublicIp(h);
  }
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return false; // single-number IP forms
  return true;
}

/** Resolve a DNS name and require EVERY record to be public. Names that don't resolve fail closed
 *  (fetch would fail anyway). If the runtime lacks resolveDns, fall back to static checks only —
 *  strictly better than the old guard, never worse. */
async function resolvedPublic(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase();
  if (/^\[?[0-9a-f:.]+\]?$/i.test(h) && (h.includes(':') || /^[\d.]+$/.test(h))) return isPublicIp(h);
  try {
    const lookups = await Promise.allSettled([
      Deno.resolveDns(h, 'A'),
      Deno.resolveDns(h, 'AAAA'),
    ]);
    const ips = lookups.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (!ips.length) return false;              // nothing resolved → fail closed
    return ips.every((ip) => isPublicIp(ip));   // ONE private record rejects the host
  } catch {
    return true; // resolveDns unavailable in this runtime — static checks still applied
  }
}

/** Full validation for one hop. */
export async function urlAllowed(url: URL): Promise<boolean> {
  if (!urlStaticOk(url)) return false;
  return await resolvedPublic(url.hostname);
}

/** Fetch with MANUAL redirects, re-validating every hop. Throws on a blocked hop. */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = new URL(String(input));
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await urlAllowed(url))) throw new Error(`This URL cannot be fetched (blocked host: ${url.hostname}).`);
    const res = await fetch(url.href, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      await res.body?.cancel().catch(() => {});
      url = new URL(loc, url); // relative redirects resolve against the current hop
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects.');
}
