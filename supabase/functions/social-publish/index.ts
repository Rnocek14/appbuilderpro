// supabase/functions/social-publish/index.ts
// THE SOCIAL PUBLISH PATH — clones send-email's approval spine: nothing posts to her accounts
// without an owned, APPROVED approvals row (kind 'publish_post'), re-verified server-side with the
// payload-hash bound at approval time and an atomic double-post claim. Posts through the connected
// provider (Ayrshare) to whatever accounts she linked on that key. The provider API key is SEALED
// in provider_connections — the browser never sees it.
//
// TWO callers, ONE path (send-email's dual-caller pattern): the OWNER's browser (JWT), or the
// standing worker's drain (x-worker-secret) executing an already-approved post unattended — the
// owner is derived FROM the approval row, never from the caller, and every gate below is shared.
//
// Deploy: in package.json functions:deploy (user-JWT gateway; the worker passes a service-role
// bearer to clear it, then authenticates on x-worker-secret). No new global secret — the provider
// key is stored per-user via the connections hub.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { getConnection } from '../_shared/connections.ts';
import { payloadMatches } from '../_shared/payloadHash.ts';
import { checkDraft, providerPayload, mapProviderResult, type SocialDraft } from '../_shared/socialCore.ts';

const AYRSHARE_URL = 'https://app.ayrshare.com/api/post';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };
    if (!approval_id) return json({ error: 'approval_id is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // TWO callers, ONE path, every gate below shared (mirrors send-email):
    //  1) the OWNER (browser) — Authorization JWT; the approval must be theirs.
    //  2) the STANDING WORKER (x-worker-secret) — serving BOTH drains: the content-week drain
    //     (garvis-auto staged weeks) and the social drain (operator-queued posts). The owner is
    //     derived FROM the approval row, never from the caller. No requested_by restriction: a
    //     publish_post approval only ever reaches 'approved' through the owner's decision in the
    //     Queue — status='approved' IS the human authority for either class, and restricting to
    //     garvis-auto would strand approved operator-queued posts. Everything downstream —
    //     payload-hash check, atomic double-post claim, checkDraft, per-brand Profile-Key — is
    //     identical either way.
    const workerSecret = Deno.env.get('WORKER_SECRET');
    const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;

    // The approval is the authority to post. Verify it: correct kind, approved, and untampered.
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result').eq('id', approval_id).single();
    if (!approval) return json({ error: 'Approval not found' }, 404);
    if (approval.kind !== 'publish_post') return json({ error: 'Approval is not a publish_post.' }, 400);
    if (approval.status !== 'approved') return json({ error: `Approval is ${approval.status}, not approved.` }, 409);
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed since it was approved — refusing to post.' }, 409);
    }

    let uid: string;
    if (byWorker) {
      uid = approval.owner_id as string;
    } else {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (approval.owner_id !== user.id) return json({ error: 'Approval not found' }, 404);
      uid = user.id;
    }

    const rowId = (approval.payload as { post_row_id?: string })?.post_row_id;
    if (!rowId) return json({ error: 'Approval payload is missing post_row_id.' }, 400);

    const { data: row } = await admin.from('social_posts')
      .select('id, owner_id, world_id, body, platforms, media_urls, scheduled_for, status, provider_post_id').eq('id', rowId).single();
    if (!row || row.owner_id !== uid) return json({ error: 'Post not found' }, 404);
    if (row.provider_post_id || !['queued'].includes(row.status)) return json({ error: `Post already ${row.status}.` }, 409);

    // Atomic double-post claim — a post is not idempotent.
    const priorResult = (approval.result as Record<string, unknown> | null) ?? {};
    const { data: claimRows, error: claimErr } = await admin.from('approvals')
      .update({ result: { ...priorResult, send_claimed_at: new Date().toISOString() } })
      .eq('id', approval_id).eq('status', 'approved').is('result->>send_claimed_at', null).select('id');
    if (claimErr || !claimRows?.length) return json({ error: 'This post is already in flight (or was claimed).' }, 409);
    const releaseClaim = (extra: Record<string, unknown> = {}) =>
      admin.from('approvals').update({ result: { ...priorResult, ...extra, send_claimed_at: null } }).eq('id', approval_id);

    const ledger = (r: Record<string, unknown>) =>
      admin.from('execution_runs').insert({ owner_id: uid, approval_id, connector: 'ayrshare', action: 'publish_post', ...r });
    const block = async (reason: string): Promise<Response> => {
      await admin.from('social_posts').update({ status: 'failed', error: reason }).eq('id', rowId);
      await ledger({ status: 'skipped', request: { post_row_id: rowId }, error: reason });
      await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- gates -----
    // An approved post whose scheduled moment has ARRIVED posts now — the drain (standing-worker)
    // wakes it when the time comes, and a moment that just passed (≤1h: a tick's lag, a short
    // outage) is still that moment. Anything staler keeps its past scheduleAt so checkDraft
    // refuses it with the honest reason — a "tonight at 8" post must never quietly go out a day
    // late. A future scheduleAt still rides to the provider for provider-side scheduling.
    const SCHEDULE_GRACE_MS = 60 * 60 * 1000;
    let scheduleAt = (row.scheduled_for as string | null) ?? null;
    if (scheduleAt) {
      const lateMs = Date.now() - new Date(scheduleAt).getTime();
      if (lateMs >= 0 && lateMs <= SCHEDULE_GRACE_MS) scheduleAt = null;
    }
    const draft: SocialDraft = {
      text: row.body ?? '', platforms: (row.platforms ?? []) as string[],
      mediaUrls: (row.media_urls ?? []) as string[],
      scheduleAt,
    };
    // Re-run the honesty/refusal gate server-side — a doc a platform would reject never goes out.
    const chk = checkDraft(draft, new Date().toISOString());
    if (!chk.ok) return await block(chk.reason ?? 'Not sendable.');

    const conn = await getConnection(admin, uid, 'ayrshare');
    if (!conn?.access_token) return await block('No social account connected — connect a provider (Ayrshare) in Settings first.');

    const scheduled = !!draft.scheduleAt;
    const headers: Record<string, string> = { 'content-type': 'application/json', Authorization: `Bearer ${conn.access_token}` };
    // WHICH BRAND'S ACCOUNTS (app_0084): a business-attributed post resolves its own Ayrshare
    // Profile-Key. Fail-closed once the owner runs multiple destinations — a mapped setup never
    // silently posts one brand's content to another brand's accounts. Zero mappings = the one
    // connected account, exactly as before.
    let profileKey = (conn.metadata as { profile_key?: string } | null)?.profile_key;
    const { data: mappings } = await admin.from('world_social_profiles')
      .select('world_id, profile_key').eq('owner_id', uid).limit(200);
    const worldId = (row.world_id as string | null) ?? null;
    if (worldId) {
      const hit = (mappings ?? []).find((m) => m.world_id === worldId);
      if (hit?.profile_key) profileKey = hit.profile_key as string;
      else if ((mappings ?? []).length > 0) {
        return await block('This business has no social destination mapped. Map its Ayrshare Profile-Key in Settings → Connections (or remove all mappings to post everything through the one connected account).');
      }
    }
    if (profileKey) headers['Profile-Key'] = profileKey;

    const res = await fetch(AYRSHARE_URL, { method: 'POST', headers, body: JSON.stringify(providerPayload(draft)) });
    const out = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = String((out as { message?: string })?.message ?? `HTTP ${res.status}`);
      await admin.from('social_posts').update({ status: 'failed', error: msg.slice(0, 400) }).eq('id', rowId);
      await ledger({ status: 'failed', request: { post_row_id: rowId }, response: { status: res.status }, error: `ayrshare ${res.status}` });
      await releaseClaim({ failed: `ayrshare ${res.status}` });
      return json({ ok: false, error: `Provider error ${res.status}: ${msg.slice(0, 300)}` }, 502);
    }

    const mapped = mapProviderResult(out as { status?: string; postIds?: { status?: string }[]; errors?: unknown[] }, scheduled);
    const providerId = (out as { id?: string })?.id ?? null;
    const now = new Date().toISOString();
    await admin.from('social_posts').update({
      status: mapped, provider_post_id: providerId,
      posted_at: mapped === 'posted' ? now : null,
      error: mapped === 'failed' ? 'Provider reported a per-platform failure — check the provider dashboard.' : null,
    }).eq('id', rowId);
    await ledger({ status: mapped === 'failed' ? 'failed' : 'ok', request: { post_row_id: rowId, platforms: draft.platforms }, response: { provider_id: providerId, mapped } });
    await admin.from('approvals').update({ result: { ...priorResult, send_claimed_at: now, provider_id: providerId, status: mapped } }).eq('id', approval_id);
    await admin.from('mind_events').insert({
      owner_id: uid, source: 'execution', event_type: 'note',
      subject: mapped === 'scheduled'
        ? `Scheduled a post to ${draft.platforms.join(', ')} for ${String(draft.scheduleAt).slice(0, 16)}`
        : mapped === 'posted' ? `Posted to ${draft.platforms.join(', ')}` : `A social post failed — check the provider.`,
      payload: { key: `social:${rowId}`, post_row_id: rowId, platforms: draft.platforms, status: mapped },
    }).then(() => {}, () => {});

    return json({ ok: mapped !== 'failed', status: mapped, provider_id: providerId, warnings: chk.warnings });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
