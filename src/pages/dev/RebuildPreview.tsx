// src/pages/dev/RebuildPreview.tsx
// DEV-ONLY renderer for a scrape-rebuilt SiteSpec at /dev/rebuild-preview (no auth), for
// screenshot-driven quality checks of the client-hunt rebuild pipeline. The spec is injected by
// the test harness via window.__REBUILD_SPEC__ (Playwright addInitScript) or pasted into
// localStorage under 'dev:rebuild-spec'. Renders the SAME PreviewSiteRenderer production uses —
// what you see here is exactly what a prospect sees at their preview link. Not linked anywhere.

import { PreviewSiteRenderer } from '../../components/preview/PreviewSiteRenderer';
import type { SiteSpec } from '../../lib/preview/spec';

declare global { interface Window { __REBUILD_SPEC__?: unknown } }

export default function RebuildPreview() {
  let spec: SiteSpec | null = null;
  try {
    const raw = window.__REBUILD_SPEC__ ?? JSON.parse(localStorage.getItem('dev:rebuild-spec') ?? 'null');
    if (raw && typeof raw === 'object') spec = raw as SiteSpec;
  } catch { /* fall through to the hint */ }

  if (!spec) {
    return (
      <div style={{ padding: 40, font: '14px system-ui', color: '#444' }}>
        No spec injected. Set <code>window.__REBUILD_SPEC__</code> (Playwright) or localStorage
        <code> dev:rebuild-spec</code> to a SiteSpec JSON, then reload.
      </div>
    );
  }
  return <PreviewSiteRenderer spec={spec} />;
}
