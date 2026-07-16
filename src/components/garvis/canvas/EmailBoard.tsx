// src/components/garvis/canvas/EmailBoard.tsx
// The EMAIL adapter for the creative board. Make email drafts from a kind (Just listed, Free valuation,
// Referral ask, …), spread them out to compare subject-line angles, spin renditions, edit, then Send to
// a contact SEGMENT — which enqueues ONE approval the clock drains under your daily cap (loop closes).
// Plugs the email pipeline (emailBoard + createBatch) into the generic CreativeBoard shell.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Copy, Save, Users } from 'lucide-react';
import {
  emailKindsFor, emailKindById, defaultEmailKind, buildEmailContent, applyEmailRendition, composeEmailText,
  applyEmailCopy,
  type EmailContent, type EmailMaterials, type EmailCopyFields,
} from '../../../lib/garvis/emailBoard';
import { loadEmailMaterials, queueEmailToSegment, emailSegmentCounts, saveEmailTemplate, type BatchSegment } from '../../../lib/garvis/emailBoardRun';
import { generateBoardCopy, explainCopyMiss } from '../../../lib/garvis/boardCopyRun';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;
const SEGMENTS: { id: BatchSegment; label: string }[] = [
  { id: 'all', label: 'Everyone' }, { id: 'new', label: 'New' }, { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' }, { id: 'customer', label: 'Customers' },
];

export function EmailBoard({ worldId, clusterId, onToast, realEstate: reProp, materialsOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast;
  realEstate?: boolean; materialsOverride?: EmailMaterials;
}) {
  const [materials, setMaterials] = useState<EmailMaterials | null>(materialsOverride ?? null);

  useEffect(() => {
    if (materialsOverride) { setMaterials(materialsOverride); return; }
    let live = true;
    void (async () => {
      try { const m = await loadEmailMaterials(worldId, clusterId); if (live) setMaterials(m); }
      catch { if (live) setMaterials({ businessName: '', agentName: '', phone: null, area: null, realEstate: !!reProp }); }
    })();
    return () => { live = false; };
  }, [worldId, clusterId, materialsOverride, reProp]);

  const realEstate = reProp ?? materials?.realEstate ?? false;
  // Repeated Makes cycle subject angles so two presses never produce identical twins (pure fallback path).
  const makeSeq = useRef<Record<string, number>>({});

  const adapter = useMemo<CreativeBoardAdapter<EmailContent> | null>(() => {
    if (!materials) return null;
    const facts = (): Record<string, unknown> => ({
      business: materials.businessName || null, agent: materials.agentName || null,
      phone: materials.phone, area: materials.area, tone: materials.tone ?? null,
    });
    return {
      storageKey: 'email',
      title: 'Email board',
      subtitle: 'Make drafts, compare subject-line angles, spin renditions, then send to a segment.',
      metrics: { w: 270, h: 300, gap: 26, cols: 3, pad: 40 },
      designWidth: 300,
      promptPlaceholder: 'an idea… e.g. “open house with free kayak rides, casual and fun”',
      emptyHint: 'Pick a kind (or type an idea) and hit Make. Drafts appear here — spin subject angles, compare, then send the best to a segment.',
      kinds: emailKindsFor(realEstate).map((k) => ({ id: k.id, label: k.label, emoji: k.emoji, hint: k.hint })),
      banner: 'Real facts fill in; unknowns are [EDIT] holes; {{first_name}} fills per recipient. Nothing sends — a segment send goes through Approvals and drains under your daily cap.',
      captionOf: (c) => emailKindById(c.kindId)?.label ?? 'Email',
      searchText: (c) => `${c.subject} ${c.body}`,
      generate: async ({ prompt, kindId }) => {
        const kind = (kindId && emailKindById(kindId)) || defaultEmailKind(realEstate);
        const seq = makeSeq.current[kind.id] ?? 0;
        makeSeq.current[kind.id] = seq + 1;
        let content = buildEmailContent({ materials, kind, variant: seq });
        // The idea box is REAL now: a typed idea becomes the draft via the board-copy seam (facts from
        // materials only, {{first_name}} + [EDIT] holes preserved). Honest fallback to the template.
        if (prompt.trim()) {
          const ai = await generateBoardCopy({ channel: 'email', mode: 'make', instruction: prompt, kindLabel: kind.label, materials: facts() });
          if (!ai.ok) explainCopyMiss(ai, onToast);
          if (ai.ok) content = applyEmailCopy(content, ai.fields as EmailCopyFields);
        }
        return content;
      },
      rendition: async ({ parent, instruction }) => {
        // The instruction reaches the words: "make it funnier and mention the kayaks" actually does.
        if (instruction.trim()) {
          const ai = await generateBoardCopy({
            channel: 'email', mode: 'rendition', instruction, kindLabel: emailKindById(parent.kindId)?.label ?? null,
            materials: facts(), current: { subject: parent.subject, body: parent.body },
          });
          if (!ai.ok) explainCopyMiss(ai, onToast);
          if (ai.ok) return applyEmailCopy({ ...parent }, ai.fields as EmailCopyFields);
        }
        return applyEmailRendition(parent, instruction);
      },
      renderThumb: (c) => <EmailCard content={c} materials={materials} />,
      renderFocus: (c, api) => <EmailFocus content={c} api={api} clusterId={clusterId} worldId={worldId} onToast={onToast} />,
    };
  }, [materials, realEstate, clusterId, worldId, onToast]);

  if (!materials || !adapter) {
    return <div className="grid h-full min-h-[400px] place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>;
  }
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

function EmailCard({ content, materials }: { content: EmailContent; materials: EmailMaterials }) {
  const from = (materials.agentName || materials.businessName || 'You').trim();
  const initial = (from[0] || 'Y').toUpperCase();
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E7E0D6', color: '#0F1419', overflow: 'hidden', boxShadow: '0 6px 20px -12px rgba(0,0,0,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderBottom: '1px solid #EFEAE2' }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, background: 'linear-gradient(140deg,#ff8a3d,#c85a12)', flex: '0 0 auto' }}>{initial}</span>
        <div style={{ lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{from}</div>
          <div style={{ color: '#65676B', fontSize: 11 }}>to your list</div>
        </div>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{content.subject}</div>
        <div style={{ marginTop: 7, fontSize: 12, color: '#3a3a3a', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{content.body}</div>
      </div>
    </div>
  );
}

function EmailFocus({ content, api, clusterId, worldId, onToast }: {
  content: EmailContent; api: FocusApi<EmailContent>; clusterId: string | null; worldId: string; onToast: Toast;
}) {
  const [seg, setSeg] = useState<BatchSegment>('all');
  const [counts, setCounts] = useState<Record<BatchSegment, number> | null>(null);
  const [sending, setSending] = useState(false);
  const kind = emailKindById(content.kindId);

  useEffect(() => { let live = true; void emailSegmentCounts().then((c) => { if (live) setCounts(c); }).catch(() => {}); return () => { live = false; }; }, []);

  const send = async () => {
    setSending(true);
    try {
      const r = await queueEmailToSegment({ content, segment: seg, worldId });
      const ex = r.excluded.length ? ` (${r.excluded.length} skipped)` : '';
      onToast('success', `Queued to ${r.queued} contact${r.queued === 1 ? '' : 's'}${ex} — approve it in your Queue. The clock drains it under your daily cap.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the send.'); }
    finally { setSending(false); }
  };
  const saveTemplate = async () => {
    if (!clusterId) { onToast('info', 'Copy it for now — saving needs this studio’s area set up.'); return; }
    try { await saveEmailTemplate(clusterId, content, `Email — ${kind?.label ?? 'Draft'}`); onToast('success', 'Saved to your shelf as a template.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(composeEmailText(content)); onToast('success', 'Copied.'); }
    catch { onToast('info', 'Select the text and copy it.'); }
  };

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{kind?.emoji} {kind?.label ?? 'Email'}</div>

      <label className="block">
        <span className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">Subject</span>
        <input value={content.subject} onChange={(e) => api.update({ ...content, subject: e.target.value })}
          className="w-full rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[13.5px] font-medium text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
      </label>
      <label className="mt-2 block">
        <span className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">Body</span>
        <textarea value={content.body} onChange={(e) => api.update({ ...content, body: e.target.value })} rows={Math.min(14, Math.max(6, content.body.split('\n').length + 1))}
          className="w-full resize-y rounded-md border border-forge-border bg-forge-bg px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
      </label>
      <p className="mt-1 text-[10px] text-forge-dim/80"><span className="text-forge-ember">[EDIT: …]</span> marks are yours; <code className="text-forge-dim">{'{{first_name}}'}</code> fills per recipient.</p>

      {/* segment send — the loop-closer */}
      <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel/40 p-2.5">
        <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-forge-dim"><Users size={12} /> Send to a segment</p>
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => (
            <button key={s.id} onClick={() => setSeg(s.id)} className={cn('cb-chip', seg === s.id && 'cb-chip-on')}>
              {s.label}{counts ? ` · ${counts[s.id]}` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || (counts ? counts[seg] === 0 : false)}>
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send to {SEGMENTS.find((s) => s.id === seg)?.label}{counts ? ` (${counts[seg]})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void saveTemplate()}><Save size={13} /> Save template</Button>
        <Button variant="outline" size="sm" onClick={() => void copy()}><Copy size={13} /> Copy</Button>
        <Button variant={api.isFavorite ? 'primary' : 'ghost'} size="sm" onClick={api.favorite}>{api.isFavorite ? '★' : '☆'}</Button>
      </div>
    </div>
  );
}
