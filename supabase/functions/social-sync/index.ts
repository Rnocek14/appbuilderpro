// supabase/functions/social-sync/index.ts
// THE READ-BACK — Garvis posted to social and never looked at the results; this closes that loop.
// Pulls per-post analytics from Ayrshare for recently posted rows and lands them in
// social_post_metrics (app_0087): every metric nullable (absent = NULL, never fake 0), the raw
// provider object kept verbatim. Also reconciles 'scheduled' posts the provider has since posted.
//
// TWO callers, one function:
//   1) the HEARTBEAT (x-worker-secret) — every 6h, fans out across owners with an Ayrshare key.
//   2) the OWNER (browser JWT) — "sync now" for their own posts.
//
// HONEST DEGRADE: Ayrshare's analytics API is plan-gated (posting works on free; analytics needs
// Premium/Business). A 403/plan error records available:false and stamps last_synced_at so we
// don't hammer the API — the UI shows counts-only, never invented engagement numbers.
//
// Deploy: in functions:deploy:webhooks (--no-verify-jwt; both auth paths are checked in-code).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { getConnection } from '../_shared/connections.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';

const ANALYTICS_URL = 'https://app.ayrshare.com/api/analytics/post';
const MAX_POSTS_PER_OWNER = 20;
const STALE_AFTER_MS = 6 * 3600_000;
const WINDOW_MS = 30 * 24 * 3600_000;

interface PostRow {
  id: string; owner_id: string; world_id: string | null; platforms: string[];
  provider_post_id: string; status: string; posted_at: string | null;
  scheduled_for: string | null; last_synced_at: string | null;
}

/** Instagram's field names are web-confirmed; other platforms are best-effort — the raw object is
 *  stored verbatim either way, so a wrong mapping loses nothing. Absent = null, never 0. */
function mapMetrics(a: Record<string, unknown>): {
  likes: number | null; comments: number | null; shares: number | null; impressions: number | null;
  video_views: number | null; saves: number | null; clicks: number | null; engagement: number | null;
} {
  const n = (...keys: string[]): number | null => {
    for (const k of keys) {
      const v = a[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  };
  return {
    likes: n('likeCount', 'likes', 'favoriteCount'),
    comments: n('commentsCount', 'commentCount', 'comments'),
    shares: n('sharesCount', 'shareCount', 'retweetCount', 'shares'),
    impressions: n('impressionsCount', 'impressionCount', 'impressions', 'viewsCount'),
    video_views: n('videoViews', 'videoViewCount', 'viewCount'),
    saves: n('savedCount', 'saveCount', 'saves'),
    clicks: n('clickCount', 'clicks'),
    engagement: n('engagementCount', 'engagement'),
  };
}

async function syncOwner(
  // deno-lint-ignore no-explicit-any
  admin: any, uid: string,
): Promise<{ synced: number; skipped: number; available: boolean; error?: string }> {
  const conn = await getConnection(admin, uid, 'ayrshare');
  if (!conn?.access_token) return { synced: 0, skipped: 0, available: false, error: 'No Ayrshare connection.' };

  const now = Date.now();
  const cutoff = new Date(now - WINDOW_MS).toISOString();
  const staleBefore = new Date(now - STALE_AFTER_MS).toISOString();
  const { data: posts } = await admin.from('social_posts')
    .select('id, owner_id, world_id, platforms, provider_post_id, status, posted_at, scheduled_for, last_synced_at')
    .eq('owner_id', uid).not('provider_post_id', 'is', null).in('status', ['posted', 'scheduled'])
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)
    .order('created_at', { ascending: false }).limit(MAX_POSTS_PER_OWNER);

  // Per-world Ayrshare Profile-Keys (app_0084): analytics must use the SAME profile the post was
  // published under, or the provider answers "post not found".
  const { data: mappings } = await admin.from('world_social_profiles')
    .select('world_id, profile_key').eq('owner_id', uid).limit(200);
  const defaultKey = (conn.metadata as { profile_key?: string } | null)?.profile_key ?? null;

  let synced = 0, skipped = 0, available = true;
  for (const row of (posts ?? []) as PostRow[]) {
    const when = Date.parse(row.posted_at ?? row.scheduled_for ?? '');
    if (Number.isFinite(when) && when < now - WINDOW_MS && (row.posted_at ?? row.scheduled_for ?? '') < cutoff) { skipped++; continue; }

    const headers: Record<string, string> = {
      'content-type': 'application/json', Authorization: `Bearer ${conn.access_token}`,
    };
    const hit = row.world_id ? ((mappings ?? []) as { world_id: string; profile_key: string }[]).find((m) => m.world_id === row.world_id) : undefined;
    const profileKey = hit?.profile_key ?? defaultKey;
    if (profileKey) headers['Profile-Key'] = profileKey;

    try {
      const res = await fetch(ANALYTICS_URL, {
        method: 'POST', headers,
        body: JSON.stringify({ id: row.provider_post_id, platforms: row.platforms?.length ? row.platforms : undefined }),
      });
      const out = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.status === 403 || res.status === 402) {
        // Plan-gated: analytics needs Ayrshare Premium/Business. Stamp so we stop hammering; the
        // client renders counts-only ("analytics not on this plan"), never invented numbers.
        available = false;
        await admin.from('social_posts').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id);
        break;
      }
      if (!res.ok) { skipped++; continue; }

      // Response shape: { <platform>: { analytics: {...} } , ...} (per Ayrshare docs research).
      for (const [platform, val] of Object.entries(out as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        const analytics = ((val as Record<string, unknown>).analytics ?? val) as Record<string, unknown>;
        if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) continue;
        const m = mapMetrics(analytics);
        // A platform entry with NO recognizable numbers and no analytics object is provider noise
        // (e.g. status fields) — keep it only if the raw object has content worth keeping.
        if (Object.values(m).every((v) => v === null) && Object.keys(analytics).length === 0) continue;
        await admin.from('social_post_metrics').upsert({
          owner_id: uid, post_id: row.id, world_id: row.world_id, platform,
          ...m, raw: analytics, synced_at: new Date().toISOString(),
        }, { onConflict: 'post_id,platform' });
      }

      // Reconcile the terminal-'scheduled' gap: if the provider reports the post live, say so.
      const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
      if (row.status === 'scheduled') {
        patch.status = 'posted';
        patch.posted_at = row.posted_at ?? new Date().toISOString();
      }
      await admin.from('social_posts').update(patch).eq('id', row.id);
      synced++;
    } catch { skipped++; }
  }
  return { synced, skipped, available };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const workerSecret = Deno.env.get('WORKER_SECRET');
  const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;
  const body = (await req.json().catch(() => ({}))) as { owner_id?: string };

  try {
    if (byWorker) {
      await stampHeartbeat(admin, 'social-sync');
      if (body.owner_id) {
        const r = await syncOwner(admin, body.owner_id);
        return json({ ok: true, ...r });
      }
      // Fan out: every owner with an Ayrshare connection; one owner's failure never blocks the rest.
      const { data: conns } = await admin.from('provider_connections')
        .select('user_id').eq('provider', 'ayrshare').limit(500);
      const owners = [...new Set(((conns ?? []) as { user_id: string }[]).map((c) => c.user_id))];
      let synced = 0;
      for (const uid of owners) {
        try { synced += (await syncOwner(admin, uid)).synced; } catch { /* next owner */ }
      }
      return json({ ok: true, owners: owners.length, synced });
    }

    // Owner path: their JWT, their posts only.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const r = await syncOwner(admin, user.id);
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
