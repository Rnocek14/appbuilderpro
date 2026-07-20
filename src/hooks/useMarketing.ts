// src/hooks/useMarketing.ts
// The Marketing Worker — Garvis's first DO-layer worker. Takes a brief about a subject (a portfolio
// app or an external business) and produces real, reviewable deliverables via chained model calls:
//   strategy + calendar  →  social posts  →  launch email + landing-page copy
// Every asset is Verified (deterministic acceptance gate) and saved as a draft. The founder reviews,
// approves, and publishes via prefilled composer intents (approve-to-publish). DIRECT mode (rawComplete),
// no edge deploy — consistent with the rest of Garvis. Logs an `analyze`/content run for history.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateCampaign } from '../lib/garvis/marketingRun';
import { buildShareUrl, postText } from '../lib/garvis/channels';
import { queueSocialPost } from '../lib/garvis/socialRun';
import type { MarketingAsset, MarketingCampaign } from '../types';

export interface RunCampaignInput {
  subject: string;
  brief?: string;
  appId?: string | null;
  onProgress?: (stage: string) => void;
}

export function useMarketing() {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [assets, setAssets] = useState<MarketingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [c, a] = await Promise.all([
        supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('marketing_assets').select('*').order('created_at', { ascending: true }),
      ]);
      setCampaigns((c.data as MarketingCampaign[]) ?? []);
      setAssets((a.data as MarketingAsset[]) ?? []);
    } finally {
      setLoading(false); // a failed load must never leave an eternal spinner
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`garvis-marketing-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_campaigns' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_assets' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, refresh]);

  const assetsByCampaign = useMemo(() => {
    const m: Record<string, MarketingAsset[]> = {};
    for (const a of assets) (m[a.campaign_id] ??= []).push(a);
    return m;
  }, [assets]);

  /**
   * Run the worker end to end via the shared core (generateCampaign), then log the run. Returns the
   * campaign id. The Mission orchestrator's marketing worker calls the same core directly.
   */
  const runCampaign = useCallback(async (input: RunCampaignInput): Promise<string | null> => {
    if (!session) throw new Error('Marketing worker requires an authenticated user.');
    setRunningId('pending');
    try {
      const res = await generateCampaign({ ownerId: session.user.id, subject: input.subject, brief: input.brief, appId: input.appId ?? null, onProgress: input.onProgress });
      await supabase.from('agent_runs').insert({
        owner_id: session.user.id, app_id: input.appId ?? null, kind: 'content',
        title: `Marketing campaign: ${input.subject}`, status: 'succeeded', phase: 'act',
        input: input.brief ?? null, output: res.summary, cost_usd: res.costUsd, spent_usd: res.costUsd,
        finished_at: new Date().toISOString(),
      });
      await refresh();
      return res.campaignId;
    } finally {
      setRunningId(null);
    }
  }, [session, refresh]);

  // ---- asset lifecycle (the approve-to-publish gate) ----
  // MUTATIONS THROW ON FAILURE (design review): these swallowed supabase errors, so a failed
  // status flip looked identical to a successful one — the UI moved on while the row never changed.
  const must = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
  const setAssetChannel = async (id: string, channel: string) => { must((await supabase.from('marketing_assets').update({ channel }).eq('id', id)).error); await refresh(); };
  const approveAsset = async (id: string) => { must((await supabase.from('marketing_assets').update({ status: 'approved' }).eq('id', id)).error); await refresh(); };
  const rejectAsset = async (id: string) => { must((await supabase.from('marketing_assets').update({ status: 'rejected' }).eq('id', id)).error); await refresh(); };
  /** Schedule = queue on the REAL social rail with a future fire time (scan B6: the old version
   *  only stamped status='scheduled' and nothing ever drained marketing_assets — the label lied).
   *  The post waits as a pending approval; once approved, the standing-worker social drain posts
   *  it when its moment arrives. Channels with no automated sender refuse honestly. */
  const scheduleAsset = async (asset: MarketingAsset, whenISO: string) => {
    const channel = (asset.channel ?? 'manual') as 'x' | 'email' | 'linkedin' | 'manual';
    if (channel !== 'x' && channel !== 'linkedin') {
      throw new Error('Scheduling runs on the social rail — email/manual assets have no automated sender; use Publish when you are ready to send it yourself.');
    }
    await queueSocialPost({ text: postText(asset.content), platforms: [channel === 'x' ? 'twitter' : 'linkedin'], scheduleAt: whenISO });
    must((await supabase.from('marketing_assets').update({ status: 'scheduled', scheduled_for: whenISO }).eq('id', asset.id)).error);
    await refresh();
  };

  /**
   * Publish through the REAL rails where one exists. Social channels (x/linkedin) queue an actual
   * social_post behind a PENDING approval — the same spine every other outbound uses; it posts via
   * Ayrshare once approved in the Queue. The asset is marked 'scheduled' (queued), never
   * 'published', because approval hasn't executed yet. Channels with no rail (email needs a
   * human-chosen audience; 'manual') keep the prefilled-composer handoff and mark published,
   * since the operator is genuinely doing that send themselves.
   */
  const publishAsset = async (asset: MarketingAsset): Promise<'queued' | 'manual'> => {
    const channel = (asset.channel ?? 'manual') as 'x' | 'email' | 'linkedin' | 'manual';
    if (channel === 'x' || channel === 'linkedin') {
      await queueSocialPost({ text: postText(asset.content), platforms: [channel === 'x' ? 'twitter' : 'linkedin'] });
      must((await supabase.from('marketing_assets').update({ status: 'scheduled', scheduled_for: new Date().toISOString() }).eq('id', asset.id)).error);
      await refresh();
      return 'queued';
    }
    const url = buildShareUrl(channel, asset.kind, asset.content);
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    must((await supabase.from('marketing_assets').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', asset.id)).error);
    await refresh();
    return 'manual';
  };

  const deleteCampaign = async (id: string) => { must((await supabase.from('marketing_campaigns').delete().eq('id', id)).error); await refresh(); };

  return {
    campaigns, assets, assetsByCampaign, loading, runningId, refresh,
    runCampaign, setAssetChannel, approveAsset, rejectAsset, scheduleAsset, publishAsset, deleteCampaign,
  };
}
