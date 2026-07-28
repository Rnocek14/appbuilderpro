// src/lib/garvis/billing/packageLifecycleRun.ts
// IMPURE half of the package lifecycle (app_0119): migrate a pin between versions, pause/resume a
// client's world, record consent, detect drift, and terminate with an offboarding inventory. All
// decisions come from the pure cores in servicePackages.ts; this file only reads rows, applies the
// computed changes, and reports honestly what actually happened.
//
// House invariants, enforced here:
//   * Consent before any newly introduced outbound: a migration records newly-introduced actions
//     as ASKS (mind_events) — they NEVER arm here; recordConsent() is the only path to a yes, and
//     it refuses consent without evidence.
//   * Nothing survives termination except explicit retained_services entries.
//   * The offboarding inventory INVENTORIES. It lists the takedowns, transfers, and cancellations
//     the operator must follow through on; no live site is deleted, no provider row destroyed, no
//     Stripe subscription canceled by this code — destructive acts remain the operator's explicit,
//     deliberate follow-through.

import { supabase } from '../../supabase';
import {
  currentPackage, driftDiff, installedState, migratePlan, terminationPlan,
  type DriftDiff, type InstalledState, type MigratePlan, type PackageRow,
  type RetainedService, type TerminationPlan,
} from './servicePackages';

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

interface PinRow {
  id: string; package_id: string; status: 'active' | 'paused' | 'terminated';
  overrides: Record<string, unknown> | null; retained_services: RetainedService[] | null;
}

const PKG_COLS = 'id, owner_id, key, version, name, blurb, cadence, price_hint, definition, status';

async function loadPin(clientSubscriptionId: string): Promise<PinRow | null> {
  const { data } = await supabase.from('package_pins')
    .select('id, package_id, status, overrides, retained_services')
    .eq('client_subscription_id', clientSubscriptionId).maybeSingle();
  return (data as PinRow | null) ?? null;
}

async function loadPackageById(id: string): Promise<PackageRow | null> {
  const { data } = await supabase.from('service_packages').select(PKG_COLS).eq('id', id).maybeSingle();
  return (data as PackageRow | null) ?? null;
}

async function loadConsentedActions(clientSubscriptionId: string): Promise<string[]> {
  const { data } = await supabase.from('package_consents')
    .select('action').eq('client_subscription_id', clientSubscriptionId);
  return ((data ?? []) as { action: string }[]).map((r) => r.action);
}

/** The client's watch orders: linked by config (the establish path stamps client_subscription_id
 *  into config) or by the client's world (app_0116). Two fail-soft queries, merged by id. */
async function loadClientWatches(
  ownerId: string, clientSubscriptionId: string, worldId: string | null,
): Promise<{ id: string; label: string; status: string }[]> {
  const byId = new Map<string, { id: string; label: string; status: string }>();
  try {
    const { data } = await supabase.from('standing_orders').select('id, label, status')
      .eq('owner_id', ownerId).eq('kind', 'watch_url')
      .eq('config->>client_subscription_id', clientSubscriptionId);
    for (const w of (data ?? []) as { id: string; label: string; status: string }[]) byId.set(w.id, w);
  } catch { /* fail-soft: the config linkage predates some watches */ }
  if (worldId) {
    try {
      const { data } = await supabase.from('standing_orders').select('id, label, status')
        .eq('owner_id', ownerId).eq('kind', 'watch_url').eq('world_id', worldId);
      for (const w of (data ?? []) as { id: string; label: string; status: string }[]) byId.set(w.id, w);
    } catch { /* fail-soft */ }
  }
  return Array.from(byId.values());
}

// ------------------------------------------------------------------------------------------------
// MIGRATE (upgrade / downgrade) — same pin row re-pointed; overrides survive; new outbound ASKS.

export interface PinMigrationResult {
  migrated: boolean;
  reason: string | null;                                     // when not migrated, why — honestly
  from: { key: string; version: number; name: string } | null;
  to: { key: string; version: number; name: string } | null;
  plan: MigratePlan | null;
  asksRecorded: number;                                      // newly introduced actions surfaced as asks
  triggersPaused: { id: string; label: string }[];           // downgrade only: removed actions' triggers
}

const noMigration = (reason: string): PinMigrationResult =>
  ({ migrated: false, reason, from: null, to: null, plan: null, asksRecorded: 0, triggersPaused: [] });

async function migratePinTo(
  clientSubscriptionId: string,
  resolveTarget: (rows: PackageRow[], from: PackageRow) => PackageRow | null,
  pauseRemovedActions: boolean,
): Promise<PinMigrationResult> {
  const u = await uid();
  if (!u) return noMigration('Not signed in.');
  const pin = await loadPin(clientSubscriptionId);
  if (!pin) return noMigration('No package pin for this client.');
  if (pin.status === 'terminated') return noMigration('The pin is terminated — a migration would resurrect a closed relationship.');
  const from = await loadPackageById(pin.package_id);
  if (!from) return noMigration('The pinned package row is missing.');

  const { data: candRows } = await supabase.from('service_packages').select(PKG_COLS);
  const to = resolveTarget(((candRows ?? []) as PackageRow[]), from);
  if (!to) return noMigration('No target package version to migrate to.');
  if (to.id === from.id) return noMigration('Already on that package version — nothing to migrate.');

  const consented = await loadConsentedActions(clientSubscriptionId);
  const plan = migratePlan(from, to, (pin.overrides ?? {}) as Record<string, unknown>, consented);

  // Re-point the SAME pin row (one pin per client, ever). The patch deliberately omits overrides:
  // not touching the column IS the retention — client-specific deltas survive byte-identical.
  const { error: pinErr } = await supabase.from('package_pins')
    .update({ package_id: to.id }).eq('id', pin.id).eq('client_subscription_id', clientSubscriptionId);
  if (pinErr) return noMigration(`Pin update failed: ${pinErr.message}`);

  // Newly introduced outbound arrives as an ASK — never armed. Consent is collected via
  // recordConsent() (evidence-backed), and only then does the operator arm anything.
  let asksRecorded = 0;
  if (plan.newlyIntroducedActions.length) {
    await supabase.from('mind_events').insert({
      owner_id: u, event_type: 'note', source: 'execution',
      subject: `📦 ${from.name} → ${to.name}: ${plan.newlyIntroducedActions.length} new action${plan.newlyIntroducedActions.length === 1 ? '' : 's'} (${plan.newlyIntroducedActions.join(', ')}) — each needs the client's recorded consent BEFORE it arms`,
      payload: {
        key: `pkg-migrate:${clientSubscriptionId}`, from_package_id: from.id, to_package_id: to.id,
        propose_automations: plan.newlyIntroducedActions,
      },
    }).then(() => { asksRecorded = plan.newlyIntroducedActions.length; }, () => {});
  }

  // Downgrade: actions the target package no longer establishes lose their footing — their triggers
  // PAUSE (never delete; the configuration and fire history stay for a future re-upgrade).
  const triggersPaused: { id: string; label: string }[] = [];
  if (pauseRemovedActions) {
    const toActions = new Set(to.definition.establishes?.propose_automations ?? []);
    const removed = (from.definition.establishes?.propose_automations ?? []).filter((a) => !toActions.has(a));
    if (removed.length) {
      try {
        const { data: paused } = await supabase.from('automation_triggers')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('owner_id', u).eq('client_subscription_id', clientSubscriptionId)
          .in('capability_id', removed).eq('status', 'active')
          .select('id, label');
        for (const t of (paused ?? []) as { id: string; label: string }[]) triggersPaused.push(t);
        if (triggersPaused.length) {
          await supabase.from('mind_events').insert({
            owner_id: u, event_type: 'note', source: 'execution',
            subject: `📦 Downgrade to ${to.name}: paused ${triggersPaused.length} trigger${triggersPaused.length === 1 ? '' : 's'} no longer in the package (${triggersPaused.map((t) => t.label).join(', ')})`,
            payload: { key: `pkg-downgrade:${clientSubscriptionId}`, paused_trigger_ids: triggersPaused.map((t) => t.id), removed_actions: removed },
          }).then(() => {}, () => {});
        }
      } catch { /* fail-soft: the pin already migrated; the console shows the stragglers */ }
    }
  }

  return {
    migrated: true, reason: null,
    from: { key: from.key, version: from.version, name: from.name },
    to: { key: to.key, version: to.version, name: to.name },
    plan, asksRecorded, triggersPaused,
  };
}

/** Upgrade the client's pin to the CURRENT version of `toVersionKey` (default: the same key —
 *  i.e. "take the newest version of what they already buy"). Newly introduced actions become
 *  asks; nothing arms without recorded consent. */
export async function upgradePin(clientSubscriptionId: string, toVersionKey?: string): Promise<PinMigrationResult> {
  return migratePinTo(
    clientSubscriptionId,
    (rows, from) => currentPackage(rows, toVersionKey ?? from.key),
    false,
  );
}

/** Downgrade the client's pin: to the current version of `toVersionKey` when given, else to the
 *  highest 'current' LOWER version of the same key. Same migration mechanics (a downgrade can also
 *  introduce actions — computed identically, and they too need consent before arming); actions no
 *  longer in the package get their triggers paused with a note. */
export async function downgradePin(clientSubscriptionId: string, toVersionKey?: string): Promise<PinMigrationResult> {
  return migratePinTo(
    clientSubscriptionId,
    (rows, from) => {
      if (toVersionKey) return currentPackage(rows, toVersionKey);
      const lower = rows.filter((r) => r.key === from.key && r.status === 'current' && r.version < from.version);
      return lower.length ? currentPackage(lower, from.key) : null;
    },
    true,
  );
}

// ------------------------------------------------------------------------------------------------
// PAUSE / RESUME — the pin plus this client's watches and triggers, fail-soft each.

export interface PinToggleResult {
  pin: 'paused' | 'active' | 'unchanged';
  watchesToggled: number;
  triggersToggled: number;
  notes: string[];               // what did NOT toggle, honestly
}

async function togglePin(clientSubscriptionId: string, target: 'paused' | 'active'): Promise<PinToggleResult> {
  const out: PinToggleResult = { pin: 'unchanged', watchesToggled: 0, triggersToggled: 0, notes: [] };
  const u = await uid();
  if (!u) { out.notes.push('Not signed in.'); return out; }

  // The pin itself. A terminated pin never pauses or resumes here — resurrection is not a toggle.
  const { data: pinRows, error: pinErr } = await supabase.from('package_pins')
    .update(target === 'paused'
      ? { status: 'paused', paused_at: new Date().toISOString() }
      : { status: 'active', paused_at: null })
    .eq('client_subscription_id', clientSubscriptionId).neq('status', 'terminated')
    .select('id');
  if (pinErr) out.notes.push(`Pin not toggled: ${pinErr.message}`);
  else if (!pinRows?.length) out.notes.push('Pin not toggled (missing, or terminated — termination is not reversible by resume).');
  else out.pin = target;

  const { data: sub } = await supabase.from('client_subscriptions')
    .select('world_id').eq('owner_id', u).eq('id', clientSubscriptionId).maybeSingle();
  const worldId = (sub as { world_id: string | null } | null)?.world_id ?? null;

  // This client's world-scoped watches (standing_orders). Fail-soft: report what actually moved.
  try {
    const watches = await loadClientWatches(u, clientSubscriptionId, worldId);
    const toToggle = watches.filter((w) => w.status !== target).map((w) => w.id);
    if (toToggle.length) {
      const { data: moved, error } = await supabase.from('standing_orders')
        .update({ status: target, updated_at: new Date().toISOString() })
        .eq('owner_id', u).in('id', toToggle).select('id');
      if (error) out.notes.push(`Watches not toggled: ${error.message}`);
      else out.watchesToggled = moved?.length ?? 0;
    }
  } catch (e) { out.notes.push(`Watches not toggled: ${e instanceof Error ? e.message : 'unknown error'}`); }

  // This client's attributed automation triggers.
  try {
    const { data: moved, error } = await supabase.from('automation_triggers')
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq('owner_id', u).eq('client_subscription_id', clientSubscriptionId).neq('status', target)
      .select('id');
    if (error) out.notes.push(`Triggers not toggled: ${error.message}`);
    else out.triggersToggled = moved?.length ?? 0;
  } catch (e) { out.notes.push(`Triggers not toggled: ${e instanceof Error ? e.message : 'unknown error'}`); }

  return out;
}

/** Pause the client's pin + their watches + their triggers. Fail-soft each; the result says what
 *  actually toggled and names anything that did not. */
export async function pausePin(clientSubscriptionId: string): Promise<PinToggleResult> {
  return togglePin(clientSubscriptionId, 'paused');
}

/** Resume the client's pin + watches + triggers (the mirror of pausePin; never resurrects a
 *  terminated pin). */
export async function resumePin(clientSubscriptionId: string): Promise<PinToggleResult> {
  return togglePin(clientSubscriptionId, 'active');
}

// ------------------------------------------------------------------------------------------------
// CONSENT — the only path to a yes. Evidence is mandatory: consent without evidence is not consent.

/** Record the client's consent to an outbound action (package_consents upsert — one row per
 *  (client, action); a re-consent refreshes the evidence). Throws on empty evidence. */
export async function recordConsent(
  clientSubscriptionId: string, action: string, evidence: string,
): Promise<{ recorded: true; action: string }> {
  const act = (action ?? '').trim();
  const ev = (evidence ?? '').trim();
  if (!ev) throw new Error('Consent without evidence is not consent — record how the client said yes (their words, the signed doc, the call note).');
  if (!act) throw new Error('Consent needs the action it covers.');
  const u = await uid();
  if (!u) throw new Error('Not signed in.');
  const pin = await loadPin(clientSubscriptionId);
  if (!pin) throw new Error('No package pin for this client — nothing to consent against.');
  const { error } = await supabase.from('package_consents').upsert({
    owner_id: u, client_subscription_id: clientSubscriptionId, package_id: pin.package_id,
    action: act, evidence: ev, consented_at: new Date().toISOString(),
  }, { onConflict: 'client_subscription_id,action' });
  if (error) throw new Error(error.message);
  return { recorded: true, action: act };
}

// ------------------------------------------------------------------------------------------------
// DRIFT — desired (the pinned package) vs installed (live rows), through the pure driftDiff.

export interface DriftReport {
  ok: boolean;
  reason: string | null;         // when ok=false, why drift could not be computed
  packageName: string | null;
  installed: InstalledState | null;
  drift: DriftDiff | null;
}

/** Gather the client's installed state and diff it against what their pinned package desires.
 *  Declines are read from the pin's overrides (`declined_actions: string[]` — the client-specific
 *  record of a "no"); pending proposals come from the establish/migrate asks (mind_events) and
 *  from configured-but-unconsented triggers. Read-only: detecting drift never fixes it. */
export async function detectDrift(clientSubscriptionId: string): Promise<DriftReport> {
  const none: DriftReport = { ok: false, reason: null, packageName: null, installed: null, drift: null };
  const u = await uid();
  if (!u) return { ...none, reason: 'Not signed in.' };
  const pin = await loadPin(clientSubscriptionId);
  if (!pin) return { ...none, reason: 'No package pin for this client.' };
  const pkg = await loadPackageById(pin.package_id);
  if (!pkg) return { ...none, reason: 'The pinned package row is missing.' };

  const est = pkg.definition.establishes ?? {};
  const desired = {
    watchSite: !!est.watch_site,
    proposeAutomations: (est.propose_automations ?? []).filter((a) => typeof a === 'string' && a.trim().length > 0),
    reporting: est.reporting === 'monthly' ? 'monthly' as const : null,
  };

  const { data: sub } = await supabase.from('client_subscriptions')
    .select('world_id').eq('owner_id', u).eq('id', clientSubscriptionId).maybeSingle();
  const worldId = (sub as { world_id: string | null } | null)?.world_id ?? null;

  const watches = await loadClientWatches(u, clientSubscriptionId, worldId);
  const consented = await loadConsentedActions(clientSubscriptionId);
  const overrides = (pin.overrides ?? {}) as Record<string, unknown>;
  const declinedRaw = overrides['declined_actions'];
  const declined = Array.isArray(declinedRaw) ? declinedRaw.filter((a): a is string => typeof a === 'string') : [];

  // Pending proposals: the asks this pin's establish/migrate paths surfaced …
  const proposedPending: string[] = [];
  try {
    const { data: asks } = await supabase.from('mind_events')
      .select('payload').eq('owner_id', u)
      .in('payload->>key', [`pkg-establish:${clientSubscriptionId}`, `pkg-migrate:${clientSubscriptionId}`]);
    for (const row of (asks ?? []) as { payload: { propose_automations?: unknown } }[]) {
      const list = row.payload?.propose_automations;
      if (Array.isArray(list)) for (const a of list) if (typeof a === 'string') proposedPending.push(a);
    }
  } catch { /* fail-soft: no asks found is simply "nothing pending from asks" */ }
  // … plus triggers configured for this client whose action has no answer yet (installedState
  // subtracts the answered ones).
  try {
    const { data: trig } = await supabase.from('automation_triggers')
      .select('capability_id').eq('owner_id', u).eq('client_subscription_id', clientSubscriptionId);
    for (const t of (trig ?? []) as { capability_id: string }[]) proposedPending.push(t.capability_id);
  } catch { /* fail-soft */ }

  const installed = installedState({
    hasWatch: watches.some((w) => w.status === 'active'),
    consented, declined, proposedPending,
  });
  return { ok: true, reason: null, packageName: pkg.name, installed, drift: driftDiff(desired, installed) };
}

// ------------------------------------------------------------------------------------------------
// TERMINATE — stop everything a retained entry doesn't name, and inventory the rest.

export interface TerminationReport {
  terminated: boolean;
  reason: string | null;
  plan: TerminationPlan | null;
  watchesPaused: number;         // what the execution actually stopped
  triggersPaused: number;
  inventorySaved: boolean;       // the offboarding_inventories row landed
  inventory: Record<string, unknown> | null;
  notes: string[];
}

/** Terminate the client's pin. Computes the termination plan from LIVE rows, EXECUTES the stops
 *  (watch orders → 'paused', triggers → 'paused' — pause, never delete: history survives), marks
 *  the pin terminated with the explicit retained_services, and writes the offboarding inventory.
 *
 *  The inventory INVENTORIES. Every destructive or external act on it — taking down or
 *  transferring the live site, releasing the domain, revoking the Twilio number, retiring the
 *  sender identity, canceling the Stripe subscription — remains the operator's explicit
 *  follow-through. This function deletes nothing, cancels nothing at Stripe, and never touches a
 *  live site: we never silently cancel a client's payment or destroy their deployed presence. */
export async function terminatePin(
  clientSubscriptionId: string, retained: RetainedService[],
): Promise<TerminationReport> {
  const none: TerminationReport = {
    terminated: false, reason: null, plan: null, watchesPaused: 0, triggersPaused: 0,
    inventorySaved: false, inventory: null, notes: [],
  };
  const u = await uid();
  if (!u) return { ...none, reason: 'Not signed in.' };
  const pin = await loadPin(clientSubscriptionId);
  if (!pin) return { ...none, reason: 'No package pin for this client.' };
  if (pin.status === 'terminated') return { ...none, reason: 'Already terminated.' };

  const { data: subRow } = await supabase.from('client_subscriptions')
    .select('id, business_name, email, world_id, preview_site_id, stripe_subscription_id, twilio_number')
    .eq('owner_id', u).eq('id', clientSubscriptionId).maybeSingle();
  const sub = subRow as {
    id: string; business_name: string; email: string | null; world_id: string | null;
    preview_site_id: string | null; stripe_subscription_id: string | null; twilio_number: string | null;
  } | null;
  if (!sub) return { ...none, reason: 'Client subscription not found.' };

  // ---- Gather LIVE rows (never a cached view — termination acts on what is actually running) ----
  const watches = (await loadClientWatches(u, clientSubscriptionId, sub.world_id))
    .filter((w) => w.status === 'active');
  let triggers: { id: string; label: string }[] = [];
  try {
    const { data } = await supabase.from('automation_triggers').select('id, label')
      .eq('owner_id', u).eq('client_subscription_id', clientSubscriptionId).eq('status', 'active');
    triggers = ((data ?? []) as { id: string; label: string }[]);
  } catch { /* fail-soft */ }

  const scopeOr = sub.world_id
    ? `world_id.eq.${sub.world_id},client_subscription_id.eq.${clientSubscriptionId}`
    : `client_subscription_id.eq.${clientSubscriptionId}`;
  let openRequests = 0;
  try {
    const { count } = await supabase.from('change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', u).or(scopeOr).not('status', 'in', '(closed,declined)');
    openRequests = count ?? 0;
  } catch { /* fail-soft: zero means "none found", and the inventory says what was counted */ }
  let undeliveredReports = 0;
  try {
    const { count } = await supabase.from('client_reports')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', u).or(scopeOr).neq('delivery_state', 'sent');
    undeliveredReports = count ?? 0;
  } catch { /* fail-soft */ }

  const plan = terminationPlan({ watches, triggers, openRequests, undeliveredReports }, retained ?? []);

  // ---- EXECUTE the stops: pause (never delete) everything not covered by a retained entry ----
  let watchesPaused = 0;
  if (plan.stopWatches.length) {
    try {
      const { data: moved, error } = await supabase.from('standing_orders')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('owner_id', u).in('id', plan.stopWatches).select('id');
      if (error) none.notes.push(`Watches not all paused: ${error.message}`);
      else watchesPaused = moved?.length ?? 0;
    } catch (e) { none.notes.push(`Watches not all paused: ${e instanceof Error ? e.message : 'unknown error'}`); }
  }
  let triggersPaused = 0;
  if (plan.pauseTriggers.length) {
    try {
      const { data: moved, error } = await supabase.from('automation_triggers')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('owner_id', u).in('id', plan.pauseTriggers).select('id');
      if (error) none.notes.push(`Triggers not all paused: ${error.message}`);
      else triggersPaused = moved?.length ?? 0;
    } catch (e) { none.notes.push(`Triggers not all paused: ${e instanceof Error ? e.message : 'unknown error'}`); }
  }

  // ---- The pin: terminated, with the explicit (and only) survivors recorded on the row ----
  const { error: pinErr } = await supabase.from('package_pins').update({
    status: 'terminated', terminated_at: new Date().toISOString(),
    retained_services: (retained ?? []).filter((r) => (r.service ?? '').trim().length > 0),
  }).eq('id', pin.id);
  if (pinErr) {
    return { ...none, reason: `Pin not terminated: ${pinErr.message}`, plan, watchesPaused, triggersPaused };
  }

  // ---- The OFFBOARDING INVENTORY: everything the relationship touched, as follow-through items.
  // Hosting/domain/provider/billing entries are ACTIONS FOR THE OPERATOR, not acts performed here.
  const hosting: Record<string, unknown>[] = [];
  const domains: Record<string, unknown>[] = [];
  const sites: Record<string, unknown>[] = [];
  if (sub.preview_site_id) {
    try {
      const { data: site } = await supabase.from('preview_sites')
        .select('id, slug, live_url, netlify_site_id, custom_domain, published_at, status')
        .eq('id', sub.preview_site_id).maybeSingle();
      const s = site as {
        id: string; slug: string; live_url: string | null; netlify_site_id: string | null;
        custom_domain: string | null; published_at: string | null; status: string;
      } | null;
      if (s) {
        sites.push({ preview_site_id: s.id, slug: s.slug, status: s.status, live_url: s.live_url, published_at: s.published_at });
        if (s.live_url || s.netlify_site_id) {
          hosting.push({
            preview_site_id: s.id, live_url: s.live_url, netlify_site_id: s.netlify_site_id,
            action: 'transfer or takedown required — the site runs on the operator\'s hosting; a live client site is NEVER auto-deleted',
          });
        }
        if (s.custom_domain) {
          domains.push({ domain: s.custom_domain, action: 'transfer to the client or release — their domain must not stay pointed at hosting we may retire' });
        }
      }
    } catch { none.notes.push('Preview site could not be read — hosting inventory may be incomplete.'); }
  }

  const credentials: Record<string, unknown>[] = [];
  if (sub.twilio_number) {
    credentials.push({ kind: 'twilio_number', value: sub.twilio_number, action: 'revoke or transfer — the number must stop acting for a terminated client (row kept for the record; not deleted here)' });
  }
  if (sub.world_id) {
    try {
      const { data: ident } = await supabase.from('world_sender_identities')
        .select('from_name, from_email, reply_to, company_name')
        .eq('owner_id', u).eq('world_id', sub.world_id).maybeSingle();
      const si = ident as { from_name: string | null; from_email: string | null; reply_to: string | null; company_name: string | null } | null;
      if (si && (si.from_email || si.from_name)) {
        credentials.push({
          kind: 'sender_identity', from_name: si.from_name, from_email: si.from_email, reply_to: si.reply_to,
          action: 'revoke or transfer — nothing may keep sending as this client (row kept for the record; not deleted here)',
        });
      }
    } catch { none.notes.push('Sender identity could not be read — credentials inventory may be incomplete.'); }
  }

  const billing: Record<string, unknown>[] = [];
  if (sub.stripe_subscription_id) {
    billing.push({
      kind: 'stripe_subscription', stripe_subscription_id: sub.stripe_subscription_id,
      action: 'cancel at Stripe — the operator does it there, deliberately; we NEVER silently cancel a client\'s payment',
    });
  }

  const inventory: Record<string, unknown> = {
    client: { client_subscription_id: sub.id, business_name: sub.business_name, email: sub.email },
    hosting,
    domains,
    sites,
    credentials,
    automations_paused: triggers.filter((t) => plan.pauseTriggers.includes(t.id)),
    scheduled_jobs_stopped: watches.filter((w) => plan.stopWatches.includes(w.id)),
    retained_services: plan.retainedSummary,
    retained_data: 'Ledgers, reports, requests, and consent records are RETAINED (paused, not deleted) for the record and for export — purge only on the client\'s explicit request.',
    open_requests: openRequests,
    undelivered_reports: undeliveredReports,
    blockers: plan.blockers,
    billing,
    export_obligations: [
      'Hand over the published site (index.html in project-assets) and content.',
      'Hand over their customer lists and consent records on request.',
      'Hand over report history for the engagement period.',
    ],
  };

  let inventorySaved = false;
  if (sub.world_id) {
    const { error: invErr } = await supabase.from('offboarding_inventories').insert({
      owner_id: u, world_id: sub.world_id, client_subscription_id: sub.id, inventory, status: 'draft',
    });
    if (invErr) none.notes.push(`Offboarding inventory row not saved: ${invErr.message}`);
    else inventorySaved = true;
  } else {
    // offboarding_inventories requires a world (the scope contract). No world = pre-linkage client;
    // the inventory is still returned so the operator can act on it — honesty over silence.
    none.notes.push('No world linked to this client — inventory returned but not persisted (offboarding_inventories requires world_id).');
  }

  return {
    terminated: true, reason: null, plan, watchesPaused, triggersPaused,
    inventorySaved, inventory, notes: none.notes,
  };
}
