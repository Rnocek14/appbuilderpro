// src/components/garvis/EmailStudio.tsx
// THE EMAIL STUDIO — the answer to "clicking Email shouldn't give me one rendition, it should be a
// studio." It opens FULL of ideas: a gallery of the emails a business like this actually sends, each
// card already showing an example subject. Pick one → a ready, editable draft (from the business's
// real brand + area, with visible [EDIT: …] holes for anything we can't know). "Another angle" spins
// a genuinely different rendition. Edit inline, copy, or save it as a draft on the shelf.
//
// The catalog + the example engine are the VERIFIED pure core (emailStudio.ts). This file is the
// workspace around them: load the business context, render the gallery/editor, save.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Copy, Save, Sparkles, ArrowLeft, Mail } from 'lucide-react';
import { conceptsFor, buildEmailExample, conceptSample, type EmailConcept, type EmailCtx } from '../../lib/garvis/emailStudio';
import { getBrandKit, createArtifact } from '../../lib/garvis/artifacts';
import { loadWeb } from '../../lib/garvis/workwebRun';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

const RE_TITLE = /real.?estate|realtor|realty|listing|propert|broker|\bhomes?\b/i;

export function EmailStudio({ worldId, clusterId, realEstate, onToast, onSaved }: {
  worldId: string; clusterId: string | null; realEstate?: boolean; onToast: Toast; onSaved?: () => void;
}) {
  const [re, setRe] = useState(!!realEstate);   // inferred from the world's name below if not given
  const [ctx, setCtx] = useState<EmailCtx>({ businessName: '', agentName: '', phone: null, area: null, realEstate: !!realEstate });
  const [sel, setSel] = useState<EmailConcept | null>(null);
  const [variant, setVariant] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  // Build the business context from what we honestly know: the world's name, the brand's signer, and
  // (if a campaign was set up on the canvas) its agent/phone/area — never invented.
  useEffect(() => {
    let live = true;
    void (async () => {
      let isRE = !!realEstate;
      const next: EmailCtx = { businessName: '', agentName: '', phone: null, area: null, realEstate: isRE };
      try { const w = await loadWeb(worldId); if (w?.title) { next.businessName = w.title; if (realEstate === undefined) isRE = RE_TITLE.test(w.title); } } catch { /* keep blank */ }
      next.realEstate = isRE;
      if (live) setRe(isRE);
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
  }, [worldId, clusterId, realEstate]);

  const concepts = useMemo(() => conceptsFor(re), [re]);

  const applyVariant = (k: EmailConcept, v: number) => {
    const ex = buildEmailExample(k.id, ctx, v);
    if (ex) { setSubject(ex.subject); setBody(ex.body); }
  };
  const openConcept = (k: EmailConcept) => { setSel(k); setVariant(0); applyVariant(k, 0); };
  const anotherAngle = () => { if (!sel) return; const v = variant + 1; setVariant(v); applyVariant(sel, v); };

  const copy = async () => {
    try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); onToast('success', 'Email copied.'); }
    catch { onToast('info', 'Select the text and copy it.'); }
  };
  const saveDraft = async () => {
    if (!sel) return;
    if (!clusterId) { onToast('info', 'Copy it for now — saving drafts needs this studio’s area set up.'); return; }
    setSaving(true);
    try {
      await createArtifact({ clusterId, kind: 'doc', title: `Email — ${sel.name}`, detail: `Subject: ${subject}\n\n${body}`, source: 'garvis' });
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
        <label className="mb-1 block text-[11px] font-medium text-forge-dim">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)}
          className="mb-3 w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        <label className="mb-1 block text-[11px] font-medium text-forge-dim">Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
          className="w-full resize-y rounded-lg border border-forge-border bg-forge-bg px-3 py-2 font-mono text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        <p className="mt-1.5 text-[10.5px] text-forge-dim/80">
          <span className="text-forge-ember">[EDIT: …]</span> marks are yours to fill in. <code>{'{{first_name}}'}</code> fills in for each person when you send.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={anotherAngle}><Sparkles size={13} /> Another angle</Button>
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
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Mail size={17} /></span>
        <div>
          <h3 className="text-sm font-semibold text-forge-ink">Email studio</h3>
          <p className="text-[11.5px] text-forge-dim">Pick an idea — each opens a ready example you can spin, edit, and save.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {concepts.map((k) => (
          <button key={k.id} onClick={() => openConcept(k)}
            className={cn('group rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-left transition hover:border-forge-ember/50 hover:bg-forge-ember/[0.06]')}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{k.emoji}</span>
              <span className="text-sm font-semibold text-forge-ink">{k.name}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-forge-dim">{k.blurb}</p>
            <p className="mt-1.5 truncate text-[11px] italic text-forge-dim/70" title={conceptSample(k, ctx)}>“{conceptSample(k, ctx)}”</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10.5px] text-forge-dim/80">Every draft is written from your brand — real facts fill in, and anything specific shows as an <span className="text-forge-ember">[EDIT]</span> you complete. Nothing sends from here; save a draft and send it from the Queue.</p>
    </div>
  );
}
