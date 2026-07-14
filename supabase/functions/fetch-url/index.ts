// supabase/functions/fetch-url/index.ts
// Reads a web page server-side so chat can USE pasted links instead of treating them as plain
// text: returns the page title, description, and readable text (tags stripped, capped) for
// injection into the model's context. Browser can't do this itself (CORS), and doing it here
// keeps a single hardened fetch path (SSRF guard, size/time caps).
//
// Also the ASSET-HARVEST endpoint (same hardened fetch path, so one SSRF guard covers all):
//   mode 'images' — extract the image URLs from a page (migrating photos off an old site).
//   mode 'save'   — download ONE image and copy it into the user's project-assets storage +
//                   manifest row, so it survives the source site going away.
//
// Deploy: npx supabase functions deploy fetch-url

import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeFetch, urlAllowed } from '../_shared/safeFetch.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TEXT = 12_000;      // chars of extracted text returned per page
const MAX_BODY = 1_500_000;   // chars of raw HTML we'll process

// SSRF guard: the shared hardened path (_shared/safeFetch.ts) — static checks + DNS resolution
// with every-record-public required, and MANUAL redirects re-validated per hop. The old local
// guard checked only the initial hostname string and then followed redirects blindly.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Crude-but-robust readable-text extraction: drop script/style/nav chrome, strip tags. */
function extractText(html: string): { title: string; description: string; text: string } {
  const head = html.slice(0, 40_000);
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? '');
  const description = decodeEntities(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(head)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(head)?.[1] ?? '',
  ).trim();
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep a little structure so the model can see sections/items.
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<(br|hr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
    .slice(0, MAX_TEXT);
  return { title, description, text };
}

// ---------------------------------------------------------------------------
// Asset harvest
// ---------------------------------------------------------------------------

const MAX_IMAGES = 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Skip obvious non-content images (pixels, spacers, tiny icons) by URL fingerprint.
const IMG_SKIP = /pixel|spacer|blank\.|1x1|favicon|tracking|badge|\.svg(\?|$)/i;

/** Extract likely-content image URLs (+alt) from a page's HTML, absolutized against the page. */
function extractImages(html: string, base: string): { url: string; alt: string }[] {
  const found = new Map<string, string>();
  const add = (raw: string | undefined, alt = '') => {
    if (!raw) return;
    const candidate = raw.trim().split(/\s+/)[0]; // first srcset entry
    if (!candidate || candidate.startsWith('data:')) return;
    try {
      const abs = new URL(candidate, base);
      if (!isAllowed(abs) || IMG_SKIP.test(abs.href)) return;
      if (!found.has(abs.href)) found.set(abs.href, alt);
    } catch { /* unparseable src — skip */ }
  };
  // og:image first — it's the page's chosen hero.
  add(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1], 'page hero');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = decodeEntities(/\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
    add(/\bsrcset=["']([^"']+)["']/i.exec(tag)?.[1], alt);
    add(/\bsrc=["']([^"']+)["']/i.exec(tag)?.[1], alt);
    add(/\bdata-src=["']([^"']+)["']/i.exec(tag)?.[1], alt); // lazy-load libraries
  }
  for (const m of html.matchAll(/<source\b[^>]*srcset=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) add(m[2]);
  return [...found].slice(0, MAX_IMAGES).map(([url, alt]) => ({ url, alt }));
}

/** Filename for a saved copy: keep the source basename, sanitized, uniqued by timestamp. */
function assetFileName(u: URL): string {
  const base = (u.pathname.split('/').pop() || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const named = /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.jpg`;
  return `${Date.now()}-${named}`;
}

// ---------------------------------------------------------------------------
// Contact discovery (mode 'contact') — mine a prospect's site for PUBLICLY
// LISTED contact emails. Works on the RAW HTML (mailto: links live in tags the
// text extractor strips), falls back to the site's own contact page when the
// landing page lists nothing. Only ever returns what the site itself publishes
// — Garvis never guesses or constructs an address.
// ---------------------------------------------------------------------------

const EMAIL_JUNK = /noreply|no-?reply|donotreply|do-?not-?reply|example\.|yourdomain|yourema|sentry|wixpress|schema\.org|\.(png|jpe?g|gif|webp|svg|css|js)$/i;

function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const e = decodeEntities(raw).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return;
    if (EMAIL_JUNK.test(e)) return;
    found.add(e);
  };
  for (const m of html.matchAll(/mailto:([^"'\s<>?]+)/gi)) add(m[1]);
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) add(m[0]);
  // Light de-obfuscation: "name [at] domain [dot] com" style listings.
  for (const m of text.matchAll(/([A-Za-z0-9._%+-]+)\s*[\[(]\s*at\s*[\])]\s*([A-Za-z0-9-]+)\s*[\[(]\s*dot\s*[\])]\s*([A-Za-z]{2,})/gi)) add(`${m[1]}@${m[2]}.${m[3]}`);
  for (const m of text.matchAll(/([A-Za-z0-9._%+-]+)\s*[\[(]\s*at\s*[\])]\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi)) add(`${m[1]}@${m[2]}`);
  return [...found].slice(0, 6);
}

/** Same-host contact-page link, if the page advertises one. */
function findContactLink(html: string, base: string): string | null {
  let baseHost: string;
  try { baseHost = new URL(base).hostname; } catch { return null; }
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, ' ');
    if (!/contact|get in touch|reach (us|out)/i.test(href) && !/contact|get in touch/i.test(label)) continue;
    try {
      const abs = new URL(href, base);
      if (abs.hostname === baseHost && isAllowed(abs)) return abs.href;
    } catch { /* unparseable href — skip */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Authenticated FableForge users only — this is an outbound fetch proxy.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { url: raw, mode, projectId } = (await req.json().catch(() => ({}))) as
      { url?: string; mode?: 'text' | 'images' | 'save' | 'contact'; projectId?: string };
    if (!raw) return json({ error: 'url is required' }, 400);
    let url: URL;
    try { url = new URL(raw); } catch { return json({ error: 'Invalid URL' }, 400); }
    if (!(await urlAllowed(url))) return json({ error: 'This URL cannot be fetched.' }, 400);

    // ---- mode 'save': copy ONE image into the user's project-assets storage + manifest ----
    if (mode === 'save') {
      if (!projectId) return json({ error: 'projectId is required' }, 400);
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: proj } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
      if (!proj || proj.owner_id !== user.id) return json({ error: 'Project not found.' }, 404);

      const ac0 = new AbortController();
      const t0 = setTimeout(() => ac0.abort(), 20_000);
      let img: Response;
      try {
        img = await safeFetch(url.href, { signal: ac0.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FableForge/1.0)' } });
      } finally { clearTimeout(t0); }
      if (!img.ok) return json({ error: `The image returned ${img.status}.` }, 200);
      const ctype = img.headers.get('content-type') ?? '';
      if (!ctype.startsWith('image/')) return json({ error: 'That URL is not an image.' }, 200);
      const bytes = new Uint8Array(await img.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Image is larger than 8MB.' }, 200);

      const path = `${user.id}/${projectId}/${assetFileName(url)}`;
      const up = await admin.storage.from('project-assets').upload(path, bytes, { contentType: ctype, upsert: false });
      if (up.error) return json({ error: up.error.message }, 200);
      const publicUrl = admin.storage.from('project-assets').getPublicUrl(path).data.publicUrl;
      const name = path.split('/').pop()!;
      const { data: row, error: insErr } = await admin.from('project_assets')
        .insert({ owner_id: user.id, project_id: projectId, name, url: publicUrl, alt: '', source: 'harvest' })
        .select('*').single();
      if (insErr) return json({ error: insErr.message }, 200);
      return json({ asset: row });
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await safeFetch(url.href, {
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FableForge/1.0; +https://fableforge.app)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
      });
    } finally { clearTimeout(t); }
    if (!res.ok) return json({ error: `The page returned ${res.status}.`, status: res.status }, 200);

    const type = res.headers.get('content-type') ?? '';
    const bodyRaw = (await res.text()).slice(0, MAX_BODY);

    // ---- mode 'images': list the page's likely-content images for the harvest picker ----
    if (mode === 'images') {
      if (!/html/.test(type)) return json({ images: [], url: res.url || url.href });
      return json({ images: extractImages(bodyRaw, res.url || url.href), url: res.url || url.href });
    }

    // ---- mode 'contact': publicly listed emails from the page (falls back to its contact page) ----
    if (mode === 'contact') {
      if (!/html/.test(type)) return json({ emails: [], contactPage: null, url: res.url || url.href });
      let emails = extractEmails(bodyRaw);
      const contactPage = findContactLink(bodyRaw, res.url || url.href);
      if (!emails.length && contactPage) {
        try {
          const ac2 = new AbortController();
          const t2 = setTimeout(() => ac2.abort(), 12_000);
          let r2: Response;
          try {
            r2 = await safeFetch(contactPage, { signal: ac2.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FableForge/1.0)' } });
          } finally { clearTimeout(t2); }
          if (r2.ok && /html/.test(r2.headers.get('content-type') ?? '')) {
            emails = extractEmails((await r2.text()).slice(0, MAX_BODY));
          }
        } catch { /* contact page unreachable — report what the landing page gave us */ }
      }
      return json({ emails, contactPage, url: res.url || url.href, title: extractText(bodyRaw).title });
    }

    if (/json|text\/plain|csv|xml/.test(type) && !/html/.test(type)) {
      // Raw data responses (APIs, feeds, files) pass through as-is, capped.
      return json({ url: res.url || url.href, title: url.hostname, description: '', text: bodyRaw.slice(0, MAX_TEXT), contentType: type });
    }
    const { title, description, text } = extractText(bodyRaw);
    // Raw-HTML signals for the honest site audit (computed here, before the HTML is stripped):
    // did the page declare a mobile viewport, is there any contact affordance, is it served over TLS.
    const finalUrl = res.url || url.href;
    const checks = {
      viewport: /<meta[^>]+name=["']?\s*viewport/i.test(bodyRaw),
      form: /<form[\s>]/i.test(bodyRaw) || /mailto:/i.test(bodyRaw),
      email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(bodyRaw),
      https: finalUrl.startsWith('https://'),
    };
    return json({ url: finalUrl, title: title || url.hostname, description, text, contentType: type, checks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /abort/i.test(msg) ? 'The page took too long to load.' : msg }, 200);
  }
});
