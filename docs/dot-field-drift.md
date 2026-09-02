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

## 8. Revision 3 — two kinds of scent (2026-09-02)

The founder, having felt both prototypes: "I feel like this beats scrolling. Is there anything to
make it better?" The paradigm's one honest weakness has always been scent — a dot tells you its
topic by colour and nothing else until you stop and read a card. Two additions attack that, both
felt or drawn, neither a control. Plus one port from the seed. All numbers are ESTIMATES until
the wrap says otherwise.

**8.1 Neighbour bloom — scent for the eye.** While the selection moves slowly over the world (thumb
speed plus streaming speed under 350 px/s — one law for both grips) the ring of dots nearest the selection — at most six, within
1.65 pitch — swells and grows a label: the author's first name and a kind glyph (● photo,
▶ reel, ▤ carousel), set in an 18 px pill placed *outward* from the selection so the thumb
never covers it. Placement tries three positions in order (outward, beside the dot, mirrored),
each clamped inside the field and relieved of overlaps, and rejects any that touches a 26 px
keep-out disc around the selection; if none survives, the dot swells and gets no pill — no
label beats a label under the thumb. Neighbours straight above or below get a centred pill.
Labels identify: a leading article is dropped and organisation names keep two words. Off-screen
neighbours get no label. Labels fade in
on a spring (k 520, c 34, one soft overshoot) and vanish the moment the thumb passes 560 px/s — at that speed the selection changes about
thirteen times a second and no label can be read (hysteresis, so a pause never flickers and a
skim is never cluttered; leaving is three times faster than arriving). Read dots bloom dimmer.
The effect: you read three neighbours while feeling one, which is a straight multiplier on
verdicts per second — the number the whole thesis rests on. Works in both grips: around the
thumb when scrubbing, around the reticle when steering with the ring.

**8.2 Haptic texture — scent for the thumb.** Every kind has its own detent, one event per
crossing, never a queued second:

| Kind | Core Haptics (wrap + DetentHaptics plugin) | Stock Capacitor | Android web | Web tick |
|---|---|---|---|---|
| photo | intensity 0.55 · sharpness 0.75 | `selectionChanged` | 12 ms | 1.9 kHz + 150 Hz body, 8 ms |
| reel | 0.85 · 0.30 — a rounder thud | `impact LIGHT` | 18 ms (inside the spec's 20 ms wall) | 1.15 kHz + 105 Hz, 16 ms, louder |
| carousel | 0.60 · 0.60, **two transients 34 ms apart in one pattern** | `selectionChanged` (indistinguishable from photo) | 8 · 22 · 8 ms pattern | doubled transient in one buffer |

The doubled transient needs room: above ~650 px/s the next crossing would land inside it, so
the carousel collapses to a single hit at speed (native, vibrate and audio agree) and the
ratchet stays even; below that speed the detent gap arms from the *end* of the pattern, so a
double can never overlap the next crossing. Under reduced motion, page steps refresh the
selection in every grip and the "page turned" cue is a primer, never a detent — so the only
ticks are real crossings and each carries its kind.

Honest limits: the full texture needs the Core Haptics plugin in `scout/ios-extras/` (now
extended with `count`/`gap`); the stock tick can only make reels feel different; on the web the
tick's *sound* carries the texture and the iPhone ringer switch can silence it. The thumb
learning "that felt like a reel" before the eye arrives is the claim to test in the wrap.

**8.3 Park lock (ported from the seed).** A thumb still for 60 ms (no pointer sample moved) or
under 20 px/s, held 120 ms, locks selection until it moves 0.35 pitch. A resting thumb rolls a
few px on glass and must never tick. Decided in the frame loop at rest, never inside a move. A
lift while parked opens exactly what the card shows — the 60 ms velocity projection is for a
moving thumb only, and a roll under the lock is noise, not aim.

**What the driver proves:** parked on the field, six labels bloom; a ±2 px roll of the parked
thumb adds no ticks; a fast skim shows zero labels while moving and they return within half a
second of slowing; each detent carries its kind (`data-tick`) and a count (`data-ticks`). What
it cannot prove: whether the labels *read* at a glance on a phone, and whether the textures are
distinguishable under a real thumb. Feel tests 8–9 in `scout/README.md`.

*Review pass (2026-09-02):* three adversarial reviewers and six verifiers read the revision; six
defects were confirmed and fixed (reduced-motion paging left the selection stale under the park
lock and ticked a kind-less "photo" without a crossing; the carousel's second transient could
overlap the next detent; the camera-speed gate had no hysteresis and blinked at the threshold;
a parked lift could open a neighbour of the card's post; labels near the screen edge were
clamped back onto the thumb). Fourteen minor findings were folded in where cheap — per-label
text measured once, colours precomputed, the ring scanned once per selection, restart clearing
the new state, frame-rate-independent fades that snap under reduced motion.
