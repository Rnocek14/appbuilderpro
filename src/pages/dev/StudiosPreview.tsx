// src/pages/dev/StudiosPreview.tsx
// DEV-ONLY preview of the studio SYSTEM at /dev/studios (no auth) — renders Email, Ads, and Copy from
// the one IdeaStudio scaffold with a mock business context, so the gallery → worked-example flow is
// drivable + screenshottable and the three read as one cohesive system. Not linked anywhere.

import { IdeaStudio } from '../../components/garvis/IdeaStudio';
import { EMAIL_SPEC } from '../../lib/garvis/emailStudio';
import { ADS_SPEC } from '../../lib/garvis/adsStudio';
import { COPY_SPEC } from '../../lib/garvis/copyStudio';
import type { StudioCtx } from '../../lib/garvis/studioKit';

const CTX: StudioCtx = { businessName: 'Lakeside Realty', agentName: 'Jane Doe', phone: '(262) 555-0148', area: 'Lake Geneva', realEstate: true };
const noop = (_k: 'success' | 'error' | 'info', _m: string) => {};

export default function StudiosPreview() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--forge-bg, #14100c)', padding: 24 }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 28 }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center' }}>dev preview · studio system (Email · Ads · Copy) · mock context</p>
        <section data-studio="email"><IdeaStudio spec={EMAIL_SPEC} worldId="dev" clusterId={null} onToast={noop} ctxOverride={CTX} /></section>
        <section data-studio="ads"><IdeaStudio spec={ADS_SPEC} worldId="dev" clusterId={null} onToast={noop} ctxOverride={CTX} /></section>
        <section data-studio="copy"><IdeaStudio spec={COPY_SPEC} worldId="dev" clusterId={null} onToast={noop} ctxOverride={CTX} /></section>
      </div>
    </div>
  );
}
