// src/components/garvis/canvas/StudioDock.tsx
// CALL A STUDIO FROM THE CANVAS. When you're standing in an area, this is the row of tools you can
// open without leaving the canvas — working on a postcard and want a photo? open the postcard studio.
// Want a reel from it? open the video studio. Each opens the REAL studio panel (the same one the
// workshop uses) in an overlay, seeded with this area's cluster; closing it reloads the canvas so
// anything you made shows up as a node. No new capability — the canvas just reaches the existing hands.

import { lazy, Suspense, useState, type ComponentType } from 'react';
import { X, Wrench } from 'lucide-react';
import { Overlay } from '../../ui/Overlay';
import { Spinner } from '../../ui';
import { ErrorBoundary } from '../../ErrorBoundary';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

// The summonable studios, lazy so the canvas stays light until a tool is actually opened.
const PostcardBoard = lazy(() => import('./PostcardBoard').then((m) => ({ default: m.PostcardBoard })));
const SocialBoard = lazy(() => import('./SocialBoard').then((m) => ({ default: m.SocialBoard })));
const EmailBoard = lazy(() => import('./EmailBoard').then((m) => ({ default: m.EmailBoard })));
const VideoStudio = lazy(() => import('../VideoStudio').then((m) => ({ default: m.VideoStudio })));
const DeliverableStudio = lazy(() => import('../DeliverableStudio').then((m) => ({ default: m.DeliverableStudio })));
const DataWorkspace = lazy(() => import('../DataWorkspace').then((m) => ({ default: m.DataWorkspace })));
const MarketDataPanel = lazy(() => import('../MarketDataPanel').then((m) => ({ default: m.MarketDataPanel })));

interface ToolDef { key: string; emoji: string; label: string }
const TOOLS: ToolDef[] = [
  { key: 'mailer', emoji: '✉️', label: 'Postcards' },
  { key: 'video', emoji: '🎬', label: 'Video' },
  { key: 'social', emoji: '📣', label: 'Social' },
  { key: 'email', emoji: '📧', label: 'Email' },
  { key: 'document', emoji: '📄', label: 'Document' },
  { key: 'data', emoji: '📊', label: 'Data' },
  { key: 'market', emoji: '🏷️', label: 'Market data' },
];

export function StudioDock({ worldId, clusterId, title, onToast, onClosed }: {
  worldId: string;
  clusterId: string;
  title: string;
  onToast: Toast;
  onClosed: () => void;   // a studio closed → parent reloads the canvas so new work shows as nodes
}) {
  const [open, setOpen] = useState<string | null>(null);

  const close = () => { setOpen(null); onClosed(); };

  const studio = () => {
    switch (open) {
      // The spine summons the SAME creative boards the marketing canvas opens — one system everywhere.
      case 'mailer': return <div style={{ height: '72vh', width: 'min(94vw, 1100px)' }}><PostcardBoard worldId={worldId} clusterId={clusterId} onToast={onToast} /></div>;
      case 'video': return <VideoStudio worldId={worldId} clusterId={clusterId} title={title} onToast={onToast} />;
      case 'social': return <div style={{ height: '72vh', width: 'min(94vw, 1100px)' }}><SocialBoard worldId={worldId} clusterId={clusterId} onToast={onToast} /></div>;
      case 'email': return <div style={{ height: '72vh', width: 'min(94vw, 1100px)' }}><EmailBoard worldId={worldId} clusterId={clusterId} onToast={onToast} /></div>;
      case 'document': return <DeliverableStudio worldId={worldId} clusterId={clusterId} onToast={onToast} />;
      case 'data': return <DataWorkspace worldId={worldId} clusterId={clusterId} onToast={onToast} />;
      case 'market': return <MarketDataPanel onToast={onToast} />;
      default: return null;
    }
  };
  const openLabel = TOOLS.find((t) => t.key === open)?.label ?? '';

  return (
    <div className="sd-wrap">
      <style>{SD_CSS}</style>
      <span className="sd-label"><Wrench size={12} /> Work in a studio</span>
      <div className="sd-chips">
        {TOOLS.map((t) => (
          <button key={t.key} className="sd-chip" onClick={() => setOpen(t.key)}>
            <span className="sd-em">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {open && (
        <Overlay onClose={close} z={72}>
          <div className="sd-panel" role="dialog" aria-modal="true" aria-label={openLabel}>
            <div className="sd-top">
              <span className="sd-toptitle">{openLabel} · {title}</span>
              <button className="sd-x" onClick={close} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="sd-body">
              <ErrorBoundary>
                <Suspense fallback={<div className="sd-loading"><Spinner label="Opening the studio…" /></div>}>
                  {studio()}
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

const SD_CSS = `
.sd-wrap{ margin-top:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:0 2px; }
.sd-label{ display:inline-flex; align-items:center; gap:6px; font:600 12px/1 -apple-system,sans-serif; color:var(--gv-night-dim); }
.sd-label svg{ color:var(--gv-ember); }
.sd-chips{ display:flex; flex-wrap:wrap; gap:7px; }
.sd-chip{ display:inline-flex; align-items:center; gap:6px; font:600 12.5px/1 -apple-system,sans-serif; cursor:pointer;
  color:var(--gv-night-ink); background:var(--gv-night-orb); border:1px solid var(--gv-night-line2); border-radius:999px; padding:8px 13px; transition:.15s ease; }
.sd-chip:hover{ border-color:var(--gv-ember); box-shadow:0 0 0 1px var(--gv-ember), 0 0 18px -6px rgba(var(--gv-ember-rgb),.5); }
.sd-em{ font-size:14px; line-height:1; }

.sd-panel{ width:min(920px,100%); max-height:90vh; display:flex; flex-direction:column; background:var(--forge-bg); color:var(--forge-ink);
  border:1px solid var(--forge-border); border-radius:18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); overflow:hidden;
  animation:sd-rise .2s cubic-bezier(.2,.7,.2,1); }
@keyframes sd-rise{ from{ transform:translateY(12px) scale(.98); opacity:0 } to{ transform:none; opacity:1 } }
.sd-top{ display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--forge-border); background:var(--forge-panel); }
.sd-toptitle{ font:600 15px/1 -apple-system,sans-serif; }
.sd-x{ margin-left:auto; border:none; background:none; cursor:pointer; color:var(--forge-dim); width:32px; height:32px; border-radius:9px; display:grid; place-items:center; }
.sd-x:hover{ background:var(--forge-raised); color:var(--forge-ink); }
.sd-body{ overflow-y:auto; padding:18px; }
.sd-loading{ display:grid; place-items:center; padding:60px; }
`;
