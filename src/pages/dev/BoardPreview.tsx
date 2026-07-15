// src/pages/dev/BoardPreview.tsx
// DEV-ONLY preview of the CREATIVE BOARDS at /dev/board (no auth). Tabs between the postcard board and
// the social board, both mounted with mock materials so make → spread → rendition → focus is drivable +
// screenshottable without a DB or an image key (AI imagery degrades honestly to brand cards here).

import { useState } from 'react';
import { PostcardBoard } from '../../components/garvis/canvas/PostcardBoard';
import { SocialBoard } from '../../components/garvis/canvas/SocialBoard';
import type { PostcardMaterials } from '../../lib/garvis/postcardBoard';
import type { SocialMaterials } from '../../lib/garvis/socialBoard';

const PC: PostcardMaterials = {
  ctx: {
    business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null,
    offerings: ['lakefront listings', 'buyer representation'], audience: 'lakefront sellers',
    locale: 'Lake Geneva', links: { site: 'https://lakeside.example' }, tone: null,
  },
  brand: { palette: ['#2e6f95', '#0f3d5c'], fonts: [], compliance_line: 'Lakeside Realty · Equal Housing Opportunity' },
  images: [],
};
const SC: SocialMaterials = { businessName: 'Lakeside Realty', area: 'Lake Geneva', realEstate: true, accent: '#2e6f95', avatarUrl: null, images: [] };
const noop = (_k: 'success' | 'error' | 'info', _m: string) => {};

export default function BoardPreview() {
  const [tab, setTab] = useState<'postcard' | 'social'>('postcard');
  return (
    <div style={{ height: '100vh', background: 'var(--forge-bg, #14100c)' }}>
      <div style={{ height: '100vh', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 6 }}>
          <span style={{ color: '#A99BB0', font: '12px system-ui' }}>dev · creative boards ·</span>
          {(['postcard', 'social'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ font: '12px system-ui', padding: '3px 10px', borderRadius: 8, border: '1px solid #3a2f25', background: tab === t ? '#ff8a3d' : 'transparent', color: tab === t ? '#1a0e04' : '#A99BB0' }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === 'postcard'
            ? <PostcardBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={PC} />
            : <SocialBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={SC} />}
        </div>
      </div>
    </div>
  );
}
