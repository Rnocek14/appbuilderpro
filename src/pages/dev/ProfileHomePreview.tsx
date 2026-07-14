// src/pages/dev/ProfileHomePreview.tsx
// DEV-ONLY preview of the whole canvas spine at /dev/profile-home — drives BranchCanvas with a static
// three-level resolveLevel (sample data, no network) so the branch-in-place transition is drivable and
// screenshottable. Not linked anywhere in the app.

import { useState } from 'react';
import { Telescope } from 'lucide-react';
import { BranchCanvas, type LevelSpec } from '../../components/garvis/canvas/BranchCanvas';
import { CanvasChat } from '../../components/garvis/canvas/CanvasChat';
import { ArtifactSheet } from '../../components/garvis/canvas/ArtifactSheet';
import type { StudioArtifact } from '../../lib/garvis/artifacts';

// A canned Garvis reply so the docked chat + the workbench are drivable/screenshottable with no auth.
const stubSend = (text: string) => new Promise<{ reply: string; note?: string }>((res) =>
  setTimeout(() => res({ reply: `On it — I made a fresh take on that ("${text.slice(0, 40)}"). It's on your canvas as a new node.`, note: 'Made it — it’s on your canvas.' }), 500));

const SAMPLE_ARTIFACT: StudioArtifact = {
  id: 'a1', cluster_id: 'c1', slug: 'postcard-proof', kind: 'post',
  title: 'Just Listed — 48 Lakeshore Dr', detail: 'A proof-first postcard: the home’s best photo, the price, and one line on the lakefront lifestyle. Front headline: “Just Listed on Geneva Lake.”',
  source: 'garvis-chat', revision: 1, created_at: '2026-06-01T00:00:00Z',
};

// ── Sample tree (illustrative, not real data) ─────────────────────────────────
const BUSINESSES: Record<string, { title: string; momentum: string; areas: { slug: string; emoji: string; title: string; sub: string; count?: number; dim?: boolean }[] }> = {
  w1: {
    title: 'Mom’s Real Estate', momentum: 'accelerating',
    areas: [
      { slug: 'social', emoji: '🎨', title: 'Social', sub: '6 posts · 2 this week', count: 6 },
      { slug: 'website', emoji: '🚀', title: 'Website', sub: '1 site · live', count: 1 },
      { slug: 'mail', emoji: '📊', title: 'Direct mail', sub: '3 mailers', count: 3 },
      { slug: 'contacts', emoji: '👥', title: 'Contacts', sub: 'nothing yet', dim: true },
    ],
  },
  w2: { title: 'Lakeside Roofing', momentum: 'steady', areas: [{ slug: 'social', emoji: '🎨', title: 'Social', sub: '3 posts', count: 3 }] },
  w3: { title: 'Corner Bakery', momentum: 'quiet', areas: [] },
};
const WORK: Record<string, { id: string; emoji: string; title: string; sub: string }[]> = {
  'w1/social': [
    { id: 'a1', emoji: '📣', title: 'Just Listed — 48 Lakeshore Dr', sub: 'post' },
    { id: 'a2', emoji: '🎬', title: 'Walkthrough reel', sub: 'video' },
    { id: 'a3', emoji: '🖼️', title: 'Open house graphic', sub: 'image' },
  ],
};

export default function ProfileHomePreview() {
  const [path, setPath] = useState<string[]>([]);
  const [sheet, setSheet] = useState<StudioArtifact | null>(null);

  const resolveLevel = (p: string[]): LevelSpec => {
    if (p.length === 0) {
      return {
        key: '', crumb: 'You',
        center: { kicker: 'Your command', title: 'Riley', sub: '3 businesses' },
        nodes: [
          ...Object.entries(BUSINESSES).map(([id, b]) => ({ key: id, emoji: '🏢', label: b.title, sub: b.momentum, count: b.areas.length || undefined, dim: b.areas.length === 0, accent: 'ember' as const })),
          { key: 'today', emoji: '🌅', label: 'Today', sub: 'what needs you', accent: 'violet' as const, leaf: true },
          { key: 'queue', emoji: '✅', label: 'Queue', sub: 'approve & reply', accent: 'violet' as const, leaf: true },
          { key: 'money', emoji: '💵', label: 'Money', sub: 'invoices', accent: 'violet' as const, leaf: true },
          { key: 'new', emoji: '＋', label: 'New business', sub: 'start one', dim: true, leaf: true },
        ],
      };
    }
    if (p.length === 1) {
      const b = BUSINESSES[p[0]];
      return {
        key: p[0], crumb: b.title,
        center: { kicker: b.momentum, title: b.title, sub: `${b.areas.length} area${b.areas.length === 1 ? '' : 's'}` },
        nodes: b.areas.map((a) => ({ key: a.slug, emoji: a.emoji, label: a.title, sub: a.sub, count: a.count, dim: a.dim, accent: 'ember' as const })),
        empty: b.areas.length ? undefined : { emoji: '🗂', title: 'No areas yet', body: 'Nothing set up in this business yet.' },
      };
    }
    const key = `${p[0]}/${p[1]}`;
    const work = WORK[key] ?? [];
    const area = BUSINESSES[p[0]].areas.find((a) => a.slug === p[1]);
    return {
      key, crumb: area?.title ?? p[1],
      center: { kicker: 'active', title: area?.title ?? p[1], sub: area?.sub ?? '' },
      nodes: work.map((w) => ({ key: w.id, emoji: w.emoji, label: w.title, sub: w.sub, accent: 'ember' as const, leaf: true })),
      empty: work.length ? undefined : { emoji: '🎨', title: 'Nothing made here yet', body: 'Open the studio to make the first piece.' },
    };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f0b14', padding: 20 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ color: '#A99BB0', font: '13px system-ui', textAlign: 'center', marginBottom: 12 }}>dev preview · branch the spine — tap a business, then an area (sample data)</p>
        <BranchCanvas
          path={path}
          resolveLevel={resolveLevel}
          onPathChange={setPath}
          onLeaf={(p, k) => { if (p.length === 2) setSheet({ ...SAMPLE_ARTIFACT, id: k }); }}
          trailing={<button className="bc-cine"><Telescope size={14} /> Cinematic view</button>}
        />
        <CanvasChat onSend={stubSend} hint={path.length === 2 ? 'Ask about this area, or tell Garvis to make something…' : 'Ask Garvis…'} />
      </div>
      {sheet && <ArtifactSheet artifact={sheet} onClose={() => setSheet(null)} onAsk={stubSend} />}
    </div>
  );
}
