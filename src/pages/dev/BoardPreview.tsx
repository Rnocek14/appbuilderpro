// src/pages/dev/BoardPreview.tsx
// DEV-ONLY preview of the CREATIVE BOARDS at /dev/board (no auth). Tabs across all four channel boards
// (postcard, social, email, branding), each mounted with mock materials so make → spread → rendition →
// focus + the shared organize tools (search / tidy) are drivable + screenshottable without a DB or an
// image key (AI imagery / logos degrade honestly here).

import { useState } from 'react';
import { PostcardBoard } from '../../components/garvis/canvas/PostcardBoard';
import { SocialBoard } from '../../components/garvis/canvas/SocialBoard';
import { EmailBoard } from '../../components/garvis/canvas/EmailBoard';
import { BrandBoard } from '../../components/garvis/canvas/BrandBoard';
import { IdeaBoard } from '../../components/garvis/canvas/IdeaBoard';
import type { PostcardMaterials } from '../../lib/garvis/postcardBoard';
import type { SocialMaterials } from '../../lib/garvis/socialBoard';
import type { EmailMaterials } from '../../lib/garvis/emailBoard';
import type { BrandMaterials } from '../../lib/garvis/brandBoard';
import type { IdeaMaterials } from '../../lib/garvis/ideaBoard';

const PC: PostcardMaterials = {
  ctx: { business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null, offerings: ['lakefront listings'], audience: 'lakefront sellers', locale: 'Lake Geneva', links: { site: 'https://lakeside.example' }, tone: null },
  brand: { palette: ['#2e6f95', '#0f3d5c'], fonts: [], compliance_line: 'Lakeside Realty · Equal Housing Opportunity' },
  images: [],
};
const SC: SocialMaterials = { businessName: 'Lakeside Realty', area: 'Lake Geneva', realEstate: true, accent: '#2e6f95', avatarUrl: null, images: [] };
const EM: EmailMaterials = { businessName: 'Lakeside Realty', agentName: 'Jane Doe', phone: '(262) 555-0148', area: 'Lake Geneva', realEstate: true };
const BR: BrandMaterials = { businessName: 'Lakeside Realty', palette: ['#2e6f95', '#0f3d5c'], logoUrl: null, realEstate: true };
const ID: IdeaMaterials = { projectName: 'WealthCharts', mission: 'help traders see the market clearly' };
const noop = (_k: 'success' | 'error' | 'info', _m: string) => {};

type Tab = 'postcard' | 'social' | 'email' | 'branding' | 'ideas';

export default function BoardPreview() {
  const [tab, setTab] = useState<Tab>('postcard');
  return (
    <div style={{ height: '100vh', background: 'var(--forge-bg, #14100c)' }}>
      <div style={{ height: '100vh', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 6 }}>
          <span style={{ color: '#A99BB0', font: '12px system-ui' }}>dev · creative boards ·</span>
          {(['postcard', 'social', 'email', 'branding', 'ideas'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ font: '12px system-ui', padding: '3px 10px', borderRadius: 8, border: '1px solid #3a2f25', background: tab === t ? '#ff8a3d' : 'transparent', color: tab === t ? '#1a0e04' : '#A99BB0' }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === 'postcard' && <PostcardBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={PC} />}
          {tab === 'social' && <SocialBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={SC} />}
          {tab === 'email' && <EmailBoard worldId="dev" clusterId={null} realEstate onToast={noop} materialsOverride={EM} />}
          {tab === 'branding' && <BrandBoard worldId="dev" clusterId={null} onToast={noop} materialsOverride={BR} />}
          {tab === 'ideas' && <IdeaBoard worldId="dev" clusterId={null} onToast={noop} materialsOverride={ID} />}
        </div>
      </div>
    </div>
  );
}
