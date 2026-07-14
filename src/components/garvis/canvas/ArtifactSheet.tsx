// src/components/garvis/canvas/ArtifactSheet.tsx
// The leaf of the spine: a single made thing, opened as a cream paper sheet over the night. Shows
// only its real fields (title, kind, revision, when it was made, and whatever detail was stored) —
// no invented preview, no fabricated stats. Uses the shared Overlay primitive + paper tokens.

import { X } from 'lucide-react';
import { Overlay } from '../../ui/Overlay';
import type { StudioArtifact } from '../../../lib/garvis/artifacts';

const KIND_LABEL: Record<string, string> = {
  image: 'Image', video: 'Video', diagram: 'Diagram', research: 'Research',
  doc: 'Document', link: 'Link', post: 'Post', data: 'Data', simulation: 'Simulation',
};

function whenMade(iso: string): string {
  // Static, honest: the stored timestamp as a plain date. No "x ago" (that needs a live clock here).
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ArtifactSheet({ artifact, onClose }: { artifact: StudioArtifact; onClose: () => void }) {
  const kind = KIND_LABEL[artifact.kind] ?? artifact.kind;
  const made = whenMade(artifact.created_at);
  return (
    <Overlay onClose={onClose} z={78}>
      <style>{AS_CSS}</style>
      <div className="as-sheet" role="dialog" aria-modal="true" aria-label={artifact.title}>
        <button className="as-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <div className="as-body">
          <div className="as-kind">{kind}{artifact.revision > 1 ? ` · v${artifact.revision}` : ''}</div>
          <h3 className="as-title">{artifact.title}</h3>
          {made && <p className="as-meta">Made {made}</p>}
          {artifact.detail
            ? <p className="as-detail">{artifact.detail}</p>
            : <p className="as-note">No extra detail was saved with this one.</p>}
        </div>
      </div>
    </Overlay>
  );
}

const AS_CSS = `
.as-sheet{ position:relative; width:min(440px,100%); background:var(--gv-paper); color:var(--gv-paper-ink); border-radius:18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); animation:as-rise .2s cubic-bezier(.2,.7,.2,1); }
@keyframes as-rise{ from{ transform:translateY(12px) scale(.98); opacity:0 } to{ transform:none; opacity:1 } }
.as-x{ position:absolute; top:12px; right:12px; border:none; background:none; cursor:pointer; color:var(--gv-paper-dim); width:28px; height:28px; border-radius:8px; display:grid; place-items:center; }
.as-x:hover{ background:var(--gv-paper-line2); color:var(--gv-paper-ink); }
.as-body{ padding:22px; }
.as-kind{ font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--gv-ember-ink); }
.as-title{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:20px; font-weight:600; margin:6px 0 2px; }
.as-meta{ font-size:12.5px; color:var(--gv-paper-dim); margin:0 0 12px; font-variant-numeric:tabular-nums; }
.as-detail{ font-size:14px; line-height:1.6; color:var(--gv-paper-ink); margin:0; white-space:pre-line; }
.as-note{ font-size:13.5px; color:var(--gv-paper-note); margin:0; }
`;
