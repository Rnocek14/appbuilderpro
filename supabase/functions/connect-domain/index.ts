// supabase/functions/connect-domain/index.ts
// MIGRATE A CLIENT'S EXISTING DOMAIN onto their hosted site — by pointing DNS at the Netlify host
// (they keep owning the domain; no transfer). We set the custom domain on the site, nudge SSL, and
// report back the EXACT records the client adds at their registrar + the live status (DNS verified?
// SSL active?). Only web records — never MX — so their email is never touched.
//
// Operator-only (owner JWT must own the preview). The site must already be live (Go Live first).
// Deploy: npx supabase functions deploy connect-domain
// Secrets: NETLIFY_AUTH_TOKEN.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeCustomDomain } from '../../../src/lib/preview/publishCore.ts';
import { classifyDomain, dnsRecordsFor, apexPointsAtNetlify } from '../../../src/lib/preview/domainCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { previewSiteId, domain: rawDomain, action } = (await req.json().catch(() => ({}))) as
      { previewSiteId?: string; domain?: string; action?: 'connect' | 'status' };
    if (!previewSiteId) return json({ error: 'previewSiteId is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: site } = await admin.from('preview_sites')
      .select('id, user_id, netlify_site_id, custom_domain').eq('id', previewSiteId).single();
    if (!site) return json({ error: 'Preview not found.' }, 404);

    // Operator-only: the caller must own this preview.
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (user.id !== (site as { user_id: string }).user_id) return json({ error: 'Preview not found.' }, 404);

    const netlifySiteId = (site as { netlify_site_id?: string | null }).netlify_site_id ?? null;
    if (!netlifySiteId) return json({ error: 'Publish the site first (Go Live), then connect a domain.' }, 400);

    const token = Deno.env.get('NETLIFY_AUTH_TOKEN');
    if (!token) return json({ error: 'Hosting is not connected — set NETLIFY_AUTH_TOKEN.' }, 400);
    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.netlify.com/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

    // The domain: on 'connect' take the new value; on 'status' reuse the stored one.
    const domain = action === 'status'
      ? ((site as { custom_domain?: string | null }).custom_domain ?? null)
      : normalizeCustomDomain(rawDomain);
    if (!domain) return json({ error: 'Enter a valid domain (e.g. summitroofing.com).' }, 400);

    if (action !== 'status') {
      // Point the Netlify site at the domain (Netlify auto-adds the www alias for an apex). Then nudge
      // SSL — it provisions on its own once DNS resolves, but asking early shortens the wait.
      const patch = await api(`/sites/${netlifySiteId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_domain: domain }),
      });
      if (!patch.ok) return json({ error: `Netlify set-domain ${patch.status}: ${(await patch.text()).slice(0, 300)}` }, 502);
      await api(`/sites/${netlifySiteId}/ssl`, { method: 'POST' }).catch(() => {});
      await admin.from('preview_sites').update({ custom_domain: domain, updated_at: new Date().toISOString() }).eq('id', previewSiteId);
    }

    // Read live status: the default host (for the CNAME target) + SSL state.
    const sr = await api(`/sites/${netlifySiteId}`);
    const s = sr.ok ? (JSON.parse(await sr.text()) as { name?: string; default_domain?: string; ssl_url?: string; ssl?: boolean }) : {};
    const netlifyHost = (s.default_domain || (s.name ? `${s.name}.netlify.app` : '')).toLowerCase();
    const sslActive = s.ssl === true && !!s.ssl_url && s.ssl_url.toLowerCase().includes(domain);

    // Real "DNS points here yet?" check — resolve the record the client was told to set. Best-effort:
    // if resolution isn't available/possible, we simply report not-verified (never a false positive).
    let dnsVerified = false;
    try {
      const parts = classifyDomain(domain);
      if (parts?.isApex) {
        const a = await Deno.resolveDns(parts.registrable, 'A');
        dnsVerified = apexPointsAtNetlify(a);
      } else if (netlifyHost) {
        const c = await Deno.resolveDns(domain, 'CNAME');
        dnsVerified = c.some((v) => v.replace(/\.$/, '').toLowerCase() === netlifyHost);
      }
    } catch { /* not resolvable yet → not verified */ }

    return json({
      ok: true, domain, netlifyHost,
      records: netlifyHost ? dnsRecordsFor(domain, netlifyHost) : [],
      dnsVerified, sslActive,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
