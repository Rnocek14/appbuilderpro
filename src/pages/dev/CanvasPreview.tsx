// src/pages/dev/CanvasPreview.tsx
// DEV-ONLY preview of the real marketing canvas at /dev/marketing-canvas (no auth), for screenshot-
// driven building. Data calls (loadWeb/brand/save/post) fail gracefully unauthed; the making of
// pieces is pure client-side, so the whole flow is drivable here. Not linked anywhere in the app.

import { MarketingCanvas } from '../../components/garvis/canvas/MarketingCanvas';

export default function CanvasPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center', marginBottom: 12 }}>dev preview · tap the center to set details, then open a node</p>
        <MarketingCanvas worldId="dev-preview" realEstate onToast={(_k, m) => console.log('[toast]', m)} />
      </div>
    </div>
  );
}
