# The Drift — steering an algorithm with your thumb

*Companion to `docs/dot-field-navigation.md` (the bounded field, P13). The operator's next
idea, verbatim spirit: "if you like the direction you are going it will recenter and you can
continue dragging your thumb around in the direction you like — it feeds algorithms from
different sides and you control where you want to go." Four analyses (recenter physics, the
trajectory-as-signal loop, product theses, a kill report) refereed into this spec. The feelable
half is `prototypes/the-drift.html` — the numbers below are the ones it ships with.*

---

## 1. What the idea really is

The bounded field made rank a *place* instead of a sequence. Drift makes the recommender a
**terrain you walk** instead of a dealer you're dealt by. The field becomes a viewport onto a
territory larger than the screen; pushing into an edge streams the world under your thumb; and
the *trajectory itself is the query* — dwell is interest, speed-past is disinterest, and the
direction you keep choosing is a gradient the engine serves. Scroll feeds are 1-D with no
steering wheel; this is 2-D with an explicit one. The one-liner survives at scale: **the
algorithm suggests where things sit; the thumb decides where to go.**

## 2. The law, renegotiated — not broken

P13's settled law was "dots never move while a thumb is down." Its real content: **the world
never rearranges under your finger.** Drift keeps that by splitting "move" into two things the
hand can tell apart: the lattice stays rigid (dots pinned to world coordinates forever, nothing
reflows), and what moves is the *camera* — only as a direct, proportional, user-caused
consequence of pushing. Self-initiated optic flow is tolerated an order of magnitude better
than imposed flow; the law becomes: **the world moves only while you push it, at a speed you
set, and stops the frame you stop.**

## 3. The conveyor (ship numbers)

| Parameter | Value | Why |
|---|---|---|
| Edge band | 72px, all four edges, corners blend | 1.6× pitch: deep enough to modulate, shallow enough to keep the field |
| Intent gate | outward velocity 60–600px/s sustained 80ms in-band, OR 150ms in-band dwell while slow | a fly-through skim and a stroke *along* the edge must never yank the world — false positives here are catastrophic to trust |
| Velocity | 880px/s × smoothstep(penetration) | ≤20 crossings/s keeps detents percussion, not buzz |
| Combined cap | \|world\| + \|thumb\| ≤ 1100px/s, **thumb has right of way** | the detent budget caps *relative* motion |
| Attack / release | ramp ~180ms / **zero** — velocity dies the frame you retreat or lift, no coast | the asymmetry IS "you push, it never pushes," made mechanical and verifiable |
| Detents | fire on nearest-cell *change*, whether thumb crossed the comb or the comb slid under the thumb; skip-never-queue; none during any system glide | the ribbed feel was never proprioceptive — a crown proves detents-come-to-you feels *more* mechanical |
| Vestibular | one rigid plane, no parallax; 6% vignette above half speed; reduce-motion → half-viewport step-pages on 350ms dwell | self-caused flow plus a cockpit frame is the VR-tested mitigation |

**The drift ring — the operator-tested revision.** The referee originally rejected a
joystick as "abandoning direct manipulation" and ordered the ergonomics *measured, not
assumed*. The measurement happened: the operator's own thumb found edge-holding "kinda fun
but kinda annoying" — the skeptic's reach attack, confirmed in the wild. The revision: a
spring-loaded **ring docked in the thumb's natural home** (bottom-center, 44px radius).
Displacement from center is the velocity vector — same smoothstep envelope, same caps, same
release-stops-dead law — and while steering, **selection hands off to a reticle near screen
center** that the world streams past: the radio-tuner inversion (fixed needle, spinning dial).
Release never opens anything; easing off the stick while something crosses the needle is
itself a dwell signal. Direct scrubbing stays untouched everywhere else on the glass, and the
edge conveyor remains as the secondary grip. Ruling amended: direct manipulation for
*choosing*, the ring for *traveling* — two verbs, two grips, one grammar.

**Recenter-on-lift — the one orchestrated move.** Lift without opening, selection beyond 62%
of half-extent → the camera glides it to center (280–450ms by √distance, ease-out); below the
threshold, nothing moves. 180ms grace; touch-down mid-glide freezes the camera that frame.
Concentrating all system motion into one predictable moment teaches the hand a single grammar:
*ticks and flow are mine; the one silent glide is the system tidying up.* Strokes then chain
like walking — stroke, plant, stroke — so journeys never run out of screen.

**Trail stability = tape rewind.** Cell contents are assigned at first sight and cached for
the session — cache the *assignment*, not the recipe. Back-scrubbing your own path must meet
the exact same dots, same positions, read-fades intact. One regeneration difference on revisit
kills spatial memory, which is still the paradigm's core asset.

## 4. The signal loop

What the engine reads (per-cell, decaying — session half-life 90s):

| Event | Signal |
|---|---|
| Scrub-past (<200ms at speed) | −0.1 — could be transit; sub-600ms is mostly the field working, not judgment |
| Glance (200–600ms) | 0 (noise floor) |
| Pause (600ms–1.5s) | +0.3 |
| Read (>1.5s, slow) | +0.7 |
| Open | +1.0 — the only unambiguous positive |
| Steer-away (sharp turn off a live preview) | −0.6 over that neighbourhood |

**Steer-away is the paradigm's proprietary signal**: no scroll feed can distinguish "scrolled
past" from "actively turned away from," because turning has a direction and a thumb-cost.

What the engine writes — only *unseen territory ahead*: `P ∝ 0.55·continuity (the world must
never semantically teleport) + 0.30·affinity + 0.15·exploration`. Exploration is injected
*perpendicular* to the heading (serendipity ahead reads as disobedience; to the sides it reads
as terrain you may turn toward), renders at full color in-viewport, and never floors below
15% — bubble resistance is structural, not informational. Density may thicken toward taste and
thin where you speed past, but only in unmaterialized cells, floored so no direction becomes a
wall. Density behind you never changes — settled law wins over "honest visualization."

**Legibility instruments, exactly this many:** a one-line drift label ("39% walked · drifting
toward slow food · old maps"), updated ≤ every 2s and never mid-gesture; the trail drawn on
the land (a 20-minute rabbit hole is visibly *20cm of thumb travel in one direction*, and the
way back still exists); a home glyph with bearing and distance. The trail is the feature scroll
cannot render: a consumption ledger with geography. **No wellbeing claims anywhere** — the
skeptic's transparency-uptake data killed the "detox" framing; ship instruments, claim consent,
never virtue.

## 5. The referee's big ruling: bounded first

The skeptic's strongest attack: P13's surviving claim was *bounded + stable*, and an infinite
drift deletes both — risking "infinite scroll in a haptic costume." The ruling: **Drift v1 is
navigation of a large bounded world** (the prototype ships 55×44 cells ≈ 20 phone-screens).
Doneness returns as the odometer — "39% walked" is a *spatial fact*, a stronger receipt than
any feed's scroll position. Truly infinite worlds are deferred until the invariants prove out;
the demo must not simulate them as solved. The steering guarantees that make agency real
rather than theater: reproducible geography (same walk, same world), inspectable currents, and
the exploration floor — all three are cheap in the bounded version.

## 6. What products this becomes (ranked)

1. **Research — the wedge, specifically trend-scouting.** Research is a gradient walk with a
   stop condition; "more like this but toward X" is the query researchers actually have and no
   interface serves. Provenance becomes geography — a bibliography that is a *trail* is a new
   research object. Fit scores: UGC short-form for trend research 9/10, papers 8, products 8,
   patents 6, case law 4 (scent too slow). **Traction Engine's pipeline is the 9/10**: hooks
   clustered by format-embedding, virality as hue, recency as fade, the operator scrubbing
   toward what's rising; pin (second finger) collects without breaking the drift; the trail is
   a scouting session another operator can re-walk. 90-day shape: tiler over the existing
   corpus → dogfood on one phone → trajectory signal wired back into ranking → trails shared
   between operators.
2. **The engine/SDK — the 18-month play.** The gesture is copyable in a weekend; the moat is
   the stack: stable-geography tiling under streaming updates (hard math), the
   trajectory-signal API (the thing ML teams actually want), the versioned detent grammar, and
   portable trail objects. Sell one killer surface first; platform-before-product is the
   classic death.
3. **Social — the biggest prize, the wrong first move.** Field = your people, finite,
   finishable; Drift = the explore you steer. The killer social object is the **shared trail**
   — someone's Sunday-morning drift you re-scrub, their dwells felt as heavier detents under
   your thumb: the mixtape, remade. Co-drifting (two thumbs, ghost halos, one world) is a phone
   call made of content. All of it waits until the bounded version proves the invariants.
4. **Browsing — a feature of other people's products.** The 400ms-scent rule sorts it: images,
   short video, products, fonts, real estate sing; general web search dies.

**Monetization law:** never sell position — a sponsored dot corrupts spatial memory, the core
asset (zero sponsored dots, in writing). The only clean unit is a labeled sponsored *region*
entered knowingly. Sell the instrument (operator seats), corpus connectors, then the SDK.

## 7. What the demo honestly proves — and fakes

`prototypes/the-drift.html` implements everything in §3–§5: the gated conveyor with asymmetric
envelope, detents from relative motion, recenter-on-lift with grace and cancel, immutable
walked-world cache, dwell-weighted sampling of unseen territory with a 15% serendipity floor
and floored density, the drift label, the trail drawn on the land, the trail-as-object tab
with glide-back, home bearing, odometer, reduce-motion step-paging, keyboard drift.

What it deliberately fakes, disclosed on its face: the "algorithm" is twelve seeded currents
and a mixture sampler, not a model; **projection stability at real embedding scale is the open,
unproven risk** (a real engine must guarantee no semantic teleports under streaming updates —
this is the hard part); edge-fetch latency is simulated (real budget: <100ms perceived against
a 300ms–1s rank/fetch/moderate pipeline); and every direction paying off is a property of the
staging. The demo proves one thing, and it's the thing that matters first: **the control loop
is legible and steering feels causal.**
