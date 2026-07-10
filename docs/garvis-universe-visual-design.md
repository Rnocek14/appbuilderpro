# The Universe, With Depth — Visual Design Spec (P4: the Inhabited Sky)

*The current Universe/System views are honest diagrams — flat SVG sheets. This spec makes the
sky a PLACE: one continuous 3D scene you fly through, where diving into a world is camera
travel, planets glow like bodies not dots, and landing on a feature opens its studio. Every
No-Theater invariant survives: the scene compilers (universeView/systemView) stay untouched —
same rows in, same scene out; only the RENDERER gains a dimension.*

---

## 1. The one-camera model (no more separate pages)

Universe, System, and Planet are not three screens — they are three CAMERA DISTANCES in one
persistent 3D scene. Navigation is travel:

```
UNIVERSE (camera far)          — all worlds: glowing spheres in a starfield, filament ribbons
   ↓ click a world             — camera FLIES IN (900ms, the signature cubic-bezier)
SYSTEM (camera at the star)    — the star burns center; chartered areas resolve from points
                                 into planets on INCLINED orbital planes (this is the depth)
   ↓ click a planet            — camera settles into orbit around it
PLANET (camera in orbit)       — moons (child areas) + artifacts as glinting satellites;
                                 the STUDIO docks in as a right-side overlay panel — content
                                 stays crisp DOM, the 3D stays the map
   ↑ scroll out / breadcrumb   — camera pulls back; nothing re-renders, you just leave
```

Routes stay deep-linkable: `/garvis/universe`, `/garvis/system/:id`, `?area=` set the camera
target; back/forward = camera moves. The transition IS the information: you always know where
you are because you watched yourself get there (Rule 5: transitions reduce friction).

## 2. Material language — how honesty looks in 3D

| Element | Render | Driven by (unchanged truth) |
|---|---|---|
| World body / star | Emissive sphere + additive corona sprite + bloom | momentum label tier → emissive intensity; never observed = cold, dim, no bloom |
| Planet (area) | Shader-lit sphere: rim-light from the star, archetype-tinted surface, emissive edge | glow = counted 7-day artifacts / waiting approvals; size = log artifact mass |
| Orbit | Faint elliptical ring, inclined 8–22° (hash of cluster id → stable inclination) | ring = archetype; angle = id hash — spatial memory survives the third dimension |
| Moons | Small satellites orbit-locked to the parent | chartered children |
| Artifacts | Glints (instanced points) in a thin ring around their planet | real artifact rows; hover = title, click = open in studio |
| Filaments | Glowing bezier ribbons arcing THROUGH space between worlds | cross-world insights, width/brightness = measured cosine |
| Nebulae | Volumetric fog sprites at the system rim, faint violet | unactivated archetypes ("capability as potential") |
| Comets | Bright head + short particle tail, parked on the outer band | the same ranked Next Moves; click = act |
| Local worlds | Dashed holographic shell around the sphere | localOnly flag |
| Deep field | 3-layer instanced starfield with camera parallax + subtle nebula fog | fixed seed — decoration by design, claims no state |

**Motion policy (No-Theater in 3D):** bodies do NOT revolve idly. Motion sources are exactly:
(a) camera travel the user initiated, (b) parallax from that travel, (c) a slow emissive pulse
only on bodies with real activity this week, (d) comet tail shimmer only while the camera moves.
`prefers-reduced-motion`: instant camera cuts, zero pulse. The scrubber still replays the
record — in 3D it relights the sky at time T.

## 3. Post-processing (what makes it "space simulator")

Bloom (threshold tuned so ONLY emissive = honest activity blooms), filmic tone mapping, gentle
vignette, barely-there film grain. No lens flares (pure decoration on a claim-bearing surface),
no god rays. The ember/forge palette carries over: void #05060A, bodies in momentum colors,
filaments #B98CE0.

## 4. The studio landing (click a feature → content)

Landing on a planet does NOT navigate away. The camera holds orbit; a right-docked panel
(40% width, glass-dark, same forge chrome) slides in with the EXISTING workspace: tools,
artifacts, files, brand kit, studio chat. The 3D scene dims 20% behind it. Clicking an artifact
glint opens that artifact in the panel. Escape/click-void = panel retracts, camera stays.
This is "not a sheet of tasks": the sheet becomes the cockpit window you dock against.

## 5. Tech decision

**three.js + @react-three/fiber + drei (+ postprocessing for bloom).** The repo already pins
three/R3F for generated apps' preview import-map, so the stack is house-approved. The 3D route
is lazy-loaded (dynamic import) so the main bundle is untouched; WebGL-unavailable falls back
to the current SVG views (they remain as the accessible/fallback renderer — nothing is lost).
The pure compilers stay the single source of truth: `angleOf/ringRadius` extend to 3D as
`(angle, ring, hash-inclination) → x,y,z`, one pure function, verified like everything else.

## 6. Build phases

- **V1 — the inhabited sky**: one R3F scene for Universe+System, fly-in/fly-out camera, bloom,
  emissive bodies, inclined orbits, starfield parallax, filament ribbons; planet click deep-links
  into the existing WorkWeb (?area) while the docked panel lands in V2.
- **V2 — orbit + dock**: planet-orbit camera, artifact glints, the docked studio panel in-scene
  (WorkWeb's workspace extracted into a reusable panel component).
- **V3 — time & life**: scrubber relights the 3D sky; away-replay on arrival (the ~3s delta
  flight over what changed); Explore's constellation joins the same scene.

*Acceptance: entering the Universe should feel like opening a window, not a dashboard — and
every glow you see must still survive the question "which row is that?"*
