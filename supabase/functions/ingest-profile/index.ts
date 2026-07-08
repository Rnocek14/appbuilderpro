// supabase/functions/ingest-profile/index.ts
// THE FUNNEL'S FRONT DOOR. The external scraper/lead engine POSTs BusinessProfile JSON here with
// an ingest token (Settings → API tokens; no browser session needed) and gets back a live public
// preview URL + report URL. Validation, recipes, and normalization are the exact same pure module
// the client uses (_shared/previewSpec.ts).
//
// v1 generates the deterministic recipe-based spec (assembleFallbackSpec — instant, free, always
// valid). The AI intelligence chain (strategy → spec → critique → audit → pitch) runs when the
// agency owner hits Regenerate in the admin UI; spec_source marks the tier honestly.
//
//   curl -X POST "$SUPABASE_URL/functions/v1/ingest-profile" \
//     -H "content-type: application/json" -H "x-ingest-token: $TOKEN" \
//     -d '{"business_name":"Joe'\''s Roofing","industry":"roofing","services":["Roof repair"]}'
//
// Deploy: npx supabase functions deploy ingest-profile

import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseBusinessProfile, assembleFallbackSpec, previewSlug } from '../_shared/previewSpec.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const token = req.headers.get('x-ingest-token')?.trim();
    if (!token) return json({ error: 'x-ingest-token header is required.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: tok } = await admin.from('ingest_tokens')
      .select('id, user_id, revoked_at').eq('token', token).single();
    if (!tok || (tok as { revoked_at: string | null }).revoked_at) {
      return json({ error: 'Invalid or revoked ingest token.' }, 401);
    }
    const userId = (tok as { user_id: string }).user_id;
    void admin.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', (tok as { id: string }).id);

    const raw = await req.json().catch(() => null);
    const { profile, errors } = parseBusinessProfile(raw);
    if (!profile) return json({ error: 'Invalid BusinessProfile.', details: errors }, 400);

    const { data: profileRow, error: pErr } = await admin.from('business_profiles').insert({
      user_id: userId,
      business_name: profile.business_name,
      industry: profile.industry,
      website_score: profile.current_website_score ?? null,
      profile,
    }).select('id').single();
    if (pErr) return json({ error: `Could not save profile: ${pErr.message}` }, 500);

    // Deterministic recipe spec — instant and always valid. Slug gets a nonce so pitches
    // aren't enumerable by guessing business names.
    const spec = assembleFallbackSpec(profile);
    const nonce = Math.random().toString(36).slice(2, 8);
    const slug = `${previewSlug(profile.business_name)}-${nonce}`;

    const { data: site, error: sErr } = await admin.from('preview_sites').insert({
      user_id: userId,
      profile_id: (profileRow as { id: string }).id,
      slug,
      business_name: profile.business_name,
      industry: profile.industry,
      spec,
      pitch: '',
      spec_source: 'fallback',
      status: 'preview',
    }).select('id, slug').single();
    if (sErr) return json({ error: `Could not save preview: ${sErr.message}` }, 500);

    const appOrigin = Deno.env.get('APP_ORIGIN') ?? req.headers.get('origin') ?? '';
    const path = `/preview-site/${(site as { slug: string }).slug}`;
    return json({
      ok: true,
      id: (site as { id: string }).id,
      slug: (site as { slug: string }).slug,
      previewUrl: appOrigin ? `${appOrigin}${path}` : path,
      reportUrl: appOrigin ? `${appOrigin}${path}/report` : `${path}/report`,
      spec_source: 'fallback',
      note: 'Deterministic recipe spec. Open the admin Preview Engine and hit Regenerate to run the AI strategy/critique/audit chain on this site.',
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
