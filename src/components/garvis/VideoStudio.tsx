// src/components/garvis/VideoStudio.tsx
// The video studio: build a storyboard from the world's REAL photos, watch it play in the browser
// (a real Ken-Burns slideshow with text overlays + captions — usable with ZERO setup), edit each
// scene's text, pick an aspect, download the caption .srt, save the storyboard, and render a real
// mp4 when a render key is configured (honest degradation otherwise).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, Pause, Save, Film, Download, Clapperboard } from 'lucide-react';
import { buildStoryboard, type Aspect, type Storyboard } from '../../lib/garvis/storyboard';
import {
  loadVideoMaterials, defaultStoryboardFor, saveStoryboard, startRender, pollRender, saveRenderedVideo,
  type VideoMaterials,
} from '../../lib/garvis/videoRun';
import { cn } from '../../lib/utils';

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
  const [playing, setPlaying] = useState(false);
  const [scene, setScene] = useState(0);
  const [busy, setBusy] = useState(false);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    try { await saveStoryboard(clusterId, sb); onToast('success', 'Storyboard saved into this area.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doRender = async () => {
    if (!sb) return;
    setBusy(true); setRenderMsg('Starting render…');
    try {
      const start = await startRender(sb);
      if (start.available === false) { setRenderMsg(null); onToast('info', 'Video rendering isn\'t configured on the server yet — the preview above is fully usable. (Add a render key: see the system health page.)'); return; }
      if (!start.ok || !start.id) { setRenderMsg(null); onToast('error', start.error ?? 'Render could not start.'); return; }
      await saveStoryboard(clusterId, sb).catch(() => {});
      // Poll to completion (renders take ~10-40s for short clips).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollRender(start.id);
        setRenderMsg(`Rendering… (${st.status ?? 'working'})`);
        if (st.status === 'done' && st.url) {
          await saveRenderedVideo(clusterId, sb.title, st.url);
          setRenderMsg(null);
          onToast('success', 'Video rendered — saved to this area.');
          window.open(st.url, '_blank');
          return;
        }
        if (st.status === 'failed') { setRenderMsg(null); onToast('error', 'The render failed on the provider.'); return; }
      }
      setRenderMsg(null); onToast('info', 'Render is taking longer than expected — it will appear as an artifact when done.');
    } catch (e) { setRenderMsg(null); onToast('error', e instanceof Error ? e.message : 'Render failed.'); }
    finally { setBusy(false); }
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
            <button onClick={() => { setScene(0); setPlaying((p) => !p); }} className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04]">
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
            </button>
            <span className="text-[11px] text-forge-dim">{sb.totalDurationS}s · {sb.scenes.length} scenes</span>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-3">
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

          <div className="flex flex-wrap gap-2">
            <button onClick={() => void doRender()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-2 text-sm font-medium text-[#1A0E04] disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} Render mp4
            </button>
            <button onClick={() => void doSave()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
              <Save size={14} /> Save storyboard
            </button>
            <button onClick={downloadSrt} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50">
              <Download size={14} /> Captions .srt
            </button>
          </div>
          {renderMsg && <p className="flex items-center gap-1.5 text-xs text-forge-dim"><Clapperboard size={12} /> {renderMsg}</p>}
          <p className="text-[11px] text-forge-dim">The preview plays your real photos with motion + captions — usable now. "Render mp4" produces a downloadable file when a render key is set (System health shows status).</p>
        </div>
      </div>
    </div>
  );
}
