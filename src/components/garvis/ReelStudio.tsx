// src/components/garvis/ReelStudio.tsx
// THE REEL STUDIO — a real short-video pipeline for a faceless content account, modeled on the
// traction-engine repo's flow. Unlike the other studios (one gallery → one worked example), a reel is
// built in three visible stages, because that's how the good ones are actually made:
//
//   1. IDEATE     pick a format + your topic → a few distinct ANGLE concepts (title, angle, the exact
//                 hook, why it retains). You choose one.
//   2. SCRIPT     the idea becomes a beat-by-beat script — a story spine + Hook → Value → Escalation →
//                 Peak → CTA beats, each an editable voiceover line + on-screen text + timing.
//   3. STORYBOARD every beat expands into a shot: subject, action, environment, camera, mood, cut — the
//                 direction a video model needs. Then copy it or save it as a draft.
//
// HONESTY holds (same as every studio): your topic fills in; every specific we can't know — the fact,
// the item, the number — is a visible [EDIT: …] hole you complete, never invented. A storyboard is a
// SEED: rendering it to a real vertical video needs a connected video model — this never fakes footage.
// All logic lives in the pure core (reelStudio.ts, verified). This file is the staged UI over it.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Copy, Save, Loader2, Lightbulb, FileText, Clapperboard, Play, Clock } from 'lucide-react';
import {
  REEL_FORMATS, reelIdeas, reelScript, reelScenes, reelCaption, reelToText,
  type ReelFormat, type ReelIdea, type ReelScript, type ReelBeat,
} from '../../lib/garvis/reelStudio';
import type { StudioCtx } from '../../lib/garvis/studioKit';
import { createArtifact } from '../../lib/garvis/artifacts';
import { loadWeb } from '../../lib/garvis/workwebRun';
import { Button } from '../ui';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;
type Stage = 'ideate' | 'script' | 'storyboard';

const ROLE_TINT: Record<ReelBeat['role'], string> = {
  hook: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
  value: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  escalation: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  peak: 'text-violet-300 border-violet-400/30 bg-violet-400/10',
  cta: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
};

export function ReelStudio({ worldId, clusterId, onToast, onSaved, ctxOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast; onSaved?: () => void; ctxOverride?: StudioCtx;
}) {
  const [topic, setTopic] = useState('');
  const [topicTouched, setTopicTouched] = useState(false);
  const [stage, setStage] = useState<Stage>('ideate');
  const [format, setFormat] = useState<ReelFormat | null>(null);
  const [ideaVariant, setIdeaVariant] = useState(0);
  const [idea, setIdea] = useState<ReelIdea | null>(null);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [captionVariant, setCaptionVariant] = useState(0);
  const [saving, setSaving] = useState(false);

  // Seed the topic from the world's name (the faceless account's niche), so it opens ready to work.
  // The owner can change it anytime; nothing is invented — an empty topic just shows [EDIT] holes.
  useEffect(() => {
    if (topicTouched) return;
    if (ctxOverride) { setTopic(ctxOverride.businessName || ''); return; }
    let live = true;
    void (async () => {
      try { const w = await loadWeb(worldId); if (live && w?.title) setTopic(w.title); } catch { /* leave blank → EDIT holes */ }
    })();
    return () => { live = false; };
  }, [worldId, ctxOverride, topicTouched]);

  const ideas = useMemo(() => (format ? reelIdeas(format.id, topic, ideaVariant) : []), [format, topic, ideaVariant]);
  const scenes = useMemo(() => (format && script ? reelScenes(format, script) : []), [format, script]);

  const reset = () => { setStage('ideate'); setFormat(null); setIdea(null); setScript(null); setIdeaVariant(0); setCaptionVariant(0); };
  const openFormat = (f: ReelFormat) => { setFormat(f); setIdeaVariant(0); setStage('ideate'); };
  const pickIdea = (i: ReelIdea) => {
    if (!format) return;
    const sc = reelScript(format.id, i, 0);
    if (!sc) return;
    setIdea(i); setScript({ ...sc, beats: sc.beats.map((b) => ({ ...b })) }); setStage('script');
  };

  const editBeat = (i: number, patch: Partial<ReelBeat>) => setScript((s) => {
    if (!s) return s;
    const beats = s.beats.map((b, j) => (j === i ? { ...b, ...patch } : b));
    return { ...s, beats, runtime: beats.reduce((n, b) => n + b.seconds, 0) };
  });

  const fullText = () => (format && idea && script ? reelToText(format, idea, script, scenes, captionVariant) : '');
  const copy = async () => {
    try { await navigator.clipboard.writeText(fullText()); onToast('success', 'Storyboard copied.'); }
    catch { onToast('info', 'Select the text and copy it.'); }
  };
  const saveDraft = async () => {
    if (!format || !idea || !script) return;
    if (!clusterId) { onToast('info', 'Copy it for now — saving drafts needs this studio’s area set up.'); return; }
    setSaving(true);
    try {
      await createArtifact({ clusterId, kind: 'doc', title: `Reel — ${idea.title}`, detail: fullText(), source: 'garvis' });
      onToast('success', 'Saved to your shelf as a reel draft.');
      onSaved?.();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the draft.'); }
    finally { setSaving(false); }
  };

  // ---- header: title + the 3-stage progress rail ----
  const header = (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-lg text-forge-ember">🎬</span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-forge-ink">Reel studio</h3>
        <p className="text-[11.5px] text-forge-dim">Build a faceless short in three stages — ideate an angle, script the beats, then storyboard every shot.</p>
      </div>
    </div>
  );

  const Rail = ({ active }: { active: Stage }) => {
    const steps: { key: Stage; label: string; icon: typeof Lightbulb }[] = [
      { key: 'ideate', label: 'Ideate', icon: Lightbulb },
      { key: 'script', label: 'Script', icon: FileText },
      { key: 'storyboard', label: 'Storyboard', icon: Clapperboard },
    ];
    const order: Stage[] = ['ideate', 'script', 'storyboard'];
    const activeIdx = order.indexOf(active);
    return (
      <div className="mb-3 flex items-center gap-1.5 text-[11px]">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < activeIdx; const now = i === activeIdx;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
                now ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ember'
                  : done ? 'border-forge-border bg-forge-panel/40 text-forge-ink' : 'border-forge-border/60 text-forge-dim/70')}>
                <Icon size={12} /> {s.label}
              </span>
              {i < steps.length - 1 && <span className={cn('h-px w-4', done ? 'bg-forge-ember/40' : 'bg-forge-border')} />}
            </div>
          );
        })}
      </div>
    );
  };

  // ---- the topic field, shown once a format is open ----
  const TopicField = (
    <label className="mb-3 block">
      <span className="mb-1 block text-[11px] font-medium text-forge-dim">What’s this account about? (your niche / topic)</span>
      <input
        value={topic}
        onChange={(e) => { setTopic(e.target.value); setTopicTouched(true); }}
        placeholder="e.g. vintage watches, home espresso, ancient Rome…"
        className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
      {!topic.trim() && <span className="mt-1 block text-[10.5px] text-forge-dim/70">Leave it blank and every specific becomes an <span className="text-forge-ember">[EDIT]</span> you fill in.</span>}
    </label>
  );

  // ================= STAGE: pick a format =================
  if (!format) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REEL_FORMATS.map((f) => (
            <button key={f.id} onClick={() => openFormat(f)}
              className="group rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-left transition hover:border-forge-ember/50 hover:bg-forge-ember/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-lg">{f.emoji}</span>
                <span className="text-sm font-semibold text-forge-ink">{f.name}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-forge-dim">{f.blurb}</p>
              <p className="mt-1.5 truncate text-[11px] italic text-forge-dim/70" title={f.sample}>“{f.sample}”</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10.5px] text-forge-dim/80">Every reel is faceless — no business name, no face. Rendering a storyboard to real video needs a connected video model; nothing is faked here.</p>
      </div>
    );
  }

  // ================= STAGE: ideate =================
  if (stage === 'ideate') {
    return (
      <div>
        {header}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button onClick={reset} className="inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember"><ArrowLeft size={13} /> Formats</button>
          <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{format.emoji} {format.name}</span>
        </div>
        <Rail active="ideate" />
        {TopicField}
        <p className="mb-2 text-[11.5px] text-forge-dim">Pick an angle — each is a different way to hook this topic:</p>
        <div className="space-y-2">
          {ideas.map((k) => (
            <button key={k.id} onClick={() => pickIdea(k)}
              className="group block w-full rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-left transition hover:border-forge-ember/50 hover:bg-forge-ember/[0.06]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-forge-ink">{k.title}</span>
                <span className="shrink-0 text-[10px] text-forge-ember opacity-0 transition group-hover:opacity-100">Script it →</span>
              </div>
              <p className="mt-1 text-[11.5px] text-forge-dim">{k.angle}</p>
              <p className="mt-1.5 rounded-md border border-forge-border/60 bg-forge-bg/60 px-2 py-1 text-[11.5px] italic text-forge-ink/90">🎣 “{k.hookLine}”</p>
              <p className="mt-1 text-[10.5px] text-forge-dim/70">Why it works: {k.whyItWorks}</p>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setIdeaVariant((v) => v + 1)}><Sparkles size={13} /> More angles</Button>
        </div>
      </div>
    );
  }

  // ================= STAGE: script =================
  if (stage === 'script' && script && idea) {
    return (
      <div>
        {header}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button onClick={() => setStage('ideate')} className="inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember"><ArrowLeft size={13} /> Angles</button>
          <span className="inline-flex items-center gap-1 text-[11px] text-forge-dim"><Clock size={12} /> ~{script.runtime}s · 9:16</span>
        </div>
        <Rail active="script" />
        <div className="mb-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
          <p className="text-sm font-semibold text-forge-ink">{idea.title}</p>
          <p className="mt-0.5 text-[11px] text-forge-dim"><span className="text-forge-ember">Story spine:</span> {script.spine}</p>
        </div>
        <div className="space-y-2.5">
          {script.beats.map((b, i) => (
            <div key={i} className="rounded-xl border border-forge-border bg-forge-panel/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', ROLE_TINT[b.role])}>{b.role}</span>
                <span className="text-[11px] text-forge-dim">{b.label}</span>
              </div>
              <label className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">On-screen text <span className="text-forge-dim/60">(keep it short)</span></label>
              <input value={b.onscreen} onChange={(e) => editBeat(i, { onscreen: e.target.value })}
                className="mb-2 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[13px] font-medium text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
              <label className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">Voiceover</label>
              <textarea value={b.narration} onChange={(e) => editBeat(i, { narration: e.target.value })}
                rows={Math.min(5, Math.max(2, Math.ceil(b.narration.length / 52)))}
                className="w-full resize-y rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-forge-dim/80"><span className="text-forge-ember">[EDIT: …]</span> marks are yours to fill in with the real fact — Garvis never invents specifics.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setStage('storyboard')}><Clapperboard size={13} /> Storyboard it</Button>
          <Button variant="outline" size="sm" onClick={() => void copy()}><Copy size={13} /> Copy script</Button>
        </div>
      </div>
    );
  }

  // ================= STAGE: storyboard =================
  if (stage === 'storyboard' && script && idea) {
    return (
      <div>
        {header}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button onClick={() => setStage('script')} className="inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember"><ArrowLeft size={13} /> Script</button>
          <span className="inline-flex items-center gap-1 text-[11px] text-forge-dim"><Clock size={12} /> ~{script.runtime}s · {scenes.length} scenes</span>
        </div>
        <Rail active="storyboard" />
        <div className="space-y-2.5">
          {scenes.map((s, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-forge-border bg-forge-panel/30">
              <div className="flex items-center justify-between gap-2 border-b border-forge-border/60 bg-forge-bg/40 px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-forge-ink">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-forge-ember/15 text-[11px] text-forge-ember">{i + 1}</span>
                  {s.label}
                </span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[9.5px] font-medium uppercase', ROLE_TINT[s.role])}>{s.zone}</span>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-lg border border-forge-border/60 bg-forge-bg/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-forge-dim">On-screen</p>
                  <p className="text-[13px] font-semibold text-forge-ink">{s.onscreen}</p>
                  <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-forge-dim">Voiceover</p>
                  <p className="text-[12.5px] leading-relaxed text-forge-ink/90">{s.narration}</p>
                </div>
                <ShotField label="Subject" value={s.subject} onChange={(v) => editBeat(i, { subject: v })} />
                <ShotField label="Action" value={s.action} onChange={(v) => editBeat(i, { action: v })} />
                <Direction label="Camera" value={s.camera} />
                <Direction label="Environment" value={s.environment} />
                <Direction label="Mood" value={s.mood} />
                <Direction label="Cut" value={s.cut} />
              </div>
            </div>
          ))}
        </div>

        {/* caption */}
        <div className="mt-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium text-forge-dim">Post caption + hashtags</p>
            <button onClick={() => setCaptionVariant((v) => v + 1)} className="inline-flex items-center gap-1 text-[10.5px] text-forge-dim hover:text-forge-ember"><Sparkles size={11} /> Another</button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-forge-ink/90">{reelCaption(topic, captionVariant)}</pre>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-forge-dim/80">
          <Play size={11} className="text-forge-ember" /> This is a shot list, not footage. Rendering it to a real vertical video needs a connected video model (the clip engine).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save as draft
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copy()}><Copy size={13} /> Copy storyboard</Button>
        </div>
      </div>
    );
  }

  return null;
}

function ShotField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-forge-dim">{label}</p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
        className="w-full resize-y rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
    </div>
  );
}

function Direction({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forge-border/50 bg-forge-bg/30 px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-forge-dim/80">{label}</p>
      <p className="text-[11.5px] leading-snug text-forge-ink/80">{value}</p>
    </div>
  );
}
