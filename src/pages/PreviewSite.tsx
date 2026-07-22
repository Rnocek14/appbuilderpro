// src/pages/PreviewSite.tsx
// The PUBLIC preview route — what a business owner opens from the outreach email. No login, no
// FableForge chrome: just their website. `/preview-site/:slug/email-shot` renders the stripped,
// animation-free variant used for email screenshots. Previews are kept out of search indexes.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPreviewSite, recordPreviewEvent, type PreviewSiteRow } from '../lib/preview/engine';
import { PreviewSiteRenderer } from '../components/preview/PreviewSiteRenderer';
import { ClaimBar } from '../components/preview/ClaimBar';
import { AutomationIntake } from '../components/preview/AutomationIntake';
import { supabaseUrl } from '../lib/supabase';

/** Renders a bespoke, Claude-authored HTML document in a sandboxed iframe. No allow-same-origin, so
 *  the generated page is isolated from the app (and can't reach the parent); allow-forms/popups/
 *  top-navigation keep its quote form and tel:/mailto CTAs working. Fills the viewport and scrolls
 *  internally — the ClaimBar overlays it via fixed positioning. */
function BespokeFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={`${title} — website preview`}
      srcDoc={html}
      className="block h-screen w-full border-0"
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
  // into a div, and its CSS must not leak into the app — so it renders in a sandboxed, same-origin
  // iframe that auto-sizes to its content (letting the ClaimBar/AutomationIntake flow below).
  if (row.spec.html) {
    return (
      <>
        <BespokeFrame html={row.spec.html} title={row.business_name} />
        {!shot && <AutomationIntake previewSiteId={row.id} businessName={row.business_name} theme={row.spec.theme} />}
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
