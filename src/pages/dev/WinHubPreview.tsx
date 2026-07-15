// src/pages/dev/WinHubPreview.tsx
// DEV-ONLY preview of the Win-clients pipeline canvas (the top of the nesting) at /dev/win-hub.
// Sample counts — illustrative, not real data. Not linked anywhere.

import { CanvasScene, type CanvasNode } from '../../components/garvis/canvas/CanvasScene';

const center = { kicker: 'Win clients', title: 'roofers · Lake Geneva', sub: '8 found' };
const nodes: CanvasNode[] = [
  { key: 'find', emoji: '🔎', label: 'Find', sub: '8 found' },
  { key: 'built', emoji: '✨', label: 'Sites built', sub: '3 ready', count: 3 },
  { key: 'pitch', emoji: '✉️', label: 'Pitches', sub: '2 in Queue', count: 2, accent: 'violet' },
  { key: 'clients', emoji: '🤝', label: 'Clients', sub: 'deploy · soon', dim: true },
];

export default function WinHubPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center', marginBottom: 12 }}>dev preview · Win clients pipeline — tap a stage to work it (sample data)</p>
        <CanvasScene center={center} nodes={nodes} onOpen={(k) => console.log('[hub]', k)} />
      </div>
    </div>
  );
}
