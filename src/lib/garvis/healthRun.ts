// src/lib/garvis/healthRun.ts
// The integrations HEALTH BOARD — one honest place to see what's actually wired. It answers the
// question the audit surfaced: "which of the ~38 edge functions are deployed, and which providers
// have their secrets?" We can't read server secrets from the browser (correctly), so we probe what
// IS observable: (1) Supabase configured?; (2) each function's OPTIONS preflight — every Garvis
// function returns 200 'ok' on OPTIONS, a 404 means NOT deployed; (3) provider status modes where a
// function exposes one (ads-sync reports server-secret presence). Everything else says "unknown —
// checked at use" rather than pretending.

import { supabaseConfigured, supabaseUrl, supabaseAnonKey } from '../supabase';
import { supabase } from '../supabase';

export type Probe = 'deployed' | 'not_deployed' | 'error' | 'unknown';
export interface FnHealth { name: string; group: string; probe: Probe; note?: string }
export interface ProviderHealth { name: string; configured: boolean | 'unknown'; detail: string }
export interface TableHealth { name: string; feature: string; present: boolean | 'unknown' }
export interface HealthReport {
  supabaseConfigured: boolean;
  functions: FnHealth[];
  providers: ProviderHealth[];
  tables: TableHealth[];
}

// The functions that matter, grouped by the pillar they serve (from package.json deploy lists).
const FUNCTIONS: { name: string; group: string }[] = [
  { name: 'generate-app', group: 'Build' },
  { name: 'chat-edit', group: 'Build' },
  { name: 'deploy-site', group: 'Build' },
  { name: 'garvis-brain', group: 'Brain' },
  { name: 'cluster-chat', group: 'Brain' },
  { name: 'explorer-turn', group: 'Explore' },
  { name: 'discover-media', group: 'Explore / Research' },
  { name: 'fetch-url', group: 'Research / Email discovery' },
  { name: 'embed-worker', group: 'Ask Garvis (retrieval)' },
  { name: 'ingest-document', group: 'Documents' },
  { name: 'send-email', group: 'Email' },
  { name: 'resend-inbound', group: 'Email' },
  { name: 'resend-webhook', group: 'Email' },
  { name: 'outreach-followups', group: 'Email' },
  { name: 'site-events', group: 'Instrumentation' },
  { name: 'ads-sync', group: 'Ad connections' },
  { name: 'render-video', group: 'Video' },
  { name: 'garvis-pulse', group: 'Heartbeat (works while you sleep)' },
  { name: 'garvis-worker', group: 'Heartbeat (works while you sleep)' },
  // The function that executes the ENTIRE daily client hunt + watchers + reminders — the audit
  // found all-green could coexist with the loop's executor being undeployed. Never again.
  { name: 'standing-worker', group: 'Heartbeat (works while you sleep)' },
  { name: 'ads-watch', group: 'Heartbeat (works while you sleep)' },
  { name: 'outreach-reactivate', group: 'Heartbeat (works while you sleep)' },
  { name: 'inbox-draft', group: 'Heartbeat (works while you sleep)' },
  { name: 'garvis-scorecard', group: 'Heartbeat (works while you sleep)' },
  { name: 'invoice-chase', group: 'Heartbeat (works while you sleep)' },
  { name: 'unsubscribe', group: 'Email' },
  { name: 'stripe-webhook', group: 'Billing' },
];

// The migration-drift check the audit demanded: the app being up says nothing about the DATABASE
// being current (the documented install script was 8 migrations stale and everything failed
// silently). Probe the key tables of the win-clients loop — a missing one names its migration.
const TABLES: { name: string; feature: string }[] = [
  { name: 'standing_orders', feature: 'The clock: watchers + daily hunt (app_0059/0079)' },
  { name: 'discovered_businesses', feature: 'Daily-hunt lead pool (app_0072)' },
  { name: 'prospect_audits', feature: 'Saved prospect audits (app_0074/0075)' },
  { name: 'automation_triggers', feature: 'Client automations (app_0076)' },
  { name: 'client_subscriptions', feature: 'Client billing book (app_0077)' },
  { name: 'preview_sites', feature: 'Demo sites (preview engine migration)' },
];

/** HEAD-count one table. RLS-safe (0 rows is fine) — we only learn whether the relation EXISTS. */
async function probeTable(name: string): Promise<boolean | 'unknown'> {
  try {
    const { error } = await supabase.from(name).select('id', { count: 'exact', head: true });
    if (!error) return true;
    return /does not exist|find the table|relation|schema cache/i.test(error.message) ? false : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** OPTIONS-probe one function. 200 → deployed; 404 → not deployed; other → error. */
async function probeFn(name: string): Promise<Probe> {
  if (!supabaseConfigured) return 'unknown';
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: { apikey: supabaseAnonKey, 'access-control-request-method': 'POST' },
    });
    if (res.status === 404) return 'not_deployed';
    if (res.ok || res.status === 401 || res.status === 405) return 'deployed'; // reachable = deployed
    return 'error';
  } catch {
    return 'error';
  }
}

export async function loadHealth(): Promise<HealthReport> {
  const functions: FnHealth[] = [];
  const tables: TableHealth[] = [];
  if (supabaseConfigured) {
    const [probes, tableProbes] = await Promise.all([
      Promise.all(FUNCTIONS.map((f) => probeFn(f.name))),
      Promise.all(TABLES.map((t) => probeTable(t.name))),
    ]);
    FUNCTIONS.forEach((f, i) => functions.push({ name: f.name, group: f.group, probe: probes[i] }));
    TABLES.forEach((t, i) => tables.push({ name: t.name, feature: t.feature, present: tableProbes[i] }));
  } else {
    FUNCTIONS.forEach((f) => functions.push({ name: f.name, group: f.group, probe: 'unknown', note: 'Supabase not configured' }));
    TABLES.forEach((t) => tables.push({ name: t.name, feature: t.feature, present: 'unknown' }));
  }

  // Providers with an observable status. Ad platforms report server-secret presence via ads-sync.
  const providers: ProviderHealth[] = [];
  if (supabaseConfigured) {
    try {
      const { data } = await supabase.functions.invoke('ads-sync', { body: { mode: 'status' } });
      const p = (data as { providers?: Record<string, { serverConfigured?: boolean }> } | null)?.providers ?? {};
      providers.push({ name: 'Meta ads', configured: !!p.meta_ads?.serverConfigured, detail: p.meta_ads?.serverConfigured ? 'server token set' : 'not registered — see the ads studio' });
      providers.push({ name: 'Google ads', configured: !!p.google_ads?.serverConfigured, detail: p.google_ads?.serverConfigured ? 'server token set' : 'not registered — see the ads studio' });
    } catch {
      providers.push({ name: 'Ad platforms', configured: 'unknown', detail: 'ads-sync not deployed yet' });
    }
  }
  // These degrade honestly at use; we surface them as "checked at use" rather than guessing secrets.
  providers.push({ name: 'Email (Resend)', configured: 'unknown', detail: 'RESEND_API_KEY is server-side — a send reports if it\'s missing' });
  providers.push({ name: 'Business discovery (Google Places)', configured: 'unknown', detail: 'GOOGLE_PLACES_API_KEY is server-side — Find / the daily hunt report if it\'s missing' });
  providers.push({ name: 'Web search (Serper)', configured: 'unknown', detail: 'SERPER_API_KEY is server-side — market research reports if it\'s missing' });
  providers.push({ name: 'Embeddings', configured: 'unknown', detail: 'EMBEDDINGS_API_KEY is server-side — Ask falls back to lexical without it' });
  providers.push({ name: 'Video render (Shotstack)', configured: 'unknown', detail: 'SHOTSTACK_API_KEY is server-side — the browser preview works without it' });

  return { supabaseConfigured, functions, providers, tables };
}
