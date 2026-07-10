// src/pages/Universe3D.tsx
// P4 V1 — THE INHABITED SKY. WebGL universe (three/R3F + bloom): a particle galaxy with real
// depth — 9k stars in three parallax shells, spiral dust arms, a burning core — where every
// WORLD is a glowing orb (emissive intensity = its momentum tier; cold and dim when never
// observed) and clicking one FLIES the camera in to reveal its chartered areas as planets on
// inclined orbits, with a golden holographic ring around the selected star (the Garvis core).
//
// No-Theater in 3D: positions come from the SAME pure compilers (angle = identity hash, band =
// structural commitment); nothing revolves idly — motion is user-driven camera travel, and the
// only pulse is on bodies with recorded activity. The deep field is fixed-seed decoration by
// design; every element ABOVE it answers "which row is that?". SVG views remain the fallback.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { ArrowLeft, Telescope, Waypoints, Orbit as OrbitIcon } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui';
import { loadUniverseScene } from '../lib/garvis/universeViewRun';
import { loadSystemScene } from '../lib/garvis/systemViewRun';
import { listClusterArtifacts, type StudioArtifact } from '../lib/garvis/artifacts';
import { hash32, BAND_R, BAND_LABEL, type UniverseScene, type WorldBody } from '../lib/garvis/universeView';
import type { SystemScene, Planet as SysPlanet } from '../lib/garvis/systemView';
import { X, FileText } from 'lucide-react';

const SKY = 170;                    // universe radius in world units
const MOMENTUM_COLOR: Record<string, string> = {
  surging: '#FF8A3D', steady: '#4ADE80', slowing: '#FACC15', dormant: '#8B90A0',
};

// Deterministic pseudo-randoms from the fixed seed — same sky every visit.
const rnd = (i: number, salt: string) => (hash32(`${salt}-${i}`) % 10000) / 10000;

/** Soft-disc sprite texture, canvas-generated once (no external assets — CSP-safe). */
function discTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, inner.replace(',1)', ',0.45)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function useDisc(): THREE.Texture {
  return useMemo(() => discTexture(), []);
}

/** A planet's position relative to its star — tilt is a stable hash so orbits have volume. */
function planetLocal(p: SysPlanet): [number, number, number] {
  const a = (p.angleDeg * Math.PI) / 180;
  const r = 6 + p.ring * 3.4;
  const tilt = ((hash32(`tilt-${p.id}`) % 100) / 100 - 0.5) * 0.5;
  return [Math.cos(a) * r, Math.sin(a) * r * Math.sin(tilt) * 0.6, Math.sin(a) * r * Math.cos(tilt)];
}

/** 3D position for a world: same identity angle/band as the pure compiler, plus a stable
 *  hash-derived inclination so the sky has VOLUME without inventing similarity. */
function worldPos(b: WorldBody): [number, number, number] {
  const a = (b.angleDeg * Math.PI) / 180;
  const r = b.r * SKY;
  const y = ((hash32(`incl-${b.id}`) % 1000) / 1000 - 0.5) * 34; // ±17 units of depth
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

// ---------------------------------------------------------------------------
// Deep field: stars in three parallax shells + spiral dust arms + the core
// ---------------------------------------------------------------------------

function StarShell({ count, radius, size, salt, hue }: { count: number; radius: number; size: number; salt: string; hue: [number, number, number] }) {
  const tex = useDisc();
  const [positions, colors] = useMemo(() => {
    const p = new Float32Array(count * 3);
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = rnd(i, salt) * Math.PI * 2;
      const ph = Math.acos(2 * rnd(i, salt + 'p') - 1);
      const rr = radius * (0.55 + 0.45 * rnd(i, salt + 'r'));
      p[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = rr * Math.cos(ph) * 0.62;
      p[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      const w = 0.55 + 0.45 * rnd(i, salt + 'c');
      c[i * 3] = hue[0] * w; c[i * 3 + 1] = hue[1] * w; c[i * 3 + 2] = hue[2] * w;
    }
    return [p, c];
  }, [count, radius, salt, hue]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} size={size} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** The spiral dust arms — a logarithmic spiral of tinted particles in the galactic plane. */
function DustArms() {
  const tex = useDisc();
  const [positions, colors] = useMemo(() => {
    const N = 4200;
    const p = new Float32Array(N * 3);
    const c = new Float32Array(N * 3);
    const tints: [number, number, number][] = [[0.56, 0.66, 1], [0.72, 0.55, 0.88], [1, 0.54, 0.24]];
    for (let i = 0; i < N; i++) {
      const arm = i % 2;
      const t = rnd(i, 'sp') * 4.4 + 0.6;                 // spiral parameter
      const ang = t * 1.9 + arm * Math.PI;
      const rad = 14 * Math.exp(0.28 * t) + (rnd(i, 'sj') - 0.5) * 16;
      if (rad > SKY * 0.98) continue;
      p[i * 3] = Math.cos(ang) * rad;
      p[i * 3 + 1] = (rnd(i, 'sy') - 0.5) * (7 + rad * 0.05);
      p[i * 3 + 2] = Math.sin(ang) * rad;
      const tint = tints[hash32(`tint-${i}`) % 3];
      const w = 0.16 + 0.5 * rnd(i, 'sw');
      c[i * 3] = tint[0] * w; c[i * 3 + 1] = tint[1] * w; c[i * 3 + 2] = tint[2] * w;
    }
    return [p, c];
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} size={2.1} vertexColors transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

function CoreGlow() {
  const tex = useDisc();
  return (
    <group>
      {[[120, '#FFE7C2', 0.5], [64, '#FFB573', 0.55], [26, '#FFFFFF', 0.9]].map(([s, col, op], i) => (
        <sprite key={i} scale={[s as number, s as number, 1]}>
          <spriteMaterial map={tex} color={col as string} transparent opacity={op as number} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

/** The golden holographic ring (the Garvis core aesthetic) around the selected system. */
function HoloRing({ radius }: { radius: number }) {
  const tex = useDisc();
  const [positions] = useMemo(() => {
    const N = 900;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd(i, 'hr') * Math.PI * 2;
      const rr = radius * (0.94 + 0.12 * rnd(i, 'hw'));
      p[i * 3] = Math.cos(a) * rr;
      p[i * 3 + 1] = (rnd(i, 'hy') - 0.5) * 1.6;
      p[i * 3 + 2] = Math.sin(a) * rr;
    }
    return [p];
  }, [radius]);
  return (
    <points rotation={[0.28, 0, 0.12]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} color="#FFC46B" size={1.5} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

function GlowOrb({ pos, color, coreScale, halo, pulse, onClick, children }: {
  pos: [number, number, number]; color: string; coreScale: number; halo: number;
  pulse: boolean; onClick?: () => void; children?: React.ReactNode;
}) {
  const tex = useDisc();
  const mat = useRef<THREE.SpriteMaterial>(null);
  const base = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (mat.current && pulse) mat.current.opacity = 0.55 + 0.2 * Math.sin(clock.elapsedTime * 1.4 + base.current);
  });
  return (
    <group position={pos}>
      <mesh onClick={onClick} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <sphereGeometry args={[coreScale, 24, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <sprite scale={[halo, halo, 1]}>
        <spriteMaterial ref={mat} map={tex} color={color} transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera rig — dive-as-travel
// ---------------------------------------------------------------------------

function CameraRig({ target, dist, controls }: { target: THREE.Vector3; dist: number; controls: React.MutableRefObject<any> }) {
  const { camera } = useThree();
  const goal = useRef({ pos: new THREE.Vector3(0, 46, 168), look: new THREE.Vector3(0, 0, 0) });
  useEffect(() => {
    const dir = target.length() > 0.01 ? target.clone().normalize() : new THREE.Vector3(0, 0.25, 1).normalize();
    goal.current.pos = target.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.35, 0));
    goal.current.look = target.clone();
  }, [target, dist]);
  useFrame(() => {
    camera.position.lerp(goal.current.pos, 0.045);
    if (controls.current) {
      controls.current.target.lerp(goal.current.look, 0.06);
      controls.current.update();
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

function Sky({ scene, onSelect, selected, system, planet, onPlanet, arts, onArt }: {
  scene: UniverseScene; onSelect: (b: WorldBody | null) => void; selected: WorldBody | null; system: SystemScene | null;
  planet: SysPlanet | null; onPlanet: (p: SysPlanet) => void; arts: StudioArtifact[] | null; onArt: (a: StudioArtifact) => void;
}) {
  const posOf = useMemo(() => new Map(scene.bodies.map((b) => [b.id, worldPos(b)])), [scene.bodies]);

  return (
    <group>
      <StarShell count={4200} radius={SKY * 2.4} size={1.6} salt="far" hue={[0.75, 0.8, 1]} />
      <StarShell count={3200} radius={SKY * 1.6} size={2.2} salt="mid" hue={[1, 0.92, 0.8]} />
      <StarShell count={1600} radius={SKY * 1.05} size={3.0} salt="near" hue={[1, 0.78, 0.5]} />
      <DustArms />
      <CoreGlow />

      {/* Filaments — measured cross-world threads, arcing through space */}
      {scene.filaments.map((f) => {
        const a = posOf.get(f.a); const b = posOf.get(f.b);
        if (!a || !b) return null;
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 14, (a[2] + b[2]) / 2];
        return (
          <group key={f.key}>
            <Line points={[a, mid, b]} color="#B98CE0" lineWidth={0.6 + 2 * f.score} transparent opacity={0.5} />
          </group>
        );
      })}

      {/* Worlds — glowing orbs; emissive tier = momentum; cold when never observed */}
      {scene.bodies.map((b) => {
        const color = b.momentum ? MOMENTUM_COLOR[b.momentum.label] : '#3A4051';
        const size = 1.2 + b.size * 0.22;
        return (
          <GlowOrb
            key={b.id}
            pos={posOf.get(b.id)!}
            color={color}
            coreScale={size}
            halo={size * (b.momentum ? 7 : 3.5)}
            pulse={!!b.momentum && b.momentum.label !== 'dormant'}
            onClick={() => onSelect(b)}
          >
            <Html center distanceFactor={140} style={{ pointerEvents: 'none' }} position={[0, -(size + 2.4), 0]}>
              <div style={{ color: selected?.id === b.id ? '#FFD9B0' : '#8B90A0', fontSize: 11, whiteSpace: 'nowrap', textShadow: '0 0 6px #000' }}>
                {b.title}{b.localOnly ? ' · local' : ''}
              </div>
            </Html>
          </GlowOrb>
        );
      })}

      {/* The dived system: planets on inclined orbits + the golden holo ring */}
      {selected && system && (
        <group position={posOf.get(selected.id)!}>
          <HoloRing radius={13} />
          {system.planets.map((p) => {
            const r = 6 + p.ring * 3.4;
            const tilt = ((hash32(`tilt-${p.id}`) % 100) / 100 - 0.5) * 0.5;
            const pos = planetLocal(p);
            const ringPts = Array.from({ length: 65 }, (_, i) => {
              const t = (i / 64) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r * Math.sin(tilt) * 0.6, Math.sin(t) * r * Math.cos(tilt));
            });
            const glowing = p.glow > 0;
            const isFocus = planet?.id === p.id;
            return (
              <group key={p.id}>
                <Line points={ringPts} color="#3A4051" lineWidth={0.4} transparent opacity={0.5} dashed dashSize={0.6} gapSize={0.9} />
                <GlowOrb
                  pos={pos}
                  color={glowing ? (p.glowTone === 'warn' ? '#FACC15' : '#FF8A3D') : '#5A6070'}
                  coreScale={0.45 + p.size * 0.05}
                  halo={glowing ? 4.5 : 1.6}
                  pulse={glowing}
                  onClick={() => onPlanet(p)}
                >
                  <Html center distanceFactor={60} style={{ pointerEvents: 'none' }} position={[0, -1.6, 0]}>
                    <div style={{ color: isFocus ? '#FFD9B0' : '#C9CDD9', fontSize: 10, whiteSpace: 'nowrap', textShadow: '0 0 5px #000' }}>{p.title}</div>
                  </Html>
                  {/* V2 — artifact glints: REAL artifact rows in a thin ring around the focused planet */}
                  {isFocus && (arts ?? []).slice(0, 24).map((art, i) => {
                    const ga = ((hash32(`art-${art.id}`) % 360) * Math.PI) / 180;
                    const gr = 1.6 + (i % 3) * 0.5;
                    return (
                      <mesh
                        key={art.id}
                        position={[Math.cos(ga) * gr, ((hash32(`ay-${art.id}`) % 100) / 100 - 0.5) * 0.9, Math.sin(ga) * gr]}
                        onClick={(e) => { e.stopPropagation(); onArt(art); }}
                        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
                        onPointerOut={() => { document.body.style.cursor = ''; }}
                      >
                        <sphereGeometry args={[0.14, 8, 8]} />
                        <meshBasicMaterial color="#FFC46B" toneMapped={false} />
                      </mesh>
                    );
                  })}
                </GlowOrb>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function Universe3D() {
  const navigate = useNavigate();
  const [scene, setScene] = useState<UniverseScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<WorldBody | null>(null);
  const [system, setSystem] = useState<SystemScene | null>(null);
  const [planet, setPlanet] = useState<SysPlanet | null>(null);
  const [arts, setArts] = useState<StudioArtifact[] | null>(null);
  const [openArt, setOpenArt] = useState<StudioArtifact | null>(null);
  const controls = useRef<any>(null);

  useEffect(() => {
    let live = true;
    loadUniverseScene().then((s) => { if (live) setScene(s); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  // Dive: select → fly the camera → resolve the system's planets (real rows, loaded on arrival).
  useEffect(() => {
    let live = true;
    setSystem(null);
    setPlanet(null);
    setOpenArt(null);
    if (selected && !selected.localOnly) {
      loadSystemScene(selected.id).then((s) => { if (live) setSystem(s); }).catch(() => {});
    }
    return () => { live = false; };
  }, [selected]);

  // V2 — landing on a planet loads its REAL artifacts (the glints) and docks the studio panel.
  useEffect(() => {
    let live = true;
    setArts(null);
    setOpenArt(null);
    if (planet) listClusterArtifacts(planet.id).then((a) => { if (live) setArts(a); }).catch(() => { if (live) setArts([]); });
    return () => { live = false; };
  }, [planet]);

  const target = useMemo(() => {
    if (selected && planet) {
      const w = worldPos(selected); const pl = planetLocal(planet);
      return new THREE.Vector3(w[0] + pl[0], w[1] + pl[1], w[2] + pl[2]);
    }
    return selected ? new THREE.Vector3(...worldPos(selected)) : new THREE.Vector3(0, 0, 0);
  }, [selected, planet]);

  if (failed) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-forge-dim">The universe could not be loaded.</p>
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to webs</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="relative h-[calc(100vh-0px)] w-full bg-[#04050A]">
        {!scene ? (
          <div className="flex h-full items-center justify-center"><Spinner label="Compiling the universe…" /></div>
        ) : (
          <Canvas camera={{ fov: 50, position: [0, 46, 168], near: 0.1, far: 2000 }} dpr={[1, 2]} gl={{ antialias: true }}>
            <color attach="background" args={['#04050A']} />
            <Suspense fallback={null}>
              <Sky scene={scene} onSelect={setSelected} selected={selected} system={system} planet={planet} onPlanet={setPlanet} arts={arts} onArt={setOpenArt} />
              <CameraRig target={target} dist={planet ? 7 : selected ? 26 : 168} controls={controls} />
              <OrbitControls ref={controls} enableDamping dampingFactor={0.08} enablePan={false} minDistance={12} maxDistance={340} />
              <EffectComposer>
                <Bloom intensity={1.25} luminanceThreshold={0.16} luminanceSmoothing={0.5} mipmapBlur />
                <Vignette eskil={false} offset={0.18} darkness={0.82} />
                <Noise opacity={0.022} />
              </EffectComposer>
            </Suspense>
          </Canvas>
        )}

        {/* Chrome — DOM stays crisp above the sky */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-forge-border bg-black/50 px-3 py-2 backdrop-blur">
            <Telescope size={16} className="text-forge-ember" />
            <span className="text-sm font-semibold text-forge-ink">Universe</span>
            {scene && <span className="text-xs text-forge-dim">{scene.bodies.length} worlds · {scene.filaments.length} filaments</span>}
            {planet ? (
              <button onClick={() => setPlanet(null)} className="ml-2 rounded-lg border border-forge-border px-2 py-0.5 text-xs text-forge-dim hover:text-forge-ink">← back to system</button>
            ) : selected ? (
              <button onClick={() => setSelected(null)} className="ml-2 rounded-lg border border-forge-border px-2 py-0.5 text-xs text-forge-dim hover:text-forge-ink">← zoom out</button>
            ) : null}
          </div>
          <Link to="/garvis/universe/flat" className="pointer-events-auto rounded-xl border border-forge-border bg-black/50 px-3 py-2 text-xs text-forge-dim backdrop-blur hover:text-forge-ink">2D map</Link>
        </div>

        {/* The selected world's card — every line a row */}
        {selected && !planet && (
          <div className="absolute bottom-4 left-4 w-80 rounded-2xl border border-forge-border bg-black/60 p-4 backdrop-blur">
            <p className="font-display text-sm font-semibold text-forge-ink">{selected.title}</p>
            <p className="mt-0.5 text-xs text-forge-dim">{BAND_LABEL[selected.band]} · {selected.massEvidence}</p>
            {selected.momentum
              ? <p className="mt-1 text-xs" style={{ color: MOMENTUM_COLOR[selected.momentum.label] }}>{selected.momentum.label} — <span className="text-forge-dim">{selected.momentum.evidence}</span></p>
              : <p className="mt-1 text-xs text-forge-dim">{selected.localOnly ? 'local rabbithole — open it in Explore to sync' : 'never observed — open the web once to compile its state'}</p>}
            <div className="mt-3 flex gap-2">
              {selected.localOnly ? (
                <button onClick={() => navigate('/garvis/explore')} className="rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-ember">Open in Explore</button>
              ) : (
                <>
                  <button onClick={() => navigate(`/garvis/webs/${selected.id}`)} className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-xs text-forge-ember"><Waypoints size={12} /> Enter the web</button>
                  <button onClick={() => navigate(`/garvis/system/${selected.id}`)} className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink"><OrbitIcon size={12} /> Cockpit</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* V2 — the docked studio: the cockpit window you work against without leaving space.
            Every line is a row; the golden glints around the planet ARE these artifacts. */}
        {planet && selected && (
          <div className="absolute inset-y-4 right-4 flex w-[380px] flex-col rounded-2xl border border-forge-border bg-black/70 backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-forge-border px-4 py-3">
              <span className="h-2 w-2 rounded-full" style={{ background: planet.glow > 0 ? '#FF8A3D' : '#5A6070' }} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-forge-ink">{planet.title}</p>
              <button onClick={() => setPlanet(null)} className="text-forge-dim hover:text-forge-ink"><X size={15} /></button>
            </div>
            <p className="border-b border-forge-border px-4 py-2 text-[11px] text-forge-dim">{planet.evidence}</p>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {openArt ? (
                <div>
                  <button onClick={() => setOpenArt(null)} className="mb-2 text-[11px] text-forge-dim hover:text-forge-ink">← all artifacts</button>
                  <p className="text-sm font-medium text-forge-ink">{openArt.title}</p>
                  <p className="text-[10px] uppercase tracking-wide text-forge-dim">{openArt.kind} · rev {openArt.revision}</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-body text-xs leading-relaxed text-forge-ink/85">{openArt.detail ?? '(no content)'}</pre>
                </div>
              ) : arts === null ? (
                <p className="text-xs text-forge-dim">Loading artifacts…</p>
              ) : arts.length === 0 ? (
                <p className="text-xs text-forge-dim">Nothing made here yet — open the full studio to generate the first draft.</p>
              ) : (
                <ul className="space-y-1.5">
                  {arts.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => setOpenArt(a)} className="flex w-full items-center gap-2 rounded-lg border border-forge-border px-3 py-2 text-left hover:border-forge-ember/50">
                        <FileText size={13} className="shrink-0 text-forge-ember" />
                        <span className="min-w-0 flex-1 truncate text-xs text-forge-ink/90">{a.title}</span>
                        <span className="text-[10px] text-forge-dim">rev {a.revision}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-forge-border p-3">
              <button
                onClick={() => navigate(`/garvis/webs/${selected.id}?area=${encodeURIComponent(planet.slug)}`)}
                className="w-full rounded-lg bg-ember-gradient px-3 py-2 text-xs font-medium text-[#1A0E04]"
              >Open the full studio — tools, files, chat</button>
            </div>
          </div>
        )}

        <p className="absolute bottom-4 right-4 rounded-lg bg-black/40 px-3 py-1.5 text-[10px] text-forge-dim/80 backdrop-blur">
          drag to orbit · scroll to travel · every glow is a count — hover nothing here lies
        </p>
      </div>
    </AppShell>
  );
}
