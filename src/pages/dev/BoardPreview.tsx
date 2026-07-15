// src/pages/dev/BoardPreview.tsx
// DEV-ONLY preview of the POSTCARD CREATIVE BOARD at /dev/board (no auth). Mounts PostcardBoard with mock
// materials so the spread → make → rendition → focus flow is drivable + screenshottable without a DB or
// an image key (AI imagery degrades honestly to brand cards here). Not linked anywhere.

import { PostcardBoard } from '../../components/garvis/canvas/PostcardBoard';
import type { PostcardMaterials } from '../../lib/garvis/postcardBoard';

const MATERIALS: PostcardMaterials = {
  ctx: {
    business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null,
    offerings: ['lakefront listings', 'buyer representation'], audience: 'lakefront sellers',
    locale: 'Lake Geneva', links: { site: 'https://lakeside.example' }, tone: null,
  },
  brand: { palette: ['#2e6f95', '#0f3d5c'], fonts: [], compliance_line: 'Lakeside Realty · Equal Housing Opportunity' },
  images: [],
};
const noop = (_k: 'success' | 'error' | 'info', _m: string) => {};

export default function BoardPreview() {
  return (
    <div style={{ height: '100vh', background: 'var(--forge-bg, #14100c)' }}>
      <div style={{ height: '100vh', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <p style={{ color: '#A99BB0', font: '12px system-ui', textAlign: 'center', padding: '6px' }}>dev preview · postcard creative board · mock materials (AI imagery degrades to brand cards)</p>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PostcardBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={MATERIALS} />
        </div>
      </div>
    </div>
  );
}
