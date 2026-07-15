// src/components/garvis/IdeaStudio.tsx
// THE ONE STUDIO SCAFFOLD. Every "make something" studio is the same experience: a gallery of IDEAS
// (each card already showing an example), pick one → a worked, editable draft with as many fields as
// that thing needs, "another angle" spins a different rendition, then copy or save it as a draft.
// Email, Ads, and Copy all mount THIS with their own StudioSpec — so the whole app's studios are one
// cohesive system, not a pile of bespoke panels.
//
// It loads the business context (name, signer, phone, area) from what we honestly know, so every draft
// fills in real facts and leaves the rest as visible [EDIT] holes. Nothing sends from here — drafts
// save to the shelf and go out through the Queue.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Copy, Save, Sparkles, ArrowLeft } from 'lucide-react';
import {
  exampleToText, inferRealEstate,
  type StudioSpec, type StudioCtx, type StudioIdea, type StudioExamplePart,
} from '../../lib/garvis/studioKit';
import { getBrandKit, createArtifact } from '../../lib/garvis/artifacts';
import { loadWeb } from '../../lib/garvis/workwebRun';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function IdeaStudio({ spec, worldId, clusterId, onToast, onSaved, ctxOverride }: {
  spec: StudioSpec;
  worldId: string;
  clusterId: string | null;
  onToast: Toast;
  onSaved?: () => void;
  ctxOverride?: StudioCtx;   // dev previews inject a ready context and skip the loaders
}) {
  const [ctx, setCtx] = useState<StudioCtx>(ctxOverride ?? { businessName: '', agentName: '', phone: null, area: null, realEstate: false });
  const [sel, setSel] = useState<StudioIdea | null>(null);
  const [variant, setVariant] = useState(0);
  const [parts, setParts] = useState<StudioExamplePart[]>([]);
  const [saving, setSaving] = useState(false);

  // Build the business context from what we honestly know: the world's name (→ business + real-estate
  // guess), the brand's signer, and — if a campaign was set up on the canvas — its agent/phone/area.
  useEffect(() => {
    if (ctxOverride) { setCtx(ctxOverride); return; }
    let live = true;
    void (async () => {
      const next: StudioCtx = { businessName: '', agentName: '', phone: null, area: null, realEstate: false };
      try { const w = await loadWeb(worldId); if (w?.title) { next.businessName = w.title; next.realEstate = inferRealEstate(w.title); } } catch { /* keep blank */ }
      try { const k = await getBrandKit(worldId); if (k?.name) next.agentName = k.name; } catch { /* keep blank */ }
      if (clusterId) {
        try {
          const { data } = await supabase.from('knowledge_clusters').select('working_state').eq('id', clusterId).maybeSingle();
          const camp = (data?.working_state as { campaign?: { agentName?: string | null; agentPhone?: string | null; area?: string | null } } | null)?.campaign;
          if (camp) {
            if (camp.agentName && !next.agentName) next.agentName = camp.agentName;
            if (camp.agentPhone) next.phone = camp.agentPhone;
            if (camp.area) next.area = camp.area;
          }
        } catch { /* no campaign set — the studio still works, with EDIT holes */ }
      }
      if (live) setCtx(next);
    })();
    return () => { live = false; };
  }, [spec.kind, worldId, clusterId, ctxOverride]);

  const ideas = useMemo(() => spec.ideasFor(ctx.realEstate), [spec, ctx.realEstate]);

  const applyVariant = (idea: StudioIdea, v: number) => {
    const ex = spec.build(idea.id, ctx, v);
    if (ex) setParts(ex.parts);
  };
  const openIdea = (idea: StudioIdea) => { setSel(idea); setVariant(0); applyVariant(idea, 0); };
  const anotherAngle = () => { if (!sel) return; const v = variant + 1; setVariant(v); applyVariant(sel, v); };
  const editPart = (i: number, value: string) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, value } : p)));

  const copy = async () => {
    try { await navigator.clipboard.writeText(exampleToText({ parts })); onToast('success', 'Copied.'); }
    catch { onToast('info', 'Select the text and copy it.'); }
  };
  const saveDraft = async () => {
    if (!sel) return;
    if (!clusterId) { onToast('info', 'Copy it for now — saving drafts needs this studio’s area set up.'); return; }
    setSaving(true);
    try {
      await createArtifact({ clusterId, kind: 'doc', title: `${spec.savePrefix} — ${sel.name}`, detail: exampleToText({ parts }), source: 'garvis' });
      onToast('success', 'Saved to your shelf as a draft.');
      onSaved?.();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the draft.'); }
    finally { setSaving(false); }
  };

  // ---- editor ----
  if (sel) {
    return (
      <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember"><ArrowLeft size={13} /> Ideas</button>
          <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{sel.emoji} {sel.name}</span>
        </div>
        <div className="space-y-3">
          {parts.map((p, i) => (
            <div key={`${sel.id}-${i}`}>
              <label className="mb-1 block text-[11px] font-medium text-forge-dim">{p.label}</label>
              {p.multiline ? (
                <textarea value={p.value} onChange={(e) => editPart(i, e.target.value)} rows={Math.min(16, Math.max(3, p.value.split('\n').length + 1))}
                  className="w-full resize-y rounded-lg border border-forge-border bg-forge-bg px-3 py-2 font-mono text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
              ) : (
                <input value={p.value} onChange={(e) => editPart(i, e.target.value)}
                  className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-forge-dim/80">
          <span className="text-forge-ember">[EDIT: …]</span> marks are yours to fill in. Merge fields like <code>{'{{first_name}}'}</code> fill in per person when you send.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sel.variants > 1 && <Button variant="outline" size="sm" onClick={anotherAngle}><Sparkles size={13} /> Another angle</Button>}
          <Button variant="outline" size="sm" onClick={() => void copy()}><Copy size={13} /> Copy</Button>
          <Button variant="primary" size="sm" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save as draft
          </Button>
        </div>
      </div>
    );
  }

  // ---- gallery of ideas ----
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-lg text-forge-ember">{spec.emoji}</span>
        <div>
          <h3 className="text-sm font-semibold text-forge-ink">{spec.title}</h3>
          <p className="text-[11.5px] text-forge-dim">{spec.subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ideas.map((k) => (
          <button key={k.id} onClick={() => openIdea(k)}
            className="group rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-left transition hover:border-forge-ember/50 hover:bg-forge-ember/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-lg">{k.emoji}</span>
              <span className="text-sm font-semibold text-forge-ink">{k.name}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-forge-dim">{k.blurb}</p>
            <p className="mt-1.5 truncate text-[11px] italic text-forge-dim/70" title={spec.sampleFor(k, ctx)}>“{spec.sampleFor(k, ctx)}”</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10.5px] text-forge-dim/80">Every draft is written from your brand — real facts fill in, and anything specific shows as an <span className="text-forge-ember">[EDIT]</span> you complete. Nothing sends from here; save a draft and send it from the Queue.</p>
    </div>
  );
}
