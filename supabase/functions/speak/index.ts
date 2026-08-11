// supabase/functions/speak/index.ts
// THE TALK-BACK seam — the concierge's spoken replies through ElevenLabs (Flash v2.5, the same
// key/voice family the voiceover seam uses). One short line in, one small mp3 (base64) out.
// EPHEMERAL BY DESIGN: this is UI voice, not published media — nothing is stored, so no
// provenance stamp travels (the disclosure gate guards what gets PUBLISHED; a dock that talks
// to its own operator is not a publication).
//
//   { text, voice? } → { available, ok, audio: <base64 mp3>, contentType }
//   no ELEVENLABS_API_KEY → { available: false, setup: [...] }   (the dock falls back to the
//   browser voice, honestly — talk-back never goes silent because a key is missing)
//
// Deploy: npx supabase functions deploy speak

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETUP = [
  '1. supabase secrets set ELEVENLABS_API_KEY=<key>  (elevenlabs.io → Profile → API keys)',
  '2. (Optional) supabase secrets set ELEVENLABS_VOICE_ID=<voice id> to pick the voice',
  '3. Until then the concierge keeps talking with the browser voice.',
];

// Dock lines are one to three short sentences by design — refuse essays honestly.
const MAX_CHARS = 400;
// ElevenLabs Flash v2.5 pricing (~$0.05 per 1k characters).
const USD_PER_CHAR = 0.05 / 1000;

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

    const key = Deno.env.get('ELEVENLABS_API_KEY');
    if (!key) return json({ available: false, setup: SETUP });

    const body = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
    const text = String(body.text ?? '').trim().slice(0, MAX_CHARS);
    if (!text) return json({ error: 'text is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try { await checkCredits(admin, user.id, 'garvis'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const voiceId = (body.voice ?? '').trim() || Deno.env.get('ELEVENLABS_VOICE_ID')?.trim() || 'JBFqnCBsd6RMkjVDRZzb'; // stock "George"
    // Small output format — a one-line reply should be a few KB, not a podcast.
    const call = (withSettings: boolean) => fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          text, model_id: 'eleven_flash_v2_5',
          ...(withSettings ? { voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.05 } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    // Same degradation ladder as the voiceover seam: a settings 4xx retries plain once.
    let res = await call(true);
    if (!res.ok && res.status >= 400 && res.status < 500) res = await call(false);
    if (!res.ok) return json({ available: true, ok: false, error: `ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 160)}` });

    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const audio = btoa(bin);

    await spendCredits(admin, user.id, {
      costUsd: text.length * USD_PER_CHAR, kind: 'garvis', provider: 'elevenlabs', model: 'eleven_flash_v2_5',
    });

    return json({ available: true, ok: true, audio, contentType: 'audio/mpeg' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'speak failed' }, 500);
  }
});
