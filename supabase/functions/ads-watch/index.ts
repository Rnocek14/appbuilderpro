// supabase/functions/ads-watch/index.ts
// THE 2AM AD WATCHDOG — runs on the heartbeat (daily, pre-morning). For each owner with a
// connected ad account it (1) refreshes metrics through the one sync path (ads-sync, worker
// entry — metering intact), (2) judges YESTERDAY against a 7-day baseline with the VERIFIED
// detection core (_shared/adsWatchCore.ts — MIN-sample gated, today never judged, a missing
// report never treated as zero), and (3) pushes anything real to the owner's webhook + the
// mind_events record so the waking moment shows the same facts.
//
// HONESTY RULES:
//   - Detection only. This function never mutates a campaign — no auto-pause, no budget writes.
//     Alerts say what the numbers did and where to look; acting is the owner's call.
//   - Quiet accounts stay quiet (no findings → no notification, ever).
//   - Dedupe by anomaly key: the same finding never re-alerts within 3 days.
//
// Secrets: WORKER_SECRET (header x-worker-secret — the heartbeat's shared gate).
// Deploy: supabase functions deploy ads-watch --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';
import { detectAdAnomalies, type AdDayRow } from '../_shared/adsWatchCore.ts';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-worker-secret' };
const MAX_ALERTS_PER_OWNER = 5;   // one push, capped — a broken account must not become spam

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!cronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-ads-watch-daily');
  const today = new Date().toISOString().slice(0, 10);

  // Owners with a configured ad connection (an account id in config).
  const { data: conns, error } = await admin.from('connections')
    .select('owner_id, provider, config').in('provider', ['meta_ads', 'google_ads']).limit(500);
  if (error) return json({ error: error.message }, 500);
  const byOwner = new Map<string, string[]>();
  for (const c of (conns ?? []) as { owner_id: string; provider: string; config: Record<string, unknown> | null }[]) {
    const hasAccount = !!String(c.config?.ad_account_id ?? c.config?.customer_id ?? '').trim();
    if (!hasAccount) continue;
    byOwner.set(c.owner_id, [...(byOwner.get(c.owner_id) ?? []), c.provider]);
  }

  let owners = 0, alerted = 0;
  for (const [ownerId, providers] of byOwner) {
    owners++;
    try {
      // 1) Refresh through the ONE sync path (best-effort — stale data still gets judged honestly,
      //    because a missing yesterday-report produces no verdict, never a fake zero).
      for (const provider of providers) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ads-sync`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-worker-secret': secret,
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ mode: 'sync', provider, owner_id: ownerId }),
        }).catch(() => {});
      }

      // 2) Judge yesterday vs the 7-day baseline (verified core).
      const cutoff = new Date(Date.now() - 9 * 24 * 3_600_000).toISOString().slice(0, 10);
      const { data: rows } = await admin.from('ad_metrics')
        .select('provider, campaign_name, date, spend_usd, impressions, clicks')
        .eq('owner_id', ownerId).gte('date', cutoff).limit(3000);
      const anomalies = detectAdAnomalies((rows ?? []) as AdDayRow[], today);
      if (!anomalies.length) continue;                                   // quiet account stays quiet

      // 3) Dedupe against recent alerts (same anomaly key within 3 days → already told them).
      const dedupeSince = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
      const { data: recent } = await admin.from('mind_events')
        .select('payload').eq('owner_id', ownerId).eq('source', 'ads-watch').gte('occurred_at', dedupeSince).limit(100);
      const seen = new Set(((recent ?? []) as { payload: { key?: string } | null }[]).map((e) => e.payload?.key).filter(Boolean));
      const fresh = anomalies.filter((a) => !seen.has(a.key)).slice(0, MAX_ALERTS_PER_OWNER);
      if (!fresh.length) continue;

      // 4) One push with the arithmetic + one mind_event per finding (the waking moment's record).
      const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', ownerId).single();
      const lines = [
        `🔦 Ad watchdog — ${fresh.length} finding${fresh.length === 1 ? '' : 's'} from yesterday's numbers:`,
        ...fresh.map((a) => `${a.severity === 'alert' ? '🔴' : '🟡'} ${a.headline}\n   ${a.evidence}`),
        'Nothing was changed — review in Ads Manager. (Detection is measured vs your own 7-day baseline.)',
      ];
      await notifyText((owner as { webhook_url?: string } | null)?.webhook_url, lines.join('\n'));
      for (const a of fresh) {
        await admin.from('mind_events').insert({
          owner_id: ownerId, event_type: 'note', source: 'ads-watch',
          subject: a.headline,
          payload: { key: a.key, kind: a.kind, severity: a.severity, provider: a.provider, campaign: a.campaign, evidence: a.evidence },
        }).then(() => {}, () => {});
      }
      alerted++;
    } catch { /* one owner's failure never blocks the rest */ }
  }

  return json({ ok: true, owners, alerted });
});
