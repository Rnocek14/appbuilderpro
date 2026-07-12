# Universe Design Scan — the honest gap analysis vs the references

*Reference set: M81-class spiral galaxy photography (volumetric core, dark dust lanes, pink HII
knots), a wide star field with diffraction-spiked bright stars, a golden accretion-disk render,
a cinematic planets-forward composition, and the JARVIS golden holographic data-core. Question
asked: "is this the best we can actually do?" Answer: **no — the current scene is ~5.5/10
against those references; the browser ceiling with this exact stack is ~8.5/10.** The gaps are
specific and fixable. This scan names each one and what closes it.*

## Where the current scene falls short (element by element)

1. **The galaxy doesn't read as a galaxy.** The references read because of FOUR things the scene
   lacks: (a) density — arms need thousands of particles clustered tightly around a spiral
   centerline with gaussian falloff, not 4.2k uniformly jittered points; (b) **dark dust lanes**
   — the brown-black veins in M81 are *subtractive*; an additive-only particle system can never
   produce darkness, so the scene has no contrast structure; (c) HII knots — small magenta
   clusters dotted along the arms; (d) a core that is **elliptical and stratified** (white →
   cream → amber, squashed along the disk plane), not three stacked circular sprites.
2. **Stars are all the same class.** Real fields follow a power law: thousands dim, a handful
   blinding — and the bright ones carry **diffraction spikes** (the instant "telescope photo"
   signal in reference 2). One uniform sprite size per shell reads as noise, not sky.
3. **Worlds are flat discs, not bodies.** `meshBasicMaterial` = constant color = no sphere cue.
   The references sell "planet" with two lighting facts: a **terminator** (lit side / dark side
   from the star) and a **fresnel atmosphere rim**. Both are one small shader.
4. **No atmosphere in the void.** References 3/4 have colored nebula banks giving the darkness
   texture and depth layers. The scene's background is uniform black — depth comes only from
   parallax.
5. **Bloom is undisciplined.** Threshold 0.16 blooms *everything* mildly, flattening the
   hierarchy that bloom exists to create. The accretion-disk reference works because of extreme
   dynamic range: one blinding source, true darkness. Hot things must be numerically hot
   (over-driven color, toneMapped off) and the threshold raised so ONLY they bloom.
6. **The holo ring is a fuzzy band.** The JARVIS core is concentric SEGMENTED arcs with radial
   ticks and a bright thin rim — structure, not fuzz.
7. **Labels are plain gray text.** In the reference language, text is part of the hologram:
   gold, uppercase, letter-spaced, with tick marks. Typography is the cheapest cinematic win.

## What ships in this pass (implemented with this scan)

- Galaxy rebuilt: ~9k arm particles with gaussian falloff around the spiral centerline, magenta
  HII knots along arms, **dark dust-lane particles (normal-blended, drawn over the arms)**, and
  an elliptical stratified core (squashed sprites + a wide disk haze).
- Star field gains a sparse **bright class with diffraction-spike texture** (canvas-generated,
  4-point) over the three dim shells.
- **FresnelOrb shader** for worlds and planets: star-lit terminator + atmosphere rim, light
  sourced from the galactic core (universe level) or the world's star (system level). Bodies
  finally read as lit spheres; momentum still sets color and over-drive (honesty unchanged).
- Nebula banks: eight fixed-seed soft sprites (violet/teal/ember) at varied depth.
- Dynamic-range discipline: background deepened, bloom threshold raised to 0.32, momentum
  bodies over-driven ~2.4× so only real activity burns.
- Holo ring upgraded: segmented concentric arcs + a thin bright rim line.
- HUD typography: uppercase letter-spaced gold labels for systems.

## The remaining ceiling (next pass, if wanted)

Per-particle size attributes via a custom points shader (true power-law fields), a procedural
galaxy density texture under the particles, lens dirt + subtle chromatic aberration on the
composer, animated shader time on the holo ring gated to activity, and an environment-mapped
specular glint on planet atmospheres. Those take the scene from ~8 to ~8.5-9; beyond that is
offline-render territory.

*Invariant check: every change above is presentation. Positions, colors-by-momentum, glow-by-
activity, and the fixed-seed decoration policy are untouched — the sky gets photographic, the
truth stays the truth.*
