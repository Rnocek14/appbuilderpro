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

// ================================================================================================
// PACKAGE LIFECYCLE (app_0119) — pure additions. The pin became operational: versions migrate,
// clients pause/resume, relationships end. These cores compute WHAT should change; they never
// touch a row (packageLifecycleRun.ts does), and they carry the two house invariants:
//   * consent before any newly introduced outbound — a migration may ASK, never silently arm;
//   * a client's recorded "no" is respected — a declined action is NOT drift to be "fixed".

/** What is actually installed on a client right now, as gathered from live rows. */
export interface InstalledState {
  hasWatch: boolean;            // a live-site watch order exists and is active
  consented: string[];          // actions with a package_consents row (evidence-backed yes)
  declined: string[];           // actions the client said no to (the recorded no)
  proposedPending: string[];    // actions proposed (ask surfaced / trigger configured) but unanswered
}

/** Normalize raw gathered rows into an InstalledState: lists trimmed, deduped, and internally
 *  consistent — an evidence-backed consent supersedes an earlier decline (the reverse requires
 *  withdrawing the consent row itself, a deliberate act), and a proposal that has been answered
 *  either way is no longer pending. */
export function installedState(rows: {
  hasWatch: boolean; consented: string[]; declined: string[]; proposedPending: string[];
}): InstalledState {
  const clean = (xs: string[]) =>
    Array.from(new Set((xs ?? []).map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0)));
  const consented = clean(rows.consented);
  const declined = clean(rows.declined).filter((a) => !consented.includes(a));
  const answered = new Set([...consented, ...declined]);
  return {
    hasWatch: !!rows.hasWatch,
    consented,
    declined,
    proposedPending: clean(rows.proposedPending).filter((a) => !answered.has(a)),
  };
}

/** The establish-shape a pinned package DESIRES on its client (EstablishPlan minus the URL —
 *  drift asks "is a watch present", not "which URL"). */
export interface DesiredEstablish {
  watchSite: boolean;
  proposeAutomations: string[];
  reporting: 'monthly' | null;
}

export interface DriftDiff {
  missingWatch: boolean;        // the package promises a watch and none is running
  unconsentedActions: string[]; // desired actions with neither a consent nor a decline on record
  resolved: boolean;            // nothing missing, nothing awaiting an answer
}

/** Desired vs installed. A client's DECLINED action is deliberately NOT drift — drift is the gap
 *  between what the package promises and what has been ANSWERED, and "no" is an answer. Only a
 *  missing watch or an action with no answer at all counts. */
export function driftDiff(
  desired: DesiredEstablish,
  installed: { hasWatch: boolean; consented: string[]; declined: string[] },
): DriftDiff {
  const consented = new Set((installed.consented ?? []).map((s) => s.trim()));
  const declined = new Set((installed.declined ?? []).map((s) => s.trim()));
  const missingWatch = !!desired.watchSite && !installed.hasWatch;
  const unconsentedActions = Array.from(new Set(
    (desired.proposeAutomations ?? []).map((s) => s.trim()).filter((s) => s.length > 0),
  )).filter((a) => !consented.has(a) && !declined.has(a));
  return { missingWatch, unconsentedActions, resolved: !missingWatch && unconsentedActions.length === 0 };
}

export interface MigratePlan {
  /** Actions the target package proposes that the source did not — these need CONSENT before they
   *  arm; the migration surfaces them as asks and nothing more. Already-consented actions are not
   *  re-asked (the yes stands across versions). */
  newlyIntroducedActions: string[];
  /** The pin's client-specific overrides, passed through untouched — they survive migration. */
  retainedOverrides: Record<string, unknown>;
  watchChange: 'keep' | 'add' | 'remove';
}

const establishedActions = (pkg: PackageRow): string[] => {
  const raw = pkg.definition.establishes?.propose_automations;
  return Array.isArray(raw) ? raw.filter((a) => typeof a === 'string' && a.trim().length > 0).map((a) => a.trim()) : [];
};

/** Plan a version migration (upgrade OR downgrade — the math is direction-agnostic). Pure: what
 *  is newly introduced, what the watch does, and the overrides handed back exactly as given. */
export function migratePlan(
  fromPkg: PackageRow, toPkg: PackageRow, overrides: Record<string, unknown>, consented: string[],
): MigratePlan {
  const fromActions = new Set(establishedActions(fromPkg));
  const consentedSet = new Set((consented ?? []).map((s) => s.trim()));
  const newlyIntroducedActions = Array.from(new Set(establishedActions(toPkg)))
    .filter((a) => !fromActions.has(a) && !consentedSet.has(a));
  const fromWatch = !!fromPkg.definition.establishes?.watch_site;
  const toWatch = !!toPkg.definition.establishes?.watch_site;
  return {
    newlyIntroducedActions,
    retainedOverrides: overrides,  // the same object, untouched — client-specific deltas survive
    watchChange: fromWatch === toWatch ? 'keep' : toWatch ? 'add' : 'remove',
  };
}

/** An explicit post-termination retention: the ONLY way anything keeps running after the end. */
export interface RetainedService { service: string; reason: string; until?: string }

export interface TerminationPlan {
  stopWatches: string[];        // standing-order ids to pause (not covered by a retained entry)
  pauseTriggers: string[];      // automation-trigger ids to pause (likewise)
  blockers: string[];           // open work that must be resolved or explicitly carried, by name
  retainedSummary: string[];    // one honest line per retained service
}

/** Compute what termination stops. The rule is absolute: nothing survives except what a retained
 *  entry names — an entry covers an item only by exact id or exact (case-insensitive) label, so a
 *  vague entry never quietly keeps half the fleet alive. Blockers don't stop the termination; they
 *  name the open work the operator must resolve or deliberately carry. */
export function terminationPlan(
  active: {
    watches: { id: string; label: string }[];
    triggers: { id: string; label: string }[];
    openRequests: number;
    undeliveredReports: number;
  },
  retained: RetainedService[],
): TerminationPlan {
  const keys = new Set(
    (retained ?? []).map((r) => (r.service ?? '').trim().toLowerCase()).filter((s) => s.length > 0),
  );
  const covered = (item: { id: string; label: string }) =>
    keys.has(item.id.trim().toLowerCase()) || keys.has(item.label.trim().toLowerCase());
  const blockers: string[] = [];
  if (active.openRequests > 0) {
    blockers.push(`${active.openRequests} open change request${active.openRequests === 1 ? '' : 's'} — resolve or explicitly carry before closing out`);
  }
  if (active.undeliveredReports > 0) {
    blockers.push(`${active.undeliveredReports} undelivered report${active.undeliveredReports === 1 ? '' : 's'} — deliver or explicitly carry before closing out`);
  }
  return {
    stopWatches: active.watches.filter((w) => !covered(w)).map((w) => w.id),
    pauseTriggers: active.triggers.filter((t) => !covered(t)).map((t) => t.id),
    blockers,
    retainedSummary: (retained ?? [])
      .filter((r) => (r.service ?? '').trim().length > 0)
      .map((r) => `${r.service.trim()} — ${(r.reason ?? '').trim() || 'no reason recorded'}${r.until ? ` (until ${r.until})` : ''}`),
  };
}
