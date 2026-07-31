// src/lib/garvis/billing/servicePackagesRun.ts
// IMPURE half of the service-package noun (app_0115): pin a client to the current package version
// and ESTABLISH it — materialize the plan's mechanical objects and surface its deliberate asks.
// Fail-soft throughout: a close must stand even when establishment hiccups (the pin records what
// happened; establishment is re-runnable).

import { supabase } from '../../supabase';
import { currentPackage, establishPlan, type PackageRow } from './servicePackages';

/** Pin `clientSubscriptionId` to the current package for `key` and establish it. Idempotent:
 *  an existing pin is kept (one pin per client; upgrades re-pin deliberately, not here). Returns
 *  what actually happened so the caller can tell the operator honestly. */
export async function pinAndEstablish(input: {
  clientSubscriptionId: string; packageKey: string; liveUrl?: string | null; businessName?: string;
  worldId?: string | null;
}): Promise<{ pinned: boolean; packageName: string | null; watched: boolean; proposed: number }> {
  const none = { pinned: false, packageName: null, watched: false, proposed: 0 };
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return none;

  const { data: pkgRows } = await supabase.from('service_packages')
    .select('id, owner_id, key, version, name, blurb, cadence, price_hint, definition, status')
    .eq('key', input.packageKey);
  const pkg = currentPackage(((pkgRows ?? []) as PackageRow[]), input.packageKey);
  if (!pkg) return none;   // no package for this key — the tier still sells; nothing to establish

  // One pin per client — the unique index arbitrates a double-close race; losing is fine.
  const { error: pinErr } = await supabase.from('package_pins').insert({
    owner_id: uid, client_subscription_id: input.clientSubscriptionId, package_id: pkg.id,
  });
  if (pinErr && !/duplicate|unique/i.test(pinErr.message)) return { ...none, packageName: pkg.name };

  const plan = establishPlan(pkg, input.liveUrl ?? null);
  let watched = false;

  // Mechanical: watch the live site (same idempotence as the pay→auto-publish watch — one watch
  // per URL, ever). No live URL yet → the stripe-webhook path arms it at payment instead.
  if (plan.watchUrl) {
    try {
      const { data: existing } = await supabase.from('standing_orders')
        .select('id').eq('owner_id', uid).eq('kind', 'watch_url')
        .eq('config->>url', plan.watchUrl).limit(1);
      if (!existing?.length) {
        const nowIso = new Date().toISOString();
        await supabase.from('standing_orders').insert({
          // Scope contract: the watch belongs to the CLIENT's world (app_0116) — a null here is
          // only legal when the world genuinely doesn't exist yet (pre-linkage close).
          owner_id: uid, world_id: input.worldId ?? null, kind: 'watch_url',
          label: `Client site: ${(input.businessName ?? input.packageKey).slice(0, 100)}`,
          cadence: 'daily', config: { url: plan.watchUrl, client_subscription_id: input.clientSubscriptionId },
          status: 'active', anchor_at: nowIso, next_run_at: nowIso,
        });
      }
      watched = true;
    } catch { /* re-runnable; the payment-time watch is the backstop */ }
  }

  // Deliberate: automations arrive as an ASK, never armed. One mind_event carries the proposals —
  // the same feed the Brief and waking moment read.
  if (plan.proposeAutomations.length) {
    await supabase.from('mind_events').insert({
      owner_id: uid, event_type: 'note', source: 'execution',
      subject: `📦 ${pkg.name} for ${input.businessName ?? 'new client'}: ${plan.proposeAutomations.length} automation${plan.proposeAutomations.length === 1 ? '' : 's'} to set up (${plan.proposeAutomations.join(', ')}) — each needs their customer list + consent before it arms`,
      payload: { key: `pkg-establish:${input.clientSubscriptionId}`, package_id: pkg.id, propose_automations: plan.proposeAutomations, reporting: plan.reporting },
    }).then(() => {}, () => {});
  }

  await supabase.from('package_pins')
    .update({ established_at: new Date().toISOString() })
    .eq('client_subscription_id', input.clientSubscriptionId).is('established_at', null)
    .then(() => {}, () => {});

  return { pinned: true, packageName: pkg.name, watched, proposed: plan.proposeAutomations.length };
}
