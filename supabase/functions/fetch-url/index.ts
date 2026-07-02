// supabase/functions/fetch-url/index.ts
// Reads a web page server-side so chat can USE pasted links instead of treating them as plain
// text: returns the page title, description, and readable text (tags stripped, capped) for
// injection into the model's context. Browser can't do this itself (CORS), and doing it here
// keeps a single hardened fetch path (SSRF guard, size/time caps).
//
// Deploy: npx supabase functions deploy fetch-url

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TEXT = 12_000;      // chars of extracted text returned per page
const MAX_BODY = 1_500_000;   // chars of raw HTML we'll process

/** Block non-http(s) schemes and private/link-local hosts (SSRF guard). */
function isAllowed(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^127\.|^10\.|^0\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === '[::1]' || h.startsWith('fd') || h.startsWith('fe80')) return false;
  return true;
}

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

    const { url: raw } = (await req.json().catch(() => ({}))) as { url?: string };
    if (!raw) return json({ error: 'url is required' }, 400);
    let url: URL;
    try { url = new URL(raw); } catch { return json({ error: 'Invalid URL' }, 400); }
    if (!isAllowed(url)) return json({ error: 'This URL cannot be fetched.' }, 400);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url.href, {
        signal: ac.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FableForge/1.0; +https://fableforge.app)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
      });
    } finally { clearTimeout(t); }
    if (!res.ok) return json({ error: `The page returned ${res.status}.`, status: res.status }, 200);

    const type = res.headers.get('content-type') ?? '';
    const bodyRaw = (await res.text()).slice(0, MAX_BODY);
    if (/json|text\/plain|csv|xml/.test(type) && !/html/.test(type)) {
      // Raw data responses (APIs, feeds, files) pass through as-is, capped.
      return json({ url: res.url || url.href, title: url.hostname, description: '', text: bodyRaw.slice(0, MAX_TEXT), contentType: type });
    }
    const { title, description, text } = extractText(bodyRaw);
    return json({ url: res.url || url.href, title: title || url.hostname, description, text, contentType: type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /abort/i.test(msg) ? 'The page took too long to load.' : msg }, 200);
  }
});
