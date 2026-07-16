// src/components/garvis/canvas/IdeaBoard.tsx
// The IDEA BOARD adapter — the universal canvas for any project (an app like WealthCharts, an
// automation concept, a content angle). Same spatial lab as every board; the loop-closers go
// somewhere REAL: "Send to app builder" seeds the builder's first generation with this idea
// (the existing ff:build-brief handoff), and "Copy brief" puts a working brief on the clipboard.
// Fresh ideas can also arrive on a clock via the idea_stream standing order (grouped by date).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Copy, Hammer, Star, Trash2, Zap } from 'lucide-react';
import {
  IDEA_KINDS, IDEA_TAGS, ideaKindById, defaultIdeaKind, buildIdeaContent, applyIdeaCopy,
  applyIdeaRendition, composeIdeaText,
  type IdeaContent, type IdeaMaterials, type IdeaCopyFields, type IdeaTag,
} from '../../../lib/garvis/ideaBoard';
import { generateBoardCopy, explainCopyMiss } from '../../../lib/garvis/boardCopyRun';
import { loadWeb } from '../../../lib/garvis/workwebRun';
import { supabase } from '../../../lib/supabase';
import { listOrders, createOrder, setOrderStatus } from '../../../lib/garvis/standingRun';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;
const TAG_COLOR: Record<IdeaTag, string> = {
  feature: '#7aa5ff', automation: '#b48aff', content: '#ffb066', growth: '#6fd6a8', revenue: '#f4b942', wild: '#ff7a9c',
};

export function IdeaBoard({ worldId, clusterId, onToast, materialsOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast; materialsOverride?: IdeaMaterials;
}) {
  const [materials, setMaterials] = useState<IdeaMaterials | null>(materialsOverride ?? null);

  useEffect(() => {
    if (materialsOverride) { setMaterials(materialsOverride); return; }
    let live = true;
    void Promise.all([
      loadWeb(worldId).catch(() => null),
      supabase.from('knowledge_worlds').select('business_context').eq('id', worldId).maybeSingle().then((r) => r.data, () => null),
    ]).then(([w, bc]) => {
      if (live) setMaterials({ projectName: w?.title ?? '', mission: null, context: (bc?.business_context as Record<string, unknown> | null) ?? null });
    });
    return () => { live = false; };
  }, [worldId, materialsOverride]);

  const adapter = useMemo<CreativeBoardAdapter<IdeaContent> | null>(() => {
    if (!materials) return null;
    const facts = (): Record<string, unknown> => ({ project: materials.projectName || null, mission: materials.mission, ...(materials.context ?? {}) });
    return {
      storageKey: 'idea',
      title: 'Idea board',
      subtitle: `Ideas for ${materials.projectName || 'this project'} — features, automations, content, growth. Riff, compare, keep, build.`,
      metrics: { w: 250, h: 180, gap: 26, cols: 3, pad: 40 },
      designWidth: 250,
      promptPlaceholder: 'an idea… e.g. “replay mode for past trading days” — or just pick a lens and Make',
      emptyHint: 'Pick a lens (Feature, Automation, Content…) and hit Make — or type the idea in your head. They land here to riff on, compare, and build.',
      kinds: IDEA_KINDS.map((k) => ({ id: k.id, label: k.label, emoji: k.emoji, hint: k.hint })),
      banner: 'Starters frame the right question with [EDIT] holes — connect an AI key and Make/riffs ideate for real, grounded in this project. ⚡ Auto-ideas can add fresh ones on a clock.',
      captionOf: (c) => `${ideaKindById(c.kindId)?.emoji ?? '💡'} ${c.tag}`,
      searchText: (c) => `${c.title} ${c.pitch} ${c.notes} ${c.tag}`,
      extraControls: clusterId ? <AutoIdeasToggle worldId={worldId} clusterId={clusterId} onToast={onToast} /> : undefined,

      generate: async ({ prompt, kindId }) => {
        const kind = (kindId && ideaKindById(kindId)) || defaultIdeaKind();
        let content = buildIdeaContent({ materials, kind, idea: prompt });
        // Even an empty Make asks the seam to ideate through the chosen lens — that's the point of
        // an idea board. Honest fallback to the question-framing starter when the seam is off.
        const ai = await generateBoardCopy({
          channel: 'idea', mode: 'make', kindLabel: kind.label,
          instruction: prompt.trim() || `One fresh, specific ${kind.label.toLowerCase()} idea for this project — not generic advice.`,
          materials: facts(),
        });
          if (!ai.ok) explainCopyMiss(ai, onToast);
        if (ai.ok) content = applyIdeaCopy(content, ai.fields as IdeaCopyFields);
        return content;
      },
      rendition: async ({ parent, instruction }) => {
        const ai = await generateBoardCopy({
          channel: 'idea', mode: 'rendition', instruction, kindLabel: ideaKindById(parent.kindId)?.label ?? null,
          materials: facts(), current: { title: parent.title, pitch: parent.pitch, notes: parent.notes, tag: parent.tag },
        });
          if (!ai.ok) explainCopyMiss(ai, onToast);
        if (ai.ok) return applyIdeaCopy({ ...parent }, ai.fields as IdeaCopyFields);
        const det = applyIdeaRendition(parent, instruction);
        if (det) return det;
        throw new Error('Riffing on an idea needs the AI seam, which isn’t connected — edit the card directly, or use “title: …”.');
      },

      renderThumb: (c) => <IdeaCard content={c} />,
      renderFocus: (c, api) => <IdeaFocus content={c} api={api} materials={materials} worldId={worldId} clusterId={clusterId} onToast={onToast} />,
    };
  }, [materials, worldId, clusterId, onToast]);

  if (!materials || !adapter) {
    return <div className="grid h-full min-h-[400px] place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>;
  }
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

function IdeaCard({ content }: { content: IdeaContent }) {
  return (
    <div style={{ width: 250, height: 180, borderRadius: 12, background: '#1d1712', border: '1px solid #3a2f25', padding: '12px 14px', color: '#f0e6da', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
      <span style={{ alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#14100c', background: TAG_COLOR[content.tag], borderRadius: 999, padding: '2px 8px' }}>{content.tag}</span>
      <div style={{ font: '600 14.5px/1.25 system-ui', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{content.title}</div>
      <div style={{ font: '11px/1.45 system-ui', color: '#a99b90', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{content.pitch}</div>
    </div>
  );
}

function IdeaFocus({ content, api, materials, worldId, clusterId, onToast }: {
  content: IdeaContent; api: FocusApi<IdeaContent>; materials: IdeaMaterials;
  worldId: string; clusterId: string | null; onToast: Toast;
}) {
  const navigate = useNavigate();
  const F = 'w-full rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12.5px] text-forge-ink focus:border-forge-ember/60 focus:outline-none';
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(composeIdeaText(content, materials.projectName)); onToast('success', 'Brief copied.'); }
    catch { onToast('info', 'Select and copy the text.'); }
  };
  // THE LOOP-CLOSER: this idea seeds the app builder's FIRST generation (the existing ff:build-brief
  // handoff NewProject reads) — "continuously generate ideas … and then potentially build them."
  const sendToBuilder = () => {
    const brief = composeIdeaText(content, materials.projectName);
    try { localStorage.setItem('ff:build-brief', JSON.stringify({ prompt: content.title, brief })); } catch { /* prompt-only seed */ }
    onToast('success', 'Idea handed to the app builder — it seeds the first generation.');
    // ?from=constellation is the flag NewProject checks before consuming ff:build-brief —
    // a bare /new would leave the brief unread in localStorage (the loop-closer would be a dead end).
    navigate('/new?from=constellation');
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {IDEA_TAGS.map((t) => (
          <button key={t} onClick={() => api.update({ ...content, tag: t })}
            className={cn('cb-gchip', content.tag === t && 'cb-gchip-on')}>{t}</button>
        ))}
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] text-forge-dim">Title<input className={F} value={content.title} onChange={(e) => api.update({ ...content, title: e.target.value })} /></label>
        <label className="block text-[11px] text-forge-dim">Pitch<textarea className={F} rows={3} value={content.pitch} onChange={(e) => api.update({ ...content, pitch: e.target.value })} /></label>
        <label className="block text-[11px] text-forge-dim">Notes — steps, risks, open questions<textarea className={F} rows={5} value={content.notes} onChange={(e) => api.update({ ...content, notes: e.target.value })} /></label>
      </div>
      <p className="mt-1 text-[10px] text-forge-dim/80"><span className="text-forge-ember">[EDIT: …]</span> holes are yours to fill — nothing is invented.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={api.isFavorite ? 'primary' : 'outline'} size="sm" onClick={api.favorite}><Star size={13} className={api.isFavorite ? 'fill-current' : ''} /> {api.isFavorite ? 'Keeper' : 'Keep'}</Button>
        <Button variant="outline" size="sm" onClick={() => void copyBrief()}><Copy size={13} /> Copy brief</Button>
        <Button variant="outline" size="sm" onClick={sendToBuilder} title="Seed the app builder's first generation with this idea"><Hammer size={13} /> Send to app builder</Button>
        <Button variant="ghost" size="sm" onClick={api.remove}><Trash2 size={13} /> Delete</Button>
      </div>
      {clusterId === null && <p className="mt-2 text-[10px] text-forge-dim/70">Dev preview — ideas aren’t persisted without a workspace.</p>}
    </div>
  );
}

// ---- ⚡ Auto-ideas: the idea_stream standing order, controlled from the board -----------------
function AutoIdeasToggle({ worldId, clusterId, onToast }: { worldId: string; clusterId: string; onToast: Toast }) {
  const [state, setState] = useState<'loading' | 'off' | 'daily' | 'weekly'>('loading');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void listOrders(worldId).then((orders) => {
      if (!live) return;
      const o = orders.find((x) => x.kind === 'idea_stream' && (x.config as { cluster_id?: string }).cluster_id === clusterId);
      if (!o) { setState('off'); return; }
      setOrderId(o.id);
      setState(o.status === 'active' ? (o.cadence === 'daily' ? 'daily' : 'weekly') : 'off');
    }).catch(() => { if (live) setState('off'); });
    return () => { live = false; };
  }, [worldId, clusterId]);

  const set = async (next: 'off' | 'daily' | 'weekly') => {
    setBusy(true);
    try {
      if (next === 'off') {
        if (orderId) await setOrderStatus(orderId, 'paused');
        setState('off'); onToast('info', 'Auto-ideas paused.');
      } else if (orderId) {
        await setOrderStatus(orderId, 'active');
        setState(next); onToast('success', `Auto-ideas on — fresh ideas will land here ${next}. (Cadence follows the order’s original setting.)`);
      } else {
        const o = await createOrder({ worldId, kind: 'idea_stream', label: `Auto-ideas · ${next}`, cadence: next, config: { cluster_id: clusterId, count: 3 } });
        setOrderId(o.id); setState(next);
        onToast('success', `Auto-ideas on — Garvis will add 3 fresh ideas ${next}, grouped by date. Needs the heartbeat armed + an AI key.`);
      }
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update auto-ideas.'); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-forge-dim"><Zap size={11} /> Auto-ideas</span>
      {(['off', 'daily', 'weekly'] as const).map((v) => (
        <button key={v} disabled={busy} onClick={() => void set(v)} className={cn('cb-chip', state === v && 'cb-chip-on')}>{v}</button>
      ))}
    </div>
  );
}
