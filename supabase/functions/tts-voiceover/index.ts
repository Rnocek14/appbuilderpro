// supabase/functions/tts-voiceover/index.ts
// THE VOICEOVER seam — turns a storyboard's narration lines into real per-scene mp3 clips. One call
// PER SCENE (per-scene clips align exactly to scene starts in the render; a single full-script track
// drifts). Default provider is OpenAI gpt-4o-mini-tts (~$0.015/min — OPENAI_API_KEY is already
// provisioned for generate-image); ELEVENLABS_API_KEY unlocks the higher-quality head (Flash v2.5,
// $0.05/1k chars). Keys live in edge env only; the browser never holds them.
//
//   { scenes: [{ text, seconds }], voice?, provider?, clusterId? }
//     → { available, ok, clips: [{ sceneIndex, url }], provenance }
//   neither key set → { available: false, setup: [...] }   (honest degradation)
//
// Every clip is AI audio, so the response carries an AiProvenance stamp the caller MUST keep with
// the storyboard — the social-publish disclosure gate is fail-closed on it downstream.
//
// Deploy: npx supabase functions deploy tts-voiceover

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';
import { aiProvenance } from '../_shared/mediaProvenanceCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETUP = [
  '1. The default voice uses your OpenAI key: supabase secrets set OPENAI_API_KEY=<key>',
  '2. (Optional, higher-quality voices) supabase secrets set ELEVENLABS_API_KEY=<key>',
  '3. Press "Voiceover" again — the silent preview works without any of this.',
];

// OpenAI's built-in voices — validated so a typo degrades to the default, never a provider 400.
// marin/cedar are the newest and OpenAI's own best-quality recommendation; marin is the default.
const OPENAI_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const MAX_SCENES = 14;              // matches the storyboard's scene cap
const MAX_CHARS_PER_SCENE = 300;    // narration lines are short by design; refuse essays honestly
const MAX_INSTRUCTIONS_CHARS = 900; // delivery steering — long blocks dilute adherence

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      scenes?: { text?: string; seconds?: number }[]; voice?: string; provider?: string; clusterId?: string | null;
      instructions?: string;
    };
    const scenes = (Array.isArray(body.scenes) ? body.scenes : [])
      .map((s, i) => ({ index: i, text: String(s?.text ?? '').trim() }))
      .filter((s) => s.text.length > 0);
    if (!scenes.length) return json({ error: 'At least one scene with narration text is required.' }, 400);
    if (scenes.length > MAX_SCENES) return json({ error: `Too many scenes (max ${MAX_SCENES}).` }, 400);
    const tooLong = scenes.find((s) => s.text.length > MAX_CHARS_PER_SCENE);
    if (tooLong) return json({ error: `Scene ${tooLong.index + 1}'s narration is over ${MAX_CHARS_PER_SCENE} chars — narration lines are short by design.` }, 400);

    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const wantEleven = body.provider === 'elevenlabs';
    const useEleven = wantEleven && !!elevenKey;
    if (wantEleven && !elevenKey) return json({ available: false, setup: SETUP });
    if (!useEleven && !openaiKey) return json({ available: false, setup: SETUP });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // CREDIT GATE — voiceover spends provider quota, so it spends the user's credits. The kind's
    // estimate is per-CLIP, so the whole-episode job re-checks the balance against scene count
    // (review finding: a 5-credit balance could start a 14-scene job).
    try {
      const balance = await checkCredits(admin, user.id, 'voiceover');
      if (balance < scenes.length * 5) return json({ error: "You're out of credits for this many scenes. Upgrade your plan or wait for your monthly refill." }, 402);
    }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const folder = (body.clusterId ?? '').trim() || 'world';
    const totalChars = scenes.reduce((n, s) => n + s.text.length, 0);

    const instructions = (body.instructions ?? '').trim().slice(0, MAX_INSTRUCTIONS_CHARS);
    const synth = async (text: string): Promise<Uint8Array> => {
      if (useEleven) {
        const voiceId = (body.voice ?? '').trim() || 'JBFqnCBsd6RMkjVDRZzb'; // ElevenLabs' stock "George"
        // The community-tested energetic-shorts settings; if the model rejects any of them (4xx),
        // retry once with defaults rather than failing the whole episode.
        const call = (withSettings: boolean) => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': elevenKey!, 'content-type': 'application/json' },
          body: JSON.stringify({
            text, model_id: 'eleven_flash_v2_5',
            ...(withSettings ? { voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.3, speed: 1.1, use_speaker_boost: true } } : {}),
          }),
          signal: AbortSignal.timeout(60_000),
        });
        let res = await call(true);
        if (!res.ok && res.status >= 400 && res.status < 500) res = await call(false);
        if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return new Uint8Array(await res.arrayBuffer());
      }
      const voice = OPENAI_VOICES.has((body.voice ?? '').trim()) ? (body.voice as string).trim() : 'marin';
      // gpt-4o-mini-tts steers on `instructions` (its `speed` param is ignored) — the delivery
      // direction is where the energy/pacing lives, not a rate multiplier.
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3',
          ...(instructions ? { instructions } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: { message?: string } }));
        throw new Error(data?.error?.message ?? `TTS provider returned ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    };

    // Partial failure still spends for what was actually synthesized (review finding: the early
    // returns billed the OPERATOR's provider account and charged the user nothing).
    let spentChars = 0;
    const spendSoFar = () => spentChars > 0
      ? spendCredits(admin, user.id, {
          costUsd: useEleven ? (spentChars / 1000) * 0.05 : (spentChars / 900) * 0.015,
          kind: 'voiceover', provider: useEleven ? 'elevenlabs' : 'openai',
          model: useEleven ? 'eleven_flash_v2_5' : 'gpt-4o-mini-tts',
        })
      : Promise.resolve(0);
    const clips: { sceneIndex: number; url: string }[] = [];
    for (const s of scenes) {
      let bytes: Uint8Array;
      try { bytes = await synth(s.text); }
      catch (e) { await spendSoFar(); return json({ available: true, ok: false, error: e instanceof Error ? e.message : String(e), clips }); }
      spentChars += s.text.length;
      const path = `${user.id}/studio/${folder}/vo-${crypto.randomUUID()}.mp3`;
      const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'audio/mpeg', upsert: false });
      if (up.error) { await spendSoFar(); return json({ available: true, ok: false, error: `Could not store scene ${s.index + 1}'s audio: ${up.error.message}`, clips }); }
      const { data: pub } = admin.storage.from('project-assets').getPublicUrl(path);
      clips.push({ sceneIndex: s.index, url: pub.publicUrl });
    }

    // Real cost: OpenAI gpt-4o-mini-tts ≈ $0.015/min ≈ 900 chars/min; ElevenLabs Flash $0.05/1k chars.
    const costUsd = useEleven ? (totalChars / 1000) * 0.05 : (totalChars / 900) * 0.015;
    const tool = useEleven ? 'elevenlabs' : 'openai-tts';
    const model = useEleven ? 'eleven_flash_v2_5' : 'gpt-4o-mini-tts';
    await spendCredits(admin, user.id, { costUsd, kind: 'voiceover', provider: useEleven ? 'elevenlabs' : 'openai', model });

    return json({
      available: true, ok: true, clips,
      provenance: aiProvenance('audio', tool, Date.now(), model),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
