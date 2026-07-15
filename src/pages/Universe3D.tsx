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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { ArrowLeft, Telescope, Waypoints, Orbit as OrbitIcon } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner, Button } from '../components/ui';
import { loadUniverseScene } from '../lib/garvis/universeViewRun';
import { loadSystemScene } from '../lib/garvis/systemViewRun';
import { listClusterArtifacts, type StudioArtifact } from '../lib/garvis/artifacts';
import { hash32, BAND_R, BAND_LABEL, type UniverseScene, type WorldBody } from '../lib/garvis/universeView';
import type { SystemScene, Planet as SysPlanet } from '../lib/garvis/systemView';
import { X, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import UniverseFlat from './Universe';

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

// Canvas textures are hand-made, so R3F's auto-dispose never reaches them — without this they leak
// one GPU texture per body on every visit to /garvis/universe (deep scan P2). This memoizes the
// texture and disposes it when the component unmounts.
function useManagedTexture(make: () => THREE.Texture): THREE.Texture {
  const tex = useMemo(make, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function useDisc(): THREE.Texture {
  return useManagedTexture(() => discTexture());
}

/** A 4-point diffraction-spike star texture — the "telescope photo" signal on bright stars. */
function spikeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 22);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,240,220,0.5)');
  grad.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (const rot of [0, Math.PI / 2]) {
    g.save();
    g.translate(64, 64);
    g.rotate(rot);
    const lg = g.createLinearGradient(-64, 0, 64, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(-64, -1.2, 128, 2.4);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// FRESNEL ORB — the two lighting facts that make a body read as a sphere in the references:
// a terminator (lit side / dark side from the star) and an atmosphere rim. Pure presentation:
// color and intensity still come from momentum/activity, exactly as before.
const ORB_VERT = `
varying vec3 vN; varying vec3 vW;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ORB_FRAG = `
uniform vec3 uColor; uniform float uIntensity; uniform vec3 uLight;
varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uLight - vW);
  float diff = clamp(dot(N, L), 0.0, 1.0) * 0.6 + 0.16;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  vec3 col = uColor * (diff + fres * 1.9) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}`;

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

/** Spiral position on arm `arm` at parameter t, with gaussian scatter around the centerline —
 *  DENSITY is what makes an arm read as an arm. */
function armPoint(i: number, salt: string, spread: number): { x: number; y: number; z: number; t: number } {
  const arm = hash32(`${salt}-arm-${i}`) % 2;
  const t = rnd(i, `${salt}t`) * 4.6 + 0.5;
  const ang = t * 1.9 + arm * Math.PI;
  // gaussian-ish scatter: sum of two uniforms, tighter near the centerline
  const g = (rnd(i, `${salt}g1`) + rnd(i, `${salt}g2`) - 1) * spread * (0.5 + t * 0.22);
  const rad = 13 * Math.exp(0.285 * t) + g;
  return { x: Math.cos(ang) * rad, y: (rnd(i, `${salt}y`) + rnd(i, `${salt}y2`) - 1) * (3.5 + rad * 0.035), z: Math.sin(ang) * rad, t };
}

/** The galaxy disk: dense blue-white arm stars + magenta HII knots + DARK occluding dust lanes.
 *  The lanes are the trick the references depend on — additive light can never make darkness,
 *  so they render normal-blended, near-black, drawn OVER the arms. */
function GalaxyDisk() {
  const tex = useDisc();
  const [armPos, armCol, laneP, hiiP, hiiC] = useMemo(() => {
    const N = 9000;
    const p = new Float32Array(N * 3); const c = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = armPoint(i, 'ga', 9);
      if (Math.hypot(a.x, a.z) > SKY * 0.98) continue;
      p[i * 3] = a.x; p[i * 3 + 1] = a.y; p[i * 3 + 2] = a.z;
      // color temperature: warm toward the core, blue-white outward
      const warm = Math.max(0, 1 - a.t / 4.6);
      const w = 0.2 + 0.55 * rnd(i, 'gw');
      c[i * 3] = (0.62 + 0.38 * warm) * w; c[i * 3 + 1] = (0.68 + 0.2 * warm) * w; c[i * 3 + 2] = (1 - 0.35 * warm) * w;
    }
    const L = 2600;
    const lp = new Float32Array(L * 3);
    for (let i = 0; i < L; i++) {
      const a = armPoint(i, 'lane', 3.2); // tight to the arm's inner edge
      lp[i * 3] = a.x * 0.96; lp[i * 3 + 1] = a.y * 0.6 + 0.8; lp[i * 3 + 2] = a.z * 0.96;
    }
    const H = 260;
    const hp = new Float32Array(H * 3); const hc = new Float32Array(H * 3);
    for (let i = 0; i < H; i++) {
      const a = armPoint(i, 'hii', 4);
      hp[i * 3] = a.x; hp[i * 3 + 1] = a.y; hp[i * 3 + 2] = a.z;
      hc[i * 3] = 1; hc[i * 3 + 1] = 0.35; hc[i * 3 + 2] = 0.62; // HII magenta
    }
    return [p, c, lp, hp, hc];
  }, []);
  return (
    <group>
      <points renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[armPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[armCol, 3]} />
        </bufferGeometry>
        <pointsMaterial map={tex} size={1.9} vertexColors transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <points renderOrder={3}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[laneP, 3]} />
        </bufferGeometry>
        <pointsMaterial map={tex} size={4.6} color="#0B0705" transparent opacity={0.5} depthWrite={false} sizeAttenuation />
      </points>
      <points renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hiiP, 3]} />
          <bufferAttribute attach="attributes-color" args={[hiiC, 3]} />
        </bufferGeometry>
        <pointsMaterial map={tex} size={3.4} vertexColors transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}

/** Sparse bright stars with diffraction spikes — the power-law top of the field. */
function BrightStars() {
  const tex = useManagedTexture(spikeTexture);
  const [positions] = useMemo(() => {
    const N = 110;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = rnd(i, 'bs') * Math.PI * 2;
      const ph = Math.acos(2 * rnd(i, 'bsp') - 1);
      const rr = SKY * (1.1 + 1.2 * rnd(i, 'bsr'));
      p[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      p[i * 3 + 1] = rr * Math.cos(ph) * 0.62;
      p[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    return [p];
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={tex} size={13} color="#FFF6E8" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** Fixed-seed nebula banks — the colored darkness that gives the void its depth layers. */
function Nebulae() {
  const tex = useDisc();
  const banks = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    pos: [
      Math.cos(rnd(i, 'nb') * Math.PI * 2) * SKY * (0.5 + 0.6 * rnd(i, 'nbr')),
      (rnd(i, 'nby') - 0.5) * 70,
      Math.sin(rnd(i, 'nb') * Math.PI * 2) * SKY * (0.5 + 0.6 * rnd(i, 'nbr')),
    ] as [number, number, number],
    scale: 80 + 90 * rnd(i, 'nbs'),
    color: ['#5A4B8A', '#274B5E', '#6E3A22', '#3C2B55'][i % 4],
    opacity: 0.06 + 0.06 * rnd(i, 'nbo'),
  })), []);
  return (
    <group>
      {banks.map((b, i) => (
        <sprite key={i} position={b.pos} scale={[b.scale, b.scale * 0.62, 1]}>
          <spriteMaterial map={tex} color={b.color} transparent opacity={b.opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function CoreGlow() {
  const tex = useDisc();
  // Elliptical + stratified, like the references: a wide disk haze squashed into the galactic
  // plane, then cream → amber → white toward the nucleus.
  const layers: [number, number, string, number][] = [
    [250, 0.34, '#8A6B4A', 0.22],   // disk haze
    [120, 0.42, '#FFE7C2', 0.4],
    [62, 0.5, '#FFB573', 0.55],
    [24, 0.7, '#FFFFFF', 0.95],
  ];
  return (
    <group>
      {layers.map(([w, ratio, col, op], i) => (
        <sprite key={i} scale={[w, w * ratio, 1]}>
          <spriteMaterial map={tex} color={col} transparent opacity={op} depthWrite={false} blending={THREE.AdditiveBlending} />
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
  // Segmented rim: bright dashes with deliberate gaps — structure, not fuzz (the JARVIS ring).
  const rim = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius * 1.12, 0, Math.sin(a) * radius * 1.12));
    }
    return pts;
  }, [radius]);
  return (
    <group rotation={[0.28, 0, 0.12]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial map={tex} color="#FFC46B" size={1.5} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <Line points={rim} color="#FFD9A0" lineWidth={1} transparent opacity={0.8} dashed dashSize={2.2} gapSize={1.1} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

function GlowOrb({ pos, color, coreScale, halo, pulse, hot, lightPos, onClick, children }: {
  pos: [number, number, number]; color: string; coreScale: number; halo: number;
  pulse: boolean; hot?: boolean; lightPos?: [number, number, number]; onClick?: () => void; children?: React.ReactNode;
}) {
  const tex = useDisc();
  const mat = useRef<THREE.SpriteMaterial>(null);
  // Deterministic pulse phase from position — no Math.random in the sky.
  const base = useRef(((pos[0] * 13.37 + pos[2] * 7.77) % 6.28));
  useFrame(({ clock }) => {
    if (mat.current && pulse) mat.current.opacity = 0.55 + 0.2 * Math.sin(clock.elapsedTime * 1.4 + base.current);
  });
  // Fresnel-lit body: terminator from the light source + atmosphere rim. Hot bodies over-drive
  // (only REAL momentum burns past the bloom threshold — dynamic-range discipline).
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uIntensity: { value: hot ? 2.4 : 0.85 },
    uLight: { value: new THREE.Vector3(...(lightPos ?? [0, 0, 0])) },
  }), [color, hot, lightPos]);
  return (
    <group position={pos}>
      <mesh onClick={onClick} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <sphereGeometry args={[coreScale, 32, 32]} />
        <shaderMaterial vertexShader={ORB_VERT} fragmentShader={ORB_FRAG} uniforms={uniforms} toneMapped={false} />
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
  const settled = useRef(false);
  useEffect(() => { settled.current = false; }, [target, dist]);
  useFrame(() => {
    if (settled.current) return; // arrived — free orbit; the rig only drives TRANSITIONS
    camera.position.lerp(goal.current.pos, 0.045);
    if (controls.current) {
      controls.current.target.lerp(goal.current.look, 0.06);
      controls.current.update();
    }
    if (camera.position.distanceTo(goal.current.pos) < 0.6) settled.current = true;
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
      <StarShell count={4200} radius={SKY * 2.4} size={1.5} salt="far" hue={[0.75, 0.8, 1]} />
      <StarShell count={3200} radius={SKY * 1.6} size={2.0} salt="mid" hue={[1, 0.92, 0.8]} />
      <StarShell count={1600} radius={SKY * 1.05} size={2.7} salt="near" hue={[1, 0.78, 0.5]} />
      <BrightStars />
      <Nebulae />
      <GalaxyDisk />
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
        const hot = !!b.momentum && b.momentum.label !== 'dormant';
        return (
          <GlowOrb
            key={b.id}
            pos={posOf.get(b.id)!}
            color={color}
            coreScale={size}
            halo={size * (hot ? 7 : 3)}
            pulse={hot}
            hot={hot}
            lightPos={[0, 0, 0]}
            onClick={() => onSelect(b)}
          >
            <Html center distanceFactor={140} style={{ pointerEvents: 'none' }} position={[0, -(size + 2.6), 0]}>
              <div style={{
                color: selected?.id === b.id ? '#FFC46B' : b.isSystem ? '#D8B98A' : '#8B90A0',
                fontSize: 10.5, whiteSpace: 'nowrap', textShadow: '0 0 8px #000',
                letterSpacing: 2, textTransform: 'uppercase', fontWeight: b.isSystem ? 600 : 400,
              }}>
                {b.title}{b.localOnly ? ' · LOCAL' : ''}
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
                  hot={glowing}
                  lightPos={posOf.get(selected!.id)!}
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

// ONE SKY (design review P0): /garvis/universe is the only door. The WebGL scene renders when
// the machine can and the user hasn't asked otherwise; the SVG map (the identical UniverseScene
// through the same pure compiler) is the automatic fallback for no-WebGL / reduced-motion, and a
// pill toggles between them. The old /universe/flat route redirects here with ?mode=flat.
export default function UniverseSky() {
  const [params, setParams] = useSearchParams();
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Reset the pointer cursor on unmount — navigating away mid-hover left it stuck as a pointer
  // (deep scan P2), since onPointerOut never fires when the whole scene unmounts.
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  const webgl = useMemo(() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }, []);
  const mode = params.get('mode');
  // No-WebGL ALWAYS falls back to the flat map (deep scan P2): a ?mode=3d deep link used to bypass
  // the guard and throw into the error boundary on a machine that can't do WebGL. mode=3d still
  // overrides reduced-motion (an explicit opt-in), but never the hardware capability check.
  const flat = mode === 'flat' || !webgl || (mode !== '3d' && reduced);
  const setMode = (m: 'flat' | '3d') => {
    const next = new URLSearchParams(params);
    next.set('mode', m);
    setParams(next, { replace: true });
  };
  return (
    <>
      {flat ? <UniverseFlat /> : <Universe3D />}
      {/* Bottom-CENTER (review fix): both bottom corners belong to the 3D scene's own UI — the
          selected-world card sits left, the orbit hint and docked studio panel sit right. */}
      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-forge-border bg-forge-raised/95 p-1 text-[11px] shadow-lift">
        {webgl && !reduced && (
          <>
            <button onClick={() => setMode('3d')} className={cn('rounded-full px-2.5 py-1', !flat ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>3D sky</button>
            <button onClick={() => setMode('flat')} className={cn('rounded-full px-2.5 py-1', flat ? 'bg-forge-ember/15 text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>2D map</button>
            <span className="mx-0.5 h-4 w-px bg-forge-border" />
          </>
        )}
        <Link to="/garvis/explore" className="rounded-full px-2.5 py-1 text-forge-dim hover:text-forge-ember" title="The rabbit-hole galaxy — live exploration, same sky family">Rabbit holes →</Link>
      </div>
    </>
  );
}

function Universe3D() {
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
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to Businesses</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="relative h-[calc(100vh-0px)] w-full bg-[#020308]">
        {!scene ? (
          <div className="flex h-full items-center justify-center"><Spinner label="Compiling the universe…" /></div>
        ) : (
          <Canvas camera={{ fov: 50, position: [0, 46, 168], near: 0.1, far: 2000 }} dpr={[1, 2]} gl={{ antialias: true }}>
            <color attach="background" args={['#020308']} />
            <Suspense fallback={null}>
              <Sky scene={scene} onSelect={setSelected} selected={selected} system={system} planet={planet} onPlanet={setPlanet} arts={arts} onArt={setOpenArt} />
              <CameraRig target={target} dist={planet ? 7 : selected ? 26 : 168} controls={controls} />
              <OrbitControls ref={controls} enableDamping dampingFactor={0.08} enablePan={false} minDistance={12} maxDistance={340} />
              <EffectComposer>
                <Bloom intensity={1.35} luminanceThreshold={0.32} luminanceSmoothing={0.35} mipmapBlur />
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
              <Button
                variant="primary" size="sm" className="w-full"
                onClick={() => navigate(`/garvis/webs/${selected.id}?area=${encodeURIComponent(planet.slug)}`)}
              >Open the full studio — tools, files, chat</Button>
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
