// src/components/garvis/canvas/ArtifactSheet.tsx
// The leaf of the spine, now a WORKBENCH — not a tombstone. A single made thing opens as a cream
// paper sheet showing only its real fields (title, kind, revision, when it was made, stored detail).
// And you can tell Garvis to change it: a quick chip or a line of instruction runs a real studio turn
// that branches a fresh take onto your canvas (or revises this one) — never fabricated, and anything
// outward-facing is only proposed into the approval queue.

import { useState } from 'react';
import { X, Sparkles, Loader2, ArrowUp } from 'lucide-react';
import { Overlay } from '../../ui/Overlay';
import type { StudioArtifact } from '../../../lib/garvis/artifacts';

const KIND_LABEL: Record<string, string> = {
  image: 'Image', video: 'Video', diagram: 'Diagram', research: 'Research',
  doc: 'Document', link: 'Link', post: 'Post', data: 'Data', simulation: 'Simulation',
};

// A couple of one-tap "change it" instructions, plus free-form. Kept generic so they read well for
// any kind of made thing (a postcard, a proposal, a report…).
const CHIPS = ['Do it differently', 'Make it punchier', 'Try a different angle'];

function whenMade(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ArtifactSheet({ artifact, onClose, onAsk }: {
  artifact: StudioArtifact;
  onClose: () => void;
  onAsk?: (text: string) => Promise<{ reply: string; note?: string }>;
}) {
  const kind = KIND_LABEL[artifact.kind] ?? artifact.kind;
  const made = whenMade(artifact.created_at);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; note?: string } | null>(null);

  const ask = async (text: string) => {
    if (!onAsk || busy || !text.trim()) return;
    setInput('');
    setBusy(true);
    setReply(null);
    try {
      const res = await onAsk(text.trim());
      setReply({ text: res.reply, note: res.note });
    } catch (e) {
      setReply({ text: e instanceof Error ? e.message : 'Something went wrong — try again.' });
    } finally {
      setBusy(false);
    }
  };

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

          {onAsk && (
            <div className="as-work">
              <div className="as-worklabel"><Sparkles size={12} /> Change it with Garvis</div>
              <div className="as-chips">
                {CHIPS.map((c) => (
                  <button key={c} className="as-chip" onClick={() => void ask(c)} disabled={busy}>{c}</button>
                ))}
              </div>
              <div className="as-askbar">
                <input
                  className="as-in"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ask(input); } }}
                  placeholder="Tell Garvis how to change it…"
                  disabled={busy}
                  aria-label="Tell Garvis how to change it"
                />
                <button className="as-send" onClick={() => void ask(input)} disabled={busy || !input.trim()} aria-label="Send">
                  {busy ? <Loader2 size={15} className="as-spin" /> : <ArrowUp size={15} />}
                </button>
              </div>
              {reply && (
                <div className="as-reply">
                  <p>{reply.text}</p>
                  {reply.note && <p className="as-replynote">{reply.note}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

const AS_CSS = `
.as-sheet{ position:relative; width:min(460px,100%); max-height:90vh; overflow:auto; background:var(--gv-paper); color:var(--gv-paper-ink); border-radius:18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); animation:as-rise .2s cubic-bezier(.2,.7,.2,1); }
@keyframes as-rise{ from{ transform:translateY(12px) scale(.98); opacity:0 } to{ transform:none; opacity:1 } }
.as-x{ position:absolute; top:12px; right:12px; border:none; background:none; cursor:pointer; color:var(--gv-paper-dim); width:28px; height:28px; border-radius:8px; display:grid; place-items:center; }
.as-x:hover{ background:var(--gv-paper-line2); color:var(--gv-paper-ink); }
.as-body{ padding:22px; }
.as-kind{ font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--gv-ember-ink); }
.as-title{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:20px; font-weight:600; margin:6px 0 2px; }
.as-meta{ font-size:12.5px; color:var(--gv-paper-dim); margin:0 0 12px; font-variant-numeric:tabular-nums; }
.as-detail{ font-size:14px; line-height:1.6; color:var(--gv-paper-ink); margin:0; white-space:pre-line; }
.as-note{ font-size:13.5px; color:var(--gv-paper-note); margin:0; }

.as-work{ margin-top:18px; border-top:1px solid var(--gv-paper-line2); padding-top:15px; }
.as-worklabel{ display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--gv-paper-dim); margin-bottom:10px; }
.as-worklabel svg{ color:var(--gv-ember-ink); }
.as-chips{ display:flex; flex-wrap:wrap; gap:7px; margin-bottom:10px; }
.as-chip{ font:inherit; font-size:12.5px; cursor:pointer; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); color:var(--gv-paper-ink); border-radius:999px; padding:6px 12px; transition:.15s ease; }
.as-chip:hover{ border-color:var(--gv-ember-deep); color:var(--gv-ember-ink); }
.as-chip:disabled{ opacity:.5; cursor:default; }
.as-askbar{ display:flex; align-items:center; gap:8px; }
.as-in{ flex:1; font:inherit; font-size:14px; color:var(--gv-paper-ink); background:var(--gv-paper-raised); border:1px solid var(--gv-paper-line); border-radius:11px; padding:10px 12px; }
.as-in:focus-visible{ outline:2px solid var(--gv-ember-deep); outline-offset:1px; border-color:var(--gv-ember-deep); }
.as-send{ flex:0 0 auto; width:38px; height:38px; border-radius:11px; border:none; cursor:pointer; display:grid; place-items:center; background:var(--gv-ember-grad); color:#fff; }
.as-send:hover{ filter:brightness(1.04); } .as-send:disabled{ opacity:.45; cursor:default; filter:none; }
.as-reply{ margin-top:12px; background:var(--gv-paper-warm); border:1px solid var(--gv-paper-warmln); border-radius:12px; padding:11px 13px; }
.as-reply p{ margin:0; font-size:13.5px; line-height:1.5; color:var(--gv-paper-ink); }
.as-replynote{ margin-top:6px !important; font-size:12px !important; color:var(--gv-ember-ink) !important; font-weight:600; }
.as-spin{ animation:as-rot 1s linear infinite; } @keyframes as-rot{ to{ transform:rotate(360deg) } }
@media (prefers-reduced-motion:reduce){ .as-spin{ animation:none } }
`;
