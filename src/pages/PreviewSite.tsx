// src/pages/PreviewSite.tsx
// The PUBLIC preview route — what a business owner opens from the outreach email. No login, no
// FableForge chrome: just their website. `/preview-site/:slug/email-shot` renders the stripped,
// animation-free variant used for email screenshots. Previews are kept out of search indexes.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPreviewSite, recordPreviewEvent, type PreviewSiteRow } from '../lib/preview/engine';
import { PreviewSiteRenderer } from '../components/preview/PreviewSiteRenderer';
import { ClaimBar } from '../components/preview/ClaimBar';
import { supabaseUrl } from '../lib/supabase';

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
  return (
    <>
      <PreviewSiteRenderer spec={row.spec} shot={shot} previewSiteId={row.id}
        leadSubmitUrl={`${supabaseUrl}/functions/v1/claim-submit`} />
      {/* The purchase-intent path: a preview with no way to say "yes" converts at zero. */}
      {!shot && <ClaimBar previewSiteId={row.id} businessName={row.business_name} slug={row.slug} />}
    </>
  );
}
