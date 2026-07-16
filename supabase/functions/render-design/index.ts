// supabase/functions/render-design/index.ts — DESIGNS BECOME REAL PIXELS.
// Before this, the app's best-looking asset (the no-photo brand card) existed only as CSS in a
// preview: a brand-mode Instagram post was refused (image required) and every other platform went
// out as bare text. This function renders the same design server-side (satori → SVG → resvg → PNG),
// stores it in project-assets, and returns a URL the publisher can attach.
//
// HONESTY: a rendered brand design is the business's OWN graphic — not AI imagery — so it carries
// no AI disclosure (mediaProvenance rules apply only to model-generated imagery). No provider key
// is involved; this is pure compute, credit-metered lightly as 'design_render'.

import { createClient } from 'npm:@supabase/supabase-js@2';
import satori from 'npm:satori@0.10.14';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';
import { brandCardDesign, DESIGN_SIZES, type BrandCardSpec } from '../_shared/designSpec.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cold-start assets (wasm renderer + fonts) — fetched once per instance, reset on failure so a
// transient network blip doesn't brick the function until redeploy.
let assets: Promise<{ f700: ArrayBuffer; f500: ArrayBuffer }> | null = null;
function ensureAssets(): Promise<{ f700: ArrayBuffer; f500: ArrayBuffer }> {
  if (!assets) {
    assets = (async () => {
      await initWasm(fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm'));
      const woff = async (u: string) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`font fetch ${r.status}`);
        return r.arrayBuffer();
      };
      const [f700, f500] = await Promise.all([
        woff('https://unpkg.com/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff'),
        woff('https://unpkg.com/@fontsource/inter@5.0.16/files/inter-latin-500-normal.woff'),
      ]);
      return { f700, f500 };
    })().catch((e) => { assets = null; throw e; });
  }
  return assets;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

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
      kind?: string; size?: string; clusterId?: string | null;
      spec?: { headline?: string; business?: string; area?: string | null; accent?: string };
    };
    if (body.kind !== 'brand_card') return json({ error: `Unknown design kind "${body.kind}".` }, 400);
    const dim = DESIGN_SIZES[body.size ?? ''] ?? DESIGN_SIZES['1080x1080'];
    const spec: BrandCardSpec = {
      headline: (body.spec?.headline ?? '').trim().slice(0, 90) || (body.spec?.business ?? '').trim() || 'Your brand',
      business: (body.spec?.business ?? '').trim().slice(0, 60) || 'Your brand',
      area: (body.spec?.area ?? null)?.toString().slice(0, 60) ?? null,
      accent: HEX.test(body.spec?.accent ?? '') ? body.spec!.accent! : '#FF8A3D',
    };

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try { await checkCredits(admin, user.id, 'design_render'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const { f700, f500 } = await ensureAssets();
    const svg = await satori(brandCardDesign(spec, dim.w, dim.h) as never, {
      width: dim.w, height: dim.h,
      fonts: [
        { name: 'Inter', data: f700, weight: 700, style: 'normal' },
        { name: 'Inter', data: f500, weight: 500, style: 'normal' },
      ],
    });
    const png = new Resvg(svg).render().asPng();

    const clusterId = (body.clusterId ?? '').trim() || null;
    const folder = clusterId || 'world';
    const path = `${user.id}/studio/${folder}/design-${crypto.randomUUID()}.png`;
    const up = await admin.storage.from('project-assets').upload(path, png, { contentType: 'image/png', upsert: false });
    if (up.error) return json({ ok: false, error: `Could not store the design: ${up.error.message}` });
    const { data: pub } = admin.storage.from('project-assets').getPublicUrl(path);
    const url = pub.publicUrl;

    // Vault row so the design is reusable — only against a cluster the user owns (generate-image pattern).
    if (clusterId) {
      try {
        const { data: owned } = await admin.from('knowledge_clusters').select('id').eq('id', clusterId).eq('owner_id', user.id).maybeSingle();
        if (owned) {
          await admin.from('cluster_files').insert({
            owner_id: user.id, cluster_id: clusterId, name: 'Brand card.png', url,
            kind: 'image', bytes: png.length, caption: spec.headline, label: 'brand-design',
          });
        }
      } catch (_) { /* design is already made + stored; a vault-row hiccup must not fail the render */ }
    }

    // Pure compute — metered lightly so the seam is accounted for from day one.
    await spendCredits(admin, user.id, { costUsd: 0.002, kind: 'design_render', provider: 'satori', model: 'brand_card' });
    return json({ ok: true, url, width: dim.w, height: dim.h });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'render-design failed' }, 500);
  }
});
