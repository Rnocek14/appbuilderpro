// src/pages/SystemAltitude.tsx
// P2 — THE SYSTEM ALTITUDE. One world rendered as its solar system, every element a row:
// star = Living State, planets = chartered areas (ring by archetype, bearing by identity),
// moons = chartered children, glow = counted 7-day activity, comets = this world's Next Moves,
// nebulae = unactivated archetypes, warnings = evidence-backed blockers/risks.
// No-Theater: planets do not revolve (nothing changed → nothing moves); the only motion is a
// slow pulse on bodies with REAL activity this week, and it stands down for reduced-motion.

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Orbit, Waypoints } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui';
import { cn } from '../lib/utils';
import { loadSystemScene } from '../lib/garvis/systemViewRun';
import type { SystemScene, Planet, GlowTone } from '../lib/garvis/systemView';
import { ringRadius } from '../lib/garvis/systemView';
import { ARCHETYPES } from '../lib/garvis/workweb';

const CX = 300;                 // viewBox center
const SCALE = 268;              // px per 1.0 of normalized radius

const TONE_HEX: Record<'ember' | 'ok' | 'warn' | 'dim', string> = {
  ember: '#FF8A3D', ok: '#4ADE80', warn: '#FACC15', dim: '#8B90A0',
};
const GLOW_HEX: Record<GlowTone, string> = { ember: '#FF8A3D', warn: '#FACC15', none: 'transparent' };
const MOMENTUM_HEX = { surging: '#FF8A3D', steady: '#4ADE80', slowing: '#FACC15', dormant: '#8B90A0' } as const;

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * SCALE * Math.cos(rad), y: CX + r * SCALE * Math.sin(rad) };
}

export default function SystemAltitude() {
  const { worldId = '' } = useParams();
  const navigate = useNavigate();
  const [scene, setScene] = useState<SystemScene | null>(null);
  const [loading, setLoading] = useState(true);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadSystemScene(worldId)
      .then((s) => { if (live) setScene(s); })
      .catch(() => { if (live) setScene(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [worldId]);

  const openArea = (slug: string) => navigate(`/garvis/webs/${worldId}?area=${encodeURIComponent(slug)}`);

  const heartbeatRows = useMemo(() => {
    if (!scene) return [];
    const blockers = scene.warnings.filter((w) => w.kind === 'blocker');
    const risks = scene.warnings.filter((w) => w.kind === 'risk');
    return [
      { q: 'Accomplishing', a: scene.star.objective ?? 'No objective set yet — say what winning looks like.' },
      { q: 'Doing', a: scene.star.momentum ? `${scene.star.momentum.label} — ${scene.star.momentum.evidence}` : 'never observed — open the web once to compile its state' },
      { q: 'Blocked by', a: blockers.length ? blockers.map((b) => b.text).join(' · ') : 'nothing structural' },
      { q: 'At risk', a: risks.length ? risks.map((r) => r.text).join(' · ') : 'nothing flagged' },
      { q: 'Next', a: scene.recommendation ?? scene.comets[0]?.title ?? 'run the play, then reflect' },
      { q: 'Unknown', a: scene.openQuestions[0] ?? 'no open questions on record' },
    ];
  }, [scene]);

  if (loading) return <AppShell><div className="p-8"><Spinner label="Compiling the system…" /></div></AppShell>;
  if (!scene) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-forge-dim">This system could not be loaded.</p>
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to webs</Link>
        </div>
      </AppShell>
    );
  }

  const star = scene.star;
  const momentumHex = star.momentum ? MOMENTUM_HEX[star.momentum.label] : '#8B90A0';

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link to="/garvis/webs" className="text-forge-dim hover:text-forge-ink"><ArrowLeft size={18} /></Link>
          <Orbit size={20} className="text-forge-ember" />
          <h1 className="text-xl font-semibold text-forge-ink">{star.title}</h1>
          <span className="text-xs text-forge-dim">system altitude</span>
          <div className="ml-auto flex items-center gap-2">
            {star.momentum && (
              <span
                title={`${star.momentum.evidence} — derived from counts, never an opinion`}
                className="rounded-lg border border-forge-border px-2.5 py-1 text-xs font-medium"
                style={{ color: momentumHex }}
              >{star.momentum.label}</span>
            )}
            <Link
              to={`/garvis/webs/${worldId}`}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
            ><Waypoints size={13} /> Open the web</Link>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* The sky */}
          <div className="relative overflow-hidden rounded-2xl border border-forge-border bg-forge-bg">
            <svg viewBox="0 0 600 600" className="block h-auto w-full" role="img" aria-label={`${star.title} — orbital view of its production areas`}>
              <defs>
                <radialGradient id="sa-corona">
                  <stop offset="0%" stopColor={momentumHex} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={momentumHex} stopOpacity="0" />
                </radialGradient>
                <filter id="sa-neb" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
              </defs>

              {/* Occupied orbit rings only — an empty orbit is a claim about nothing */}
              {scene.occupiedRings.map((ring) => (
                <circle key={ring} cx={CX} cy={CX} r={ringRadius(ring) * SCALE} fill="none" stroke="#262B3A" strokeWidth="1" strokeDasharray="2 5" />
              ))}

              {/* Nebulae — capability as visible potential */}
              {scene.nebulae.map((n) => {
                const p = polar(n.angleDeg, n.r);
                return (
                  <g key={n.archetype} className="cursor-pointer" onClick={() => navigate(`/garvis/webs/${worldId}`)}>
                    <title>{`${n.label} — ${n.tagline}\n${n.evidence}`}</title>
                    <circle cx={p.x} cy={p.y} r={16} fill="#B98CE0" opacity={0.22} filter="url(#sa-neb)" />
                    <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fill="#8B90A0">{n.label}</text>
                  </g>
                );
              })}

              {/* Comets — this world's next moves; tail length = rank */}
              {scene.comets.map((c) => {
                const head = polar(c.angleDeg, c.r);
                const tail = polar(c.angleDeg, c.r + 0.085 * c.tailScale);
                return (
                  <g key={c.key} className="cursor-pointer" onClick={() => navigate(c.route)}>
                    <title>{`${c.title}\n${c.why}\n→ ${c.actionLabel}`}</title>
                    <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} stroke="#FF8A3D" strokeWidth="1.5" opacity="0.65" strokeLinecap="round" />
                    <circle cx={head.x} cy={head.y} r={4} fill="#FF8A3D" />
                  </g>
                );
              })}

              {/* Planets + moons */}
              {scene.planets.map((p) => <PlanetGroup key={p.id} planet={p} reduced={reduced} onOpen={openArea} />)}

              {/* The star — momentum-lit exactly as far as the counts allow */}
              <g>
                <title>{star.momentum
                  ? `${star.title}\nmomentum: ${star.momentum.label} (${star.momentum.evidence})${star.objective ? `\nobjective: ${star.objective}` : ''}`
                  : `${star.title}\nnever observed — open the web once to compile its state`}</title>
                <circle cx={CX} cy={CX} r={70 * star.coronaScale} fill="url(#sa-corona)" />
                <circle cx={CX} cy={CX} r={20} fill="#FF8A3D" />
                <circle cx={CX} cy={CX} r={20} fill="none" stroke="#FFB573" strokeWidth="1.5" opacity="0.8" />
              </g>
            </svg>

            <p className="border-t border-forge-border px-4 py-2 text-[11px] text-forge-dim">
              Every glow is a count · hover anything for its evidence · nothing here animates unless a row changed
            </p>
          </div>

          {/* The cockpit — Living State, health, and the same comets as actionable text */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Heartbeat</h2>
              <dl className="space-y-2">
                {heartbeatRows.map((row) => (
                  <div key={row.q} className="text-sm">
                    <dt className="text-[11px] uppercase tracking-wide text-forge-dim/70">{row.q}</dt>
                    <dd className="text-forge-ink/90">{row.a}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {scene.warnings.length > 0 && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Orbit health</h2>
                <ul className="space-y-2">
                  {scene.warnings.map((w) => (
                    <li key={`${w.kind}:${w.text}`} className="text-sm">
                      <span className={cn('font-medium', w.kind === 'blocker' ? 'text-forge-warn' : 'text-forge-dim')}>{w.text}</span>
                      <span className="block text-xs text-forge-dim/80">{w.evidence}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {scene.comets.length > 0 && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Comets — next moves</h2>
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

            {scene.openQuestions.length > 0 && (
              <section className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim">Open questions</h2>
                <ul className="list-inside list-disc space-y-1 text-sm text-forge-ink/80">
                  {scene.openQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PlanetGroup({ planet: p, reduced, onOpen }: { planet: Planet; reduced: boolean; onOpen: (slug: string) => void }) {
  const pos = polar(p.angleDeg, p.r);
  const tone = TONE_HEX[ARCHETYPES[p.archetype].tone];
  const lit = p.glow > 0;
  return (
    <g className="cursor-pointer" onClick={() => onOpen(p.slug)}>
      <title>{`${p.title} (${ARCHETYPES[p.archetype].label})\n${p.evidence}`}</title>
      {lit && (
        <circle
          cx={pos.x} cy={pos.y} r={p.size + 7}
          fill={GLOW_HEX[p.glowTone]} opacity={0.28 * p.glow}
          className={reduced ? undefined : 'animate-pulse'}
        />
      )}
      <circle cx={pos.x} cy={pos.y} r={p.size} fill={tone} opacity={lit ? 0.95 : 0.45} />
      {p.moons.map((m) => {
        const mrad = (m.angleDeg * Math.PI) / 180;
        const mx = pos.x + (p.size + 9) * Math.cos(mrad);
        const my = pos.y + (p.size + 9) * Math.sin(mrad);
        return (
          <g key={m.id}>
            <title>{`${m.title}\n${m.evidence}`}</title>
            <circle cx={mx} cy={my} r={2.5} fill={m.glow > 0 ? GLOW_HEX[m.glowTone] : '#8B90A0'} opacity={m.glow > 0 ? 0.95 : 0.55} />
          </g>
        );
      })}
      <text x={pos.x} y={pos.y + p.size + 13} textAnchor="middle" fontSize="10" fill="#8B90A0">{p.title}</text>
    </g>
  );
}
