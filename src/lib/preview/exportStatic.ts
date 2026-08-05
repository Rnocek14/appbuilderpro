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
  // DEV MODE SHIPS AN UNSTYLED SITE. Vite injects CSS as <style> elements during development and
  // emits a <link rel=stylesheet> only in a production build — so on a dev server the loop above
  // finds nothing, returns '', and the export is raw unstyled markup. That file is the DELIVERABLE:
  // an operator exporting or publishing from `npm run dev` was handing a paying client naked HTML,
  // and nothing anywhere said so. Inline <style> content is collected too; in production this adds
  // only the small critical block, which is harmless.
  for (const el of Array.from(document.querySelectorAll<HTMLStyleElement>('style'))) {
    const css = el.textContent ?? '';
    if (css.trim()) parts.push(css);
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
  /** The business's live /book/:slug page, when they have one ENABLED. This is what turns the
   *  registry's "self-serve online booking" from a page that exists NEXT TO the website into a
   *  button ON it — the site sold as having a scheduler must actually carry one. Absent ⇒ nothing
   *  renders; a disabled or unbuilt booking page must never produce a dead button. */
  bookingUrl?: string | null;
}

/** Marker so a document is never wired twice (re-export, re-publish, worker re-render). */
export const BESPOKE_RUNTIME_MARKER = 'data-pv-runtime="1"';

/** Does this spec ship a model-written document rather than the section renderer? */
export function isBespokeDocument(spec: Pick<SiteSpec, 'html'>): boolean {
  return !!spec.html && /<!doctype html>/i.test(spec.html.slice(0, 200));
}

/** WIRE THE BESPOKE DOCUMENT — the fix for the defect that made the recurring fee hollow.
 *
 *  The template path has always injected two things the business is actually paying for: a Book
 *  Online button pointing at their real /book page, and a submit handler that POSTs the quote form
 *  through claim-submit so a lead reaches them. The bespoke path — which is the DEFAULT — returned
 *  the model's document verbatim and got NEITHER. A published bespoke site therefore had no way to
 *  receive a lead at all: the form, if the model wrote one, submitted to nowhere.
 *
 *  Selling "$X/mo, your site captures leads and books jobs" on top of that is selling automation
 *  with nothing behind it, so this is a correctness fix, not a feature.
 *
 *  Pure on purpose (string in, string out) so it can be verified with fixtures — this file had no
 *  verify suite at all, which is how the defect survived. The runtime it injects binds EVERY form
 *  in the document and maps fields by name/type rather than by position, because the markup is
 *  model-written and nothing guarantees a `#quote form` or a fixed field order. */
export function injectBespokeRuntime(html: string, opts: ExportOpts = {}): string {
  if (!html) return html;
  if (html.includes(BESPOKE_RUNTIME_MARKER)) return html;          // idempotent
  const wantsBooking = !!opts.bookingUrl;
  const wantsLeads = !!(opts.previewSiteId && opts.leadSubmitUrl);
  if (!wantsBooking && !wantsLeads) return html;                    // nothing to wire, no marker

  const booking = wantsBooking
    ? `<a href="${esc(opts.bookingUrl!)}" class="pv-book-cta" ${BESPOKE_RUNTIME_MARKER} style="position:fixed;right:18px;bottom:18px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:999px;background:#111;color:#fff;font-weight:600;font-size:15px;font-family:system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 28px rgba(0,0,0,.28)">\u{1F4C5} Book online</a>`
    : '';

  // Field mapping is by NAME and TYPE, never by index: a model-written form may order fields any
  // way, and a positional read would post the message as the name.
  const leads = wantsLeads
    ? `<script ${BESPOKE_RUNTIME_MARKER}>
(function () {
  var URL_ = ${JSON.stringify(opts.leadSubmitUrl)};
  var SITE = ${JSON.stringify(opts.previewSiteId)};
  function pick(form, sels) {
    for (var i = 0; i < sels.length; i++) { var el = form.querySelector(sels[i]); if (el && el.value != null) return el; }
    return null;
  }
  function wire(form) {
    if (form.getAttribute('data-pv-bound')) return;
    form.setAttribute('data-pv-bound', '1');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameEl = pick(form, ['input[name*="name" i]', 'input[autocomplete="name"]', 'input[type="text"]']);
      var contactEl = pick(form, ['input[type="email"]', 'input[type="tel"]', 'input[name*="email" i]', 'input[name*="phone" i]', 'input[name*="contact" i]']);
      var msgEl = pick(form, ['textarea', 'input[name*="message" i]', 'input[name*="detail" i]']);
      fetch(URL_, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          previewSiteId: SITE,
          name: (nameEl && nameEl.value) || '',
          contact: (contactEl && contactEl.value) || '',
          message: 'Quote request (website): ' + ((msgEl && msgEl.value) || ''),
        }),
      }).catch(function () {});
      var note = document.createElement('p');
      note.textContent = 'Sent \\u2014 you\\u2019ll hear back shortly.';
      note.style.cssText = 'font-weight:600;margin-top:10px';
      form.appendChild(note);
      var btns = form.querySelectorAll('button, input[type="submit"]');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    });
  }
  function wireAll() { var fs = document.querySelectorAll('form'); for (var i = 0; i < fs.length; i++) wire(fs[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAll);
  else wireAll();
})();
</script>`
    : '';

  const block = `\n${booking}\n${leads}\n`;
  // Insert before the LAST </body>; a document without one still gets the runtime appended rather
  // than silently dropping it.
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i === -1 ? html + block : html.slice(0, i) + block + html.slice(i);
}

/** Build the complete, self-contained HTML document for a SiteSpec. */
export async function buildStaticSiteHtml(spec: SiteSpec, opts: ExportOpts = {}): Promise<string> {
  // BESPOKE mode: the model already wrote a complete, self-contained document (honesty-gated
  // upstream). Its markup ships verbatim — but the booking button and the lead-capture handler are
  // wired in, because those are the product, not decoration.
  if (isBespokeDocument(spec)) return injectBespokeRuntime(spec.html!, opts);
  const body = renderToStaticMarkup(createElement(PreviewSiteRenderer, { spec }));
  const css = await collectCss();
  const fams = [...new Set([spec.theme.displayFont, spec.theme.bodyFont])]
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
  // layers heroes carry only bgImage — og:image/preload must not miss the showpiece variant.
  const heroSec = spec.sections.find((s) => s.type === 'hero');
  const heroImg = (heroSec?.props.image ?? heroSec?.props.bgImage) as string | undefined;

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
   visible immediately; the dead SPA-only controls (mobile menu toggle) are hidden. The motion-kit
   moves (TextReveal words, ImageReveal wipes) are forced to their final states the same way —
   the exported page is the finished site, animation was progressive enhancement. */
.pv-export .pv-rvl { opacity: 1 !important; transform: none !important; }
.pv-export .pv-trw { transform: none !important; }
.pv-export .pv-irv { clip-path: none !important; }
.pv-export .pv-irv img { transform: none !important; }
/* Pinned scenes ship their finished frame — collapse the scrub runway so the export never has
   1-2 screens of scroll where nothing moves (the frame IS the layout, no pin needed). */
.pv-export .pv-scn-pin { height: auto !important; }
.pv-export .pv-scn-pin .pv-scn-stage { position: relative !important; height: auto !important; min-height: 100vh; }
.pv-export header button[aria-label*="menu" i] { display: none; }
html { scroll-behavior: smooth; }
</style>
</head>
<body class="pv-export">
${opts.bookingUrl ? `<!-- The scheduler, ON the site. A fixed, unmissable "Book online" action wired to the
     business's real /book page (race-proof availability + booking API behind it). Rendered only
     when the booking page is genuinely enabled — this button must never 404 at a customer. -->
<a href="${esc(opts.bookingUrl)}" class="pv-book-cta" style="position:fixed;right:18px;bottom:18px;z-index:60;display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:999px;background:#111;color:#fff;font-weight:600;font-size:15px;text-decoration:none;box-shadow:0 8px 28px rgba(0,0,0,.28)">📅 Book online</a>` : ''}
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
