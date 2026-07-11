// supabase/functions/render-video/index.ts
// The VIDEO RENDER seam — turns a storyboard's edit JSON into a real mp4 via a cloud render
// provider (Shotstack: JSON timeline → mp4, no local render infra needed). The key lives in edge
// env only (SHOTSTACK_API_KEY); the browser never holds it. Renders are async, so two modes:
//   { mode: 'render', edit }        → POST the edit, return the provider render id
//   { mode: 'status', id }          → poll; returns { status, url? } (done → the mp4 url)
//   { mode: 'status' } with no key  → { available: false, setup: [...] } (honest degradation)
// Optional SHOTSTACK_ENV ('stage' free sandbox | 'v1' production). The browser preview works with
// ZERO of this configured — this only produces the downloadable mp4.
//
// Deploy: npx supabase functions deploy render-video

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SETUP = [
  '1. Create a Shotstack account (shotstack.io) — the "stage" sandbox is free for testing.',
  '2. Copy your API key from the dashboard.',
  '3. Set the secret: supabase secrets set SHOTSTACK_API_KEY=<key>  (optional SHOTSTACK_ENV=stage|v1)',
  '4. Press "Render mp4" again — the browser preview already works without this.',
];

function configured(): boolean { return !!Deno.env.get('SHOTSTACK_API_KEY'); }
function base(): string { return `https://api.shotstack.io/edit/${Deno.env.get('SHOTSTACK_ENV') ?? 'stage'}`; }

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

    const body = (await req.json().catch(() => ({}))) as { mode?: string; edit?: unknown; id?: string };
    if (!configured()) return json({ available: false, setup: SETUP });

    const key = Deno.env.get('SHOTSTACK_API_KEY')!;
    const headers = { 'content-type': 'application/json', 'x-api-key': key };

    if (body.mode === 'render') {
      if (!body.edit || typeof body.edit !== 'object') return json({ error: 'edit JSON required.' }, 400);
      const res = await fetch(`${base()}/render`, { method: 'POST', headers, body: JSON.stringify(body.edit) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return json({ available: true, ok: false, error: data?.message ?? `Render provider returned ${res.status}` });
      }
      return json({ available: true, ok: true, id: data.response?.id });
    }

    if (body.mode === 'status') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'id required.' }, 400);
      const res = await fetch(`${base()}/render/${id}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        return json({ available: true, ok: false, error: data?.message ?? `Status returned ${res.status}` });
      }
      const r = data.response ?? {};
      return json({ available: true, ok: true, status: r.status, url: r.url ?? null });
    }

    return json({ error: 'mode must be render|status.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
