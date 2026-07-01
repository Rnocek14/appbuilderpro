// src/lib/garvis/discover.ts
// Real-media retrieval for Explorer mode — turns a cluster into an information hub by pulling actual
// images, an overview, and explainer videos from the open web. Design for browser reality:
//   • Wikipedia / Wikimedia action API (origin=*) — CORS-friendly, NO key — real images + a real
//     overview for almost any knowledge topic. This is the instant, free layer.
//   • YouTube explainers — found via the model's web_search (Anthropic) so we get real video links;
//     thumbnails come from img.youtube.com (keyless, renders in <img>). Falls back to a search link.
// Everything is best-effort and wrapped so a failure returns [] rather than throwing.

import { resolveAI } from '../aiConfig';
import { supabase } from '../supabase';

export interface MediaImage { title: string; url: string; thumb: string; source: string }

// ---------------------------------------------------------------------------
// PERPLEXITY (Sonar) — the real "interesting search": a synthesized answer + real web images +
// sources, in one call. Key lives in VITE_PERPLEXITY_API_KEY (.env.local, git-ignored). Browser-
// direct for the local spike; the production path is the same call from a Supabase edge function.
// ---------------------------------------------------------------------------

export interface DiscoverResult { overview: string; images: MediaImage[]; sources: { title: string; url: string }[]; costUsd: number }

// Perplexity now runs through the discover-media EDGE FUNCTION (key server-side, credit-metered) —
// never browser-direct (that leaked the key and hit the CORS wall anyway). We only learn the feature
// is off when the edge says so, so cache that to stop re-calling.
let perplexityBlocked = false;
export function perplexityAvailable(): boolean {
  return !perplexityBlocked; // the server holds the key; treat as available until a call says otherwise
}

export async function perplexityDiscover(topic: string): Promise<DiscoverResult | null> {
  if (perplexityBlocked) return null;
  try {
    const { data: resp, error } = await supabase.functions.invoke('discover-media', { body: { provider: 'perplexity', topic } });
    if (error) return null;
    if (resp && (resp as { available?: boolean }).available === false) { perplexityBlocked = true; return null; }
    const data = (resp as {
      data?: {
        choices?: { message?: { content?: string } }[];
        images?: Array<string | { image_url?: string; url?: string; title?: string }>;
        search_results?: Array<{ title?: string; url?: string }>;
        citations?: string[];
      };
    })?.data;
    if (!data) return null;
    const overview = (data?.choices?.[0]?.message?.content ?? '').trim();

    const rawImages = (data?.images ?? []) as Array<string | { image_url?: string; url?: string; title?: string }>;
    const seen = new Set<string>();
    const images: MediaImage[] = [];
    for (const im of rawImages) {
      const url = typeof im === 'string' ? im : (im.image_url || im.url || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = typeof im === 'object' && im.title ? im.title : topic;
      images.push({ title, url, thumb: url, source: 'perplexity' });
      if (images.length >= 8) break;
    }

    const searchResults = (data?.search_results ?? []) as Array<{ title?: string; url?: string }>;
    const citations = (data?.citations ?? []) as string[];
    const sources = (searchResults.length
      ? searchResults.map((s) => ({ title: s.title || s.url || '', url: s.url || '' }))
      : citations.map((u) => ({ title: u, url: u }))
    ).filter((s) => s.url).slice(0, 6);

    return { overview, images, sources, costUsd: 0 }; // Perplexity billing isn't in this response; treat as ~0 here
  } catch (e) {
    // a TypeError here is the CORS/network wall — flip the breaker so we don't keep hammering it
    if (e instanceof TypeError) perplexityBlocked = true;
    return null; // caller falls back to Wikipedia/Serper
  }
}
export interface MediaVideo { title: string; url: string; videoId?: string; thumb?: string }
export interface Gathered { images: MediaImage[]; overview: string; overviewUrl?: string }

const WIKI = 'https://en.wikipedia.org/w/api.php';

/** Best-effort Wikipedia overview + representative images. No key. CORS via origin=*. */
export async function fetchWikipedia(query: string): Promise<Gathered> {
  const empty: Gathered = { images: [], overview: '' };
  try {
    // 1) Resolve the best-matching page title via search.
    const sUrl = `${WIKI}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const sRes = await fetch(sUrl);
    if (!sRes.ok) return empty;
    const sData = await sRes.json();
    const title: string | undefined = sData?.query?.search?.[0]?.title;
    if (!title) return empty;

    // 2) Pull the page extract + its images (file titles), and the lead thumbnail.
    const pUrl = `${WIKI}?action=query&prop=extracts|pageimages|images&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=480&imlimit=20&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const pRes = await fetch(pUrl);
    if (!pRes.ok) return empty;
    const pData = await pRes.json();
    const pages = pData?.query?.pages ?? {};
    const page = Object.values(pages)[0] as {
      extract?: string; thumbnail?: { source?: string }; images?: { title: string }[]; fullurl?: string;
    } | undefined;
    const overview = (page?.extract ?? '').split('\n')[0].slice(0, 700);
    const images: MediaImage[] = [];
    if (page?.thumbnail?.source) images.push({ title, url: page.thumbnail.source, thumb: page.thumbnail.source, source: 'wikipedia' });

    // 3) Resolve a few more real image file URLs (skip icons/svg/logos).
    const fileTitles = (page?.images ?? [])
      .map((i) => i.title)
      .filter((t) => /\.(jpg|jpeg|png)$/i.test(t) && !/(commons-logo|wiki|icon|edit-|ambox|symbol|flag)/i.test(t))
      .slice(0, 6);
    if (fileTitles.length) {
      const iUrl = `${WIKI}?action=query&prop=imageinfo&iiprop=url&iiurlwidth=480&titles=${encodeURIComponent(fileTitles.join('|'))}&format=json&origin=*`;
      const iRes = await fetch(iUrl);
      if (iRes.ok) {
        const iData = await iRes.json();
        for (const p of Object.values(iData?.query?.pages ?? {}) as { title?: string; imageinfo?: { thumburl?: string; url?: string }[] }[]) {
          const info = p.imageinfo?.[0];
          const url = info?.thumburl || info?.url;
          if (url) images.push({ title: (p.title ?? '').replace(/^File:/, ''), url, thumb: url, source: 'wikimedia' });
        }
      }
    }
    const overviewUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    // de-dupe images by url, cap to 6
    const seen = new Set<string>();
    const deduped = images.filter((im) => (seen.has(im.url) ? false : (seen.add(im.url), true))).slice(0, 6);
    return { images: deduped, overview, overviewUrl };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// SERPER (Google) — real Google images + explainer videos + "people also ask" currents, one cheap
// API. Key in VITE_SERPER_API_KEY (.env.local). Browser-direct for the spike; edge fn for prod.
// ---------------------------------------------------------------------------

let serperBlocked = false;
export function serperAvailable(): boolean {
  return !serperBlocked; // key is server-side (discover-media edge fn); available until a call says off
}
export function discoverAvailable(): boolean {
  return perplexityAvailable() || serperAvailable();
}

// Strip question-filler so image/video search hits the actual subject ("how do bee hives work" → "bee hives").
function cleanQuery(q: string): string {
  const c = q
    .replace(/^(how (do|does|to)|why (do|does|is|are|did)|what (is|are|was|were)|when (did|do|does)|where (is|are|do)|who (is|are|was)|can|is|are|does|do)\s+/i, '')
    .replace(/\?+\s*$/, '')
    .replace(/\b(explained|work|works|guide|meaning|definition|overview|introduction)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return c.length >= 3 ? c : q;
}

// Junk sources to drop from image results; reputable ones to float to the top.
const IMG_BLOCK = ['facebook.', 'instagram.', 'pinterest.', 'tiktok.', 'twitter.', 'x.com', 'reddit.', 'quora.', '9gag', 'imgur.', 'tumblr.', 'memegenerator', 'ifunny', 'me.me', 'fbsbx', 'linkedin.'];
const IMG_BOOST = ['wikipedia.org', 'wikimedia.org', 'nasa.gov', '.edu', '.gov', 'britannica', 'nationalgeographic', 'nature.com', 'sciencedirect', 'smithsonian', 'esa.int', 'noaa.', 'nps.gov', 'si.edu', 'jpl.', 'cern', 'mit.edu'];
function imgScore(domain: string, w?: number): number {
  const d = (domain || '').toLowerCase();
  let s = 0;
  if (IMG_BOOST.some((b) => d.includes(b))) s += 3;
  if (typeof w === 'number') { if (w >= 800) s += 2; else if (w >= 400) s += 1; }
  return s;
}

async function serper<T>(path: string, q: string): Promise<T | null> {
  if (serperBlocked) return null;
  try {
    const { data: resp, error } = await supabase.functions.invoke('discover-media', { body: { provider: 'serper', path, q } });
    if (error) return null;
    if (resp && (resp as { available?: boolean }).available === false) { serperBlocked = true; return null; }
    return ((resp as { data?: T })?.data) ?? null;
  } catch { return null; }
}

export async function serperImages(query: string): Promise<MediaImage[]> {
  const data = await serper<{ images?: Array<{ title?: string; imageUrl?: string; thumbnailUrl?: string; imageWidth?: number; domain?: string; source?: string; link?: string }> }>('images', cleanQuery(query));
  if (!data?.images) return [];
  const seen = new Set<string>();
  const scored: { img: MediaImage; score: number }[] = [];
  for (const im of data.images) {
    const thumb = im.thumbnailUrl || im.imageUrl;
    const url = im.imageUrl || im.thumbnailUrl;
    const domain = (im.domain || im.source || im.link || '').toLowerCase();
    if (!thumb || !url || seen.has(url)) continue;
    if (IMG_BLOCK.some((b) => domain.includes(b))) continue;          // drop memes / social junk
    if (typeof im.imageWidth === 'number' && im.imageWidth < 300) continue; // drop tiny icons/thumbnails
    seen.add(url);
    scored.push({ img: { title: im.title || query, url, thumb, source: domain ? domain.replace(/^www\./, '') : 'google' }, score: imgScore(domain, im.imageWidth) });
  }
  // reputable + larger first, preserving Google's order within a tier
  return scored.map((s, i) => ({ ...s, i })).sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.img).slice(0, 8);
}

export async function serperVideos(query: string): Promise<MediaVideo[]> {
  const data = await serper<{ videos?: Array<{ title?: string; link?: string; imageUrl?: string }> }>('videos', `${cleanQuery(query)} explained`);
  if (!data?.videos) return [];
  const out: MediaVideo[] = [];
  for (const v of data.videos) {
    if (!v.link || !/youtube\.com|youtu\.be/.test(v.link)) continue;   // explainers, not random embeds
    out.push({ title: (v.title || 'Video').slice(0, 120), url: v.link, videoId: youTubeId(v.link), thumb: v.imageUrl });
    if (out.length >= 4) break;
  }
  return out;
}

/** "People also ask" + related searches → real momentum currents straight from Google. */
export async function serperRelated(query: string): Promise<string[]> {
  const data = await serper<{ peopleAlsoAsk?: Array<{ question?: string }>; relatedSearches?: Array<{ query?: string }> }>('search', query);
  if (!data) return [];
  const paa = (data.peopleAlsoAsk ?? []).map((p) => p.question).filter(Boolean) as string[];
  const rel = (data.relatedSearches ?? []).map((r) => r.query).filter(Boolean) as string[];
  return [...paa, ...rel].slice(0, 8);
}

const YT_ID = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
export function youTubeId(url: string): string | undefined {
  return YT_ID.exec(url)?.[1];
}
export function youTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Find real YouTube explainer videos via the model's web_search (Anthropic only — that's where
 * server-side web search lives). Returns [] (caller shows a search-link fallback) on any other
 * provider or failure. Thumbnails are keyless img.youtube.com urls.
 */
export async function fetchYouTube(query: string): Promise<{ videos: MediaVideo[]; costUsd: number }> {
  const ai = resolveAI();
  if (ai.provider !== 'anthropic' || !ai.key) return { videos: [], costUsd: 0 };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        system:
          'Find 3 strong YouTube explainer videos for the topic. Return ONLY a JSON array, no prose: ' +
          '[{"title":"...","url":"https://www.youtube.com/watch?v=..."}]. Use real youtube.com/watch URLs you found.',
        messages: [{ role: 'user', content: `Top YouTube explainer videos about: ${query}` }],
      }),
    });
    if (!res.ok) return { videos: [], costUsd: 0 };
    const data = await res.json();
    const text = ((data.content ?? []) as { type: string; text?: string }[])
      .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    let arr: { title?: string; url?: string }[] = [];
    if (start !== -1 && end !== -1) { try { arr = JSON.parse(text.slice(start, end + 1)); } catch { arr = []; } }
    const videos: MediaVideo[] = [];
    for (const v of arr) {
      if (!v?.url) continue;
      const id = youTubeId(v.url);
      videos.push({ title: (v.title ?? 'Video').slice(0, 120), url: v.url, videoId: id, thumb: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined });
      if (videos.length >= 3) break;
    }
    return { videos, costUsd: 0 }; // web_search billing isn't in token usage; treat as ~0 here
  } catch {
    return { videos: [], costUsd: 0 };
  }
}
