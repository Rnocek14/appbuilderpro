// supabase/functions/shot-worker/index.ts
// Server-side screenshots — the missing piece of the outreach loop. Captures (a) the email-shot
// view of a preview site and (b) the business's CURRENT site for the before/after audit, storing
// PNGs in the project-assets bucket and returning public URLs.
//
// Uses a headless-browser HTTP API (ScreenshotOne-compatible; swap via SCREENSHOT_API_URL).
//   supabase secrets set SCREENSHOT_API_KEY=...           (required)
//   supabase secrets set SCREENSHOT_API_URL=https://api.screenshotone.com/take   (default)
//   supabase secrets set APP_ORIGIN=https://your-fableforge.app                  (for slug shots)
//
// Deploy: npx supabase functions deploy shot-worker

import { createClient } from 'npm:@supabase/supabase-js@2';
import { urlAllowed } from '../_shared/safeFetch.ts';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 10 * 1024 * 1024;

// SSRF guard: the shared hardened validator (_shared/safeFetch.ts) — full private/reserved IP
// table + DNS resolution with every-record-public required, not just a hostname regex. (The
// screenshot API does the actual page fetch on its own infrastructure; this validates what we
// hand it.)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Agency owner only — screenshots land in their asset folder.
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const apiKey = Deno.env.get('SCREENSHOT_API_KEY');
    if (!apiKey) return json({ error: 'SCREENSHOT_API_KEY is not set — add a ScreenshotOne (or compatible) key to enable server screenshots.' }, 501);

    const { slug, url: rawUrl, mobile } = (await req.json().catch(() => ({}))) as
      { slug?: string; url?: string; mobile?: boolean };

    // Either a preview slug (shoot our own email-shot route) or an external URL (their current site).
    let target: string;
    if (slug) {
      const origin = Deno.env.get('APP_ORIGIN');
      if (!origin) return json({ error: 'APP_ORIGIN secret is not set (needed to shoot preview slugs).' }, 501);
      target = `${origin}/preview-site/${encodeURIComponent(slug)}/email-shot`;
    } else if (rawUrl) {
      let u: URL;
      try { u = new URL(rawUrl); } catch { return json({ error: 'Invalid url.' }, 400); }
      if (!(await urlAllowed(u))) return json({ error: 'This URL cannot be captured.' }, 400);
      target = u.href;
    } else {
      return json({ error: 'Provide slug (a preview) or url (an external site).' }, 400);
    }

    const apiUrl = Deno.env.get('SCREENSHOT_API_URL') ?? 'https://api.screenshotone.com/take';
    // CREDIT GATE — a screenshot spends the operator's provider quota, so it meters the caller's
    // credits like every other paid seam (audit M2).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try { await checkCredits(admin, user.id, 'screenshot'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }
    const params = new URLSearchParams({
      access_key: apiKey,
      url: target,
      format: 'png',
      viewport_width: mobile ? '390' : '1280',
      viewport_height: mobile ? '844' : '800',
      device_scale_factor: '2',
      block_cookie_banners: 'true',
      delay: '3', // let fonts/reveals settle
    });
    const shotRes = await fetch(`${apiUrl}?${params}`);
    if (!shotRes.ok) return json({ error: `Screenshot API returned ${shotRes.status}: ${(await shotRes.text()).slice(0, 300)}` }, 502);
    const bytes = new Uint8Array(await shotRes.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return json({ error: 'Screenshot exceeded 10MB.' }, 502);
    await spendCredits(admin, user.id, { costUsd: 0.03, kind: 'screenshot', provider: 'screenshotone' });
    const name = `${Date.now()}-${(slug ?? new URL(target).hostname).replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 60)}${mobile ? '-mobile' : ''}.png`;
    const path = `${user.id}/shots/${name}`;
    const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'image/png' });
    if (up.error) return json({ error: up.error.message }, 500);
    const publicUrl = admin.storage.from('project-assets').getPublicUrl(path).data.publicUrl;

    return json({ ok: true, url: publicUrl, target, bytes: bytes.byteLength });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
