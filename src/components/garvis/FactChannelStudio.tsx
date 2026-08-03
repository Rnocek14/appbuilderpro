// src/components/garvis/FactChannelStudio.tsx
// THE FACT CHANNEL STUDIO — the faceless-channel production line, end to end in one panel:
//   channel (a distinct niche brand, NOT a clone farm) → cited script draft (3 hook variants) →
//   AI illustrations per beat → TTS narration + captions → rendered 9:16 mp4 (finalized durably) →
//   queued into the ONE approval-gated publisher for TikTok / YouTube Shorts / Reels.
// Honesty spine throughout: scripts carry SOURCES (uncited claims are flagged needs_review,
// visibly); every AI asset is provenance-stamped at generation; the caption carries the visible AI
// disclosure and the server-side publish gate enforces it fail-closed; nothing posts without the
// owner's approval in the Queue.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Film, Send, Plus, BookOpenCheck, AlertTriangle, Clapperboard } from 'lucide-react';
import {
  parseFactScript, scriptToScenes, scriptTotalSeconds, bandCheck, illustrationPrompt, composeCaption,
  ctaLink, deliveryInstructions, CHANNEL_PRESETS, type FactScript,
} from '../../lib/garvis/factChannel';
import {
  listChannels, createChannel, listEpisodes, draftEpisode, updateEpisode, generateSceneImage,
  queueEpisodePost, loadChannelPerf, setChannelCta, createVariantEpisode, setChannelCadence, getChannelCadenceOrderId,
  type GrowthChannel, type ChannelEpisode, type ChannelPerf,
} from '../../lib/garvis/channelsRun';
import { classifyEpisode, perfLine } from '../../lib/garvis/growthLoop';
import { channelPulse } from '../../lib/garvis/channelPulse';
import { scriptToShotList, type SfxKit } from '../../lib/garvis/ugcEdit';
import { loadSfxKit, sfxKitCount } from '../../lib/garvis/sfxStore';
import { SoundKitFields } from './SoundKitFields';
import { buildStoryboard, buildTimedCaptionsSrt, type WordTiming } from '../../lib/garvis/storyboard';
import { planEmphasis } from '../../lib/garvis/editPlan';
import { generateVoiceover, saveSrtAsset, startRender, pollRender, saveRenderedVideo } from '../../lib/garvis/videoRun';
import { volumeForMusic } from '../../lib/garvis/musicBed';
import { aiProvenance } from '../../lib/garvis/mediaProvenance';
import { PLATFORM_LABEL, type Platform } from '../../lib/garvis/social';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

const VIDEO_PLATFORMS: Platform[] = ['tiktok', 'youtube', 'instagram', 'facebook'];

// The drafted script doubles as an on-camera filming sheet (the UGC lane) — downloaded as a .txt
// the operator takes to the kitchen table.
function downloadShotList(ep: ChannelEpisode, script: FactScript): void {
  const blob = new Blob([scriptToShotList(script, ep.hook_index)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shot-list-${(ep.title || 'episode').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'episode'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FactChannelStudio({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (k: 'success' | 'error' | 'info', m: string) => void;
}) {
  const [channels, setChannels] = useState<GrowthChannel[] | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<ChannelEpisode[]>([]);
  const [topic, setTopic] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [openEpisode, setOpenEpisode] = useState<string | null>(null);
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [perf, setPerf] = useState<ChannelPerf | null>(null);
  const [cadenceOn, setCadenceOn] = useState<boolean | null>(null);
  const [ctaDraft, setCtaDraft] = useState('');
  const [lane, setLane] = useState<'calm' | 'energetic'>('calm');
  const [sfx, setSfx] = useState<SfxKit>(loadSfxKit);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [epFilter, setEpFilter] = useState<'all' | 'needs_action' | 'posted'>('all');

  const channel = channels?.find((c) => c.id === channelId) ?? null;

  // THE PULSE — where this channel is in the multi-month arc (day N, streak, trend, the coach
  // read). Computed from the posts' REAL posted_at dates; the pure core stays deterministic.
  const pulse = useMemo(() => channel ? channelPulse(
    channel.created_at,
    episodes.map((ep) => ({
      postedAt: perf?.postedAt.get(ep.id) ?? null,
      views: perf?.byEpisode.get(ep.id)?.reach ?? null,
    })),
    new Date().toISOString(),
  ) : null, [channel, episodes, perf]);

  const reloadChannels = () => listChannels(worldId)
    .then((cs) => { setChannels(cs); setChannelId((cur) => cur ?? cs[0]?.id ?? null); })
    .catch((e) => onToast('error', e instanceof Error ? e.message : 'Could not load channels.'));
  useEffect(() => { void reloadChannels(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!channelId) { setEpisodes([]); return; }
    void listEpisodes(channelId).then(setEpisodes).catch(() => setEpisodes([]));
    setCtaDraft(channels?.find((c) => c.id === channelId)?.cta_url ?? '');
    setCadenceOn(null);
    void getChannelCadenceOrderId(channelId).then((id) => setCadenceOn(!!id)).catch(() => setCadenceOn(false));
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // THE LOOP'S READ SIDE: join episodes → posts → synced metrics. Re-runs when episodes change.
  useEffect(() => {
    if (!episodes.length) { setPerf(null); return; }
    let live = true;
    void loadChannelPerf(episodes).then((p) => { if (live) setPerf(p); }).catch(() => {});
    return () => { live = false; };
  }, [episodes]);

  const doCreate = async (presetId: string) => {
    const p = CHANNEL_PRESETS.find((x) => x.id === presetId)!;
    setBusy(true);
    try {
      const c = await createChannel({
        worldId, clusterId, name: p.label, niche: p.niche, persona: p.persona,
        platforms: ['tiktok', 'youtube', 'instagram'], visualStyle: p.visualStyle, musicMood: p.mood,
        voice: p.voice,
      });
      setChannels((cur) => [...(cur ?? []), c]); setChannelId(c.id);
      onToast('success', `Channel "${c.name}" created — one distinct brand, its own look and voice.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create the channel.'); }
    finally { setBusy(false); }
  };

  const doDraft = async (topicOverride?: string) => {
    if (!channel) return;
    setBusy(true); setProgress('Drafting a cited script…');
    try {
      // The loop closes here: hooks that won/died on THIS channel steer the next draft.
      const { episode, warnings } = await draftEpisode(channel, topicOverride ?? topic, perf?.intel);
      setEpisodes((cur) => [episode, ...cur]); setOpenEpisode(episode.id); setTopic('');
      onToast('success', `Drafted "${episode.title}" — pick a hook, review the sources, then produce.`);
      for (const w of warnings) onToast('info', w);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The draft failed.'); }
    finally { setBusy(false); setProgress(null); }
  };

  const patchEpisode = (id: string, patch: Partial<ChannelEpisode>) =>
    setEpisodes((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const doProduce = async (ep: ChannelEpisode) => {
    if (!channel || !ep.script) return;
    const parsed = parseFactScript(ep.script);
    if (!parsed.ok) { onToast('error', parsed.reason); return; }
    const script = parsed.script;
    setBusy(true);
    try {
      const { scenes, imagePrompts } = scriptToScenes(script, ep.hook_index);

      // Illustrate every beat — one image per UNIQUE prompt (the hook reuses beat 1's art), each
      // provenance-stamped by generate-image. Sequential on purpose: honest progress, metered
      // spend. A B-cut (or a re-produce after a failure) REUSES the saved art — same beats, same
      // frames, only the hook differs: the comparison the loop can actually trust, for pennies.
      let imageUrls = ep.assets?.imageUrls ?? [];
      if (imageUrls.length !== scenes.length || !imageUrls.every(Boolean)) {
        // Seed from any partial art already paid for (a mid-run failure persists what it made).
        const byPrompt = new Map<string, string>();
        imagePrompts.forEach((pr, i) => { if (pr && imageUrls[i]) byPrompt.set(pr, imageUrls[i]); });
        const uniquePrompts = [...new Set(imagePrompts.filter(Boolean))].filter((pr) => !byPrompt.has(pr));
        try {
          for (let i = 0; i < uniquePrompts.length; i++) {
            setProgress(`Illustrating beat ${i + 1}/${uniquePrompts.length}…`);
            byPrompt.set(uniquePrompts[i], await generateSceneImage(
              illustrationPrompt(uniquePrompts[i], channel.visual_style), clusterId, `${script.title} — beat art`,
            ));
          }
        } finally {
          // Persist whatever was made even when a beat fails — paid art is never thrown away.
          imageUrls = imagePrompts.map((p) => byPrompt.get(p) ?? '');
          if (byPrompt.size) {
            await updateEpisode(ep.id, { assets: { imageUrls } }).catch(() => {});
            patchEpisode(ep.id, { assets: { imageUrls } });
          }
        }
      }
      const withArt = scenes.map((s, i) => ({ ...s, imageUrl: imageUrls[i] || null }));
      const sb = buildStoryboard({ title: script.title, aspect: '9:16', accent: '#FF8A3D', scenes: withArt });

      setProgress('Narrating…');
      // The delivery direction — energetic documentary pacing with the channel's persona woven in.
      const vo = await generateVoiceover(sb, clusterId, { voice: channel.voice, instructions: deliveryInstructions(channel.persona) });
      if (vo.available === false) { onToast('info', 'Voiceover isn\'t configured — set OPENAI_API_KEY in the edge secrets first.'); return; }
      if (!vo.ok || !vo.clips?.length) { onToast('error', vo.error ?? 'The voiceover failed.'); return; }
      // Word-EXACT captions when the provider returned timing (ElevenLabs); proportional otherwise.
      const timings: (WordTiming[] | null)[] = [];
      for (const c of vo.clips) timings[c.sceneIndex] = c.words ?? null;
      const srtUrl = await saveSrtAsset(clusterId, sb, buildTimedCaptionsSrt(sb.scenes, timings)).catch(() => null);

      setProgress('Rendering the mp4…');
      // The whole episode is AI-made (script, art, voice) — stamped as such, disclosed at publish.
      const provenance = aiProvenance('video', 'fact-channel-studio', Date.now());
      const start = await startRender(sb, {
        voClips: vo.clips, srtUrl: srtUrl ?? undefined,
        ...(musicUrl.trim() ? { musicUrl: musicUrl.trim(), musicVolume: volumeForMusic(true) } : {}),
        lane, ...(sfxKitCount(sfx) ? { sfx } : {}),
        emphasisIndices: planEmphasis(sb.scenes),
      });
      if (start.available === false) { onToast('info', 'Rendering isn\'t configured — add SHOTSTACK_API_KEY (see System health).'); return; }
      if (!start.ok || !start.id) { onToast('error', start.error ?? 'The render could not start.'); return; }
      // Persist the render id NOW — a timed-out poll must be recoverable from the card, not lost.
      await updateEpisode(ep.id, { render_id: start.id }).catch(() => {});
      patchEpisode(ep.id, { render_id: start.id });

      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollRender(start.id, { clusterId, aiProvenance: provenance });
        setProgress(`Rendering… (${st.status ?? 'working'})`);
        if (st.status === 'done' && st.url) {
          await saveRenderedVideo(clusterId, script.title, st.url, start.id);
          await updateEpisode(ep.id, { status: 'rendered', render_id: start.id, video_url: st.url, srt_url: srtUrl });
          patchEpisode(ep.id, { status: 'rendered', render_id: start.id, video_url: st.url, srt_url: srtUrl });
          onToast('success', st.durable ? 'Episode rendered — durable mp4 saved. Queue it below.' : 'Episode rendered (provider copy only — check storage).');
          return;
        }
        if (st.status === 'failed') { await updateEpisode(ep.id, { status: 'failed', error: 'render failed' }); patchEpisode(ep.id, { status: 'failed' }); onToast('error', 'The render failed on the provider.'); return; }
      }
      onToast('info', 'The render is taking longer than expected — poll again from the episode card.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Production failed.';
      await updateEpisode(ep.id, { status: 'failed', error: msg }).catch(() => {});
      patchEpisode(ep.id, { status: 'failed', error: msg });
      onToast('error', msg);
    } finally { setBusy(false); setProgress(null); }
  };

  // THE HOOK LAB: spin a B-cut with a different hook, reusing the parent's art, and produce it.
  const doVariant = async (ep: ChannelEpisode, hookIndex: number) => {
    if (busy) return;      // the create round-trip must not leave a window for a second production
    setBusy(true);
    try {
      const cut = await createVariantEpisode(ep, hookIndex);
      setEpisodes((cur) => [cut, ...cur]); setOpenEpisode(cut.id);
      onToast('info', 'B-cut created — same video, different hook. Post cuts hours apart so each gets its own test window.');
      await doProduce(cut);
    } catch (e) { setBusy(false); onToast('error', e instanceof Error ? e.message : 'Could not create the B-cut.'); }
  };

  // A render whose poll timed out is finished on Shotstack's side minutes later — one click
  // finalizes it into durable storage instead of re-spending VO + render.
  const doCheckRender = async (ep: ChannelEpisode) => {
    if (!ep.render_id) return;
    setBusy(true); setProgress('Checking the render…');
    try {
      const st = await pollRender(ep.render_id, { clusterId, aiProvenance: aiProvenance('video', 'fact-channel-studio', Date.now()) });
      if (st.status === 'done' && st.url) {
        await updateEpisode(ep.id, { status: 'rendered', video_url: st.url });
        patchEpisode(ep.id, { status: 'rendered', video_url: st.url });
        onToast('success', st.durable ? 'Render recovered — durable mp4 saved.' : 'Render recovered (provider copy).');
      } else if (st.status === 'failed') {
        await updateEpisode(ep.id, { status: 'failed', error: 'render failed' });
        patchEpisode(ep.id, { status: 'failed' });
        onToast('error', 'The render failed on the provider.');
      } else {
        onToast('info', `Still rendering (${st.status ?? 'working'}) — check again in a minute.`);
      }
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not check the render.'); }
    finally { setBusy(false); setProgress(null); }
  };

  const doQueue = async (ep: ChannelEpisode) => {
    if (!channel || !ep.video_url || !ep.script) return;
    // Re-queue after a failure creates a FRESH post row + approval — the failed row stays as
    // honest history; social-publish (correctly) refuses to resurrect a failed post.
    const parsed = parseFactScript(ep.script);
    if (!parsed.ok) { onToast('error', parsed.reason); return; }
    setQueueingId(ep.id);
    try {
      const platforms = (channel.platforms.length ? channel.platforms : ['tiktok', 'youtube']).filter((p): p is Platform => (VIDEO_PLATFORMS as string[]).includes(p));
      const out = await queueEpisodePost({
        episode: ep, channel, caption: composeCaption(parsed.script, ctaLink(channel.cta_url, channel.id, ep.id)),
        platforms: platforms.length ? platforms : ['youtube'],
        videoUrl: ep.video_url, provenance: aiProvenance('video', 'fact-channel-studio', Date.now()),
      });
      patchEpisode(ep.id, { status: 'queued', post_id: out.postId });
      onToast('success', 'Queued — approve it in the Queue and it posts to the channel\'s platforms.');
      for (const w of out.warnings) onToast('info', w);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the episode.'); }
    finally { setQueueingId(null); }
  };

  if (channels === null) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading channels…</div>;

  return (
    <div className="mt-6 rounded-2xl border border-forge-border bg-forge-raised/40 p-4">
      <div className="flex items-center gap-2">
        <BookOpenCheck size={15} className="text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Fact Channel Studio</h3>
        <span className="text-[11px] text-forge-dim">cited script → illustrated beats → narrated 9:16 mp4 → approval-gated publish</span>
      </div>

      {/* Channel roster — a handful of DISTINCT brands. The presets are different postures on purpose. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {channels.map((c) => (
          <button key={c.id} onClick={() => setChannelId(c.id)}
            className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors', c.id === channelId ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
            {c.name}
          </button>
        ))}
        {CHANNEL_PRESETS.filter((p) => !channels.some((c) => c.name === p.label)).map((p) => (
          <button key={p.id} onClick={() => void doCreate(p.id)} disabled={busy} title={p.persona}
            className="flex items-center gap-1 rounded-lg border border-dashed border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
            <Plus size={11} /> {p.label}
          </button>
        ))}
      </div>

      {channel && (
        <>
          <p className="mt-2 text-[11px] text-forge-dim">
            {channel.niche} · posts to {channel.platforms.join(', ') || '—'} · voice "{channel.voice}"
            {perf?.baseline !== null && perf?.baseline !== undefined && <> · baseline {Math.round(perf.baseline).toLocaleString()} views/episode</>}
            {perf?.intel.winningHooks.length ? <> · {perf.intel.winningHooks.length} winning hook{perf.intel.winningHooks.length === 1 ? '' : 's'} feeding new drafts</> : null}
            {cadenceOn !== null && (
              <button onClick={() => { const next = !cadenceOn; setCadenceOn(next); void setChannelCadence(channel, next).then(() => onToast('success', next ? 'Daily auto-draft ON — a cited script lands here every day; you review, produce, and approve.' : 'Daily auto-draft off.')).catch((e) => { setCadenceOn(!next); onToast('error', e instanceof Error ? e.message : 'Could not change the cadence.'); }); }}
                className={cn('ml-2 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors', cadenceOn ? 'border-forge-ok/50 text-forge-ok' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                auto-draft daily: {cadenceOn ? 'on' : 'off'}
              </button>
            )}
          </p>
          {/* THE PULSE — the multi-month instrument: day N against the 45-75 inflection window,
              the posting streak (consistency is the input that compounds), the honest trend. */}
          {pulse && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 rounded-lg border border-forge-border bg-forge-bg/60 px-2.5 py-1.5 text-[11px] text-forge-ink">
              <span className="font-semibold">{pulse.stats}</span>
              {pulse.spark.length >= 3 && (
                <svg width="64" height="14" viewBox="0 0 64 14" className="inline-block" aria-label="recent views">
                  <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-forge-ember" points={
                    pulse.spark.map((v, i) => {
                      const max = Math.max(...pulse.spark, 1);
                      const x = pulse.spark.length === 1 ? 32 : (i / (pulse.spark.length - 1)) * 60 + 2;
                      return `${x.toFixed(1)},${(12 - (v / max) * 10).toFixed(1)}`;
                    }).join(' ')} />
                </svg>
              )}
              <span className="text-forge-dim">— {pulse.read}</span>
            </p>
          )}
          {/* THE MONEY ROUTE — one destination per channel; every caption carries it, src-stamped
              so your own sites answer "which channel sold this" through site_events. */}
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={ctaDraft} onChange={(e) => setCtaDraft(e.target.value)} placeholder="destination link (your app / shop / page) — rides every caption, src-tagged"
              className="min-w-[280px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
            {ctaDraft.trim() !== channel.cta_url && (
              <button onClick={() => { void setChannelCta(channel.id, ctaDraft, channel.cta_label).then(() => { void reloadChannels(); onToast('success', 'Destination saved — new episodes link to it.'); }).catch((e) => onToast('error', e instanceof Error ? e.message : 'Could not save.')); }}
                className="rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">
                Save destination
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic (optional — blank lets it pick one in the niche)"
              className="min-w-[240px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <input value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder="music bed URL (CC0 mp3), optional"
              className="min-w-[200px] rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
            <Button variant='primary' size='sm' onClick={() => void doDraft()} disabled={busy}>
              {busy && progress?.startsWith('Drafting') ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Draft a cited episode
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-forge-dim">edit lane:</span>
            {(['calm', 'energetic'] as const).map((l) => (
              <button key={l} onClick={() => setLane(l)}
                title={l === 'calm' ? 'Educational: karaoke captions, sparse sound cues (the caregiver default)' : 'High-energy: per-word pop captions, dense sound cues, riser under the hook'}
                className={cn('rounded-lg border px-2 py-1', lane === l ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                {l}
              </button>
            ))}
            <button onClick={() => setSfxOpen(!sfxOpen)}
              className={cn('rounded-lg border px-2 py-1', sfxKitCount(sfx) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
              Sound kit{sfxKitCount(sfx) ? ` (${sfxKitCount(sfx)})` : ''}
            </button>
            <span className="text-forge-dim">— whooshes ride the scene cuts on the next Produce</span>
          </div>
          {sfxOpen && <SoundKitFields sfx={sfx} onChange={setSfx} />}
          {progress && <p className="mt-2 flex items-center gap-1.5 text-xs text-forge-dim"><Loader2 size={12} className="animate-spin" /> {progress}</p>}

          {/* Month-scale triage: the list shows the recent 20; these chips answer "what needs me"
              without scrolling past what's already out. */}
          {episodes.length > 3 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              {([['all', 'All'], ['needs_action', 'Needs me'], ['posted', 'Posted']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setEpFilter(id)}
                  className={cn('rounded-lg border px-2 py-1', epFilter === id ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-2">
            {episodes.filter((ep) => {
              if (epFilter === 'all') return true;
              const live = perf?.liveStatus.get(ep.id);
              const st = live === 'posted' ? 'posted' : live === 'failed' ? 'failed' : ep.status;
              return epFilter === 'posted' ? st === 'posted' : st !== 'posted' && st !== 'queued';
            }).map((ep) => {
              const parsed = ep.script ? parseFactScript(ep.script) : null;
              const script: FactScript | null = parsed?.ok ? parsed.script : null;
              const open = openEpisode === ep.id;
              const total = script ? scriptTotalSeconds(script) : 0;
              const band = script ? bandCheck(total) : null;
              // Live truth beats the stored snapshot: the publisher's own record decides. A FAILED
              // post must never hide behind a stale 'queued' — that silent outage kills the
              // day-45-75 compounding the whole strategy leans on.
              const live = perf?.liveStatus.get(ep.id);
              const liveStatus = live === 'posted' ? 'posted' : live === 'failed' ? 'failed' : ep.status;
              const liveError = ep.error ?? perf?.liveError.get(ep.id) ?? null;
              const epPerf = perf?.byEpisode.get(ep.id) ?? null;
              const verdict = epPerf ? classifyEpisode(epPerf, perf?.baseline ?? null).verdict : null;
              return (
                <div key={ep.id} className="rounded-xl border border-forge-border p-3">
                  <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpenEpisode(open ? null : ep.id)}>
                    <span className="text-xs font-semibold text-forge-ink">
                      {ep.title || 'Untitled'}
                      {ep.variant_of && <span className="ml-1.5 rounded border border-forge-border px-1 text-[10px] text-forge-dim">B-CUT</span>}
                      {verdict === 'winner' && <span className="ml-1.5 text-[10px] font-bold text-green-500">WINNER</span>}
                    </span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                      liveStatus === 'posted' ? 'border-green-600/50 text-green-500'
                        : liveStatus === 'queued' ? 'border-forge-ember/50 text-forge-ember'
                        : liveStatus === 'failed' ? 'border-red-600/50 text-red-500' : 'border-forge-border text-forge-dim')}>
                      {liveStatus}
                    </span>
                  </button>
                  {epPerf && liveStatus === 'posted' && (
                    <p className="mt-1 text-[11px] text-forge-dim">{perfLine(epPerf, perf?.baseline ?? null)}</p>
                  )}
                  {liveStatus === 'failed' && (
                    <div className="mt-1 space-y-1">
                      {liveError && <p className="text-[11px] text-red-500">{liveError}</p>}
                      {ep.video_url && (
                        <button onClick={() => void doQueue(ep)} disabled={queueingId === ep.id}
                          className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
                          Queue again (new post)
                        </button>
                      )}
                    </div>
                  )}
                  {ep.status === 'draft' && ep.render_id && !ep.video_url && (
                    <button onClick={() => void doCheckRender(ep)} disabled={busy}
                      className="mt-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
                      Check render (it kept going after the timeout)
                    </button>
                  )}
                  {verdict === 'winner' && (
                    <button onClick={() => { setOpenEpisode(null); void doDraft(`A follow-up going deeper on the winning idea "${ep.title}" — same mechanism, a new surprising angle (part 2, not a rehash).`); }}
                      disabled={busy}
                      className="mt-1 rounded-lg border border-green-600/40 px-2 py-1 text-[11px] text-green-500 hover:border-green-500 disabled:opacity-60">
                      Draft a follow-up to this winner
                    </button>
                  )}
                  {open && script && (
                    <div className="mt-2 space-y-2">
                      {script.needsReview && (
                        <p className="flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-500">
                          <AlertTriangle size={12} /> Unverified claims — no sources came back. Review every line before producing.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {script.hooks.map((h, i) => (
                          <button key={i} title="the opening line this cut tests"
                            onClick={() => { void updateEpisode(ep.id, { hook_index: i }).catch(() => onToast('info', 'Could not save the hook choice — it may revert on reload.')); patchEpisode(ep.id, { hook_index: i }); }}
                            className={cn('rounded-lg border px-2 py-1 text-[11px] transition-colors', ep.hook_index === i ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                            Hook {i + 1}: {h}
                          </button>
                        ))}
                      </div>
                      <ol className="max-h-40 space-y-1 overflow-y-auto pr-1 text-[11px] text-forge-dim">
                        {script.scenes.map((s, i) => <li key={i}>{i + 1}. [{s.seconds}s] {s.voiceover} <span className="text-forge-dim/60">· {s.onScreen}</span></li>)}
                      </ol>
                      <p className="text-[11px] text-forge-dim">
                        {band?.note ?? `~${total}s — inside the monetizable 60-90s band.`}
                        {script.sources.length > 0 && <> · {script.sources.length} source{script.sources.length === 1 ? '' : 's'}: {script.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-forge-ember hover:underline"> [{i + 1}]</a>)}</>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(ep.status === 'draft' || ep.status === 'failed') && (
                          <Button variant='primary' size='sm' onClick={() => void doProduce(ep)} disabled={busy}>
                            <Film size={13} /> Produce (illustrate → narrate → render)
                          </Button>
                        )}
                        {ep.video_url && <a href={ep.video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50">watch the mp4</a>}
                        {ep.status === 'rendered' && ep.video_url && (
                          <Button variant='primary' size='sm' onClick={() => void doQueue(ep)} disabled={queueingId === ep.id}>
                            {queueingId === ep.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue to {channel.platforms.join(' + ') || 'social'}
                          </Button>
                        )}
                        {ep.status === 'rendered' && !ep.variant_of && script.hooks.map((_, i) => i !== ep.hook_index && (
                          <button key={i} onClick={() => void doVariant(ep, i)} disabled={busy}
                            title="Same video, this hook instead — reuses the art, costs only a new voiceover + render"
                            className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
                            B-cut with hook {i + 1}
                          </button>
                        ))}
                        {/* THE ON-CAMERA FORK: same script, filmed by a human instead of narrated by
                            TTS — the sheet groups every line by station, then the takes come back
                            through the UGC Studio below. Faces beat slides on retention. */}
                        <button onClick={() => downloadShotList(ep, script)}
                          title="Film this episode yourself: a station-grouped filming sheet with your lines verbatim. Cut the takes in the UGC Studio below."
                          className="flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40">
                          <Clapperboard size={12} /> Shot list (film it yourself)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!episodes.length && <p className="text-[11px] text-forge-dim">No episodes yet — draft the first one. Daily consistency is what compounds; channels typically inflect around day 45-75.</p>}
          </div>
        </>
      )}
    </div>
  );
}
