// src/lib/garvis/marketingRun.ts
// The Marketing Worker's executable core — extracted so BOTH the Marketing page (useMarketing) and the
// Mission orchestrator's marketing worker call the same path. No React; takes an explicit ownerId.
// Runs the 3 chained generation stages, Verifies each deliverable, and saves them as draft assets.

import { supabase } from '../supabase';
import { rawComplete } from '../aiClient';
import { estimateCostUsd } from './directBrain';
import {
  STRATEGY_SYSTEM, POSTS_SYSTEM, ASSETS_SYSTEM,
  buildStrategyUser, buildPostsUser, buildAssetsUser,
  parseStrategy, parsePosts, parseAssets, verifyAsset,
} from './marketing';
import type { MarketingAssetKind } from '../../types';

const DEFAULT_CHANNEL: Record<MarketingAssetKind, string | null> = {
  strategy: null, calendar: null, social_post: 'x', email: 'email', landing_page: 'manual',
};

export interface GenerateCampaignInput {
  ownerId: string;
  subject: string;
  brief?: string | null;
  appId?: string | null;
  onProgress?: (stage: string) => void;
}

export interface GenerateCampaignResult { campaignId: string; summary: string; assetCount: number; costUsd: number }

export async function generateCampaign(input: GenerateCampaignInput): Promise<GenerateCampaignResult> {
  const { data: created, error } = await supabase
    .from('marketing_campaigns')
    .insert({ owner_id: input.ownerId, app_id: input.appId ?? null, subject: input.subject, brief: input.brief ?? null, status: 'generating' })
    .select().single();
  if (error) throw new Error(error.message);
  const campaignId = (created as { id: string }).id;
  let tokIn = 0, tokOut = 0, assetCount = 0;

  const insertAsset = async (kind: MarketingAssetKind, title: string, content: Record<string, unknown>) => {
    await supabase.from('marketing_assets').insert({
      owner_id: input.ownerId, campaign_id: campaignId, kind, title, content,
      channel: DEFAULT_CHANNEL[kind], status: 'draft', verify: verifyAsset(kind, content),
    });
    assetCount++;
  };

  try {
    let profile: string | null = null;
    if (input.appId) {
      const { data } = await supabase.from('garvis_app_profiles').select('purpose, audience, business_model').eq('app_id', input.appId).maybeSingle();
      if (data) profile = `purpose: ${data.purpose ?? ''}\naudience: ${data.audience ?? ''}\nbusiness model: ${data.business_model ?? ''}`;
    }

    input.onProgress?.('Researching the market & shaping strategy…');
    const r1 = await rawComplete([{ role: 'system', content: STRATEGY_SYSTEM }, { role: 'user', content: buildStrategyUser(input.subject, input.brief, profile) }], 1600);
    tokIn += r1.inputTokens; tokOut += r1.outputTokens;
    const strat = parseStrategy(r1.text);
    if (!strat) throw new Error('The strategy stage returned nothing usable.');
    const strategyJson = JSON.stringify(strat);
    await insertAsset('strategy', 'Strategy', { ...strat.strategy });
    await insertAsset('calendar', '2-week content calendar', { entries: strat.calendar });
    await supabase.from('marketing_campaigns').update({ summary: strat.summary }).eq('id', campaignId);

    input.onProgress?.('Writing social posts…');
    const r2 = await rawComplete([{ role: 'system', content: POSTS_SYSTEM }, { role: 'user', content: buildPostsUser(strategyJson, 5) }], 1800);
    tokIn += r2.inputTokens; tokOut += r2.outputTokens;
    const posts = parsePosts(r2.text);
    for (let i = 0; i < posts.length; i++) await insertAsset('social_post', `${posts[i].platform} post ${i + 1}`, { ...posts[i] });

    input.onProgress?.('Drafting the email & landing page…');
    const r3 = await rawComplete([{ role: 'system', content: ASSETS_SYSTEM }, { role: 'user', content: buildAssetsUser(strategyJson) }], 2000);
    tokIn += r3.inputTokens; tokOut += r3.outputTokens;
    const built = parseAssets(r3.text);
    if (built) {
      await insertAsset('email', 'Launch email', { ...built.email });
      await insertAsset('landing_page', 'Landing page copy', { ...built.landing });
    }

    const costUsd = estimateCostUsd(tokIn, tokOut);
    await supabase.from('marketing_campaigns').update({ status: 'review' }).eq('id', campaignId);
    return { campaignId, summary: strat.summary, assetCount, costUsd };
  } catch (e) {
    await supabase.from('marketing_campaigns').update({ status: 'failed' }).eq('id', campaignId);
    throw e;
  }
}
