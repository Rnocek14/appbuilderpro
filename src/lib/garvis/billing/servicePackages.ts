// src/lib/garvis/billing/servicePackages.ts
// PURE half of the service-package noun (app_0115): pick the current version for a key, and turn a
// package definition into an ESTABLISH PLAN — the concrete objects applying it to a client should
// create. No I/O (servicePackages.verify.ts); the impure half is servicePackagesRun.ts.
//
// The plan is honest about mechanical vs deliberate: watching a live site is mechanical (a
// standing order the machine can create); automations are PROPOSED, never silently configured —
// per-client config, consent, and customer lists are the operator's deliberate acts, so they
// arrive as asks, not as armed rows.

export interface PackageRow {
  id: string;
  owner_id: string | null;          // null = built-in
  key: string;
  version: number;
  name: string;
  blurb: string;
  cadence: 'one_time' | 'monthly';
  price_hint: string;
  definition: {
    includes?: string[];
    establishes?: {
      watch_site?: boolean;
      propose_automations?: string[];   // automation registry capability ids
      reporting?: 'monthly' | null;
    };
  };
  status: 'draft' | 'current' | 'retired';
}

export interface EstablishPlan {
  watchUrl: string | null;             // create a daily watch_url standing order (null = no live URL known yet)
  proposeAutomations: string[];        // surfaced as asks on the client, never armed silently
  reporting: 'monthly' | null;         // reporting cadence the package promises the client
}

/** The current version for a key: highest version with status='current', the OPERATOR's own row
 *  beating a built-in at the same version (an operator override is deliberate). */
export function currentPackage(rows: PackageRow[], key: string): PackageRow | null {
  const candidates = rows.filter((r) => r.key === key && r.status === 'current');
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.version - a.version) || ((b.owner_id ? 1 : 0) - (a.owner_id ? 1 : 0)));
  return candidates[0];
}

/** Compile the establish plan for a package applied to a client whose live site URL may or may not
 *  be known yet. Pure: no invention — an unknown URL yields watchUrl:null (the pay→auto-publish
 *  path arms the watch later), and only registry ids present in the definition are proposed. */
export function establishPlan(pkg: PackageRow, liveUrl: string | null): EstablishPlan {
  const est = pkg.definition.establishes ?? {};
  const url = (liveUrl ?? '').trim();
  return {
    watchUrl: est.watch_site && /^https?:\/\/.+\..+/.test(url) ? url : null,
    proposeAutomations: Array.isArray(est.propose_automations)
      ? est.propose_automations.filter((a) => typeof a === 'string' && a.trim().length > 0)
      : [],
    reporting: est.reporting === 'monthly' ? 'monthly' : null,
  };
}
