// src/components/garvis/canvas/ProspectCanvas.tsx
// A "web" for ONE rated website — the same center-and-orbiting-nodes canvas as the marketing flow,
// but the subject in the middle is the prospect, and the nodes are the things about them: their
// current site, the new site you build, the pitch, their contact. Tap a node → a focused sheet.
// It reuses CanvasScene directly — proving that canvas IS the reusable "web" for any entity.

import { useState } from 'react';
import { X, ExternalLink, Sparkles, Loader2, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { CanvasScene, type CanvasNode } from './CanvasScene';
import { Overlay } from '../../ui/Overlay';
import type { SiteAudit, Verdict } from '../../../lib/garvis/siteAudit';

const VERDICT_LABEL: Record<Verdict, string> = { weak: 'Weak site', dated: 'Dated site', solid: 'Solid site', unknown: 'Site unknown' };

export interface ProspectCanvasData {
  name: string;
  url: string | null;
  audit: SiteAudit | null;
  built?: { previewUrl: string; queued: boolean; email: string | null } | null;
}

export function ProspectCanvas({ data, building, onBuild, onClose }: {
  data: ProspectCanvasData; building: boolean; onBuild: () => void; onClose: () => void;
}) {
  const { name, url, audit, built } = data;
  const [open, setOpen] = useState<string | null>(null);

  const center = {
    kicker: audit ? VERDICT_LABEL[audit.verdict] : 'Prospect',
    title: name,
    sub: url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : undefined,
  };
  const nodes: CanvasNode[] = [
    { key: 'site', emoji: '🔎', label: 'Their site', sub: audit?.score != null ? `scores ${audit.score}` : 'not checked' },
    { key: 'new', emoji: '✨', label: 'New site', sub: built ? 'built ✓' : 'build it', accent: 'ember' },
    { key: 'pitch', emoji: '✉️', label: 'The pitch', sub: built?.queued ? 'in your Queue' : built ? 'no email' : 'build first', dim: !built },
    { key: 'contact', emoji: '📇', label: 'Contact', sub: built?.email ? '1 email' : url ? 'none public' : 'no site', accent: 'violet' },
  ];

  return (
    <Overlay onClose={onClose} z={70}>
      <style>{PCW_CSS}</style>
      <div className="pcw-shell">
        <button className="pcw-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <CanvasScene center={center} nodes={nodes} onOpen={setOpen} height="min(68vh,520px)" />
      </div>

      {open && (
        <Overlay onClose={() => setOpen(null)} z={78} bare>
            <div className="pcw-sheet" role="dialog" aria-modal="true">
              <button className="pcw-x" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>

              {open === 'site' && (
                <Facet emoji="🔎" title="Their current site" lead={url ? url.replace(/^https?:\/\//, '') : 'No website found.'}>
                  {!audit ? <p className="pcw-note">We haven’t looked at their site yet.</p> : audit.verdict === 'unknown' ? (
                    <p className="pcw-note">Their site wouldn’t load — worth a manual look before pitching.</p>
                  ) : (
                    <>
                      <p className="pcw-head">{audit.headline}</p>
                      {audit.signals.length > 0 && <div className="pcw-tags">{audit.signals.map((s) => (
                        <span key={s.id} className="pcw-tag" title={s.detail}><AlertTriangle size={10} className={s.severity === 'high' ? 'hi' : 'md'} /> {s.label}</span>
                      ))}</div>}
                      {audit.strengths.length > 0 && <p className="pcw-sub">Already good: {audit.strengths.join(' · ')}</p>}
                    </>
                  )}
                </Facet>
              )}

              {open === 'new' && (
                <Facet emoji="✨" title="The new site" lead="A fresh site built from their own info — real, and honest about what it fixes.">
                  {built ? (
                    <div className="pcw-acts">
                      <a className="pcw-btn pri" href={built.previewUrl} target="_blank" rel="noreferrer">Open the site <ExternalLink size={14} /></a>
                      <a className="pcw-btn" href={`${built.previewUrl}/report`} target="_blank" rel="noreferrer">See the report</a>
                    </div>
                  ) : (
                    <div className="pcw-acts">
                      <button className="pcw-btn pri" onClick={onBuild} disabled={building || !url}>
                        {building ? <Loader2 size={14} className="pcw-spin" /> : <Sparkles size={14} />} Build their site
                      </button>
                      {!url && <span className="pcw-note">No website to base it on — skip this one.</span>}
                    </div>
                  )}
                </Facet>
              )}

              {open === 'pitch' && (
                <Facet emoji="✉️" title="The pitch" lead="A short, honest email that names a real problem and links the new site.">
                  {built?.queued ? (
                    <>
                      <p className="pcw-ok"><CheckCircle2 size={14} /> Drafted and waiting in your Queue — approve it there and it sends.</p>
                      <NavLink to="/garvis/queue" className="pcw-btn">Open the Queue <ArrowRight size={14} /></NavLink>
                    </>
                  ) : built ? (
                    <p className="pcw-note">The site’s built, but no public email was found to pitch to — add one in the Queue to send.</p>
                  ) : (
                    <p className="pcw-note">Build the site first — the pitch drafts itself and lands in your Queue.</p>
                  )}
                </Facet>
              )}

              {open === 'contact' && (
                <Facet emoji="📇" title="Contact" lead="Only what their site publicly lists — never guessed.">
                  {built?.email ? <p className="pcw-head">{built.email}</p>
                    : url ? <p className="pcw-note">No public email found on their site. (Building the site checks their contact page too.)</p>
                    : <p className="pcw-note">No website found for this business.</p>}
                </Facet>
              )}
            </div>
        </Overlay>
      )}
    </Overlay>
  );
}

function Facet({ emoji, title, lead, children }: { emoji: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="pcw-body">
      <div className="pcw-top"><span className="pcw-em">{emoji}</span><h3>{title}</h3></div>
      {lead && <p className="pcw-lead">{lead}</p>}
      {children}
    </div>
  );
}

const PCW_CSS = `
.pcw-shell{ position:relative; width:min(880px,100%); }
.pcw-close{ position:absolute; top:-2px; right:-2px; z-index:5; width:34px; height:34px; border-radius:10px; border:1px solid var(--gv-night-line); background:var(--gv-night-2); color:var(--gv-night-dim); cursor:pointer; display:grid; place-items:center; }
.pcw-close:hover{ color:var(--gv-night-ink); border-color:var(--gv-ember); }

.pcw-sheet{ position:relative; width:min(460px,100%); background:var(--gv-paper); color:var(--gv-paper-ink); border-radius:18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.7); animation:pcw-rise .2s cubic-bezier(.2,.7,.2,1); }
@keyframes pcw-rise{ from{ transform:translateY(12px) scale(.98); opacity:0 } to{ transform:none; opacity:1 } }
.pcw-x{ position:absolute; top:12px; right:12px; border:none; background:none; cursor:pointer; color:var(--gv-paper-dim); width:28px; height:28px; border-radius:8px; display:grid; place-items:center; }
.pcw-x:hover{ background:var(--gv-paper-line2); color:var(--gv-paper-ink); }
.pcw-body{ padding:20px; }
.pcw-top{ display:flex; align-items:center; gap:10px; }
.pcw-top .pcw-em{ font-size:20px; } .pcw-top h3{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:18px; margin:0; font-weight:600; }
.pcw-lead{ margin:8px 0 14px; color:var(--gv-paper-dim); font-size:13.5px; }
.pcw-head{ font-size:15px; font-weight:600; margin:0 0 10px; }
.pcw-sub{ font-size:12.5px; color:var(--gv-paper-dim); margin:10px 0 0; }
.pcw-note{ font-size:13.5px; color:var(--gv-paper-note); margin:0; }
.pcw-ok{ display:flex; align-items:center; gap:7px; font-size:13.5px; color:var(--gv-ok); margin:0 0 12px; }
.pcw-tags{ display:flex; flex-wrap:wrap; gap:7px; }
.pcw-tag{ display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--gv-paper-note); background:var(--gv-paper-line2); border:1px solid var(--gv-paper-line); border-radius:8px; padding:5px 9px; }
.pcw-tag svg.hi{ color:var(--gv-ember-deep); } .pcw-tag svg.md{ color:var(--gv-warn); }
.pcw-acts{ display:flex; flex-wrap:wrap; gap:9px; align-items:center; }
.pcw-btn{ font:inherit; font-size:14px; font-weight:600; cursor:pointer; border-radius:11px; padding:10px 15px; border:1px solid var(--gv-paper-line); background:var(--gv-paper-raised); color:var(--gv-paper-ink); display:inline-flex; align-items:center; gap:8px; text-decoration:none; }
.pcw-btn:hover{ border-color:var(--gv-ember-deep); color:var(--gv-ember-ink); }
.pcw-btn.pri{ background:var(--gv-ember-grad); color:#fff; border-color:transparent; }
.pcw-btn.pri:hover{ color:#fff; filter:brightness(1.04); } .pcw-btn:disabled{ opacity:.55; cursor:default; }
.pcw-spin{ animation:pcw-rot 1s linear infinite; } @keyframes pcw-rot{ to{ transform:rotate(360deg) } }
`;
