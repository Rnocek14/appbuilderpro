// src/pages/Universe.tsx
// P3 — THE UNIVERSE ALTITUDE. Every world in one sky; the x-ray of Garvis's living memory:
// bands = structural commitment (systems / growing / sparks), size = counted mass, light =
// persisted momentum, filaments = cross-world insights with measured scores, comets = the same
// Next Move engine as the waking moment, and TIME = a scrubber that replays the append-only
// mind_events record. Position is identity, never similarity — relatedness is a drawn filament
// or it isn't claimed. When you scrub into the past, momentum light dims: we persist momentum
// NOW, not its history, and the sky refuses to pretend otherwise.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Telescope, Waypoints } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';
import { loadUniverseScene } from '../lib/garvis/universeViewRun';
import { activityAt, BAND_R, BAND_LABEL, hash32, type UniverseScene, type WorldBody } from '../lib/garvis/universeView';
import { loadWorld } from '../lib/garvis/universe';

// A deterministic starfield — pure decoration BY DESIGN (fixed seed, never moves, claims no
// state); the honest elements sit on top of it. 140 points from a hash, same sky every visit.
const STARS = Array.from({ length: 140 }, (_, i) => {
  const h = hash32(`star-${i}`);
  return {
    x: h % 600,
    y: (h >>> 9) % 600,
    r: 0.4 + ((h >>> 19) % 8) / 10,
    o: 0.10 + ((h >>> 23) % 28) / 100,
  };
});

const CX = 300;
const SCALE = 272;
const MOMENTUM_HEX = { surging: '#FF8A3D', steady: '#4ADE80', slowing: '#FACC15', dormant: '#8B90A0' } as const;
const UNOBSERVED_HEX = '#4A4F5E';

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * SCALE * Math.cos(rad), y: CX + r * SCALE * Math.sin(rad) };
}

export default function Universe() {
  const navigate = useNavigate();
  const [scene, setScene] = useState<UniverseScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorldBody | null>(null);
  const [frac, setFrac] = useState(1); // 1 = now; <1 replays the record
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let live = true;
    loadUniverseScene()
      .then((s) => { if (live) setScene(s); })
      .catch(() => { if (live) setScene(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  // The scrubber's instant: oldest recorded event … now. No events → only "now" exists.
  const atIso = useMemo(() => {
    if (!scene) return new Date().toISOString();
    if (frac >= 1 || !scene.timeline.oldest) return scene.asOf;
    const t0 = new Date(scene.timeline.oldest).getTime();
    const t1 = new Date(scene.asOf).getTime();
    return new Date(t0 + frac * (t1 - t0)).toISOString();
  }, [scene, frac]);
  const isNow = !scene?.timeline.oldest || frac >= 1;

  const glow = useMemo(() => (scene ? activityAt(scene.timeline.events, atIso) : new Map<string, number>()), [scene, atIso]);
  const windowEvents = useMemo(() => {
    if (!scene) return [];
    const at = new Date(atIso).getTime();
    const from = at - 7 * 24 * 3_600_000;
    return scene.timeline.events.filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t > from && t <= at;
    }).slice(0, 8);
  }, [scene, atIso]);

  if (loading) return <AppShell><div className="p-8"><Spinner label="Compiling the universe…" /></div></AppShell>;
  if (!scene) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-forge-dim">The universe could not be loaded.</p>
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to Ventures</Link>
        </div>
      </AppShell>
    );
  }

  const posOf = new Map(scene.bodies.map((b) => [b.id, polar(b.angleDeg, b.r)]));
  const systems = scene.bodies.filter((b) => b.isSystem).length;
  const showAllLabels = scene.bodies.length <= 14;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link to="/garvis/webs" className="text-forge-dim hover:text-forge-ink"><ArrowLeft size={18} /></Link>
          <Telescope size={20} className="text-forge-ember" />
          <h1 className="text-xl font-semibold text-forge-ink">Universe</h1>
          <span className="text-xs text-forge-dim">
            {scene.bodies.length} world{scene.bodies.length === 1 ? '' : 's'} · {systems} system{systems === 1 ? '' : 's'} · {scene.filaments.length} filament{scene.filaments.length === 1 ? '' : 's'}
          </span>
          {scene.bodies.length === 0 && (
            <span className="text-xs text-forge-warn">
              — an empty sky is honest: no worlds on record yet. <Link to="/garvis/explore" className="text-forge-ember hover:underline">Explore a rabbithole</Link> or <Link to="/garvis/webs" className="text-forge-ember hover:underline">draft a world from intent</Link>.
            </span>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* The sky */}
          <div className="relative overflow-hidden rounded-2xl border border-forge-border bg-forge-bg">
            <svg viewBox="0 0 600 600" className="block h-auto w-full" role="img" aria-label="Universe — every world in one sky">
              <defs>
                <filter id="u-glow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <radialGradient id="u-vignette">
                  <stop offset="55%" stopColor="#0C0E13" stopOpacity="0" />
                  <stop offset="100%" stopColor="#05060A" stopOpacity="0.85" />
                </radialGradient>
              </defs>

              {/* The deep field — fixed-seed decoration; every honest element sits above it */}
              <rect width="600" height="600" fill="#0A0C11" />
              {STARS.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#E8E6E1" opacity={s.o} />
              ))}
              <rect width="600" height="600" fill="url(#u-vignette)" pointerEvents="none" />

              {/* Bands: structural commitment, inner → outer */}
              {( [0, 1, 2] as const ).map((band) => (
                <g key={band}>
                  <circle cx={CX} cy={CX} r={BAND_R[band] * SCALE} fill="none" stroke="#262B3A" strokeWidth="1" strokeDasharray="2 6" />
                  <text x={CX} y={CX - BAND_R[band] * SCALE - 5} textAnchor="middle" fontSize="8" letterSpacing="2" fill="#8B90A0" opacity="0.75">{BAND_LABEL[band].toUpperCase()}</text>
                </g>
              ))}

              {/* Filaments first — threads run beneath the worlds they join */}
              {scene.filaments.map((f) => {
                const a = posOf.get(f.a); const b = posOf.get(f.b);
                if (!a || !b) return null;
                return (
                  <g key={f.key}>
                    <title>{`${f.title}\n${f.evidence}`}</title>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#B98CE0" strokeWidth={1.4 + 2.6 * f.score} opacity={0.15 + 0.15 * f.score} filter="url(#u-glow)" />
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#B98CE0" strokeWidth={0.6 + 1.8 * f.score} opacity={0.35 + 0.3 * f.score} />
                  </g>
                );
              })}

              {/* Comets — attached to the world their move names */}
              {scene.comets.filter((c) => c.worldId && posOf.has(c.worldId)).map((c) => {
                const w = scene.bodies.find((b) => b.id === c.worldId)!;
                const head = polar(c.angleDeg, w.r + 0.055);
                const tail = polar(c.angleDeg, w.r + 0.055 + 0.06 * c.tailScale);
                return (
                  <g key={c.key} className="cursor-pointer" onClick={() => navigate(c.route)}>
                    <title>{`${c.title}\n${c.why}\n→ ${c.actionLabel}`}</title>
                    <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} stroke="#FF8A3D" strokeWidth="1.4" opacity="0.65" strokeLinecap="round" />
                    <circle cx={head.x} cy={head.y} r={3.5} fill="#FF8A3D" />
                  </g>
                );
              })}

              {/* Worlds */}
              {scene.bodies.map((b) => {
                const p = posOf.get(b.id)!;
                const activity = glow.get(b.id) ?? 0;
                const fill = b.momentum ? MOMENTUM_HEX[b.momentum.label] : UNOBSERVED_HEX;
                const open = () => {
                  // Navigate regardless — the local world is loaded into the explorer's store; a
                  // load hiccup must not leave the click silently dead (unhandled rejection).
                  if (b.localOnly) { void loadWorld(b.id).catch(() => {}).finally(() => navigate('/garvis/explore')); return; }
                  if (b.isSystem) { navigate(`/garvis/system/${b.id}`); return; }
                  setSelected(b);
                };
                return (
                  <g key={b.id} className="cursor-pointer" onClick={open}>
                    <title>{`${b.title} (${BAND_LABEL[b.band]}${b.localOnly ? ' · local' : ''})\n${b.massEvidence}${b.momentum ? `\nmomentum: ${b.momentum.label} (${b.momentum.evidence})` : b.localOnly ? '\nlocal rabbithole — click to open it in Explore' : '\nnever observed — open it once to compile its state'}\n${activity} recorded event${activity === 1 ? '' : 's'} in the 7 days before ${atIso.slice(0, 10)}`}</title>
                    {activity > 0 && (
                      <circle
                        cx={p.x} cy={p.y} r={b.size + 6 + Math.min(6, activity)}
                        fill={fill} opacity={Math.min(0.4, 0.1 + 0.05 * activity)} filter="url(#u-glow)"
                        className={isNow && !reduced ? 'animate-pulse' : undefined}
                      />
                    )}
                    <circle
                      cx={p.x} cy={p.y} r={b.size} fill={fill}
                      opacity={isNow ? (b.momentum ? 0.95 : b.localOnly ? 0.4 : 0.55) : 0.3}
                      filter={b.momentum ? 'url(#u-glow)' : undefined}
                    />
                    {b.isSystem && <circle cx={p.x} cy={p.y} r={b.size + 3.5} fill="none" stroke={fill} strokeWidth="0.9" opacity="0.55" />}
                    {b.localOnly && <circle cx={p.x} cy={p.y} r={b.size + 3} fill="none" stroke="#8B90A0" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.6" />}
                    {(b.isSystem || showAllLabels) && (
                      <text x={p.x} y={p.y + b.size + 12} textAnchor="middle" fontSize="10" fill={b.isSystem ? '#C9CDD9' : '#8B90A0'}>{b.title}</text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Time — replaying the record is the only honest time travel */}
            <div className="border-t border-forge-border px-4 py-3">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} value={Math.round(frac * 100)}
                  onChange={(e) => setFrac(Number(e.target.value) / 100)}
                  disabled={!scene.timeline.oldest}
                  className="h-1 flex-1 cursor-pointer accent-[#FF8A3D]"
                  aria-label="Replay the recorded events"
                />
                <span className="w-40 text-right text-xs text-forge-dim">
                  {isNow ? 'now' : new Date(atIso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                {!isNow && (
                  <button onClick={() => setFrac(1)} className="rounded border border-forge-border px-2 py-0.5 text-xs text-forge-dim hover:text-forge-ink">now</button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-forge-dim">
                position is identity, not similarity — relatedness is a drawn filament or it isn't claimed · every glow is a count ·
                the scrubber replays recorded events{!isNow && ' — momentum light dims in the past because momentum history isn’t persisted'}
              </p>
            </div>
          </div>

          {/* The panel */}
          <div className="space-y-4">
            {selected && !selected.isSystem && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-forge-ink">{selected.title}</h2>
                  <span className="text-[10px] uppercase tracking-wide text-forge-dim">{BAND_LABEL[selected.band]}</span>
                </div>
                <p className="text-xs text-forge-dim">{selected.massEvidence} · last touched {timeAgo(selected.updated_at)}</p>
                <p className="mt-2 text-xs text-forge-dim">
                  No production areas yet — this world is {selected.band === 2 ? 'a spark' : 'thought without a charter'}.
                </p>
                <Link to="/garvis/webs" className="mt-2 inline-flex items-center gap-1 text-xs text-forge-ember"><Waypoints size={12} /> Charter a web to make it a system</Link>
              </section>
            )}

            {scene.comets.length > 0 && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Next moves across the universe</h2>
                <ul className="space-y-2">
                  {scene.comets.map((c) => (
                    <li key={c.key}>
                      <button onClick={() => navigate(c.route)} className="group w-full rounded-lg border border-forge-border px-3 py-2 text-left transition-colors hover:border-forge-ember/50">
                        <span className="block text-sm text-forge-ink/90 group-hover:text-forge-ink">{c.title}</span>
                        <span className="block text-xs text-forge-dim">{c.why}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">
                The record — 7 days before {isNow ? 'now' : atIso.slice(0, 10)}
              </h2>
              {windowEvents.length === 0 ? (
                <p className="text-xs text-forge-dim">Nothing recorded in this window.</p>
              ) : (
                <ul className="space-y-1.5">
                  {windowEvents.map((e, i) => (
                    <li key={`${e.occurred_at}:${i}`} className="text-xs">
                      <span className="text-forge-ink/85">{e.subject}</span>
                      <span className={cn('ml-1.5 text-forge-dim/70')}>{timeAgo(e.occurred_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {scene.filaments.length > 0 && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Filaments — cross-world threads</h2>
                <ul className="space-y-1.5">
                  {scene.filaments.slice(0, 6).map((f) => {
                    const at = scene.bodies.find((b) => b.id === f.a)?.title ?? '?';
                    const bt = scene.bodies.find((b) => b.id === f.b)?.title ?? '?';
                    return (
                      <li key={f.key} className="text-xs">
                        <span className="text-forge-ink/85">{at} ↔ {bt}</span>
                        <span className="block text-forge-dim/80">{f.title} · {Math.round(f.score * 100)}% measured</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
