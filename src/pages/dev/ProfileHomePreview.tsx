// src/pages/dev/ProfileHomePreview.tsx
// DEV-ONLY preview of the profile "You" home — the top of the canvas spine — at /dev/profile-home.
// Sample businesses (illustrative, not real data). Not linked anywhere in the app.

import { ProfileCanvas, type BusinessNode } from '../../components/garvis/canvas/ProfileCanvas';

const businesses: BusinessNode[] = [
  { id: 'w1', title: 'Mom’s Real Estate', sub: 'accelerating', count: 24 },
  { id: 'w2', title: 'Lakeside Roofing', sub: 'steady', count: 8 },
  { id: 'w3', title: 'Corner Bakery', sub: 'nothing made yet', dim: true },
];

export default function ProfileHomePreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center', marginBottom: 12 }}>dev preview · your command — tap a business to branch into it (sample data)</p>
        <ProfileCanvas
          operatorName="Riley"
          businesses={businesses}
          onOpenBusiness={(id) => console.log('[open business]', id)}
          onOpenAmbient={(k) => console.log('[ambient]', k)}
          onNewBusiness={() => console.log('[new business]')}
          onCinematic={() => console.log('[cinematic]')}
        />
      </div>
    </div>
  );
}
