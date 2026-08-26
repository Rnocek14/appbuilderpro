// supabase/functions/generate-clip/index.ts
// THE CLIP ENGINE — the seam app_0071 built and nothing ever connected, now live on current
// renderers. One shot (a reel_clips row wired to the Cast) becomes N CANDIDATES; each is generated
// by the routed provider, copied into durable storage, vision-QA'd against the characters'
// CANONICAL references, and only an accepted candidate becomes the shot — writing its continuity
// state forward for the next one. The pure cores (mediaCast.ts, videoQa.ts) own every decision;
// this function is the plumbing: auth, credits, provider HTTP, storage.
//
//   { action: 'start',  clipId, candidates?, provider?, hero? }  → queue N generations
//   { action: 'poll',   candidateId }                            → provider status; done → durable copy
//   { action: 'qa',     candidateId, frames: [base64...] }       → vision QA vs canonical refs
//                                                                  (frames come from the BROWSER —
//                                                                  the autoCut pattern: the client
//                                                                  decodes media free; the server judges)
//   { action: 'accept', candidateId, continuityOut? }            → candidate becomes the shot
//   { action: 'list',   clipId }                                 → candidates + verdicts
//
// Credit-gated per candidate (kind 'video_clip' — the spend guard rides inside checkCredits).
// Provenance: every stored clip carries the AI stamp; the disclosure gate downstream enforces the
// label at publish. Honest degradation: no FAL_KEY → { available:false, setup } — never a fake clip.
//
// Deploy: npx supabase functions deploy generate-clip
// Secrets: FAL_KEY (Seedance). GEMINI_API_KEY (Veo). Optional: SEEDANCE_MODEL, SEEDANCE_MODEL_FAST.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';
import { completeVision, parseJson, type VisionImage } from '../_shared/ai.ts';
import { aiProvenance } from '../_shared/mediaProvenanceCore.ts';
import {
  PROVIDER_CAPS, isClipProvider, resolveReferences, buildSeedanceRequest, compileShot,
  estimateClipCostUsd, routeShot, type ClipProvider, type ShotSpec, type CastIndex, type RefAsset,
} from '../../../src/lib/garvis/mediaCast.ts';
import {
  buildQaPrompt, parseObservation, judge, type QaObservation,
} from '../../../src/lib/garvis/videoQa.ts';
import { buildVeoRequest, veoOperationName, veoResult } from '../../../src/lib/garvis/videoScenes.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETUP = [
  '1. Create a fal.ai account and copy an API key.',
  '2. Set the secret: supabase secrets set FAL_KEY=<key>',
  '3. Optional (Veo for establishing shots): supabase secrets set GEMINI_API_KEY=<key>',
  '4. Queue the shot again.',
];

const FAL_QUEUE = 'https://queue.fal.run';
const seedanceModel = (fast: boolean) =>
  fast ? (Deno.env.get('SEEDANCE_MODEL_FAST') ?? 'bytedance/seedance-2.0/fast/reference-to-video')
       : (Deno.env.get('SEEDANCE_MODEL') ?? 'bytedance/seedance-2.0/reference-to-video');
const GEMINI_BASE = () => Deno.env.get('GEMINI_BASE') ?? 'https://generativelanguage.googleapis.com/v1beta';
const MAX_CANDIDATES = 4;
const MAX_QA_FRAMES = 8;

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

    const body = (await req.json().catch(() => ({}))) as {
      action?: string; clipId?: string; candidateId?: string; candidates?: number;
      provider?: string; hero?: boolean; frames?: string[]; continuityOut?: Record<string, unknown>;
    };
    const action = body.action ?? 'list';

    // ---- shared loaders ------------------------------------------------------------------------

    const loadClip = async (clipId: string) => {
      const { data: clip } = await admin.from('reel_clips').select('*').eq('id', clipId).eq('owner_id', ownerId).single();
      return clip as Record<string, unknown> | null;
    };

    /** The clip row → the pure ShotSpec + cast index + approved asset pool. */
    const loadShot = async (clip: Record<string, unknown>) => {
      const characterIds = (clip.character_ids as string[] | null) ?? [];
      const locationId = (clip.location_id as string | null) ?? undefined;
      const cast: CastIndex = { characters: {}, locations: {} };
      let assets: RefAsset[] = [];
      const subjectIds = [...characterIds, ...(locationId ? [locationId] : [])];
      if (subjectIds.length) {
        const [{ data: chars }, { data: locs }, { data: rows }] = await Promise.all([
          admin.from('media_characters').select('id, name, likeness, consented_at').in('id', characterIds.length ? characterIds : ['00000000-0000-0000-0000-000000000000']),
          locationId ? admin.from('media_locations').select('id, name').eq('id', locationId) : Promise.resolve({ data: [] }),
          admin.from('media_ref_assets').select('id, subject_kind, subject_id, kind, label, file_url, approved')
            .eq('owner_id', ownerId).in('subject_id', subjectIds).eq('approved', true),
        ]);
        // THE LIKENESS GATE — server-side, fail-closed (the disclosure-gate pattern): a real
        // person's face never reaches a renderer without recorded consent on the character row.
        const noConsent = ((chars ?? []) as Array<{ name: string; likeness?: string; consented_at?: string | null }>)
          .filter((c) => c.likeness === 'real' && !c.consented_at);
        if (noConsent.length) {
          throw new Error(`${noConsent.map((c) => c.name).join(', ')} ${noConsent.length === 1 ? 'is' : 'are'} a real person without recorded consent — record their consent on the character before generating.`);
        }
        for (const c of (chars ?? []) as Array<{ id: string; name: string }>) cast.characters[c.id] = { name: c.name };
        for (const l of (locs ?? []) as Array<{ id: string; name: string }>) cast.locations[l.id] = { name: l.name };
        assets = ((rows ?? []) as Array<Record<string, unknown>>).map((a) => ({
          id: a.id as string, subjectKind: a.subject_kind as RefAsset['subjectKind'], subjectId: a.subject_id as string,
          kind: a.kind as RefAsset['kind'], label: (a.label as string) ?? '', fileUrl: a.file_url as string, approved: true,
        }));
      }
      // The storyboard scene carries direction; the clip row carries the shot's prompt + cast wiring.
      const meta = (clip.continuity_in ?? {}) as ShotSpec['continuityIn'];
      const shot: ShotSpec = {
        action: (clip.prompt as string) ?? '',
        dialogue: (clip.vo as string) || undefined,
        durationS: 5,
        characterIds, locationId,
        continuityIn: meta && Object.keys(meta).length ? meta : undefined,
      };
      return { shot, cast, assets };
    };

    // ---- START: queue N candidates -------------------------------------------------------------

    if (action === 'start') {
      if (!body.clipId) return json({ error: 'clipId required' }, 400);
      if (!Deno.env.get('FAL_KEY')) return json({ available: false, setup: SETUP });
      const clip = await loadClip(body.clipId);
      if (!clip) return json({ error: 'Shot not found.' }, 404);

      const { shot, cast, assets } = await loadShot(clip);
      const provider: ClipProvider = body.provider && isClipProvider(body.provider)
        ? body.provider : routeShot(shot, { hero: body.hero });
      const n = Math.max(1, Math.min(MAX_CANDIDATES, body.candidates ?? (body.hero ? 3 : 1)));
      const refs = resolveReferences(shot, assets, cast, provider);
      const estUsd = estimateClipCostUsd(shot, refs, provider);

      const started: Array<Record<string, unknown>> = [];
      for (let i = 0; i < n; i++) {
        try { await checkCredits(admin, ownerId, 'video_clip'); }
        catch (e) {
          if (e instanceof InsufficientCreditsError) {
            if (started.length) break;  // partial fleet is fine — report what queued
            return json({ error: e.message }, 402);
          }
          throw e;
        }

        let requestId: string | null = null; let err: string | null = null;
        if (provider === 'seedance' || provider === 'seedance-fast') {
          const reqBody = buildSeedanceRequest(shot, refs, cast, provider);
          const res = await fetch(`${FAL_QUEUE}/${seedanceModel(provider === 'seedance-fast')}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Key ${Deno.env.get('FAL_KEY')}` },
            body: JSON.stringify(reqBody),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) err = `Seedance rejected the request: ${String((data as { detail?: unknown }).detail ?? res.status).slice(0, 200)}`;
          else requestId = (data as { request_id?: string }).request_id ?? null;
        } else {
          const apiKey = Deno.env.get('GEMINI_API_KEY');
          if (!apiKey) { err = 'GEMINI_API_KEY is not set — Veo shots need it. Route this shot to Seedance or add the key.'; }
          else {
            const model = provider === 'veo' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
            const reqBody = buildVeoRequest(compileShot(shot, refs, cast, provider), { aspectRatio: '9:16' });
            const res = await fetch(`${GEMINI_BASE()}/models/${model}:predictLongRunning`, {
              method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify(reqBody),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) err = `Veo rejected the request: ${String((data as { error?: { message?: string } })?.error?.message ?? res.status).slice(0, 200)}`;
            else requestId = veoOperationName(data);
          }
        }
        if (!requestId && !err) err = 'The provider returned no job handle.';

        const { data: cand } = await admin.from('reel_clip_candidates').insert({
          owner_id: ownerId, clip_id: body.clipId, provider,
          request_id: requestId, status: err ? 'failed' : 'running', error: err, cost_usd: err ? 0 : estUsd,
        }).select('id, status, provider, error').single();
        started.push(cand as Record<string, unknown>);
        if (err) break;  // provider trouble: don't burn the rest of the fleet on it
      }

      await admin.from('reel_clips').update({ status: 'running' }).eq('id', body.clipId).eq('owner_id', ownerId);
      return json({ ok: true, provider, estimatedUsdPerCandidate: estUsd, references: refs.map((r) => ({ slot: r.slot, role: r.role })), candidates: started });
    }

    // ---- POLL: provider status → durable storage copy ------------------------------------------

    if (action === 'poll') {
      if (!body.candidateId) return json({ error: 'candidateId required' }, 400);
      const { data: cand } = await admin.from('reel_clip_candidates').select('*').eq('id', body.candidateId).eq('owner_id', ownerId).single();
      if (!cand) return json({ error: 'Candidate not found.' }, 404);
      if (cand.status !== 'running' && cand.status !== 'queued') return json({ ok: true, status: cand.status, videoUrl: cand.video_url, qa: cand.qa });

      let providerUrl: string | null = null; let seed: number | null = null; let err: string | null = null; let pending = false;
      if (cand.provider === 'seedance' || cand.provider === 'seedance-fast') {
        const model = seedanceModel(cand.provider === 'seedance-fast');
        const auth = { authorization: `Key ${Deno.env.get('FAL_KEY')}` };
        const st = await fetch(`${FAL_QUEUE}/${model}/requests/${cand.request_id}/status`, { headers: auth });
        const stData = await st.json().catch(() => ({})) as { status?: string; error?: unknown };
        if (stData.status === 'COMPLETED') {
          const rs = await fetch(`${FAL_QUEUE}/${model}/requests/${cand.request_id}`, { headers: auth });
          const result = await rs.json().catch(() => ({})) as { video?: { url?: string }; seed?: number; detail?: unknown };
          providerUrl = result.video?.url ?? null;
          seed = typeof result.seed === 'number' ? result.seed : null;
          if (!providerUrl) err = 'Seedance finished but returned no video.';
        } else if (stData.status === 'IN_QUEUE' || stData.status === 'IN_PROGRESS') pending = true;
        else err = `Seedance job ${stData.status ?? 'in an unknown state'}.`;
      } else {
        const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
        const res = await fetch(`${GEMINI_BASE()}/${cand.request_id}`, { headers: { 'x-goog-api-key': apiKey } });
        const v = veoResult(await res.json().catch(() => ({})));
        if (!v.done) pending = true;
        else if (v.error || !v.videoUri) err = v.error ?? 'Veo returned no video.';
        else providerUrl = `${v.videoUri}${v.videoUri.includes('?') ? '&' : '?'}key=${apiKey}`;
      }

      if (pending) return json({ ok: true, status: 'running' });
      if (err) {
        await admin.from('reel_clip_candidates').update({ status: 'failed', error: err, updated_at: new Date().toISOString() }).eq('id', cand.id);
        return json({ ok: false, status: 'failed', error: err });
      }

      // Durable copy — the provider url expires; ours doesn't. Idempotent path per candidate.
      const dl = await fetch(providerUrl!);
      if (!dl.ok) return json({ ok: false, status: 'failed', error: `Could not download the clip (${dl.status}).` });
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const path = `${ownerId}/clips/${cand.id}.mp4`;
      const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'video/mp4', upsert: true });
      if (up.error) return json({ ok: false, status: 'failed', error: `Storage copy failed: ${up.error.message}` });
      const { data: pub } = admin.storage.from('project-assets').getPublicUrl(path);

      await spendCredits(admin, ownerId, { costUsd: Number(cand.cost_usd ?? 0), kind: 'video_clip', provider: cand.provider });
      await admin.from('reel_clip_candidates').update({
        status: 'ready', video_url: pub.publicUrl, seed, updated_at: new Date().toISOString(),
      }).eq('id', cand.id);
      return json({ ok: true, status: 'ready', videoUrl: pub.publicUrl, provenance: aiProvenance('video', cand.provider, Date.now()) });
    }

    // ---- QA: vision judgment vs canonical references -------------------------------------------

    if (action === 'qa') {
      if (!body.candidateId) return json({ error: 'candidateId required' }, 400);
      const frames = (body.frames ?? []).filter((f) => typeof f === 'string' && f.length > 0).slice(0, MAX_QA_FRAMES);
      if (!frames.length) return json({ error: 'frames required — sample them from the candidate video in the browser.' }, 400);
      const { data: cand } = await admin.from('reel_clip_candidates').select('*').eq('id', body.candidateId).eq('owner_id', ownerId).single();
      if (!cand || !cand.video_url) return json({ error: 'Candidate not ready.' }, 400);
      const clip = await loadClip(cand.clip_id as string);
      if (!clip) return json({ error: 'Shot not found.' }, 404);

      try { await checkCredits(admin, ownerId, 'image'); }
      catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

      const { shot, cast, assets } = await loadShot(clip);
      // Canonical face per visible character, fetched server-side into the vision call.
      const refImages: VisionImage[] = [];
      const characters: Array<{ id: string; name: string; hasReference: boolean }> = [];
      for (const cid of shot.characterIds) {
        const face = assets.find((a) => a.subjectId === cid && a.kind === 'face_front');
        let ok = false;
        if (face) {
          const r = await fetch(face.fileUrl);
          if (r.ok) {
            const buf = new Uint8Array(await r.arrayBuffer());
            let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
            refImages.push({ mediaType: r.headers.get('content-type') ?? 'image/png', base64: btoa(bin) });
            ok = true;
          }
        }
        characters.push({ id: cid, name: cast.characters[cid]?.name ?? 'character', hasReference: ok });
      }

      const spectacle = !!(clip.continuity_in as { spectacle?: boolean } | null)?.spectacle;
      const system = buildQaPrompt({
        action: shot.action, dialogue: shot.dialogue, characters,
        previousShot: !!shot.continuityIn?.clipUrl, spectacle,
      });
      const frameImages: VisionImage[] = frames.map((f) => ({ mediaType: 'image/jpeg', base64: f.replace(/^data:[^,]+,/, '') }));
      const result = await completeVision(system,
        `Previous shot context: ${shot.continuityIn ? JSON.stringify(shot.continuityIn) : 'none'}. Judge the candidate frames.`,
        [...refImages, ...frameImages], { maxTokens: 1200 });
      await spendCredits(admin, ownerId, { costUsd: result.costUsd, kind: 'image', provider: 'vision-qa' });

      const obs: QaObservation = parseObservation(parseJson(result.text));
      const verdict = judge(obs, { spectacle });
      await admin.from('reel_clip_candidates').update({
        qa: verdict, status: verdict.decision === 'reject' ? 'rejected' : cand.status, updated_at: new Date().toISOString(),
      }).eq('id', cand.id);
      return json({ ok: true, verdict });
    }

    // ---- ACCEPT: the candidate becomes the shot; continuity flows forward ----------------------

    if (action === 'accept') {
      if (!body.candidateId) return json({ error: 'candidateId required' }, 400);
      const { data: cand } = await admin.from('reel_clip_candidates').select('*').eq('id', body.candidateId).eq('owner_id', ownerId).single();
      if (!cand || cand.status !== 'ready' || !cand.video_url) return json({ error: 'Only a ready candidate can be accepted.' }, 400);

      const continuityOut = { ...(body.continuityOut ?? {}), clipUrl: cand.video_url };
      await admin.from('reel_clip_candidates').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', cand.id);
      const { error } = await admin.from('reel_clips').update({
        status: 'done', output_url: cand.video_url, seed: cand.seed, qa: cand.qa,
        continuity_out: continuityOut, cost_usd: cand.cost_usd, error: null,
      }).eq('id', cand.clip_id).eq('owner_id', ownerId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, continuityOut });
    }

    // ---- LIST ----------------------------------------------------------------------------------

    if (action === 'list') {
      if (!body.clipId) return json({ error: 'clipId required' }, 400);
      const { data } = await admin.from('reel_clip_candidates')
        .select('id, provider, status, video_url, qa, cost_usd, error, created_at')
        .eq('clip_id', body.clipId).eq('owner_id', ownerId).order('created_at', { ascending: true });
      return json({ ok: true, candidates: data ?? [] });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    console.error('generate-clip error', e);
    return json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, 500);
  }
});
