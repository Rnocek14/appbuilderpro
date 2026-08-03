// src/components/garvis/UgcStudio.tsx
// THE UGC STUDIO — the own-footage lane: upload real takes (kitchen-table talking head, product
// demos), and the machine applies the researched native edit — hard cuts, alternating punch-ins,
// word-karaoke captions from the footage's OWN audio, a frame-one hook card, optional AI diagram
// cutaways — then renders and queues through the same approval-gated publisher as everything else.
// THE DOCTRINE (hybrid research, encoded): the human testifies, AI illustrates. Real footage is the
// spine and is never AI-altered; stylized AI cutaways are provenance-stamped and the caption says
// "Illustrations AI-assisted"; a video with NO AI elements carries no provenance — honestly.

import { useState } from 'react';
import { Loader2, Upload, Film, Send, Sparkles, Scissors, Volume2 } from 'lucide-react';
import { buildUgcEdit, describeUgcEdit, type SfxKit, type UgcBroll, type UgcTake } from '../../lib/garvis/ugcEdit';
import { detectSpeech, segmentsToTakes, cutSummary } from '../../lib/garvis/autoCut';
import { loadSfxKit, sfxKitCount } from '../../lib/garvis/sfxStore';
import { SoundKitFields } from './SoundKitFields';
import { startRenderEdit, pollRender, uploadTake, saveRenderedVideo, analyzeTakeAudio } from '../../lib/garvis/videoRun';
import { generateSceneImage } from '../../lib/garvis/channelsRun';
import { illustrationPrompt } from '../../lib/garvis/factChannel';
import { aiProvenance, withDisclosure, type AiProvenance } from '../../lib/garvis/mediaProvenance';
import { queueSocialPost } from '../../lib/garvis/socialRun';
import { PLATFORM_LABEL, type Platform } from '../../lib/garvis/social';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

const PLATFORMS: Platform[] = ['tiktok', 'youtube', 'instagram', 'facebook'];

export function UgcStudio({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (k: 'success' | 'error' | 'info', m: string) => void;
}) {
  const [takes, setTakes] = useState<UgcTake[]>([]);
  const [hook, setHook] = useState('');
  const [cutPrompt, setCutPrompt] = useState('');
  const [cutAt, setCutAt] = useState('8');
  const [broll, setBroll] = useState<UgcBroll[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; provenance: AiProvenance | null } | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['tiktok', 'youtube', 'instagram']);
  const [caption, setCaption] = useState('');
  const [autoCut, setAutoCut] = useState(true);
  const [lane, setLane] = useState<'calm' | 'energetic'>('calm');
  const [sfx, setSfx] = useState<SfxKit>(loadSfxKit);
  const [sfxOpen, setSfxOpen] = useState(false);

  const sfxCount = sfxKitCount(sfx);
  const editOpts = () => ({ hookText: hook, broll, lane, ...(sfxCount ? { sfx } : {}) });

  // Upload, then AUTO-CUT: decode the take's audio in the browser, find the speech, and split the
  // take into precisely-trimmed sub-clips — every pause >0.5s (0.3s on the energetic lane) becomes
  // a jump cut the punch alternation then disguises. Undecodable audio keeps the take whole.
  const doUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('Uploading takes…');
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('video/')) { onToast('info', `${f.name} isn't a video — skipped.`); continue; }
        const url = await uploadTake(clusterId, f);
        const audio = autoCut ? await analyzeTakeAudio(f) : null;
        if (audio) {
          const segs = detectSpeech(audio.envelope, audio.windowS, audio.durationS, lane === 'energetic' ? { cutGapS: 0.3 } : undefined);
          setTakes((cur) => [...cur, ...segmentsToTakes(url, segs)]);
          onToast('info', `${f.name}: ${cutSummary(segs, audio.durationS)}.`);
        } else {
          if (autoCut) onToast('info', `${f.name}: couldn't read the audio — keeping the take whole.`);
          setTakes((cur) => [...cur, { url }]);
        }
      }
      onToast('success', 'Takes uploaded — order is the cut order.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setBusy(null); }
  };

  // AI illustrates: a stylized diagram cutaway, provenance-stamped at generation, layered OVER the
  // continuous voice — the claim always stays on camera.
  const doCutaway = async () => {
    if (!cutPrompt.trim()) return;
    setBusy('Illustrating the cutaway…');
    try {
      const url = await generateSceneImage(illustrationPrompt(cutPrompt, 'clean hand-drawn overlay illustration; palette: warm neutrals with one accent — literal colors, no gradients'), clusterId, 'UGC cutaway');
      setBroll((cur) => [...cur, { url, kind: 'image', atS: Math.max(0, Number(cutAt) || 8), lengthS: 3 }]);
      setCutPrompt('');
      onToast('success', 'Cutaway added — 3s stylized insert over your voice.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The cutaway failed.'); }
    finally { setBusy(null); }
  };

  const doRender = async () => {
    if (!takes.length) return;
    setBusy('Rendering the edit…'); setDone(null);
    try {
      const provenance = broll.length ? aiProvenance('image', 'ugc-cutaways', Date.now()) : null;
      const start = await startRenderEdit(buildUgcEdit(takes, editOpts()));
      if (start.available === false) { onToast('info', 'Rendering isn\'t configured — add SHOTSTACK_API_KEY (System health).'); return; }
      if (!start.ok || !start.id) { onToast('error', start.error ?? 'The render could not start.'); return; }
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await pollRender(start.id, { clusterId, aiProvenance: provenance });
        setBusy(`Rendering… (${st.status ?? 'working'})`);
        if (st.status === 'done' && st.url) {
          await saveRenderedVideo(clusterId, hook || 'UGC cut', st.url, start.id);
          setDone({ url: st.url, provenance });
          setCaption((c) => c || hook);
          onToast('success', `Cut rendered — ${describeUgcEdit(takes, editOpts())}.`);
          return;
        }
        if (st.status === 'failed') { onToast('error', 'The render failed on the provider.'); return; }
      }
      onToast('info', 'Still rendering — press Render again in a minute to resume checking.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Render failed.'); }
    finally { setBusy(null); }
  };

  const doQueue = async () => {
    if (!done || !caption.trim() || !platforms.length) return;
    setBusy('Queueing…');
    try {
      // AI cutaways → "Illustrations AI-assisted." + the provenance rides the post; pure real
      // footage carries NO AI mark — the honest inverse.
      const text = done.provenance ? `${withDisclosure(caption.trim(), done.provenance)}\nIllustrations AI-assisted.` : caption.trim();
      await queueSocialPost({ text, platforms, mediaUrls: [done.url], worldId, provenance: done.provenance });
      onToast('success', 'Queued — approve it in the Queue to publish.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-6 rounded-2xl border border-forge-border bg-forge-raised/40 p-4">
      <div className="flex items-center gap-2">
        <Film size={15} className="text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">UGC Studio — your real footage, the native edit</h3>
        <span className="text-[11px] text-forge-dim">hard cuts · punch-ins · word-karaoke captions from your own audio · the human testifies, AI illustrates</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50">
          <Upload size={14} /> Upload takes
          <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => void doUpload(e.target.files)} />
        </label>
        <span className="text-[11px] text-forge-dim">{takes.length ? `${takes.length} clip${takes.length === 1 ? '' : 's'} — cut in upload order` : 'film per the episode shot list, then drop the takes here'}</span>
        {takes.length > 0 && <button onClick={() => { setTakes([]); setBroll([]); setDone(null); }} className="text-[11px] text-forge-dim hover:text-forge-ink">clear</button>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <button onClick={() => setAutoCut(!autoCut)} title="Silence removal: every pause becomes a jump cut, the CapCut-grade pacing device. Applied as takes are uploaded."
          className={cn('flex items-center gap-1 rounded-lg border px-2 py-1', autoCut ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
          <Scissors size={11} /> Auto-cut pauses
        </button>
        <span className="text-forge-dim">lane:</span>
        {(['calm', 'energetic'] as const).map((l) => (
          <button key={l} onClick={() => setLane(l)}
            title={l === 'calm' ? 'Educational/caregiver: karaoke captions, sparse sound cues, no shake' : 'UGC-ad: pop captions, tighter cuts, dense sound cues, a shake on the first punch-in'}
            className={cn('rounded-lg border px-2 py-1', lane === l ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
            {l}
          </button>
        ))}
        <button onClick={() => setSfxOpen(!sfxOpen)}
          className={cn('flex items-center gap-1 rounded-lg border px-2 py-1', sfxCount ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
          <Volume2 size={11} /> Sound kit{sfxCount ? ` (${sfxCount})` : ''}
        </button>
      </div>
      {sfxOpen && <SoundKitFields sfx={sfx} onChange={setSfx} />}

      <div className="mt-2 flex flex-wrap gap-2">
        <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="frame-one hook card (5-8 words)"
          className="min-w-[240px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        <input value={cutPrompt} onChange={(e) => setCutPrompt(e.target.value)} placeholder="AI cutaway: what to illustrate (optional)"
          className="min-w-[200px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
        <input value={cutAt} onChange={(e) => setCutAt(e.target.value)} title="seconds into the video" placeholder="at s"
          className="w-16 rounded-lg border border-forge-border bg-forge-bg px-2 py-1.5 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
        <button onClick={() => void doCutaway()} disabled={!!busy || !cutPrompt.trim()} className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
          <Sparkles size={12} /> Add cutaway{broll.length ? ` (${broll.length})` : ''}
        </button>
        <Button variant='primary' size='sm' onClick={() => void doRender()} disabled={!!busy || !takes.length}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />} Render the cut
        </Button>
      </div>
      {busy && <p className="mt-2 text-xs text-forge-dim">{busy}</p>}

      {done && (
        <div className="mt-3 space-y-2 rounded-xl border border-forge-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-forge-ink">Queue to social</p>
            <a href={done.url} target="_blank" rel="noreferrer" className="text-[11px] text-forge-ember hover:underline">watch the mp4</a>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <button key={p} onClick={() => setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])}
                className={cn('rounded-lg border px-2.5 py-1 text-xs', platforms.includes(p) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="the post caption"
            className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <p className="text-[11px] text-forge-dim">{done.provenance ? 'AI cutaways included — the caption carries the AI note and the label is enforced server-side.' : 'Pure real footage — no AI mark, honestly.'}</p>
          <Button variant='primary' size='sm' onClick={() => void doQueue()} disabled={!!busy || !caption.trim() || !platforms.length}>
            <Send size={13} /> Queue for approval
          </Button>
        </div>
      )}
    </div>
  );
}
