// src/pages/dev/ProspectWebPreview.tsx
// DEV-ONLY preview of ProspectCanvas at /dev/prospect-web (no auth) — the "web" for one rated
// website, using the same canvas as marketing. Sample data (illustrative, not real). Not linked.

import { ProspectCanvas, type ProspectCanvasData } from '../../components/garvis/canvas/ProspectCanvas';
import type { SiteAudit } from '../../lib/garvis/siteAudit';

const audit: SiteAudit = {
  url: 'http://joesroofing.com', reachable: true, verdict: 'weak', score: 34,
  headline: 'Weak site — not mobile-friendly + 3 more issues. A strong prospect.',
  signals: [
    { id: 'not_mobile', label: 'Not mobile-friendly', severity: 'high', detail: 'No mobile setup — looks broken on phones.' },
    { id: 'no_contact', label: 'No clear way to contact', severity: 'high', detail: 'No form and no visible email.' },
    { id: 'stale', label: 'Copyright says 2011', severity: 'med', detail: 'The footer year makes it look abandoned.' },
    { id: 'no_description', label: 'No meta description', severity: 'low', detail: 'No search-result summary.' },
  ],
  strengths: ['Secure (HTTPS)', 'Has a page title'],
};
const sample: ProspectCanvasData = { name: 'Joe’s Roofing', url: 'http://joesroofing.com', audit, built: null };

export default function ProspectWebPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14' }}>
      <ProspectCanvas data={sample} building={false} onBuild={() => console.log('[build]')} onClose={() => console.log('[close]')} />
    </div>
  );
}
