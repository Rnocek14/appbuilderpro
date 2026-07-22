// src/pages/SceneStudio.tsx  (/garvis/scenes)
// SCENE STUDIO — build the curated library of photoreal scroll clips with Google Veo 3.1. Generate a
// clip per trade (water rushing down a pipe → it bursts → a clamp seals it), preview it, and APPROVE
// the keeper. Approved clips are what the site generator drops into demos in that trade. This is the
// human-in-the-loop half: AI video is hit-or-miss, so nothing reaches a client's site un-reviewed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Loader2, Check, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { SCENE_PROMPTS, VIDEO_SCENE_KINDS, type VideoSceneKind } from '../lib/garvis/videoScenes';

interface Scene {
  id: string; scene_kind: VideoSceneKind; status: 'generating' | 'ready' | 'approved' | 'failed';
  prompt: string; video_url: string | null; cost_usd: number; error: string | null;
  created_at: string; approved_at: string | null;
}
const TONE: Record<Scene['status'], 'ember' | 'ok' | 'warn' | 'dim'> = { generating: 'ember', ready: 'warn', approved: 'ok', failed: 'dim' };

export default function SceneStudio() {
  const [scenes, setScenes] = useState<Scene[] | null | 'error'>(null);
  const [kind, setKind] = useState<VideoSceneKind>('pipe');
  const [prompt, setPrompt] = useState(SCENE_PROMPTS.pipe.prompt);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const invoke = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data, error } = await supabase.functions.invoke('generate-video', { body });
    if (error) return { error: error.message };
    return (data ?? {}) as Record<string, unknown>;
  }, []);

  const load = useCallback(async () => {
    const d = await invoke({ action: 'list' });
    if (d.error || !d.ok) { setScenes('error'); return; }
    setScenes((d.scenes ?? []) as Scene[]);
  }, [invoke]);
  useEffect(() => { void load(); }, [load]);

  // Poll any generating scenes until they resolve (Veo takes 1–5 min).
  useEffect(() => {
    const generating = scenes && scenes !== 'error' ? scenes.filter((s) => s.status === 'generating') : [];
    if (!generating.length) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      for (const s of generating) await invoke({ action: 'poll', sceneId: s.id });
      await load();
    }, 10_000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [scenes, invoke, load]);

  const onKind = (k: VideoSceneKind) => { setKind(k); setPrompt(SCENE_PROMPTS[k].prompt); };

  const generate = async () => {
    setBusy(true); setMsg('Sending to Veo…');
    const d = await invoke({ action: 'start', sceneKind: kind, prompt });
    setBusy(false);
    if (d.error || !d.ok) { setMsg((d.error as string) ?? 'Could not start generation.'); return; }
    setMsg('Generating — Veo takes a few minutes. It’ll appear below and update on its own.');
    await load();
  };

  const approve = async (id: string) => { await invoke({ action: 'approve', sceneId: id }); await load(); };

  const list = scenes === null || scenes === 'error' ? [] : scenes;
  const approvedKinds = new Set(list.filter((s) => s.status === 'approved').map((s) => s.scene_kind));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Film size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Scene Studio</h1>
            <p className="text-sm text-forge-dim">Generate photoreal scroll clips with Veo — one per trade, reused across every demo. Preview, then <span className="font-medium text-forge-ember">approve</span> the keeper.</p>
          </div>
          <button onClick={() => void load()} title="Refresh" className="rounded-lg border border-forge-border p-2 text-forge-dim hover:text-forge-ink">
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Generator */}
        <div className="mb-6 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {VIDEO_SCENE_KINDS.map((k) => (
              <button key={k} onClick={() => onKind(k)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  kind === k ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
                {SCENE_PROMPTS[k].label}{approvedKinds.has(k) && <Check size={11} className="ml-1 inline text-forge-ok" />}
              </button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
            className="w-full resize-y rounded-lg border border-forge-border bg-forge-bg p-3 text-sm text-forge-ink placeholder:text-forge-dim focus:border-forge-ember focus:outline-none"
            placeholder="Describe the shot…" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={() => void generate()} disabled={busy || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-forge-ember px-3.5 py-2 text-sm font-semibold text-forge-bg shadow transition-transform hover:-translate-y-0.5 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate clip
            </button>
            <span className="min-w-0 flex-1 text-xs text-forge-dim">{msg ?? 'A 4K clip costs ~$4–6 on Veo and takes a few minutes. Generate a few, keep the best.'}</span>
          </div>
        </div>

        {/* Library */}
        {scenes === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the library…</p>
        ) : scenes === 'error' ? (
          <p className="text-sm text-forge-dim">Couldn’t load the library — the scene migration may not be applied yet, or <span className="text-forge-ink">GEMINI_API_KEY</span> isn’t set.</p>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-center">
            <p className="text-sm font-medium text-forge-ink">No clips yet</p>
            <p className="mt-1 text-xs text-forge-dim">Pick a trade above and generate your first scene.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((s) => (
              <li key={s.id} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-forge-ink">{SCENE_PROMPTS[s.scene_kind]?.label ?? s.scene_kind}</span>
                  <Badge tone={TONE[s.status]}>{s.status}</Badge>
                  {s.cost_usd > 0 && <span className="text-[11px] text-forge-dim">${s.cost_usd.toFixed(2)}</span>}
                  <span className="ml-auto text-[11px] text-forge-dim">{timeAgo(s.created_at)}</span>
                </div>
                {s.status === 'generating' && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-forge-dim"><Loader2 size={12} className="animate-spin" /> Rendering on Veo — this updates automatically.</p>
                )}
                {s.status === 'failed' && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-forge-err"><AlertTriangle size={12} /> {s.error ?? 'Generation failed.'}</p>
                )}
                {s.video_url && (s.status === 'ready' || s.status === 'approved') && (
                  <div className="mt-2">
                    <video src={s.video_url} controls loop muted playsInline className="w-full rounded-lg border border-forge-border" />
                    {s.status === 'ready' && (
                      <button onClick={() => void approve(s.id)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forge-ok/15 px-3 py-1.5 text-xs font-semibold text-forge-ok hover:bg-forge-ok/25">
                        <Check size={13} /> Approve for {SCENE_PROMPTS[s.scene_kind]?.label ?? s.scene_kind} sites
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-2 line-clamp-2 text-[11px] text-forge-dim/80">{s.prompt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
