// supabase/functions/generate-video/index.ts
// VEO 3.1 scene generation — build the curated, per-trade library of photoreal scroll clips.
// Owner-driven (the operator, signed in). Veo is a LONG-RUNNING op, so this is start → poll →
// (download + store) → approve, not one blocking call. Reuses the pure core (videoScenes.ts) for the
// request/response shaping; the DB row is scroll_scenes.
//
// Deploy: npx supabase functions deploy generate-video
// Secrets: GEMINI_API_KEY (Veo access). Optional: VEO_MODEL, GEMINI_BASE, VEO_COST_PER_SEC.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  SCENE_PROMPTS, buildVeoRequest, veoOperationName, veoResult, sceneUpdateAfterPoll,
  isVideoSceneKind, VEO_MODEL_STANDARD, VEO_MODEL_FAST,
} from '../../../src/lib/garvis/videoScenes.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BASE = () => Deno.env.get('GEMINI_BASE') ?? 'https://generativelanguage.googleapis.com/v1beta';
const DURATION = 8;   // Veo default clip length (seconds) — used for the cost estimate.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const ownerId = user.id;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = (await req.json().catch(() => ({}))) as { action?: string; sceneKind?: string; sceneId?: string; prompt?: string; fast?: boolean };
    const action = body.action ?? 'start';

    // LIST — the operator's scene library.
    if (action === 'list') {
      const { data } = await admin.from('scroll_scenes')
        .select('id, scene_kind, status, prompt, video_url, poster_url, cost_usd, error, created_at, approved_at')
        .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(100);
      return json({ ok: true, scenes: data ?? [] });
    }

    // APPROVE — bless a 'ready' clip so the site generator may use it.
    if (action === 'approve') {
      if (!body.sceneId) return json({ error: 'sceneId required' }, 400);
      const { error } = await admin.from('scroll_scenes')
        .update({ status: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', body.sceneId).eq('owner_id', ownerId).eq('status', 'ready');
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, status: 'approved' });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'GEMINI_API_KEY is not set — add your Google AI (Veo) key in Supabase secrets.' }, 400);

    // START — kick off a Veo generation and record the row.
    if (action === 'start') {
      const kind = body.sceneKind ?? '';
      if (!isVideoSceneKind(kind)) return json({ error: `Unknown scene kind "${kind}".` }, 400);
      const prompt = (body.prompt && body.prompt.trim()) || SCENE_PROMPTS[kind].prompt;
      const model = body.fast ? (Deno.env.get('VEO_MODEL_FAST') ?? VEO_MODEL_FAST) : (Deno.env.get('VEO_MODEL') ?? VEO_MODEL_STANDARD);
      const reqBody = buildVeoRequest(prompt, { negativePrompt: SCENE_PROMPTS[kind].negative, aspectRatio: '16:9' });

      const res = await fetch(`${BASE()}/models/${model}:predictLongRunning`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(reqBody),
      });
      const started = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (started as { error?: { message?: string } })?.error?.message ?? `Veo ${res.status}`;
        return json({ error: `Veo rejected the request: ${String(msg).slice(0, 200)}` }, 502);
      }
      const opName = veoOperationName(started);
      if (!opName) return json({ error: 'Veo did not return an operation to poll.' }, 502);

      const { data: row, error } = await admin.from('scroll_scenes').insert({
        owner_id: ownerId, scene_kind: kind, prompt, provider: 'veo',
        status: 'generating', operation_id: opName,
      }).select('id').single();
      if (error || !row) return json({ error: error?.message ?? 'Could not record the scene.' }, 500);
      return json({ ok: true, sceneId: (row as { id: string }).id, status: 'generating' });
    }

    // POLL — check the operation; when done, download the clip and store it.
    if (action === 'poll') {
      if (!body.sceneId) return json({ error: 'sceneId required' }, 400);
      const { data: row } = await admin.from('scroll_scenes')
        .select('id, owner_id, operation_id, status, scene_kind').eq('id', body.sceneId).eq('owner_id', ownerId).maybeSingle();
      if (!row) return json({ error: 'Scene not found.' }, 404);
      const r = row as { id: string; operation_id: string | null; status: string; scene_kind: string };
      if (r.status !== 'generating') return json({ ok: true, status: r.status });   // already resolved
      if (!r.operation_id) return json({ error: 'Scene has no operation to poll.' }, 400);

      const opRes = await fetch(`${BASE()}/${r.operation_id}`, { headers: { 'x-goog-api-key': apiKey } });
      const opJson = await opRes.json().catch(() => ({}));
      if (!opRes.ok) return json({ error: `Veo poll failed: ${opRes.status}` }, 502);

      const result = veoResult(opJson);
      const upd = sceneUpdateAfterPoll(result);
      if (!upd.done) return json({ ok: true, status: 'generating' });

      if (upd.status === 'failed') {
        await admin.from('scroll_scenes').update({ status: 'failed', error: (result.error ?? 'Veo returned no video.').slice(0, 300), updated_at: new Date().toISOString() }).eq('id', r.id);
        return json({ ok: true, status: 'failed', error: result.error });
      }

      // Download the finished clip (Veo file URIs need the API key) and stash it in storage.
      const dl = await fetch(result.videoUri!, { headers: { 'x-goog-api-key': apiKey } });
      if (!dl.ok) return json({ error: `Could not download the Veo clip: ${dl.status}` }, 502);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 200 * 1024 * 1024) {
        await admin.from('scroll_scenes').update({ status: 'failed', error: 'Clip was empty or too large.', updated_at: new Date().toISOString() }).eq('id', r.id);
        return json({ ok: true, status: 'failed', error: 'Clip was empty or too large.' });
      }
      const path = `${ownerId}/scenes/${r.id}.mp4`;
      const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'video/mp4', upsert: true });
      if (up.error) return json({ error: `Storage upload failed: ${up.error.message}` }, 500);
      const videoUrl = admin.storage.from('project-assets').getPublicUrl(path).data.publicUrl as string;
      const costUsd = DURATION * Number(Deno.env.get('VEO_COST_PER_SEC') ?? '0.75');

      await admin.from('scroll_scenes').update({
        status: 'ready', video_url: videoUrl, cost_usd: costUsd, updated_at: new Date().toISOString(),
      }).eq('id', r.id);
      return json({ ok: true, status: 'ready', videoUrl, costUsd });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
