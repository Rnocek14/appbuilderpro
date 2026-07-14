// src/components/garvis/canvas/ProfileCanvas.tsx
// THE TOP OF THE SPINE — your profile as a canvas. You sit in the center; your businesses orbit you,
// each showing its real momentum; a few ambient nodes (Today, Money, Queue) hang off the ring for the
// cross-business things. Tap a business and you branch down into that business's canvas — same gesture,
// all the way down. Presentational only (data + handlers come in as props) so it renders in a dev
// preview for screenshotting; the real page (ProfileHome) loads the same scene the 3D "cinematic" view
// uses, so the two are one truth drawn two ways.

import { Telescope, Plus } from 'lucide-react';
import { CanvasScene, type CanvasNode } from './CanvasScene';

export interface BusinessNode {
  id: string;
  title: string;
  sub: string;        // real momentum / mass line — never invented
  count?: number;     // made-things count (badge), when known
  dim?: boolean;      // nothing made yet
}

export function ProfileCanvas({
  operatorName, businesses, onOpenBusiness, onOpenAmbient, onNewBusiness, onCinematic,
}: {
  operatorName: string;
  businesses: BusinessNode[];
  onOpenBusiness: (id: string) => void;
  onOpenAmbient: (key: 'today' | 'money' | 'queue') => void;
  onNewBusiness: () => void;
  onCinematic: () => void;
}) {
  // The ring: your businesses (ember) + the cross-business ambient nodes (violet) + a "new" node.
  const bizKeys = new Set(businesses.map((b) => b.id));
  const nodes: CanvasNode[] = [
    ...businesses.map((b): CanvasNode => ({
      key: b.id, emoji: '🏢', label: b.title, sub: b.sub, count: b.count, accent: 'ember', dim: b.dim,
    })),
    { key: 'today', emoji: '🌅', label: 'Today', sub: 'what needs you', accent: 'violet' },
    { key: 'queue', emoji: '✅', label: 'Queue', sub: 'approve & reply', accent: 'violet' },
    { key: 'money', emoji: '💵', label: 'Money', sub: 'invoices', accent: 'violet' },
    { key: 'new', emoji: '＋', label: 'New business', sub: 'start one', dim: true },
  ];

  const onOpen = (key: string) => {
    if (key === 'center') return;
    if (bizKeys.has(key)) return onOpenBusiness(key);
    if (key === 'new') return onNewBusiness();
    if (key === 'today' || key === 'queue' || key === 'money') return onOpenAmbient(key);
  };

  const first = (operatorName || 'You').split(/\s+/)[0];
  const center = {
    kicker: 'Your command',
    title: first,
    sub: businesses.length === 1 ? '1 business' : `${businesses.length} businesses`,
  };

  return (
    <div className="pfc-wrap">
      <style>{PFC_CSS}</style>

      {/* breadcrumb spine — at the top level it's just "You"; deeper levels thread onto it */}
      <div className="pfc-bar">
        <nav className="pfc-crumbs" aria-label="Breadcrumb"><span className="pfc-here">You</span></nav>
        <button className="pfc-cine" onClick={onCinematic}>
          <Telescope size={14} /> Cinematic view
        </button>
      </div>

      {businesses.length === 0 ? (
        <div className="pfc-empty">
          <div className="pfc-empty-orb">🏢</div>
          <h2>No businesses yet</h2>
          <p>This is your command center. Start your first business and it’ll appear here, orbiting you — tap in to run its marketing, website, and outreach.</p>
          <button className="pfc-empty-cta" onClick={onNewBusiness}><Plus size={16} /> Start your first business</button>
        </div>
      ) : (
        <CanvasScene center={center} nodes={nodes} onOpen={onOpen} />
      )}
    </div>
  );
}

const PFC_CSS = `
.pfc-wrap{ position:relative; }
.pfc-bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; padding:0 2px; }
.pfc-crumbs{ font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--gv-night-dim); display:flex; align-items:center; gap:7px; }
.pfc-here{ color:var(--gv-night-ink); }
.pfc-cine{ display:inline-flex; align-items:center; gap:6px; font:600 12px/1 -apple-system,sans-serif; cursor:pointer;
  color:var(--gv-night-dim); background:none; border:1px solid var(--gv-night-line); border-radius:999px; padding:7px 12px; transition:.18s ease; }
.pfc-cine:hover{ color:var(--gv-night-ink); border-color:var(--gv-violet); }

.pfc-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:10px; padding:64px 24px;
  border:1px solid var(--gv-night-line); border-radius:22px;
  background:radial-gradient(700px 380px at 50% 30%, rgba(var(--gv-ember-rgb),.08), transparent 60%), linear-gradient(160deg,var(--gv-night-1),var(--gv-night-2)); }
.pfc-empty-orb{ width:76px; height:76px; border-radius:24px; display:grid; place-items:center; font-size:34px;
  background:var(--gv-night-orb); border:1px solid var(--gv-night-warm); box-shadow:0 0 40px -8px rgba(var(--gv-ember-rgb),.4); margin-bottom:6px; }
.pfc-empty h2{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:22px; color:var(--gv-night-ink); margin:0; }
.pfc-empty p{ max-width:440px; color:var(--gv-night-dim); font-size:14px; line-height:1.6; margin:0; }
.pfc-empty-cta{ margin-top:10px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;
  font:600 14px/1 -apple-system,sans-serif; color:#fff; border:none; border-radius:12px; padding:12px 18px; background:var(--gv-ember-grad);
  box-shadow:0 10px 30px -10px rgba(var(--gv-ember-rgb),.5); transition:.18s ease; }
.pfc-empty-cta:hover{ filter:brightness(1.05); transform:translateY(-1px); }
`;
