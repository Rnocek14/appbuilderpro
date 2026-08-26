// src/components/garvis/CastStudio.tsx
// THE CAST — persistent people and places for AI-generated video, and the six-shot continuity test
// that decides whether anything bigger ever gets built (the media-studio review's Test A). The
// doctrine holds: zero-input value (the cast list, or an honest empty state with the ONE next
// step); one primary action (run the test — everything else is setup, collapsed); and the honesty
// spine (references are AI-generated and provenance-stamped; nothing ships unapproved; the test
// reports the verdicts it got, never a rosier summary).

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, Plus, Sparkles, Check, Clapperboard, X } from 'lucide-react';
import {
  loadCast, createCharacter, createLocation, setAssetApproved, generateReferenceSheet,
  createTestScene, setClipContinuityIn, startClip, pollClip, qaClip, acceptClip, sampleFrames, renderScene,
  type CastCharacter, type CastLocation, type CastAsset, type TestClip,
} from '../../lib/garvis/castRun';
import { testReadiness, testCostEstimateUsd, sixShotScene, type CastSubjectState } from '../../lib/garvis/castLab';
import type { QaVerdict } from '../../lib/garvis/videoQa';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

interface ShotState { clip: TestClip; status: string; videoUrl?: string; verdict?: QaVerdict; note?: string }

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
  const [shots, setShots] = useState<ShotState[]>([]);
  const [running, setRunning] = useState(false);
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [cutting, setCutting] = useState(false);

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

  const doAdd = async () => {
    if (!addOpen || !name.trim() || !desc.trim()) return;
    setBusy('Saving…');
    try {
      if (addOpen === 'character') await createCharacter(name.trim(), desc.trim());
      else await createLocation(name.trim(), desc.trim());
      setName(''); setDesc(''); setAddOpen(null);
      await reload();
      onToast('success', 'Added — now generate its reference sheet.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
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

  // THE TEST — sequential by design: shot N+1 needs shot N's accepted clip as its continuity
  // reference. Each shot: start → poll → browser frames → QA → accept (or stop and say why).
  const runTest = async () => {
    const readyChars = subjectState(characters).filter((c) => c.approvedKinds.includes('face_front') && c.approvedKinds.includes('full_body'));
    const loc = subjectState(locations).find((l) => l.approvedKinds.includes('loc_wide'));
    if (readyChars.length < 2 || !loc) return;
    setRunning(true); setShots([]);
    try {
      const a = { id: readyChars[0].id, name: readyChars[0].name };
      const b = { id: readyChars[1].id, name: readyChars[1].name };
      const clips = await createTestScene(worldId, clusterId, a, b, loc.id);
      let states: ShotState[] = clips.map((clip) => ({ clip, status: 'waiting' }));
      setShots(states);
      const setShot = (i: number, patch: Partial<ShotState>) => {
        states = states.map((s, k) => (k === i ? { ...s, ...patch } : s)); setShots(states);
      };

      let continuity: Record<string, unknown> | null = null;
      for (let i = 0; i < clips.length; i++) {
        if (continuity) await setClipContinuityIn(clips[i].id, continuity);
        setShot(i, { status: 'generating' });
        const start = await startClip(clips[i].id);
        const cand = start.candidates[0];
        if (!cand || cand.status === 'failed') { setShot(i, { status: 'failed', note: cand?.error ?? 'did not start' }); break; }

        let videoUrl: string | undefined;
        for (let p = 0; p < 60; p++) {
          await new Promise((r) => setTimeout(r, 5000));
          const st = await pollClip(cand.id);
          if (st.status === 'ready' && st.videoUrl) { videoUrl = st.videoUrl; break; }
          if (st.status === 'failed') { setShot(i, { status: 'failed', note: st.error ?? 'generation failed' }); break; }
          setShot(i, { status: `generating (${Math.round((p * 5) / 60 * 10) / 10}m)` });
        }
        if (!videoUrl) { if (states[i].status !== 'failed') setShot(i, { status: 'failed', note: 'timed out — poll again later from the clip row' }); break; }

        setShot(i, { status: 'judging', videoUrl });
        const frames = await sampleFrames(videoUrl, 6);
        const { verdict } = await qaClip(cand.id, frames);
        setShot(i, { verdict });

        if (verdict.decision === 'reject') {
          setShot(i, { status: 'rejected', note: verdict.reasons.join('; ') });
          onToast('error', `Shot ${i + 1} rejected — ${verdict.reasons[0] ?? 'QA failed it'}. The test stops here, honestly.`);
          break;
        }
        // accept and review both continue the run: review is flagged for the operator's eye, but
        // the point of Test A is the chain — six shots or a named stop.
        const acc = await acceptClip(cand.id, { lighting: 'consistent interior', wardrobe: {} });
        continuity = acc.continuityOut;
        setShot(i, { status: verdict.decision === 'accept' ? 'accepted' : 'accepted (review)' });
      }
      const done = states.filter((s) => s.status.startsWith('accepted')).length;
      if (done === clips.length) onToast('success', 'Six for six — watch them in order. If they read as one scene, the ladder continues.');
      else onToast('info', `${done}/6 shots accepted — the verdicts below say exactly what broke.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The test failed.'); }
    finally { setRunning(false); }
  };

  // THE CUT — accepted clips through the shared edit grammar (the layer shipping AI drama skips).
  const doCutScene = async () => {
    const durations = sixShotScene({ id: 'a', name: 'A' }, { id: 'b', name: 'B' }).map((s) => s.durationS);
    const clips = shots.map((s, i) => ({ url: s.videoUrl ?? '', durationS: durations[i] ?? 5 }));
    setCutting(true); setSceneUrl(null);
    try {
      const url = await renderScene(clips, clusterId, 'Six-shot continuity test — the cut');
      setSceneUrl(url);
      onToast('success', 'Scene cut — watch it as ONE piece. This is the real Test A verdict.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'The scene cut failed.'); }
    finally { setCutting(false); }
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
        <span className="text-[11px] text-forge-dim">approved reference images pin identity · the six-shot test decides what gets built next</span>
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
                  <span className="text-[11px] text-forge-dim">{kind}{own.length ? ` · ${own.filter((a) => a.approved).length}/${own.length} approved` : ''}</span>
                  <button onClick={() => void doSheet(kind, row.id, row.description, row.name)} disabled={!!busy || running}
                    className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">
                    <Sparkles size={11} /> {own.length ? 'Regenerate sheet' : 'Generate reference sheet'}
                  </button>
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
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={addOpen === 'character' ? 'name (e.g. Sarah)' : 'name (e.g. the lake house kitchen)'}
            className="min-w-[160px] rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder={addOpen === 'character' ? 'appearance: age, build, hair, distinguishing features' : 'the space: layout, furniture, windows, light'}
            className="min-w-[280px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void doAdd()} disabled={!!busy || !name.trim() || !desc.trim()}
            className="rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:border-forge-ember/40 disabled:opacity-60">Save</button>
        </div>
      )}

      {/* THE ONE PRIMARY ACTION — the test, or the honest list of what it's waiting on. */}
      <div className="mt-4 rounded-xl border border-forge-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Clapperboard size={14} className="text-forge-ember" />
          <p className="text-xs font-semibold text-forge-ink">The six-shot continuity test</p>
          <span className="text-[11px] text-forge-dim">two people, one room, six cuts — same faces or the ladder stops</span>
          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => void runTest()} disabled={!readiness.ready || running || !!busy}>
              {running ? <Loader2 size={13} className="animate-spin" /> : <Clapperboard size={13} />} Run the test (~${testCostEstimateUsd().toFixed(2)})
            </Button>
          </div>
        </div>
        {!readiness.ready && (
          <p className="mt-2 text-[11px] text-forge-dim">Waiting on: {readiness.missing.join(' · ')}.</p>
        )}
        {shots.length === 6 && shots.every((s) => s.status.startsWith('accepted')) && !running && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void doCutScene()} disabled={cutting}
              className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
              {cutting ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />} Cut the scene — hard cuts, captions, sound cues
            </button>
            <span className="text-[11px] text-forge-dim">the edit layer is where six generations become one scene</span>
            {sceneUrl && <a href={sceneUrl} target="_blank" rel="noreferrer" className="text-[11px] text-forge-ember hover:underline">watch the cut mp4</a>}
          </div>
        )}
        {sceneUrl && (
          <video src={sceneUrl} controls className="mt-2 w-full max-w-[300px] rounded-lg border border-forge-border" />
        )}
        {shots.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
        )}
      </div>

      {busy && <p className="mt-2 text-xs text-forge-dim">{busy}</p>}
    </div>
  );
}
