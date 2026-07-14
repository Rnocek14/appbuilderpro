// src/pages/dev/WebPreview.tsx
// DEV-ONLY preview of the reusable ConstellationWeb at /dev/web (no auth), for screenshot-driven
// design. The nodes here are illustrative sample data to show the layout + look — NOT real user data;
// in the app the web is fed real rows (rated prospect sites, contacts, …). Not linked anywhere.

import { ConstellationWeb } from '../../components/garvis/canvas/ConstellationWeb';
import type { WebNode, WebGroupDef } from '../../lib/garvis/webLayout';

const GROUPS: WebGroupDef[] = [
  { key: 'weak', label: 'Weak sites', color: '#FF8A3D' },
  { key: 'dated', label: 'Dated', color: '#E7B45A' },
  { key: 'solid', label: 'Already solid', color: '#5FC08A' },
  { key: 'unknown', label: 'Couldn’t load', color: '#8A8076' },
];

// sample only — representative businesses so the layout/look is visible
const NODES: WebNode[] = [
  ['Joe’s Roofing', 'weak', 88, 34], ['Ace Plumbing', 'weak', 82, 38], ['Lakeside Law', 'weak', 78, 42],
  ['Bright Dental', 'weak', 74, 46], ['Summit Landscaping', 'weak', 70, 50], ['Harbor Electric', 'weak', 66, 54],
  ['Ridge Painting', 'weak', 62, 58], ['Nova Auto', 'weak', 58, 62],
  ['Maple Bakery', 'dated', 46, 68], ['Corner Cafe', 'dated', 42, 72], ['Willow Spa', 'dated', 38, 74], ['Bay Movers', 'dated', 34, 76],
  ['Modern HVAC', 'solid', 18, 88], ['Peak Fitness', 'solid', 14, 90], ['Cedar Realty', 'solid', 10, 92],
  ['Old Mill Inn', 'unknown', 30, undefined],
].map(([label, group, metric, badge], i) => ({ id: `s${i}`, label: label as string, group: group as string, metric: metric as number, badge: badge as number | undefined }));

export default function WebPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center', marginBottom: 12 }}>
          dev preview · a “web” of businesses clustered by site strength — bigger orb = weaker site = more opportunity (sample data)
        </p>
        <ConstellationWeb nodes={NODES} groups={GROUPS} onOpen={(id) => console.log('[open]', id)} title="Prospects — by site strength" />
      </div>
    </div>
  );
}
