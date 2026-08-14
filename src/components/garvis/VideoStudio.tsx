// src/components/garvis/VideoStudio.tsx
// The video studio: build a storyboard from the world's REAL photos, watch it play in the browser
// (a real Ken-Burns slideshow with text overlays + captions — usable with ZERO setup), edit each
// scene's text, pick an aspect, download the caption .srt, save the storyboard, and render a real
// mp4 when a render key is configured (honest degradation otherwise). A render can carry a real
// TTS voiceover + burned captions + a CC0 music bed, is FINALIZED into durable storage (provider
// URLs die in 24h), and a finished render queues straight into the approval-gated social publisher
// — the full storyboard → mp4 → TikTok/Shorts/Reels circuit in one place.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, Pause, Save, Film, Download, Clapperboard, Send, Mic } from 'lucide-react';
import { buildStoryboard, buildTimedCaptionsSrt, VIDEO_CONCEPTS, type Aspect, type EditOpts, type Storyboard, type VideoConcept, type WordTiming } from '../../lib/garvis/storyboard';
import { planEmphasis } from '../../lib/garvis/editPlan';
import {
  loadVideoMaterials, defaultStoryboardFor, subjectStoryboardFor, saveStoryboard, startRender, pollRender, saveRenderedVideo,
  saveSrtAsset, generateVoiceover,
  type VideoMaterials,
} from '../../lib/garvis/videoRun';
import { volumeForMusic } from '../../lib/garvis/musicBed';
import { type SfxKit } from '../../lib/garvis/ugcEdit';
import { loadSfxKit, sfxKitCount } from '../../lib/garvis/sfxStore';
import { SoundKitFields } from './SoundKitFields';
import { withDisclosure, type AiProvenance } from '../../lib/garvis/mediaProvenance';
import { registerSurface } from '../../lib/garvis/surfaceBridge';
import { parseVideoAsk } from '../../lib/garvis/studioVoice';
import { PLATFORM_LABEL, type Platform } from '../../lib/garvis/social';
import { queueSocialPost } from '../../lib/garvis/socialRun';
import { cn } from '../../lib/utils';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { Button } from '../ui';

// The platforms a finished VIDEO can ride to (socialCore supports all of them end-to-end; video on
// the provider's free tier is plan-gated — checkDraft surfaces that warning honestly).
const VIDEO_PLATFORMS: Platform[] = ['tiktok', 'youtube', 'instagram', 'facebook', 'linkedin', 'twitter'];

const ASPECTS: { id: Aspect; label: string; box: string }[] = [
  { id: '9:16', label: 'Reel / TikTok', box: 'aspect-[9/16] max-w-[240px]' },
  { id: '1:1', label: 'Square', box: 'aspect-square max-w-[320px]' },
  { id: '16:9', label: 'Landscape', box: 'aspect-video max-w-full' },
];
const KEN_BURNS: Record<string, string> = {
  zoomIn: 'vs-zoom-in', zoomOut: 'vs-zoom-out', panLeft: 'vs-pan-left', panRight: 'vs-pan-right', still: '',
};

export function VideoStudio({ worldId, clusterId, title, onToast }: {
  worldId: string; clusterId: string; title: string; onToast: (k: 'success' | 'error' | 'info', m: string) => void;
}) {
  const [materials, setMaterials] = useState<VideoMaterials | null>(null);
  const [sb, setSb] = useState<Storyboard | null>(null);
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [concept, setConcept] = useState<VideoConcept>('proof_first');
  const [playing, setPlaying] = useState(false);
  const [scene, setScene] = useState(0);
  const [busy, setBusy] = useState(false);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const [voiceoverOn, setVoiceoverOn] = useState(false);
  const [musicUrl, setMusicUrl] = useState('');
  const [lane, setLane] = useState<'calm' | 'energetic'>('calm');
  const [sfx, setSfx] = useState<SfxKit>(loadSfxKit);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [lastRender, setLastRender] = useState<{ url: string; durable: boolean; provenance: AiProvenance | null } | null>(null);
  const [pendingRender, setPendingRender] = useState<{ id: string; provenance: AiProvenance | null } | null>(null);
  const [pubPlatforms, setPubPlatforms] = useState<Platform[]>(['tiktok', 'youtube', 'instagram']);
  const [pubCaption, setPubCaption] = useState('');
  const [queueing, setQueueing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unsaved-edit guard: hand-edited lines live only in state until Save/Render — leaving the
  // browser with edits pending must ask first (design review).
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);

  // TALK TO THE STUDIO — the concierge's sentences act HERE while this studio is open ("make a
  // video about the lakefront listing", "story first", "make it vertical", "play it"). Claims
  // are the verified pure parser (studioVoice.ts); state is read through a ref so the handle
  // never goes stale across renders. A rebuild op refuses while hand edits are unsaved — spoken
  // words must not silently destroy an hour of typing.
  const voiceRef = useRef({ materials, dirty, playing, aspect, concept });
  voiceRef.current = { materials, dirty, playing, aspect, concept };
  useEffect(() => registerSurface({
    id: 'studio:video',
    claims: (sentence) => (parseVideoAsk(sentence) ? { kind: 'instruct', text: sentence } : null),
    suggest: () => (voiceRef.current.playing
      ? [{ label: 'Pause it', cmd: { kind: 'instruct', text: 'pause' } }]
      : [
        { label: 'Play it', cmd: { kind: 'instruct', text: 'play it' } },
        { label: 'Story-first cut', cmd: { kind: 'instruct', text: 'story first' } },
        { label: 'Make it vertical', cmd: { kind: 'instruct', text: 'make it vertical' } },
      ]),
    handle: (cmd) => {
      const ask = parseVideoAsk(cmd.text);
      const v = voiceRef.current;
      if (!ask) return 'Say it again?';
      if (ask.kind === 'play') { setPlaying(true); return 'Rolling.'; }
      if (ask.kind === 'pause') { setPlaying(false); return 'Paused.'; }
      if (ask.kind === 'aspect') { setAspect(ask.aspect); rebuild({ aspect: ask.aspect }); setScene(0); return `Now ${ask.aspect === '9:16' ? 'vertical' : ask.aspect === '1:1' ? 'square' : 'landscape'}.`; }
      if (v.dirty) return "You have unsaved line edits — save or render first, then I'll rebuild the timeline.";
      if (!v.materials) return 'Still loading this business\u2019s photos — one moment.';
      if (ask.kind === 'cut') {
        setConcept(ask.concept);
        setSb(defaultStoryboardFor(v.materials, title, v.aspect, ask.concept));
        setScene(0); setPlaying(false);
        return `Recut — ${ask.concept === 'story_first' ? 'the story leads' : ask.concept === 'offer_first' ? 'the offer leads' : 'the proof leads'}.`;
      }
      // retitle: the whole board rebuilds AROUND the spoken subject — opening card and words,
      // not just the artifact title.
      setSb(subjectStoryboardFor(v.materials, ask.title, v.aspect, v.concept));
      setScene(0); setPlaying(false);
      return `Built around \u201c${ask.title}\u201d — the real photos are in; tune any line and press Render.`;
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    void loadVideoMaterials(worldId).then((m) => {
      if (!live) return;
      setMaterials(m);
      setSb(defaultStoryboardFor(m, title, aspect));
    }).catch(() => {});
    return () => { live = false; };
  }, [worldId, title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild the board when aspect changes, preserving edited text.
  const rebuild = useCallback((next: Partial<{ aspect: Aspect; scenes: Storyboard['scenes'] }>) => {
    setSb((cur) => {
      if (!cur) return cur;
      return buildStoryboard({
        title: cur.title, aspect: next.aspect ?? cur.aspect, accent: cur.accent,
        scenes: (next.scenes ?? cur.scenes).map((s) => ({ imageUrl: s.imageUrl, shoot: s.shoot, onScreen: s.onScreen, voiceover: s.voiceover, durationS: s.durationS })),
      });
    });
  }, []);

  // The player: advance scene by scene on each scene's real duration.
  useEffect(() => {
    if (!playing || !sb || !sb.scenes.length) return;
    timer.current = setTimeout(() => {
      setScene((i) => {
        if (i + 1 >= sb.scenes.length) { setPlaying(false); return 0; }
        return i + 1;
      });
    }, sb.scenes[scene]?.durationS * 1000 || 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, scene, sb]);

  const editScene = (i: number, patch: Partial<{ onScreen: string; voiceover: string }>) => {
    if (!sb) return;
    setDirty(true);
    const scenes = sb.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s));
    rebuild({ scenes });
  };

  const downloadSrt = () => {
    if (!sb?.captionsSrt) { onToast('info', 'No captions yet — add voiceover lines to the scenes.'); return; }
    const blob = new Blob([sb.captionsSrt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${sb.title.replace(/\s+/g, '-')}.srt`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const doSave = async () => {
    if (!sb) return;
    setBusy(true);
    try { await saveStoryboard(clusterId, sb); setDirty(false); onToast('success', 'Storyboard saved into this area.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doRender = async () => {
    if (!sb) return;
    setBusy(true); setLastRender(null); setRenderMsg('Starting render…');
    try {
      // A timed-out render is NOT lost: resume polling it rather than starting (and paying for) a new one.
      if (pendingRender) {
        const st = await pollRender(pendingRender.id, { clusterId, aiProvenance: pendingRender.provenance });
        if (st.status === 'done' && st.url) {
          await saveRenderedVideo(clusterId, sb.title, st.url, pendingRender.id);
          setPendingRender(null); setRenderMsg(null);
          setLastRender({ url: st.url, durable: st.durable === true, provenance: pendingRender.provenance });
          setPubCaption((c) => c || sb.title);
          onToast('success', 'The earlier render finished — saved durably.');
          return;
        }
        if (st.status !== 'failed') { setRenderMsg(null); onToast('info', `Still rendering (${st.status ?? 'working'}) — try again in a minute.`); return; }
        setPendingRender(null); // failed → fall through to a fresh render
      }
      // Media layers first: voiceover clips + hosted captions when the toggle is on. All honest —
      // a missing TTS key degrades to the silent render with the setup steps, never a fake voice.
      const opts: EditOpts = {};
      let provenance: AiProvenance | null = null;
      if (voiceoverOn) {
        setRenderMsg('Narrating scenes…');
        const vo = await generateVoiceover(sb, clusterId);
        if (vo.available === false) { setRenderMsg(null); onToast('info', 'Voiceover isn\'t configured yet — set OPENAI_API_KEY (or ELEVENLABS_API_KEY) in the edge secrets. Rendering silently works now.'); return; }
        if (!vo.ok || !vo.clips?.length) { setRenderMsg(null); onToast('error', vo.error ?? 'The voiceover failed.'); return; }
        opts.voClips = vo.clips;
        provenance = vo.provenance ?? null;
        // Word-EXACT captions when the provider returned timing; proportional otherwise.
        const timings: (WordTiming[] | null)[] = [];
        for (const c of vo.clips) timings[c.sceneIndex] = c.words ?? null;
        opts.srtUrl = (await saveSrtAsset(clusterId, sb, buildTimedCaptionsSrt(sb.scenes, timings)).catch(() => null)) ?? undefined;
      }
      if (musicUrl.trim()) {
        opts.musicUrl = musicUrl.trim();
        opts.musicVolume = volumeForMusic(!!opts.voClips?.length);
      }
      opts.lane = lane;
      if (sfxKitCount(sfx)) opts.sfx = sfx;
      opts.emphasisIndices = planEmphasis(sb.scenes);

      const start = await startRender(sb, opts);
      if (start.available === false) { setRenderMsg(null); onToast('info', 'Video rendering isn\'t configured on the server yet — the preview above is fully usable. (Add a render key: see the system health page.)'); return; }
      if (!start.ok || !start.id) { setRenderMsg(null); onToast('error', start.error ?? 'Render could not start.'); return; }
      setPendingRender({ id: start.id, provenance });
      await saveStoryboard(clusterId, sb).then(() => setDirty(false)).catch(() => {});
      // Poll to completion (renders take ~10-40s for short clips). A finished render is FINALIZED
      // server-side into durable storage — the provider's URL rots in 24h.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollRender(start.id, { clusterId, aiProvenance: provenance });
        setRenderMsg(`Rendering… (${st.status ?? 'working'})`);
        if (st.status === 'done' && st.url) {
          await saveRenderedVideo(clusterId, sb.title, st.url, start.id);
          setPendingRender(null); setRenderMsg(null);
          setLastRender({ url: st.url, durable: st.durable === true, provenance });
          setPubCaption((c) => c || sb.title);
          onToast('success', st.durable ? 'Video rendered — saved durably to this area.' : 'Video rendered (provider copy — the durable save reported an issue).');
          return;
        }
        if (st.status === 'failed') { setPendingRender(null); setRenderMsg(null); onToast('error', 'The render failed on the provider.'); return; }
      }
      setRenderMsg(null); onToast('info', 'Render is taking longer than expected — press "Render mp4" again shortly; it resumes checking this render instead of paying for a new one.');
    } catch (e) { setRenderMsg(null); onToast('error', e instanceof Error ? e.message : 'Render failed.'); }
    finally { setBusy(false); }
  };

  const doQueue = async () => {
    if (!lastRender || !pubCaption.trim() || !pubPlatforms.length) return;
    setQueueing(true);
    try {
      // The disclosure is applied HERE when the render carries AI media (TTS audio) — and the
      // server-side publish gate re-derives + enforces it fail-closed either way.
      const text = withDisclosure(pubCaption.trim(), lastRender.provenance);
      const out = await queueSocialPost({
        text, platforms: pubPlatforms, mediaUrls: [lastRender.url], worldId,
        provenance: lastRender.provenance,
      });
      onToast('success', 'Post queued — approve it in the Queue to publish.');
      for (const w of out.warnings) onToast('info', w);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the post.'); }
    finally { setQueueing(false); }
  };

  if (!materials || !sb) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading your photos…</div>;

  const box = ASPECTS.find((a) => a.id === aspect)!.box;
  const cur = sb.scenes[scene];

  return (
    <div className="mt-4">
      <style>{`
        @keyframes vsZoomIn { from { transform: scale(1);} to { transform: scale(1.15);} }
        @keyframes vsZoomOut { from { transform: scale(1.15);} to { transform: scale(1);} }
        @keyframes vsPanLeft { from { transform: scale(1.12) translateX(3%);} to { transform: scale(1.12) translateX(-3%);} }
        @keyframes vsPanRight { from { transform: scale(1.12) translateX(-3%);} to { transform: scale(1.12) translateX(3%);} }
        .vs-zoom-in { animation: vsZoomIn linear both; } .vs-zoom-out { animation: vsZoomOut linear both; }
        .vs-pan-left { animation: vsPanLeft linear both; } .vs-pan-right { animation: vsPanRight linear both; }
      `}</style>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        {/* The player */}
        <div className="space-y-2">
          <div className={cn('relative overflow-hidden rounded-xl border border-forge-border bg-black', box)}>
            {cur?.imageUrl ? (
              <img
                key={scene} src={cur.imageUrl} alt=""
                className={cn('absolute inset-0 h-full w-full object-cover', playing && KEN_BURNS[cur.motion])}
                style={playing ? { animationDuration: `${cur.durationS}s` } : undefined}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-forge-raised p-6 text-center text-xs text-forge-dim">
                {cur?.shoot ?? 'Add photos in the Brain'}
              </div>
            )}
            {cur?.onScreen && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                <p className="text-sm font-bold leading-tight" style={{ color: sb.accent }}>{cur.onScreen}</p>
              </div>
            )}
            {/* progress dots */}
            <div className="absolute inset-x-0 top-1.5 flex gap-1 px-2">
              {sb.scenes.map((_, i) => <div key={i} className={cn('h-0.5 flex-1 rounded-full', i <= scene ? 'bg-white/80' : 'bg-white/25')} />)}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant='primary' size='sm' onClick={() => { setScene(0); setPlaying((p) => !p); }}>
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
            </Button>
            <span className="text-[11px] text-forge-dim">{sb.totalDurationS}s · {sb.scenes.length} scenes</span>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {/* THE CUTS — three renditions of the same real photos (the postcard pattern on a
              timeline). Switching rebuilds the timeline from the concept; edit lines after picking. */}
          <div className="flex flex-wrap gap-1.5">
            {VIDEO_CONCEPTS.map((c) => (
              <button key={c.id} title={`${c.blurb} (switching cuts rebuilds the timeline)`}
                onClick={() => {
                  if (!materials || c.id === concept) return;
                  // Switching cuts rebuilds the timeline — hand-edited lines would vanish
                  // silently (system scan). One honest question protects an hour of edits.
                  if (!window.confirm(`Switch to the "${c.label}" cut? The timeline rebuilds from that concept — any lines you edited on this cut are discarded.`)) return;
                  setConcept(c.id); setSb(defaultStoryboardFor(materials, title, aspect, c.id)); setScene(0); setPlaying(false);
                }}
                className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors', concept === c.id ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ASPECTS.map((a) => (
              <button key={a.id} onClick={() => { setAspect(a.id); rebuild({ aspect: a.id }); setScene(0); }}
                className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors', aspect === a.id ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                {a.label}
              </button>
            ))}
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {sb.scenes.map((s, i) => (
              <div key={i} className={cn('rounded-lg border px-2.5 py-2', i === scene ? 'border-forge-ember/50 bg-forge-ember/5' : 'border-forge-border')}>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-forge-dim">
                  <span>Scene {i + 1}</span><span>· {s.durationS}s</span><span>· {s.imageUrl ? 'photo' : 'card'}</span>
                </div>
                <input value={s.onScreen} onChange={(e) => editScene(i, { onScreen: e.target.value })} placeholder="on-screen text"
                  className="mt-1 w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                <input value={s.voiceover} onChange={(e) => editScene(i, { voiceover: e.target.value })} placeholder="voiceover / caption line"
                  className="mt-1 w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
              </div>
            ))}
          </div>

          {/* Media layers: a real TTS voiceover (per-scene, caption-aligned) + an optional CC0
              music bed. Honest: no key → the toggle degrades with setup steps, never a fake voice;
              only a track the operator attests is CC0 belongs in the music field. */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setVoiceoverOn((v) => !v)}
              className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors', voiceoverOn ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
              <Mic size={12} /> Voiceover {voiceoverOn ? 'on' : 'off'}
            </button>
            <input value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="music bed URL (CC0 mp3 — FreePD/Mixkit), optional"
              className="min-w-[220px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
            <span className="text-[11px] text-forge-dim">lane:</span>
            {(['calm', 'energetic'] as const).map((l) => (
              <button key={l} onClick={() => setLane(l)}
                title={l === 'calm' ? 'Karaoke captions, sparse sound cues' : 'Per-word pop captions, dense sound cues, riser under the hook'}
                className={cn('rounded-lg border px-2 py-1 text-[11px]', lane === l ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                {l}
              </button>
            ))}
            <button onClick={() => setSfxOpen(!sfxOpen)}
              className={cn('rounded-lg border px-2 py-1 text-[11px]', sfxKitCount(sfx) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
              Sound kit{sfxKitCount(sfx) ? ` (${sfxKitCount(sfx)})` : ''}
            </button>
          </div>
          {sfxOpen && <SoundKitFields sfx={sfx} onChange={setSfx} />}

          <div className="flex flex-wrap gap-2">
            <Button variant='primary' size='md' onClick={() => void doRender()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} Render mp4
            </Button>
            <button onClick={() => void doSave()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
              <Save size={14} /> Save storyboard
            </button>
            <button onClick={downloadSrt} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50">
              <Download size={14} /> Captions .srt
            </button>
          </div>
          {renderMsg && <p className="flex items-center gap-1.5 text-xs text-forge-dim"><Clapperboard size={12} /> {renderMsg}</p>}

          {/* THE PUBLISH CIRCUIT — a finished render queues into the ONE approval-gated publisher.
              Nothing posts here; the Queue does. AI-narrated renders carry the visible disclosure. */}
          {lastRender && (
            <div className="space-y-2 rounded-xl border border-forge-border bg-forge-raised/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-forge-ink">Queue to social</p>
                <a href={lastRender.url} target="_blank" rel="noreferrer" className="text-[11px] text-forge-ember hover:underline">watch the mp4</a>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VIDEO_PLATFORMS.map((p) => (
                  <button key={p}
                    onClick={() => setPubPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])}
                    className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors', pubPlatforms.includes(p) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                    {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
              <textarea value={pubCaption} onChange={(e) => setPubCaption(e.target.value)} rows={2} placeholder="the post caption"
                className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
              {lastRender.provenance && <p className="text-[11px] text-forge-dim">This render contains AI media — the visible AI disclosure is added to the caption and enforced again server-side.</p>}
              <Button variant='primary' size='sm' onClick={() => void doQueue()} disabled={queueing || !pubCaption.trim() || !pubPlatforms.length}>
                {queueing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue for approval
              </Button>
            </div>
          )}

          <p className="text-[11px] text-forge-dim">The preview plays your real photos with motion + captions — usable now. "Render mp4" produces a downloadable file when a render key is set (System health shows status).</p>
        </div>
      </div>
    </div>
  );
}
