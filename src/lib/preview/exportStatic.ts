// src/lib/preview/exportStatic.ts
// THE DELIVERABLE — turn a SiteSpec into ONE self-contained .html file a paying client can put on
// their domain. Fidelity by construction: we render the exact same React section components the
// preview uses (renderToStaticMarkup) and inline the app's compiled stylesheet, so the export IS
// the preview — no second renderer to drift. The head carries what the SPA route can't give a
// crawler: meta description, Open Graph, schema.org LocalBusiness JSON-LD, font links, and a
// preloaded hero. Runs in the browser (the operator clicks Export); no server round-trip.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreviewSiteRenderer } from '../../components/preview/PreviewSiteRenderer';
import type { SiteSpec } from './spec';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The app's compiled CSS (Tailwind utilities the sections are styled with), inlined. Same-origin
 *  stylesheets only; a sheet that fails to fetch is skipped rather than failing the export. */
async function collectCss(): Promise<string> {
  const parts: string[] = [];
  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
    try {
      if (!link.href.startsWith(location.origin)) continue;
      const res = await fetch(link.href);
      if (res.ok) parts.push(await res.text());
    } catch { /* skip */ }
  }
  return parts.join('\n');
}

/** schema.org LocalBusiness — only fields we actually have; nothing invented. */
function jsonLd(spec: SiteSpec, opts: ExportOpts): string {
  const quote = spec.sections.find((s) => s.type === 'quote')?.props as { phone?: string; address?: string } | undefined;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: spec.business_name,
    description: spec.seo.description,
  };
  const phone = opts.phone ?? quote?.phone;
  const address = opts.address ?? quote?.address;
  if (phone) data.telephone = phone;
  if (address) data.address = address;
  if (opts.canonicalUrl) data.url = opts.canonicalUrl;
  // JSON-LD inside <script>: escape the one sequence that could break out.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export interface ExportOpts {
  canonicalUrl?: string | null; phone?: string | null; address?: string | null;
  /** When set, the exported quote form POSTs real leads to claim-submit (rate-limited, notified). */
  previewSiteId?: string | null; leadSubmitUrl?: string | null;
}

/** Build the complete, self-contained HTML document for a SiteSpec. */
export async function buildStaticSiteHtml(spec: SiteSpec, opts: ExportOpts = {}): Promise<string> {
  const body = renderToStaticMarkup(createElement(PreviewSiteRenderer, { spec }));
  const css = await collectCss();
  const fams = [...new Set([spec.theme.displayFont, spec.theme.bodyFont])]
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
  const heroImg = spec.sections.find((s) => s.type === 'hero')?.props.image as string | undefined;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.seo.title)}</title>
<meta name="description" content="${esc(spec.seo.description)}">
<meta property="og:title" content="${esc(spec.seo.title)}">
<meta property="og:description" content="${esc(spec.seo.description)}">
<meta property="og:type" content="website">
${heroImg ? `<meta property="og:image" content="${esc(heroImg)}">\n<link rel="preload" as="image" href="${esc(heroImg)}">` : ''}
${opts.canonicalUrl ? `<link rel="canonical" href="${esc(opts.canonicalUrl)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams}&display=swap">
<script type="application/ld+json">${jsonLd(spec, opts)}</script>
<style>${css}</style>
<style>
/* Static-export overrides: scroll-reveal runs on JS the export doesn't ship — content must be
   visible immediately; the dead SPA-only controls (mobile menu toggle) are hidden. */
.pv-export .pv-site [style*="translateY"], .pv-export .pv-site .opacity-0 { opacity: 1 !important; transform: none !important; }
.pv-export header button[aria-label*="menu" i] { display: none; }
html { scroll-behavior: smooth; }
</style>
</head>
<body class="pv-export">
${body}
<script>
/* Minimal interactivity for the static build: section CTAs scroll to the quote form
   (form buttons excluded — those submit). */
document.querySelectorAll('button').forEach(function (b) {
  if (b.closest('form')) return;
  b.addEventListener('click', function () {
    var el = document.getElementById('quote') || document.getElementById('ctaBanner');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });
});
${opts.previewSiteId && opts.leadSubmitUrl ? `
/* REAL lead capture on the exported site: the quote form posts through the same rate-limited,
   owner-notified endpoint the live preview uses. */
(function () {
  var form = document.querySelector('#quote form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.querySelectorAll('input, textarea');
    fetch(${JSON.stringify(opts.leadSubmitUrl)}, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        previewSiteId: ${JSON.stringify(opts.previewSiteId)},
        name: (f[0] && f[0].value) || '',
        contact: (f[1] && f[1].value) || '',
        message: 'Quote request (exported site): ' + ((f[2] && f[2].value) || ''),
      }),
    }).catch(function () {});
    var note = document.createElement('p');
    note.textContent = 'Sent — you\\u2019ll hear back shortly.';
    note.style.cssText = 'font-weight:600;margin-top:8px';
    form.appendChild(note);
    form.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
  });
})();` : ''}
</script>
</body>
</html>`;
}

/** Trigger a browser download of the export. */
export async function downloadStaticSite(spec: SiteSpec, slug: string, opts: ExportOpts = {}): Promise<void> {
  const html = await buildStaticSiteHtml(spec, opts);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug || 'site'}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}
