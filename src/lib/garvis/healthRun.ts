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
export interface HealthReport {
  supabaseConfigured: boolean;
  functions: FnHealth[];
  providers: ProviderHealth[];
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
  { name: 'ads-watch', group: 'Heartbeat (works while you sleep)' },
  { name: 'outreach-reactivate', group: 'Heartbeat (works while you sleep)' },
];

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
  if (supabaseConfigured) {
    const probes = await Promise.all(FUNCTIONS.map((f) => probeFn(f.name)));
    FUNCTIONS.forEach((f, i) => functions.push({ name: f.name, group: f.group, probe: probes[i] }));
  } else {
    FUNCTIONS.forEach((f) => functions.push({ name: f.name, group: f.group, probe: 'unknown', note: 'Supabase not configured' }));
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
  providers.push({ name: 'Web search (Serper)', configured: 'unknown', detail: 'SERPER_API_KEY is server-side — a scan reports if it\'s missing' });
  providers.push({ name: 'Embeddings', configured: 'unknown', detail: 'EMBEDDINGS_API_KEY is server-side — Ask falls back to lexical without it' });
  providers.push({ name: 'Video render (Shotstack)', configured: 'unknown', detail: 'SHOTSTACK_API_KEY is server-side — the browser preview works without it' });

  return { supabaseConfigured, functions, providers };
}
