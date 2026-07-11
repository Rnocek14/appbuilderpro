// src/lib/garvis/adaptiveRun.ts
// Impure half of Adaptive Operation: assemble the channel rows (G5 results + logged ad spend),
// run the pure adapt() engine, and surface what the numbers say. A measured 'act' recommendation
// also becomes the world's standing recommendation (labeled "From your numbers") so the dashboards
// and the waking moment carry it — replaced by the next reflection or the next read of the rows.

import { supabase } from '../supabase';
import { worldResults, type ChannelResults } from './resultsRun';
import { adapt, channelFacts, type ChannelIn, type AdaptiveRec, type ChannelFact } from './adaptive';

export interface AdSpendRow { id: string; channel: string; label: string | null; amount_usd: number; created_at: string }

export async function listAdSpends(worldId: string): Promise<AdSpendRow[]> {
  const { data } = await supabase.from('ad_spends')
    .select('id, channel, label, amount_usd, created_at')
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as AdSpendRow[];
}

export async function logAdSpend(worldId: string, channel: string, amountUsd: number, label?: string): Promise<AdSpendRow> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error('Enter a real spend amount.');
  const { data, error } = await supabase.from('ad_spends')
    .insert({ owner_id: uid, world_id: worldId, channel: channel.toLowerCase().trim(), label: label ?? null, amount_usd: amountUsd })
    .select('id, channel, label, amount_usd, created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not log the spend.');
  return data as AdSpendRow;
}

export interface AdaptiveRead {
  facts: ChannelFact[];
  recs: AdaptiveRec[];
  results: ChannelResults;
  spendByChannel: Record<string, number>;
}

/** Build the honest channel table from real rows and run the engine. Pure math over counts —
 *  the only judgment calls (sample floors, confidence tiers) live verified in adaptive.ts.
 *  Spend source preference: API-synced platform spend (ad_metrics) over the manual log when both
 *  exist for a channel — same money, the API count is the fresher record; never summed together. */
export async function readAdaptive(worldId: string): Promise<AdaptiveRead> {
  const [results, spends, metricsQ] = await Promise.all([
    worldResults(worldId), listAdSpends(worldId),
    supabase.from('ad_metrics').select('provider, spend_usd').eq('world_id', worldId).limit(2000),
  ]);

  const spendByChannel: Record<string, number> = {};
  for (const s of spends) spendByChannel[s.channel] = (spendByChannel[s.channel] ?? 0) + Number(s.amount_usd);
  const apiSpend: Record<string, number> = {};
  for (const m of ((metricsQ.data ?? []) as { provider: string; spend_usd: number }[])) {
    const ch = m.provider === 'meta_ads' ? 'meta ads' : 'google ads';
    apiSpend[ch] = (apiSpend[ch] ?? 0) + Number(m.spend_usd);
  }
  for (const [ch, v] of Object.entries(apiSpend)) if (v > 0) spendByChannel[ch] = Math.round(v * 100) / 100;

  const srcVisits = (src: string) => results.site?.bySource.find((b) => b.source === src)?.visits ?? 0;
  const srcLeads = (src: string) => results.site?.bySource.find((b) => b.source === src)?.leads ?? 0;

  const channels: ChannelIn[] = [
    {
      name: 'email',
      out: results.email?.sent ?? 0, outLabel: 'sends',
      responses: results.email?.replies ?? 0, responseLabel: 'replies',
      spendUsd: spendByChannel['email'] ?? null,
      instrumented: results.email !== null,
    },
    {
      name: 'direct mail',
      out: results.mail?.pieces ?? 0, outLabel: 'pieces',
      // Mail's measurable return is the QR path: postcard-attributed site leads.
      responses: srcLeads('postcard'), responseLabel: 'leads',
      spendUsd: spendByChannel['direct mail'] ?? null,
      instrumented: results.mail !== null && results.site !== null,
    },
    {
      name: 'website (organic/direct)',
      out: results.site ? Math.max(0, results.site.visits - srcVisits('meta-ads') - srcVisits('google-ads') - srcVisits('postcard')) : 0,
      outLabel: 'visits',
      responses: results.site ? Math.max(0, results.site.leads - srcLeads('meta-ads') - srcLeads('google-ads') - srcLeads('postcard')) : 0,
      responseLabel: 'leads',
      spendUsd: null,
      instrumented: results.site !== null,
    },
    {
      name: 'meta ads',
      out: srcVisits('meta-ads'), outLabel: 'visits',
      responses: srcLeads('meta-ads'), responseLabel: 'leads',
      spendUsd: spendByChannel['meta ads'] ?? null,
      instrumented: results.site !== null,
    },
    {
      name: 'google ads',
      out: srcVisits('google-ads'), outLabel: 'visits',
      responses: srcLeads('google-ads'), responseLabel: 'leads',
      spendUsd: spendByChannel['google ads'] ?? null,
      instrumented: results.site !== null,
    },
    // Ad channels with spend logged but no attributed visits are running blind (or untagged).
  ].filter((c) => c.out > 0 || c.responses > 0 || (c.spendUsd ?? 0) > 0 || ['email', 'direct mail', 'website (organic/direct)'].includes(c.name));

  const recs = adapt(channels);
  const facts = channelFacts(channels);

  // A measured 'act' recommendation becomes the world's standing line — clearly sourced.
  const act = recs.find((r) => r.basis === 'measured' && r.confidence === 'act');
  if (act) {
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (uid) {
        await supabase.from('world_intelligence').upsert({
          owner_id: uid, world_id: worldId,
          recommendation: `From your numbers: ${act.text} (${act.evidence})`,
        }, { onConflict: 'world_id' });
      }
    } catch { /* the panel still shows it */ }
  }

  return { facts, recs, results, spendByChannel };
}
