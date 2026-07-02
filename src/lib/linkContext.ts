// src/lib/linkContext.ts
// Makes pasted links MEAN something: URLs in a chat message are detected, fetched server-side
// (fetch-url edge fn), and their content is appended to the outgoing message inside a marked
// block — so the model reads the actual page (docs, a site to reference, an API response)
// instead of guessing from the URL string. The marker lets the chat UI hide the bulky context
// while keeping it in history (regenerate and the agent's conversation memory both reuse it).

import { supabase } from './supabase';

export const LINK_CONTEXT_MARKER = '<<<LINKED PAGES — fetched content, not typed by the user>>>';

const URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

/** Distinct URLs in a message, in order (first 3 — enough context without blowing the budget). */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.match(URL_RE) ?? []) {
    if (!seen.has(m)) seen.add(m);
    if (seen.size >= 3) break;
  }
  return [...seen];
}

export interface FetchedLink { url: string; title: string; text: string; error?: string }

/** Fetch each URL's readable content via the fetch-url edge function (parallel, best-effort). */
export async function fetchLinks(urls: string[]): Promise<FetchedLink[]> {
  return Promise.all(urls.map(async (url) => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url } });
      if (error) return { url, title: hostOf(url), text: '', error: error.message };
      const d = data as { url?: string; title?: string; text?: string; error?: string };
      if (d.error) return { url, title: hostOf(url), text: '', error: d.error };
      return { url: d.url ?? url, title: d.title || hostOf(url), text: d.text ?? '' };
    } catch (e) {
      return { url, title: hostOf(url), text: '', error: e instanceof Error ? e.message : String(e) };
    }
  }));
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Append fetched pages to the outgoing message as a marked context block. */
export function withLinkContext(message: string, links: FetchedLink[]): string {
  const ok = links.filter((l) => l.text);
  if (!ok.length) return message;
  const blocks = ok.map((l) => `--- ${l.title} (${l.url}) ---\n${l.text}`).join('\n\n');
  return `${message}\n\n${LINK_CONTEXT_MARKER}\n${blocks}`;
}

/** Split a stored user message into the typed part + how many linked pages ride along (for display). */
export function splitLinkContext(content: string): { visible: string; linkCount: number } {
  const i = content.indexOf(LINK_CONTEXT_MARKER);
  if (i < 0) return { visible: content, linkCount: 0 };
  const ctx = content.slice(i);
  const linkCount = (ctx.match(/^--- /gm) ?? []).length;
  return { visible: content.slice(0, i).trimEnd(), linkCount };
}
