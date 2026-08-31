// src/lib/garvis/castRun.ts
// THE CAST RUNNER — impure half of the Cast lane (pure logic: castLab.ts, mediaCast.ts, videoQa.ts).
// Talks to the tables (media_characters / media_locations / media_ref_assets / reel_jobs /
// reel_clips) and the generate-clip + generate-image edge functions, and does the ONE thing the
// browser does better than any server: sampling frames from a candidate video for the QA call
// (the autoCut precedent — the client decodes media free; the server judges).

import { supabase } from '../supabase';
import { invokeFailure, startRenderEdit, pollRender, saveRenderedVideo } from './videoRun';
import { characterRefPrompts, locationRefPrompts, sixShotScene, sceneTakes, type TestShot } from './castLab';
import { buildUgcEdit } from './ugcEdit';
import { aiProvenance, type AiProvenance } from './mediaProvenance';
import type { QaVerdict } from './videoQa';

// ---- rows -------------------------------------------------------------------------------------

export interface CastCharacter {
  id: string; name: string; description: string; status: string;
  likeness: 'synthetic' | 'real'; consented_at: string | null;
}
export interface CastLocation { id: string; name: string; description: string; status: string }
export interface CastAsset {
  id: string; subject_kind: 'character' | 'location'; subject_id: string;
  kind: string; label: string; file_url: string; approved: boolean;
}

export async function loadCast(): Promise<{ characters: CastCharacter[]; locations: CastLocation[]; assets: CastAsset[] }> {
  const [{ data: characters }, { data: locations }, { data: assets }] = await Promise.all([
    supabase.from('media_characters').select('id, name, description, status, likeness, consented_at').eq('status', 'active').order('created_at'),
    supabase.from('media_locations').select('id, name, description, status').eq('status', 'active').order('created_at'),
    supabase.from('media_ref_assets').select('id, subject_kind, subject_id, kind, label, file_url, approved').order('created_at'),
  ]);
  return {
    characters: (characters ?? []) as CastCharacter[],
    locations: (locations ?? []) as CastLocation[],
    assets: (assets ?? []) as CastAsset[],
  };
}

/** Create a character. A REAL person (a friend, a willing spokesperson) requires a consent note —
 *  who said yes and how — recorded at creation; without it the row is created consent-less and the
 *  server-side likeness gate refuses to generate them. */
export async function createCharacter(
  name: string, description: string,
  real?: { consentNote: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('media_characters').insert({
    owner_id: user?.id, name, description,
    likeness: real ? 'real' : 'synthetic',
    consent_note: real?.consentNote.trim() || null,
    consented_at: real?.consentNote.trim() ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}

/** Upload real photos as a character's canonical references (the licensed-likeness path). Files
 *  map to reference kinds in order: front portrait, 3/4 portrait, full body; extras land as
 *  'expression'. Uploaded UNAPPROVED like every reference — the operator still blesses each. Real
 *  photos carry no AI provenance (they aren't AI); the videos generated FROM them are stamped and
 *  disclosed like all AI media. */
export async function uploadReferencePhotos(characterId: string, clusterId: string, files: File[]): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) throw new Error('Not signed in.');
  const kinds = ['face_front', 'face_34', 'full_body'];
  let made = 0;
  for (const [i, f] of files.entries()) {
    if (!f.type.startsWith('image/')) continue;
    const clean = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `${uid}/studio/${clusterId}/cast-${characterId}-${Date.now()}-${clean}`;
    const { error: upErr } = await supabase.storage.from('project-assets').upload(path, f, { contentType: f.type || 'image/jpeg' });
    if (upErr) throw new Error(`Could not upload ${f.name}: ${upErr.message}`);
    const url = supabase.storage.from('project-assets').getPublicUrl(path).data.publicUrl;
    const { error: insErr } = await supabase.from('media_ref_assets').insert({
      owner_id: uid, subject_kind: 'character', subject_id: characterId,
      kind: kinds[i] ?? 'expression', file_url: url, approved: false,
    });
    if (insErr) throw new Error(insErr.message);
    made++;
  }
  if (!made) throw new Error('No image files to upload.');
  return made;
}

export async function createLocation(name: string, description: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('media_locations').insert({ owner_id: user?.id, name, description });
  if (error) throw new Error(error.message);
}

export async function setAssetApproved(assetId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from('media_ref_assets').update({ approved }).eq('id', assetId);
  if (error) throw new Error(error.message);
}

// ---- reference generation ---------------------------------------------------------------------

/** Generate a subject's canonical sheet through generate-image (provenance-stamped there) and
 *  record each as an UNAPPROVED media_ref_assets row — the operator blesses them before any
 *  renderer ever sees them. Returns how many landed. */
export async function generateReferenceSheet(
  subject: { kind: 'character' | 'location'; id: string; description: string }, clusterId: string | null,
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  const prompts = subject.kind === 'character' ? characterRefPrompts(subject.description) : locationRefPrompts(subject.description);
  let made = 0;
  for (const p of prompts) {
    const { data, error } = await supabase.functions.invoke('generate-image', {
      body: { prompt: p.prompt, size: '1024x1536', clusterId: clusterId ?? undefined, caption: `cast reference: ${p.kind}`, label: 'ai-generated' },
    });
    if (error) throw await invokeFailure(error, 'The image generator (generate-image)');
    const res = data as { available?: boolean; ok?: boolean; url?: string; error?: string };
    if (res.available === false) throw new Error("Image generation isn't configured — set OPENAI_API_KEY (see System health).");
    if (!res.ok || !res.url) throw new Error(res.error ?? 'The reference generation failed.');
    const { error: insErr } = await supabase.from('media_ref_assets').insert({
      owner_id: user?.id, subject_kind: subject.kind, subject_id: subject.id, kind: p.kind, file_url: res.url, approved: false,
    });
    if (insErr) throw new Error(insErr.message);
    made++;
  }
  return made;
}

// ---- the six-shot test scene ------------------------------------------------------------------

export interface TestClip { id: string; scene_index: number; prompt: string; vo: string; status: string; output_url: string | null }

/** ANY production: one reel_jobs row + wired reel_clips from a shot list. The six-shot test and
 *  every real episode go through this same door. Returns the clips in scene order. */
export async function createProduction(
  worldId: string, clusterId: string, title: string, shots: TestShot[], locationId: string | null,
): Promise<TestClip[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!shots.length) throw new Error('The script produced no shots.');
  const { data: job, error: jobErr } = await supabase.from('reel_jobs').insert({
    owner_id: user?.id, world_id: worldId, cluster_id: clusterId,
    title, hook: '', storyboard: { shots: shots.length }, status: 'generating',
  }).select('id').single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? 'Could not create the production.');

  const rows = shots.map((s: TestShot) => ({
    owner_id: user?.id, reel_id: job.id, scene_index: s.sceneIndex,
    prompt: s.action, vo: s.dialogue, provider: 'seedance-fast',
    character_ids: s.characterIds, location_id: locationId, status: 'queued',
  }));
  const { data: clips, error: clipErr } = await supabase.from('reel_clips').insert(rows)
    .select('id, scene_index, prompt, vo, status, output_url').order('scene_index');
  if (clipErr || !clips) throw new Error(clipErr?.message ?? 'Could not create the shots.');
  return clips as TestClip[];
}

/** The Test A production, unchanged: the fixed six-shot scene through the same door. */
export async function createTestScene(
  worldId: string, clusterId: string,
  a: { id: string; name: string }, b: { id: string; name: string }, locationId: string,
): Promise<TestClip[]> {
  return createProduction(worldId, clusterId, 'Six-shot continuity test', sixShotScene(a, b), locationId);
}

/** Hand the previous accepted shot's state to the next shot before it starts. */
export async function setClipContinuityIn(clipId: string, continuity: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('reel_clips').update({ continuity_in: continuity }).eq('id', clipId);
  if (error) throw new Error(error.message);
}

// ---- the clip engine (generate-clip) ----------------------------------------------------------

export interface CandidateRef { id: string; status: string; provider: string; error?: string | null }

async function invokeClip<T>(body: Record<string, unknown>, what: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('generate-clip', { body });
  if (error) throw await invokeFailure(error, what);
  const res = data as { available?: boolean; error?: string } & T;
  if (res.available === false) throw new Error('Clip generation isn\'t configured — set FAL_KEY (see System health).');
  if (res.error) throw new Error(res.error);
  return res;
}

export async function startClip(clipId: string, opts: { candidates?: number; hero?: boolean } = {}) {
  return invokeClip<{ candidates: CandidateRef[]; estimatedUsdPerCandidate: number; references: Array<{ slot: string; role: string }> }>(
    { action: 'start', clipId, ...opts }, 'The clip engine (generate-clip)');
}

export async function pollClip(candidateId: string) {
  return invokeClip<{ status: string; videoUrl?: string; error?: string }>(
    { action: 'poll', candidateId }, 'The clip engine (generate-clip)');
}

export async function qaClip(candidateId: string, frames: string[]) {
  return invokeClip<{ verdict: QaVerdict }>({ action: 'qa', candidateId, frames }, 'The QA gate (generate-clip)');
}

export async function acceptClip(candidateId: string, continuityOut?: Record<string, unknown>) {
  return invokeClip<{ continuityOut: Record<string, unknown> }>(
    { action: 'accept', candidateId, continuityOut }, 'The clip engine (generate-clip)');
}

// ---- scene assembly ---------------------------------------------------------------------------

/** Cut the accepted clips into ONE produced scene through the shared edit grammar — hard cuts,
 *  alternating punch-ins, word-karaoke captions from the clips' own (generated) dialogue audio,
 *  sound cues on the known cut times. This is the layer the shipping AI-drama operations skip, and
 *  it's where six generations start reading as one scene. Fully AI footage → the provenance stamp
 *  rides the finalized file (the disclosure gate enforces the label at publish, as everywhere). */
export interface RenderedScene { url: string; provenance: AiProvenance; durable: boolean }

export async function renderScene(
  clips: Array<{ url: string; durationS: number }>, clusterId: string, title: string,
  onStatus?: (s: string) => void,
): Promise<RenderedScene> {
  const takes = sceneTakes(clips);
  if (!takes.length) throw new Error('No accepted clips to assemble.');
  const provenance = aiProvenance('video', 'cast-scene', Date.now());
  const edit = buildUgcEdit(takes, { lane: 'calm', captions: true });
  const start = await startRenderEdit(edit);
  if (start.available === false) throw new Error("Rendering isn't configured — add SHOTSTACK_API_KEY (System health).");
  if (!start.ok || !start.id) throw new Error(start.error ?? 'The scene render could not start.');
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await pollRender(start.id, { clusterId, aiProvenance: provenance });
    onStatus?.(st.status ?? 'working');
    if (st.status === 'done' && st.url) {
      await saveRenderedVideo(clusterId, title, st.url, start.id);
      // A publisher must only ever see the DURABLE copy — the provider url rots in 24h. When the
      // durable save failed, say so honestly rather than queueing a post that will 404 tomorrow.
      return { url: st.url, provenance, durable: st.durable !== false };
    }
    if (st.status === 'failed') throw new Error('The scene render failed on the provider.');
  }
  throw new Error('Still rendering — try again in a minute to resume checking.');
}

// ---- browser frame sampling -------------------------------------------------------------------

/** Sample n evenly-spaced frames from a video url as JPEG data-urls — the QA call's eyes. Runs
 *  entirely in the browser (storage clips are public-read, crossOrigin works). */
export function sampleFrames(videoUrl: string, n = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoUrl;
    const frames: string[] = [];
    const fail = (m: string) => reject(new Error(m));
    video.onerror = () => fail('Could not load the candidate video for QA.');
    video.onloadedmetadata = () => {
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return fail('The candidate video has no readable duration.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return fail('Canvas is unavailable.');
      let i = 0;
      const times = Array.from({ length: n }, (_, k) => ((k + 0.5) / n) * dur);
      const grab = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try { frames.push(canvas.toDataURL('image/jpeg', 0.7)); }
        catch { return fail('Could not read frames (video blocked cross-origin).'); }
        i++;
        if (i >= times.length) { resolve(frames); return; }
        video.currentTime = times[i];
      };
      video.onseeked = grab;
      video.currentTime = times[0];
    };
  });
}
