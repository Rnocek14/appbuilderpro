// src/lib/preview/scrapeProfile.ts
// THE IN-APP SCRAPER → PROFILE handoff (impure: fetch-url + model + ingest). Give it a prospect's
// URL and it assembles a real BusinessProfile from their LIVE site — the readable text (fetch-url
// 'text'), their own photos (fetch-url 'images'), and their published contact email (fetch-url
// 'contact') — plus an honest siteAudit, then hands that profile to ingestBusinessProfile (which
// builds the demo site, the audit report, and the pitch). Turns "paste a URL" into "a rebuilt-site
// demo + drafted pitch, ready to review" — entirely inside Garvis, no external scraper needed.
//
// The pure transforms (extract, build) live in scrapeProfileCore.ts and are verified there. HONEST
// BY CONSTRUCTION: the profile is extracted ONLY from what the page shows; unknowns are omitted; the
// demo is built from the prospect's OWN photos + copy; siteAudit is the honest checker.

import { supabase } from '../supabase';
import { rawComplete } from '../aiClient';
import { auditSite, type SiteAudit } from '../garvis/siteAudit';
import { ingestBusinessProfile, type PreviewSiteRow } from './engine';
import { parseBusinessProfile, type BusinessProfile } from './spec';
import { EXTRACT_SYSTEM, extractProfileFields, buildProfile, type ExtractedFields } from './scrapeProfileCore';

export { EXTRACT_SYSTEM, extractProfileFields, buildProfile } from './scrapeProfileCore';
export type { ExtractedFields, ScrapeContext } from './scrapeProfileCore';

interface ScrapedSite { text: string; title: string | null; images: string[]; email: string | null; audit: SiteAudit }

async function scrapeSite(url: string): Promise<ScrapedSite> {
  const nowYear = new Date().getFullYear();
  const invoke = (mode: 'text' | 'images' | 'contact') =>
    supabase.functions.invoke('fetch-url', { body: { url, mode } }).then((r) => (r.data ?? {}) as Record<string, unknown>, () => ({} as Record<string, unknown>));
  const [textD, imagesD, contactD] = await Promise.all([invoke('text'), invoke('images'), invoke('contact')]);

  const checks = (textD?.checks ?? {}) as { viewport?: boolean; form?: boolean; email?: boolean };
  const reachable = !!textD && !textD.error && (typeof textD.text === 'string' || typeof textD.title === 'string');
  const audit = reachable
    ? auditSite({ url: (textD.url as string) || url, reachable: true, title: (textD.title as string) ?? null, description: (textD.description as string) ?? null, text: (textD.text as string) ?? '', hasViewport: !!checks.viewport, hasForm: !!checks.form, emailFound: !!checks.email }, nowYear)
    : auditSite({ url, reachable: false }, nowYear);

  const rawImages = (imagesD?.images ?? []) as unknown[];
  const images = rawImages.map((i) => (typeof i === 'string' ? i : (i as { url?: string })?.url)).filter((u): u is string => !!u && /^https?:\/\//.test(u));
  const email = ((contactD?.emails ?? []) as string[])[0] ?? null;

  return { text: (textD?.text as string) ?? '', title: (textD?.title as string) ?? null, images, email, audit };
}

export interface ScrapeProfileResult {
  ok: boolean;
  row?: PreviewSiteRow;
  previewUrl?: string;
  profile?: BusinessProfile;
  specSource?: 'ai' | 'fallback';
  errors?: string[];
}

/** URL → scraped profile → demo site + audit + pitch. The whole front half of the win-clients funnel,
 *  in one call. Fails soft with honest errors (unreachable site, or a page too thin to extract a real
 *  business from — never a fabricated profile). */
export async function profileFromScrape(url: string): Promise<ScrapeProfileResult> {
  let clean: string;
  try { clean = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).toString(); }
  catch { return { ok: false, errors: ['That doesn’t look like a valid website URL.'] }; }

  const site = await scrapeSite(clean);
  if (!site.audit.reachable) {
    return { ok: false, errors: [`Couldn’t load ${clean} — check the URL, or the site may block scanning. Worth a manual look before pitching.`] };
  }

  // Extract the factual fields from the page text (honest; fails soft to empty on any model error).
  let fields: ExtractedFields;
  try {
    const r = await rawComplete([
      { role: 'system', content: EXTRACT_SYSTEM },
      { role: 'user', content: `URL: ${clean}\nPAGE TITLE: ${site.title ?? '(none)'}\n\nSCRAPED PAGE TEXT:\n${site.text.slice(0, 9000)}` },
    ], 900);
    fields = extractProfileFields(r.text);
  } catch {
    fields = extractProfileFields('');
  }

  const raw = buildProfile(fields, {
    url: clean, images: site.images, email: site.email,
    auditScore: site.audit.score, auditIssues: site.audit.signals.map((sig) => sig.label),
  });

  // Validate before we spend on the site build — an unextractable page returns honest errors.
  const { profile, errors } = parseBusinessProfile(raw);
  if (!profile) {
    return { ok: false, errors: errors.length ? errors.map((e) => `Couldn’t read enough from the page (${e}). Add the missing detail and retry.`) : ['Couldn’t identify the business from that page.'] };
  }

  const res = await ingestBusinessProfile(raw);
  if (!res.ok) return { ok: false, errors: res.errors };
  return { ok: true, row: res.row, previewUrl: res.previewUrl, profile, specSource: res.specSource };
}
