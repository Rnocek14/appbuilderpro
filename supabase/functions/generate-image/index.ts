// supabase/functions/generate-image/index.ts
// The IMAGE-GENERATION seam — turns an honest prompt into a real image via OpenAI gpt-image-1, stores
// it in the project-assets bucket, and (when a cluster is given) records a cluster_files image row so
// it flows into postcards/social exactly like an uploaded photo. The key lives in edge env only
// (OPENAI_API_KEY); the browser never holds it.
//
//   { prompt, size?, clusterId?, caption?, label? } → { available, ok, url }
//   no OPENAI_API_KEY → { available:false, setup:[...] }  (honest degradation)
//
// The load-bearing honesty rule (an AI image is NEVER a stand-in for a specific real property) is
// enforced upstream in src/lib/garvis/imagegen.ts, which builds the prompt and refuses listing types.
// This function is the metered generator behind that gate.
//
// Deploy: npx supabase functions deploy generate-image

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETUP = [
  '1. Get an OpenAI API key with image generation (gpt-image-1) enabled (platform.openai.com).',
  '2. Set the secret: supabase secrets set OPENAI_API_KEY=<key>',
  '3. Press "Generate an image" again.',
];

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

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

    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) return json({ available: false, setup: SETUP });

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string; size?: string; clusterId?: string | null; caption?: string | null; label?: string | null;
    };
    const prompt = (body.prompt ?? '').trim();
    if (prompt.length < 8) return json({ error: 'A prompt is required.' }, 400);
    const size = SIZES.has(body.size ?? '') ? body.size! : '1536x1024';

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // CREDIT GATE — a generation spends our provider quota, so it spends the user's credits.
    try { await checkCredits(admin, user.id, 'image'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const aiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size, quality: 'medium' }),
    });
    const aiData = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      // Surface provider refusals (content policy, etc.) honestly rather than as a 500.
      const msg = aiData?.error?.message ?? `Image provider returned ${aiRes.status}`;
      return json({ available: true, ok: false, error: msg });
    }
    const b64 = aiData?.data?.[0]?.b64_json as string | undefined;
    if (!b64) return json({ available: true, ok: false, error: 'No image was returned.' });

    // base64 → bytes
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const clusterId = (body.clusterId ?? '').trim() || null;
    const folder = clusterId || 'world';
    const path = `${user.id}/studio/${folder}/ai-${crypto.randomUUID()}.png`;
    const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (up.error) return json({ available: true, ok: false, error: `Could not store the image: ${up.error.message}` });
    const { data: pub } = admin.storage.from('project-assets').getPublicUrl(path);
    const url = pub.publicUrl;

    // Record a vault row so the image is reusable — but only against a cluster the user owns.
    if (clusterId) {
      try {
        const { data: owned } = await admin.from('knowledge_clusters').select('id').eq('id', clusterId).eq('owner_id', user.id).maybeSingle();
        if (owned) {
          await admin.from('cluster_files').insert({
            owner_id: user.id, cluster_id: clusterId, name: 'AI image.png', url,
            kind: 'image', bytes: bytes.length,
            caption: (body.caption ?? '').trim() || 'AI-generated illustration',
            label: (body.label ?? 'ai-generated'),
          });
        }
      } catch (_) { /* the image is already made + stored; a vault-row hiccup must not fail generation */ }
    }

    // gpt-image-1 @ medium quality ≈ $0.04–0.07 depending on size — charge the real ballpark.
    await spendCredits(admin, user.id, { costUsd: size === '1024x1024' ? 0.04 : 0.07, kind: 'image', provider: 'openai', model: 'gpt-image-1' });
    return json({ available: true, ok: true, url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
