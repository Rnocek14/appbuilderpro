// src/pages/PreviewSite.tsx
// The PUBLIC preview route — what a business owner opens from the outreach email. No login, no
// FableForge chrome: just their website. `/preview-site/:slug/email-shot` renders the stripped,
// animation-free variant used for email screenshots. Previews are kept out of search indexes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPreviewSite, recordPreviewEvent, type PreviewSiteRow } from '../lib/preview/engine';
import { PreviewSiteRenderer } from '../components/preview/PreviewSiteRenderer';
import { ClaimBar } from '../components/preview/ClaimBar';
import { AutomationIntake } from '../components/preview/AutomationIntake';
import { supabaseUrl } from '../lib/supabase';

// A tiny reporter injected into the bespoke document so the (deliberately cross-origin) frame can
// tell the parent how tall it is — we can't read that from here without allow-same-origin, which we
// refuse to grant. It posts the content height on load/resize/mutation; the parent sizes the iframe
// to match, so the whole page joins the PARENT's scroll instead of trapping scroll in a 100vh box.
const HEIGHT_REPORTER =
  '<script>(function(){function p(){var b=document.body,d=document.documentElement;' +
  'var h=Math.max(b?b.scrollHeight:0,d?d.scrollHeight:0,b?b.offsetHeight:0);' +
  "parent.postMessage({__ffHeight:h},'*');}" +
  "window.addEventListener('load',p);window.addEventListener('resize',p);" +
  'try{new ResizeObserver(p).observe(document.documentElement);}catch(e){}' +
  'setTimeout(p,300);setTimeout(p,1500);setTimeout(p,3500);' +
  // In-page anchor CTAs ("Get a quote" → #quote): the frame can't scroll itself (sized to content,
  // scrolling=no) and can't reach the parent (cross-origin), so its own nav/CTAs would be dead. Catch
  // the click, find the target, and post its offset — the parent scrolls the whole page to it.
  "document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest?ev.target.closest('a'):null;" +
  "if(!a)return;var href=a.getAttribute('href')||'';if(href.charAt(0)!=='#'||href.length<2)return;" +
  'var t=document.getElementById(href.slice(1));if(!t)return;ev.preventDefault();var r=t.getBoundingClientRect();' +
  "parent.postMessage({__ffAnchor:r.top+(window.scrollY||0)},'*');},true);" +
  '}());</scr' + 'ipt>';

/** Renders a bespoke, Claude-authored HTML document in a sandboxed iframe. No allow-same-origin, so
 *  the generated page stays isolated from the app (its LLM-authored script can't reach our origin,
 *  session, or storage); allow-forms/popups/top-navigation keep its quote form and tel:/mailto CTAs
 *  working. We inject HEIGHT_REPORTER and size the frame to the reported content height, so it flows
 *  in the parent document — the AutomationIntake + ClaimBar below it are reachable (a fixed 100vh
 *  frame used to eat every swipe on mobile and strand them). scrolling="no": the parent owns scroll. */
function BespokeFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(0);
  const srcDoc = useMemo(() => {
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${HEIGHT_REPORTER}</body>`);
    if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${HEIGHT_REPORTER}</html>`);
    return html + HEIGHT_REPORTER;
  }, [html]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const data = e.data as { __ffHeight?: unknown; __ffAnchor?: unknown };
      if (typeof data?.__ffHeight === 'number' && data.__ffHeight > 0) setHeight(Math.min(data.__ffHeight, 40000)); // clamp a runaway report
      // An in-page anchor was clicked inside the frame — scroll the PARENT to it (frame top + offset).
      if (typeof data?.__ffAnchor === 'number' && data.__ffAnchor >= 0) {
        const top = ref.current.getBoundingClientRect().top + window.scrollY + data.__ffAnchor - 12;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return (
    <iframe
      ref={ref}
      title={`${title} — website preview`}
      srcDoc={srcDoc}
      scrolling="no"
      className="block w-full border-0"
      style={{ height: height ? `${height}px` : '100vh' }}
      sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
    />
  );
}

export default function PreviewSite({ shot = false }: { shot?: boolean }) {
  const { slug } = useParams<{ slug: string }>();
  const [row, setRow] = useState<PreviewSiteRow | null | 'loading'>('loading');

  useEffect(() => {
    if (!slug) { setRow(null); return; }
    void getPreviewSite(slug).then((r) => setRow(r));
  }, [slug]);

  // Engagement signal for validation: a view on arrival, an "engaged" mark after 45s of dwell.
  // (Screenshot renders don't count.)
  useEffect(() => {
    if (shot || !row || row === 'loading') return;
    recordPreviewEvent(row.id, 'view');
    const t = window.setTimeout(() => recordPreviewEvent(row.id, 'engaged'), 45_000);
    return () => window.clearTimeout(t);
  }, [row, shot]);

  // Concept previews must never rank for the business's own name.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  if (row === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-400">Loading preview…</div>;
  }
  if (!row) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white">
        <p className="text-lg font-semibold text-neutral-800">Preview not found</p>
        <p className="text-sm text-neutral-500">This preview may have been removed.</p>
      </div>
    );
  }
  // BESPOKE mode: Claude wrote a complete, custom HTML document. A full document can't be injected
  // into a div, and its CSS must not leak into the app — so it renders in a sandboxed iframe that
  // reports its height back and is sized to fit, letting the AutomationIntake/ClaimBar flow below it.
  if (row.spec.html) {
    return (
      <>
        <BespokeFrame html={row.spec.html} title={row.business_name} />
        {!shot && <AutomationIntake previewSiteId={row.id} businessName={row.business_name} theme={row.spec.theme} />}
        {/* Clearance so the fixed ClaimBar can't occlude AutomationIntake's CTA on narrow phones — the
            template path gets this from its footer; the bespoke path has none, so add it explicitly. */}
        {!shot && <div aria-hidden className="h-28 md:h-16" />}
        {!shot && <ClaimBar previewSiteId={row.id} businessName={row.business_name} slug={row.slug} />}
      </>
    );
  }
  return (
    <>
      <PreviewSiteRenderer spec={row.spec} shot={shot} previewSiteId={row.id}
        leadSubmitUrl={`${supabaseUrl}/functions/v1/claim-submit`} />
      {/* The custom-automation ask — turns the visit into a conversation about running their ops.
          In-flow (not floating), so it never collides with the ClaimBar; never in the email shot. */}
      {!shot && <AutomationIntake previewSiteId={row.id} businessName={row.business_name} theme={row.spec.theme} />}
      {/* The purchase-intent path: a preview with no way to say "yes" converts at zero. */}
      {!shot && <ClaimBar previewSiteId={row.id} businessName={row.business_name} slug={row.slug} />}
    </>
  );
}
