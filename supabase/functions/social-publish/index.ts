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
import { checkDraft, providerPayload, mapProviderResult, platformUrls, type SocialDraft } from '../_shared/socialCore.ts';
import { disclosureGate, parseProvenance } from '../_shared/mediaProvenanceCore.ts';
import { bytesDigest, parseVersionContent, readBoundPayload, versionHash } from '../_shared/postVersionCore.ts';
import { factGate, parseFact } from '../_shared/reFactsCore.ts';
import { complianceGate } from '../_shared/publishGate.ts';

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
    //     derived FROM the approval row, never from the caller. No requested_by restriction for the
    //     legacy path: a publish_post approval reaches 'approved' through the owner's decision in
    //     the Queue, so status='approved' IS the human authority for either class, and restricting
    //     it would strand approved operator-queued posts. (BOUND posts — app_0140 — are stricter:
    //     the content-week drain mints pre-approved 'garvis-auto' approvals, and those are refused
    //     below, because nothing may publish to a real account on a decision no person made.) Everything downstream —
    //     payload-hash check, atomic double-post claim, checkDraft, per-brand Profile-Key — is
    //     identical either way.
    const workerSecret = Deno.env.get('WORKER_SECRET');
    const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;

    // The approval is the authority to post. Verify it: correct kind, approved, and untampered.
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result, requested_by').eq('id', approval_id).single();
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

    const bound = readBoundPayload(approval.payload);
    const rowId = bound.postRowId;
    if (!rowId) return json({ error: 'Approval payload is missing post_row_id.' }, 400);

    const { data: row } = await admin.from('social_posts')
      .select('id, owner_id, world_id, campaign_id, body, platforms, media_urls, scheduled_for, status, provider_post_id, ai_provenance, current_version_id')
      .eq('id', rowId).single();
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
    // Keep the channel episode's stored truth in step with its post — a blocked/failed publish
    // must never leave an episode claiming 'queued' (the silent-outage dead-end the walkthrough
    // audit found). Best-effort: episodes are optional callers of this path.
    const episodeSync = (status: 'posted' | 'failed', err: string | null) =>
      admin.from('channel_episodes').update({ status, error: err }).eq('post_id', rowId).then(() => {}, () => {});
    const block = async (reason: string): Promise<Response> => {
      await admin.from('social_posts').update({ status: 'failed', error: reason }).eq('id', rowId);
      await episodeSync('failed', reason);
      await ledger({ status: 'skipped', request: { post_row_id: rowId }, error: reason });
      await admin.from('mind_events').insert({
        owner_id: uid, source: 'execution', event_type: 'note',
        subject: `A social post was BLOCKED: ${reason.slice(0, 140)}`,
        payload: { key: `social:${rowId}`, post_row_id: rowId, blocked: true },
      }).then(() => {}, () => {});
      await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- THE BINDING (app_0140) -----
    // What publishes is the IMMUTABLE VERSION the human approved, not the live row. The version row
    // cannot be edited (RLS grants select+insert only, and a trigger refuses update/delete even for
    // the service role), and its hash is re-derived here and compared against the one bound into the
    // approval — so an edit after approval cannot reach an account; it needs a new decision.
    //
    // This rail refuses two things outright that the general path tolerates:
    //   * a version-less payload for a post that HAS a version — the binding is never optional;
    //   * an approval no human decided (requested_by 'garvis-auto'), because the content-week drain
    //     mints pre-approved publish_post rows and those must never reach a real estate account.
    // A legacy post with no version at all still publishes exactly as it did before.
    let versionContent: ReturnType<typeof parseVersionContent> | null = null;
    const hasVersion = !!(bound.versionId || (row as { current_version_id?: string }).current_version_id);
    if (hasVersion) {
      if (String(approval.requested_by ?? '') === 'garvis-auto') {
        return await block('This post was approved by automation, not by a person — it will not publish.');
      }
      if (!bound.versionId || !bound.contentHash) {
        return await block('This post has an approved version but the approval is not bound to it — re-approve it.');
      }
      const { data: ver } = await admin.from('post_versions')
        .select('id, post_id, owner_id, body, platforms, media_urls, media_digests, ai_provenance, scheduled_for, scheduled_local, schedule_tz, fact_ids, compliance_line, content_hash')
        .eq('id', bound.versionId).single();
      if (!ver || ver.owner_id !== uid || ver.post_id !== rowId) {
        return await block('The approved version for this post could not be found.');
      }
      versionContent = parseVersionContent(ver);
      const recomputed = await versionHash(versionContent);
      if (recomputed !== bound.contentHash || ver.content_hash !== bound.contentHash) {
        // Content changed after the decision — the decision no longer covers it (the content-week
        // pieces_hash precedent, standing-worker).
        return await block('The content changed after this was approved — approve the new version to publish it.');
      }
    }

    // ----- gates -----
    // An approved post whose scheduled moment has ARRIVED posts now — the drain (standing-worker)
    // wakes it when the time comes, and a moment that just passed (≤1h: a tick's lag, a short
    // outage) is still that moment. Anything staler keeps its past scheduleAt so checkDraft
    // refuses it with the honest reason — a "tonight at 8" post must never quietly go out a day
    // late. A future scheduleAt still rides to the provider for provider-side scheduling.
    const SCHEDULE_GRACE_MS = 60 * 60 * 1000;
    let scheduleAt = versionContent ? versionContent.scheduledFor : ((row.scheduled_for as string | null) ?? null);
    if (scheduleAt) {
      const lateMs = Date.now() - new Date(scheduleAt).getTime();
      if (lateMs >= 0 && lateMs <= SCHEDULE_GRACE_MS) scheduleAt = null;
    }
    const draft: SocialDraft = versionContent
      ? { text: versionContent.body, platforms: versionContent.platforms, mediaUrls: versionContent.mediaUrls, scheduleAt }
      : {
        text: row.body ?? '', platforms: (row.platforms ?? []) as string[],
        mediaUrls: (row.media_urls ?? []) as string[],
        scheduleAt,
      };
    // Re-run the honesty/refusal gate server-side — a doc a platform would reject never goes out.
    const chk = checkDraft(draft, new Date().toISOString());
    if (!chk.ok) return await block(chk.reason ?? 'Not sendable.');

    // THE AI-LABEL HARD GATE (fail-closed, server-side): AI-generated media never publishes without
    // its visible disclosure in the caption. The approval payload is only { post_row_id }, so the
    // payload hash alone can't protect body/media — this re-derivation from the DB is the binding:
    // the post row's own stamp OR any attached media's cluster_files provenance triggers the gate.
    // Platform policy (TikTok strikes for unlabeled AI since 2025) and the house honesty rule agree.
    let prov = parseProvenance((row as { ai_provenance?: unknown }).ai_provenance);
    if (!prov && (draft.mediaUrls ?? []).length) {
      const { data: mediaRows } = await admin.from('cluster_files')
        .select('ai_provenance').in('url', draft.mediaUrls as string[]).limit(20);
      for (const m of (mediaRows ?? []) as { ai_provenance?: unknown }[]) {
        prov = parseProvenance(m.ai_provenance);
        if (prov) break;
      }
    }
    const aiGate = disclosureGate(draft.text, prov);
    if (aiGate) return await block(aiGate);

    if (versionContent) {
      // FACT FRESHNESS AT SEND TIME (app_0139). A post can sit approved for days; a fact can go
      // stale, be retired, or pass its review date in between. The decision covered a claim that was
      // true when it was made — not one that stopped being true since.
      if (versionContent.factIds.length) {
        const { data: factRows } = await admin.from('re_facts')
          .select('id, claim, value_text, status, reviewed_at, review_due_at, re_fact_sources(count)')
          .in('id', versionContent.factIds).limit(100);
        const facts = ((factRows ?? []) as Record<string, unknown>[]).map((f) => parseFact({
          ...f,
          source_count: Array.isArray(f.re_fact_sources)
            ? Number((f.re_fact_sources[0] as { count?: number } | undefined)?.count ?? 0)
            : 0,
        })).filter((f): f is NonNullable<typeof f> => !!f);
        const stale = factGate(versionContent.factIds, facts, new Date().toISOString());
        if (stale) return await block(stale);
      }
      // THE BROKERAGE LINE. Required where it is configured, exactly like CAN-SPAM's physical
      // address is required in send-email — the caption is where a licensed agent must carry it.
      const complianceProblem = complianceGate(draft.text, versionContent.complianceLine);
      if (complianceProblem) return await block(complianceProblem);

      // MEDIA BYTES. generate-video and render-video upload with upsert:true to a deterministic
      // path, so the bytes behind an approved URL can change WITHOUT the URL changing — binding the
      // words while the picture floats free would be a half-binding. The approved digest is compared
      // against the bytes as they are right now.
      //
      // If the bytes cannot be read (network, timeout, a host that went away), this does NOT block:
      // a transient fetch failure must not strand an approved post. It is recorded on the run
      // instead, so "we could not verify the image" is visible rather than assumed.
      const digests = versionContent.mediaDigests;
      const digestUrls = Object.keys(digests).slice(0, 4);
      const mediaUnverified: string[] = [];
      for (const url of digestUrls) {
        try {
          const mres = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (!mres.ok) { mediaUnverified.push(url); continue; }
          const now = await bytesDigest(await mres.arrayBuffer());
          if (now !== digests[url]) {
            return await block('The media on this post was replaced after it was approved — approve the new version to publish it.');
          }
        } catch {
          mediaUnverified.push(url);
        }
      }
      if (mediaUnverified.length) {
        await ledger({
          status: 'ok', request: { post_row_id: rowId },
          response: { media_unverified: mediaUnverified.length },
          error: 'Could not re-read attached media to verify it is unchanged.',
        });
      }
    }

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

    // THE SEND — and the one case the old code could not survive. A thrown fetch (30s abort, DNS,
    // a dropped connection) used to escape to the outer catch: the claim was never released, the
    // post row was never touched, and it sat 'queued'-and-claimed forever. Worse, the abort can fire
    // AFTER the provider accepted the post, so the post could be LIVE while our row said 'queued'
    // with no provider id — and social-sync only looks at rows that HAVE one, so nobody would ever
    // see it. 'in_flight' + claimed_at says the honest thing: it was sent, the answer is unknown,
    // and it must be reconciled before any retry that could duplicate it.
    let res: Response;
    try {
      res = await fetch(AYRSHARE_URL, { method: 'POST', headers, body: JSON.stringify(providerPayload(draft)), signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const nowIso = new Date().toISOString();
      await admin.from('social_posts').update({
        status: 'in_flight', claimed_at: nowIso,
        error: 'The provider did not answer in time. This may or may not have posted — it will be checked before anything is retried.',
      }).eq('id', rowId);
      await ledger({ status: 'retrying', request: { post_row_id: rowId }, error: `provider timeout: ${why.slice(0, 200)}` });
      await admin.from('mind_events').insert({
        owner_id: uid, source: 'execution', event_type: 'note',
        subject: 'A social post was sent but the provider never answered — it needs checking before any retry.',
        payload: { key: `social:${rowId}`, post_row_id: rowId, in_flight: true },
      }).then(() => {}, () => {});
      // The claim is deliberately NOT released: releasing it would invite a second send of a post
      // that may already be live.
      return json({ ok: false, status: 'in_flight', error: 'The provider did not answer in time — this post is being reconciled.' }, 504);
    }
    const out = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = String((out as { message?: string })?.message ?? `HTTP ${res.status}`);
      await admin.from('social_posts').update({ status: 'failed', error: msg.slice(0, 400) }).eq('id', rowId);
      await episodeSync('failed', msg.slice(0, 400));
      await ledger({ status: 'failed', request: { post_row_id: rowId }, response: { status: res.status }, error: `ayrshare ${res.status}` });
      await releaseClaim({ failed: `ayrshare ${res.status}` });
      return json({ ok: false, error: `Provider error ${res.status}: ${msg.slice(0, 300)}` }, 502);
    }

    const mapped = mapProviderResult(out as { status?: string; postIds?: { status?: string }[]; errors?: unknown[] }, scheduled);
    const providerId = (out as { id?: string })?.id ?? null;
    // The link a human can actually open. Absent for a scheduled post (nothing exists yet) and for
    // any platform that returns none — social-sync fills those in later if the provider offers them.
    const urls = platformUrls(out);
    const now = new Date().toISOString();
    await admin.from('social_posts').update({
      status: mapped, provider_post_id: providerId,
      ...(Object.keys(urls).length ? { post_urls: urls } : {}),
      posted_at: mapped === 'posted' ? now : null,
      claimed_at: null,
      error: mapped === 'failed' ? 'Provider reported a per-platform failure — check the provider dashboard.' : null,
    }).eq('id', rowId);
    if (mapped === 'posted') await episodeSync('posted', null);
    if (mapped === 'failed') await episodeSync('failed', 'Provider reported a per-platform failure — check the provider dashboard.');
    await ledger({ status: mapped === 'failed' ? 'failed' : 'ok', request: { post_row_id: rowId, platforms: draft.platforms }, response: { provider_id: providerId, mapped, post_urls: urls } });
    await admin.from('approvals').update({ result: { ...priorResult, send_claimed_at: now, provider_id: providerId, status: mapped } }).eq('id', approval_id);
    await admin.from('mind_events').insert({
      owner_id: uid, source: 'execution', event_type: 'note',
      subject: mapped === 'scheduled'
        ? `Scheduled a post to ${draft.platforms.join(', ')} for ${String(draft.scheduleAt).slice(0, 16)}`
        : mapped === 'posted' ? `Posted to ${draft.platforms.join(', ')}` : `A social post failed — check the provider.`,
      payload: { key: `social:${rowId}`, post_row_id: rowId, platforms: draft.platforms, status: mapped },
    }).then(() => {}, () => {});

    return json({ ok: mapped !== 'failed', status: mapped, provider_id: providerId, post_urls: urls, warnings: chk.warnings });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
