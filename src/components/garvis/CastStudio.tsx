// src/components/garvis/CastStudio.tsx
// THE CAST — persistent people and places, and the PRODUCTION LINE built on them: any script, one
// beat per line, through generation → identity QA → the cut → the approval-gated publisher. The
// six-shot continuity test (Test A of the media-studio review) runs through the exact same door,
// so passing the test IS proving the production line. Doctrine holds: zero-input value (the cast
// list or an honest empty state), ONE primary action (Run production — the daily act), setup and
// the one-time test collapsed beside it, and the honesty spine end to end (approved references
// only, consent-gated real people, provenance + disclosure on every queued post, durable URLs only).

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, Plus, Sparkles, Check, Clapperboard, X, Upload, Send, Film } from 'lucide-react';
import {
  loadCast, createCharacter, createLocation, setAssetApproved, generateReferenceSheet, uploadReferencePhotos,
  createTestScene, createProduction, setClipContinuityIn, startClip, pollClip, qaClip, acceptClip,
  sampleFrames, renderScene, type RenderedScene,
  type CastCharacter, type CastLocation, type CastAsset, type TestClip,
} from '../../lib/garvis/castRun';
import { testReadiness, testCostEstimateUsd, sixShotScene, scriptShots, likenessGate, type CastSubjectState, type TestShot } from '../../lib/garvis/castLab';
import { withDisclosure } from '../../lib/garvis/mediaProvenance';
import { queueSocialPost } from '../../lib/garvis/socialRun';
import { PLATFORM_LABEL, type Platform } from '../../lib/garvis/social';
import type { QaVerdict } from '../../lib/garvis/videoQa';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

const PLATFORMS: Platform[] = ['tiktok', 'youtube', 'instagram', 'facebook'];

interface ShotState { clip: TestClip; durationS: number; status: string; videoUrl?: string; verdict?: QaVerdict; note?: string }

export function CastStudio({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (k: 'success' | 'error' | 'info', m: string) => void;
}) {
  const [characters, setCharacters] = useState<CastCharacter[]>([]);
  const [locations, setLocations] = useState<CastLocation[]>([]);
  const [assets, setAssets] = useState<CastAsset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState<'character' | 'location' | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [realPerson, setRealPerson] = useState(false);
  const [consentNote, setConsentNote] = useState('');
  // The run (test or production — same machinery)
  const [shots, setShots] = useState<ShotState[]>([]);
  const [running, setRunning] = useState(false);
  const [scene, setScene] = useState<RenderedScene | null>(null);
  const [cutting, setCutting] = useState(false);
  // Produce inputs
  const [prodTitle, setProdTitle] = useState('');
  const [script, setScript] = useState('');
  const [castIds, setCastIds] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  // Publish inputs
  const [platforms, setPlatforms] = useState<Platform[]>(['tiktok', 'youtube', 'instagram']);
  const [caption, setCaption] = useState('');

  const reload = async () => {
    try {
      const cast = await loadCast();
      setCharacters(cast.characters); setLocations(cast.locations); setAssets(cast.assets);
    } catch { /* table not migrated yet — the empty state below says what to do */ }
  };
  useEffect(() => { void reload(); }, []);

  const subjectState = (rows: Array<{ id: string; name: string }>): CastSubjectState[] =>
    rows.map((r) => ({ id: r.id, name: r.name, approvedKinds: assets.filter((a) => a.subject_id === r.id && a.approved).map((a) => a.kind) }));
  const readiness = useMemo(
    () => testReadiness(subjectState(characters), subjectState(locations)),
    [characters, locations, assets]);  // eslint-disable-line react-hooks/exhaustive-deps
  const readyCharacters = useMemo(
    () => characters.filter((c) => {
      const kinds = assets.filter((a) => a.subject_id === c.id && a.approved).map((a) => a.kind);
      return kinds.includes('face_front') && kinds.includes('full_body');
    }),
    [characters, assets]);
  const readyLocations = useMemo(
    () => locations.filter((l) => assets.some((a) => a.subject_id === l.id && a.kind === 'loc_wide' && a.approved)),
    [locations, assets]);

  const doAdd = async () => {
    if (!addOpen || !name.trim() || !desc.trim()) return;
    setBusy('Saving…');
    try {
      if (addOpen === 'character') {
        if (realPerson && !consentNote.trim()) { onToast('error', 'A real person needs a consent note — who said yes, and how.'); return; }
        await createCharacter(name.trim(), desc.trim(), realPerson ? { consentNote: consentNote.trim() } : undefined);
      } else await createLocation(name.trim(), desc.trim());
      setName(''); setDesc(''); setConsentNote(''); setRealPerson(false); setAddOpen(null);
      await reload();
      onToast('success', realPerson ? 'Added — upload their photos as the reference sheet.' : 'Added — now generate its reference sheet.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(null); }
  };

  const doUploadPhotos = async (characterId: string, subjectName: string, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(`Uploading ${subjectName}'s photos…`);
    try {
      const n = await uploadReferencePhotos(characterId, clusterId, Array.from(files));
      await reload();
      onToast('success', `${n} photo${n === 1 ? '' : 's'} uploaded — approve the ones that look right.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Photo upload failed.'); }
    finally { setBusy(null); }
  };

  const doSheet = async (kind: 'character' | 'location', id: string, description: string, subjectName: string) => {
    setBusy(`Generating ${subjectName}'s reference sheet…`);
    try {
      const n = await generateReferenceSheet({ kind, id, description }, clusterId);
      await reload();
      onToast('success', `${n} references generated — approve the ones that look right.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Reference generation failed.'); }
    finally { setBusy(null); }
  };

  const doApprove = async (asset: CastAsset) => {
    try { await setAssetApproved(asset.id, !asset.approved); await reload(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };

  // THE RUN LOOP — sequential by design: shot N+1 needs shot N's accepted clip as its continuity
  // reference. Each shot: start → poll → browser frames → QA → accept (or stop and say why). The
  // test and every production run through this same loop.
  const runClips = async (clips: TestClip[], durations: number[]): Promise<boolean> => {
    let states: ShotState[] = clips.map((clip, i) => ({ clip, durationS: durations[i] ?? 5, status: 'waiting' }));
    setShots(states); setScene(null);
    const setShot = (i: number, patch: Partial<ShotState>) => {
      states = states.map((s, k) => (k === i ? { ...s, ...patch } : s)); setShots(states);
    };
    let continuity: Record<string, unknown> | null = null;
    for (let i = 0; i < clips.length; i++) {
      if (continuity) await setClipContinuityIn(clips[i].id, continuity);
      setShot(i, { status: 'generating' });
      const start = await startClip(clips[i].id);
      const cand = start.candidates[0];
      if (!cand || cand.status === 'failed') { setShot(i, { status: 'failed', note: cand?.error ?? 'did not start' }); return false; }

      let videoUrl: string | undefined;
      for (let p = 0; p < 60; p++) {
        await new Promise((r) => setTimeout(r, 5000));
        const st = await pollClip(cand.id);
        if (st.status === 'ready' && st.videoUrl) { videoUrl = st.videoUrl; break; }
        if (st.status === 'failed') { setShot(i, { status: 'failed', note: st.error ?? 'generation failed' }); break; }
        setShot(i, { status: `generating (${Math.round((p * 5) / 60 * 10) / 10}m)` });
      }
      if (!videoUrl) { if (states[i].status !== 'failed') setShot(i, { status: 'failed', note: 'timed out — poll again later from the clip row' }); return false; }

      setShot(i, { status: 'judging', videoUrl });
      const frames = await sampleFrames(videoUrl, 6);
      const { verdict } = await qaClip(cand.id, frames);
      setShot(i, { verdict });

      if (verdict.decision === 'reject') {
        setShot(i, { status: 'rejected', note: verdict.reasons.join('; ') });
        onToast('error', `Shot ${i + 1} rejected — ${verdict.reasons[0] ?? 'QA failed it'}. The run stops here, honestly.`);
        return false;
      }
      const acc = await acceptClip(cand.id, { lighting: 'consistent interior', wardrobe: {} });
      continuity = acc.continuityOut;
      setShot(i, { status: verdict.decision === 'accept' ? 'accepted' : 'accepted (review)' });
    }
    return true;
  };

  const allAccepted = shots.length > 0 && shots.every((s) => s.status.startsWith('accepted'));

  // THE PRODUCTION — the daily act: script in, shots out, through the same loop as the test.
  const runProduction = async () => {
    const cast = readyCharacters.filter((c) => castIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name }));
    if (!cast.length || !script.trim()) return;
    const gate = likenessGate(characters.filter((c) => castIds.includes(c.id))
      .map((c) => ({ name: c.name, likeness: c.likeness, consentedAt: c.consented_at })));
    if (!gate.ok) { onToast('error', gate.reason ?? 'Consent missing.'); return; }
    const shotList: TestShot[] = scriptShots(script.split('\n'), cast);
    setRunning(true);
    try {
      const clips = await createProduction(worldId, clusterId, prodTitle.trim() || 'Untitled production', shotList, locationId || null);
      const ok = await runClips(clips, shotList.map((s) => s.durationS));
      if (ok) onToast('success', `${clips.length}/${clips.length} shots accepted — cut the scene, then queue it.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The production failed.'); }
    finally { setRunning(false); }
  };

  // THE TEST — the fixed scene, same loop, one-time validation.
  const runTest = async () => {
    const ready = subjectState(characters).filter((c) => c.approvedKinds.includes('face_front') && c.approvedKinds.includes('full_body'));
    const loc = subjectState(locations).find((l) => l.approvedKinds.includes('loc_wide'));
    if (ready.length < 2 || !loc) return;
    setRunning(true);
    try {
      const a = { id: ready[0].id, name: ready[0].name };
      const b = { id: ready[1].id, name: ready[1].name };
      const clips = await createTestScene(worldId, clusterId, a, b, loc.id);
      const durations = sixShotScene(a, b).map((s) => s.durationS);
      const ok = await runClips(clips, durations);
      if (ok) onToast('success', 'Six for six — cut the scene and watch it as ONE piece. That is the verdict.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The test failed.'); }
    finally { setRunning(false); }
  };

  // THE CUT — accepted clips through the shared edit grammar (the layer shipping AI drama skips).
  const doCutScene = async () => {
    const clips = shots.map((s) => ({ url: s.videoUrl ?? '', durationS: s.durationS }));
    setCutting(true); setScene(null);
    try {
      const rendered = await renderScene(clips, clusterId, prodTitle.trim() || 'Cast scene — the cut');
      setScene(rendered);
      setCaption((c) => c || prodTitle.trim());
      if (!rendered.durable) onToast('info', 'Cut rendered, but the durable save failed — this url dies in 24h. Re-cut before queueing.');
      else onToast('success', 'Scene cut — watch it as ONE piece, then queue it below.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The scene cut failed.'); }
    finally { setCutting(false); }
  };

  // THE QUEUE — through the approval spine; the caption ALWAYS carries the AI disclosure (the
  // server gate is fail-closed on it) and only a DURABLE url ever reaches a post.
  const doQueue = async () => {
    if (!scene || !scene.durable || !caption.trim() || !platforms.length) return;
    setBusy('Queueing…');
    try {
      await queueSocialPost({
        text: withDisclosure(caption.trim(), scene.provenance),
        platforms, mediaUrls: [scene.url], worldId, provenance: scene.provenance,
      });
      onToast('success', 'Queued — approve it in the Queue to publish.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue.'); }
    finally { setBusy(null); }
  };

  const subjects: Array<{ kind: 'character' | 'location'; row: CastCharacter | CastLocation }> = [
    ...characters.map((c) => ({ kind: 'character' as const, row: c })),
    ...locations.map((l) => ({ kind: 'location' as const, row: l })),
  ];

  return (
    <div className="mt-6 rounded-2xl border border-forge-border bg-forge-raised/40 p-4">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Cast — persistent people &amp; places</h3>
        <span className="text-[11px] text-forge-dim">approved references pin identity · script in, published episode out</span>
      </div>

      {/* THE CAST LIST — zero-input value: what exists, or the one next step. */}
      {subjects.length === 0 ? (
        <p className="mt-3 text-xs text-forge-dim">
          No cast yet. Create your first character — a name and two sentences of appearance — and Garvis generates their reference sheet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {subjects.map(({ kind, row }) => {
            const own = assets.filter((a) => a.subject_id === row.id);
            return (
              <div key={row.id} className="rounded-xl border border-forge-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-forge-ink">{row.name}</p>
                  <span className="text-[11px] text-forge-dim">
                    {kind === 'character' && (row as CastCharacter).likeness === 'real' ? 'real person · consented' : kind}
                    {own.length ? ` · ${own.filter((a) => a.approved).length}/${own.length} approved` : ''}
                  </span>
                  {kind === 'character' && (row as CastCharacter).likeness === 'real' ? (
                    <label className={cn('ml-auto flex cursor-pointer items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40', (!!busy || running) && 'pointer-events-none opacity-60')}>
                      <Upload size={11} /> Upload photos (front, angled, full body)
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void doUploadPhotos(row.id, row.name, e.target.files)} />
                    </label>
                  ) : (
                    <button onClick={() => void doSheet(kind, row.id, row.description, row.name)} disabled={!!busy || running}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
                      <Sparkles size={11} /> {own.length ? 'Regenerate sheet' : 'Generate reference sheet'}
                    </button>
                  )}
                </div>
                {own.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {own.map((a) => (
                      <button key={a.id} onClick={() => void doApprove(a)} title={a.approved ? `${a.kind} — approved (click to revoke)` : `${a.kind} — click to approve`}
                        className={cn('relative overflow-hidden rounded-lg border', a.approved ? 'border-forge-ember' : 'border-forge-border opacity-70 hover:opacity-100')}>
                        <img src={a.file_url} alt={`${row.name} ${a.kind}`} className="h-24 w-auto" loading="lazy" />
                        <span className={cn('absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px]', a.approved ? 'bg-forge-ember/90 text-white' : 'bg-black/60 text-white/80')}>
                          {a.approved ? <span className="inline-flex items-center gap-0.5"><Check size={9} /> {a.kind}</span> : a.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SETUP — collapsed: adding cast is a set-once act, not the daily work. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['character', 'location'] as const).map((k) => (
          <button key={k} onClick={() => { setAddOpen(addOpen === k ? null : k); setName(''); setDesc(''); }}
            className={cn('flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs', addOpen === k ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
            {addOpen === k ? <X size={12} /> : <Plus size={12} />} New {k}
          </button>
        ))}
      </div>
      {addOpen && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={addOpen === 'character' ? 'name (e.g. Sarah)' : 'name (e.g. the lake house kitchen)'}
              className="min-w-[160px] rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder={addOpen === 'character' ? 'appearance: age, build, hair, distinguishing features' : 'the space: layout, furniture, windows, light'}
              className="min-w-[280px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <button onClick={() => void doAdd()} disabled={!!busy || !name.trim() || !desc.trim() || (realPerson && !consentNote.trim())}
              className="rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">Save</button>
          </div>
          {addOpen === 'character' && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setRealPerson(!realPerson)}
                className={cn('rounded-lg border px-2 py-1 text-[11px]', realPerson ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                Real person (a friend — their photos become the references)
              </button>
              {realPerson && (
                <input value={consentNote} onChange={(e) => setConsentNote(e.target.value)}
                  placeholder="consent: who said yes, and how (required — generation refuses without it)"
                  className="min-w-[300px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[11px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
              )}
            </div>
          )}
        </div>
      )}

      {/* THE PRODUCTION LINE — the one primary action: script in, episode out. */}
      <div className="mt-4 rounded-xl border border-forge-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Film size={14} className="text-forge-ember" />
          <p className="text-xs font-semibold text-forge-ink">Produce</p>
          <span className="text-[11px] text-forge-dim">one beat per line · "Sarah: line" = she speaks it · anything else is an action shot</span>
        </div>
        {readyCharacters.length === 0 ? (
          <p className="mt-2 text-[11px] text-forge-dim">Waiting on: one character with an approved face + full-body reference.</p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-forge-dim">cast:</span>
              {readyCharacters.map((c) => (
                <button key={c.id} onClick={() => setCastIds((cur) => cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id])}
                  className={cn('rounded-lg border px-2 py-1 text-[11px]', castIds.includes(c.id) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                  {c.name}
                </button>
              ))}
              {readyLocations.length > 0 && (
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
                  className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-[11px] text-forge-dim focus:border-forge-ember/60 focus:outline-none">
                  <option value="">no location</option>
                  {readyLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <input value={prodTitle} onChange={(e) => setProdTitle(e.target.value)} placeholder="title (e.g. CASE 001 — Nice blue car)"
                className="min-w-[220px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-[11px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            </div>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4}
              placeholder={'Sarah: A stranger texted her three words. Nice blue car.\nSarah looks out the window at the empty street.\nSarah: One photo. One plate-lookup site. That\'s all it took.'}
              className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void runProduction()} disabled={running || cutting || !!busy || !castIds.length || !script.trim()}>
                {running ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />} Run production
              </Button>
              <span className="text-[11px] text-forge-dim">{script.trim() ? `${script.split('\n').filter((l) => l.trim()).length} shots` : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* THE SIX-SHOT TEST — one-time validation, same machinery. */}
      <div className="mt-3 rounded-xl border border-forge-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Clapperboard size={14} className="text-forge-ember" />
          <p className="text-xs font-semibold text-forge-ink">The six-shot continuity test</p>
          <span className="text-[11px] text-forge-dim">two people, one room, six cuts — same faces or the ladder stops</span>
          <button onClick={() => void runTest()} disabled={!readiness.ready || running || cutting || !!busy}
            className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
            {running ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />} Run the test (~${testCostEstimateUsd().toFixed(2)})
          </button>
        </div>
        {!readiness.ready && (
          <p className="mt-2 text-[11px] text-forge-dim">Waiting on: {readiness.missing.join(' · ')}.</p>
        )}
      </div>

      {/* THE RUN — shots, verdicts, the cut, the queue. */}
      {shots.length > 0 && (
        <div className="mt-3 rounded-xl border border-forge-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {shots.map((s, i) => (
              <div key={s.clip.id} className="rounded-lg border border-forge-border p-1.5">
                <p className="text-[10px] font-semibold text-forge-ink">Shot {i + 1}</p>
                {s.videoUrl
                  ? <video src={s.videoUrl} controls muted className="mt-1 w-full rounded" />
                  : <p className="mt-1 text-[10px] text-forge-dim">{s.clip.prompt.slice(0, 60)}…</p>}
                <p className={cn('mt-1 text-[10px]', s.status.startsWith('accepted') ? 'text-forge-ember' : s.status === 'rejected' || s.status === 'failed' ? 'text-red-400' : 'text-forge-dim')}>
                  {s.status}{s.verdict ? ` · QA ${s.verdict.overall}${s.verdict.identityMin !== null ? ` · id ${s.verdict.identityMin}` : ''}` : ''}
                </p>
                {s.note && <p className="mt-0.5 text-[10px] text-forge-dim">{s.note}</p>}
              </div>
            ))}
          </div>

          {allAccepted && !running && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => void doCutScene()} disabled={cutting}
                className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
                {cutting ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />} Cut the scene — hard cuts, captions, sound cues
              </button>
              <span className="text-[11px] text-forge-dim">the edit layer is where the shots become one scene</span>
              {scene && <a href={scene.url} target="_blank" rel="noreferrer" className="text-[11px] text-forge-ember hover:underline">watch the cut mp4</a>}
            </div>
          )}

          {scene && (
            <div className="mt-3 space-y-2 rounded-lg border border-forge-border p-3">
              <video src={scene.url} controls className="w-full max-w-[300px] rounded-lg border border-forge-border" />
              {scene.durable ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map((p) => (
                      <button key={p} onClick={() => setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])}
                        className={cn('rounded-lg border px-2.5 py-1 text-xs', platforms.includes(p) ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
                        {PLATFORM_LABEL[p]}
                      </button>
                    ))}
                  </div>
                  <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="the post caption (the AI disclosure is appended automatically)"
                    className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                  <Button variant="primary" size="sm" onClick={() => void doQueue()} disabled={!!busy || !caption.trim() || !platforms.length}>
                    <Send size={13} /> Queue for approval
                  </Button>
                </>
              ) : (
                <p className="text-[11px] text-forge-dim">This cut isn't durably stored (the url dies in 24h) — re-cut before queueing.</p>
              )}
            </div>
          )}
        </div>
      )}

      {busy && <p className="mt-2 text-xs text-forge-dim">{busy}</p>}
    </div>
  );
}
