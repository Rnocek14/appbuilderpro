// supabase/functions/_shared/appOriginCore.ts
// IS THIS ADDRESS ONE A STRANGER CAN OPEN? Pure; verified by appOriginCore.verify.ts; shared by the
// Start page (which asks for it) and system-control (which stores it), so the browser and the server
// agree on what counts as usable.
//
// WHY. APP_ORIGIN is the base of the demo link that goes inside a cold email to a real business. It
// is the one setting whose WRONG value is more dangerous than its missing one:
//
//   unset  — standing-worker refuses to queue any pitch at all. Nothing goes out. Recoverable, and
//            the readiness panel already names it.
//   local  — everything reports ready. Sites get built, emails get written, approvals pass, mail
//            leaves, and every recipient gets a link to a machine that is not theirs. The only
//            person who cannot see the problem is the one who set it.
//
// The Start page offered its own origin as a suggestion, which on a laptop is http://localhost:5173.
// Presence checks cannot catch this — system-control reports whether a secret is SET, never its
// value — so the guard has to be at the point of entry, in the browser and again on the server.

/** Why an address can't be used as this app's public base, or null when it is fine. The sentence is
 *  the whole point: "invalid" tells someone nothing about what to type instead. */
export function publicOriginProblem(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return 'Paste the web address this app is reached at.';

  let url: URL;
  try { url = new URL(value); }
  catch { return 'That is not a web address. It needs to start with https:// — for example https://garvis.yourdomain.com'; }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'That is not a web address. It needs to start with https://';
  }

  const host = url.hostname.toLowerCase();
  // Everything a machine calls itself. A link to any of these means "this computer" to whoever
  // opens it, which for the business receiving your email is THEIR computer, not yours.
  const isLoopback =
    host === 'localhost' || host.endsWith('.localhost') ||
    host === '127.0.0.1' || host.startsWith('127.') ||
    host === '::1' || host === '[::1]' || host === '0.0.0.0';
  // Addresses that only exist inside one network — a home router, an office LAN, a container host.
  const isPrivate =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith('.local') || host.endsWith('.internal') || host === 'host.docker.internal';

  if (isLoopback) {
    return 'That address only means anything on this computer. A business you email would click it and reach their own machine, not your demo. Leave this blank until the app has a real web address — nothing sends with it unset, which is the safe state.';
  }
  if (isPrivate) {
    return 'That address only works inside your own network. Anyone outside it — which is everyone you would email — gets nothing. Leave this blank until the app has a public web address.';
  }
  // A bare hostname with no dot cannot resolve for anyone else either.
  if (!host.includes('.')) {
    return `"${url.hostname}" is not a name the rest of the internet can look up. Use the full address, like https://garvis.yourdomain.com`;
  }
  return null;
}

/** True when this address is one a stranger can open. */
export function isPublicOrigin(raw: string | null | undefined): boolean {
  return publicOriginProblem(raw) === null;
}

/** Trim a trailing slash so a stored origin and a built link never produce "…//preview-site/x". */
export function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}
