# PROVISIONAL PATENT APPLICATION — TECHNICAL SPECIFICATION (DRAFT)

> **How to use this document (read first, then delete this block before filing).**
> This is a technical specification drafted to serve as the body of a U.S. provisional patent
> application. It is not legal advice and I am not a lawyer. A provisional application is not
> examined; its value is the **priority date** for everything adequately described in it.
> To file: USPTO Patent Center (patentcenter.uspto.gov) → "New submission → Provisional" →
> upload this specification (PDF) + figures + cover sheet (form SB/16) → fee (micro entity
> ~$65, small entity ~$130 as of recent schedules — verify current fees). You have **12 months**
> from filing to convert to a non-provisional or PCT application or the priority lapses.
> **File BEFORE any public disclosure** of the mechanism (the write-up, demo videos, App Store):
> the U.S. has a 12-month grace period for the inventor's own disclosures (AIA §102(b)(1)),
> but the EPO applies absolute novelty (Art. 54 EPC) with no general grace period — a public
> demo before filing kills European rights while leaving U.S. rights intact. The published artifacts to date are private links; the
> repository is private; treat both as non-disclosing but do not test that assumption.
> Strongly recommended: 1–2 hours of a patent attorney's review before filing, and a real
> attorney for the non-provisional conversion (that is where claims get drafted for value —
> the informal claims below are scaffolding for that conversation, not filing-grade).
> Fill in: inventor legal name and residence address; the filing date; entity status.

---

**TITLE:** Method and System for High-Frequency Preference Signal Acquisition via Continuous
Haptic Scrub Navigation of a Spatial Content Field

**INVENTOR:** Riley Nocek [confirm legal name; residence city/state; citizenship]

**FILED:** [date]

---

## FIELD OF THE INVENTION

This invention relates to human-computer interaction and recommendation systems; specifically,
to methods for navigating collections of content items on touch-input devices, and to the
acquisition of user-preference signals — including explicit negative signals — at rates
substantially higher than those available to serially presented content feeds.

## BACKGROUND

Content collections on touch devices are predominantly presented as vertically scrolled lists
or full-screen serial feeds. These interfaces have two structural limitations. First,
*rejection cost*: declining an item requires a discrete flick gesture and an animated
transition (typically several hundred milliseconds), and in full-screen serial feeds the user
must begin consuming an item before the option to skip it is exercised. Second, *signal
poverty*: recommendation systems driving such feeds observe approximately one implicit signal
per item presented (e.g., dwell or watch time), and cannot distinguish an item the user
deliberately avoided from an item the user never saw — the "implicit negative feedback"
problem. Additionally, the ordering of a serial feed conceals the recommender's ranking from
the user, and the extent of a session (its "doneness") is deliberately or incidentally hidden.

Prior spatial presentations of content (zoomable canvases, map metaphors, cover-flow
carousels, honeycomb icon fields) have not solved these problems: they lack a selection model
tolerant of coarse touch input, lack synchronous tactile confirmation of selection change,
provide no principled channel for preference signal extraction, and their layouts typically
reshuffle, defeating spatial memory. Separately, haptic actuators capable of crisp discrete
transients (e.g., linear resonant actuators with programmable transient interfaces) have been
ubiquitous in mobile devices since approximately 2016 but are not used as the primary feedback
spine of any mainstream content-navigation interface.

Known prior art, acknowledged and distinguished (from a live prior-art sweep, 2026-09-01):
area-cursor selection with the nearest-target property (Grossman & Balakrishnan, "The Bubble
Cursor," CHI 2005) lacks hysteresis for continuous scrubbing, haptic confirmation, and any
signal channel. Shipped dot-map browsers (Radio Garden's drag-to-reticle station globe; the
Every Noise at Once family; Nomic Atlas embedding maps) present content spatially with tap or
reticle auto-play but emit no haptic detents, apply no hysteresis, and harvest no gesture
signal from static geography. One-dimensional haptic-detent scrubbers are shipped (platform
page-dot scrubbing; alphabet-rail scrubbers) without two-dimensional fields, preview
coupling, or signal extraction. Gaze-driven adaptive image retrieval (Kozma, Klami & Kaski,
"GaZIR," ICMI-MLMI 2009; "PinView," arXiv 2014) closes an implicit-signal-to-presentation
loop using gaze, without touch input, haptics, hysteresis selection, kinematic event
taxonomy, or negative signals from motion-away. Desktop cursor-movement relevance research
(Huang, White & Dumais, CHI 2011, and successors) infers relevance from passive mouse
telemetry on conventional layouts; cognitive mouse-tracking research reads trajectory
curvature as a psychological measurement; neither defines real-time weighted negative
feedback events from heading kinematics within a designed selection gesture, nor supplies
them to a recommender at the rates disclosed herein. In the patent literature, haptic effects
on item-boundary crossings during continuous scrolling are claimed (e.g., US 10,365,719;
US 8,264,465), and coarse swipe-gesture attributes mapped to signed preference are claimed
(e.g., US 10,891,049); cursor direction-change relevance was disclosed in abandoned
US 2013/0246383. The present invention is distinguished by the combination of
hysteresis-governed nearest-target selection over a two-dimensional content field,
per-selection-interval kinematic classification into weighted preference events including a
heading-kinematics negative ("steer-away"), preference-conditioned materialization of
unvisited territory with immutability of visited territory, and the locomotion and trail
mechanisms disclosed herein.

## SUMMARY

Disclosed is a content navigation method in which items of a collection are laid out as
persistent targets ("dots") in a two-dimensional field at a substantially uniform pitch. A
continuous touch gesture ("scrub") moves across the field; a selection engine assigns the
selection to the nearest target subject to a hysteresis criterion; each selection change emits
a synchronous discrete feedback event ("detent") on a haptic, audio, or combined channel, and
updates a preview surface positioned to avoid occlusion by the operating digit. Lifting the
touch commits (opens) the selected item, subject to a velocity guard.

The method yields two classes of benefit. For the user: near-zero-cost rejection (passing a
target costs on the order of 40 ms with no consumption required), glanceable state of the
entire collection (read/unread as luminance, category as hue, rank as position), visible
completion ("doneness"), and stable spatial memory. For the recommendation system: a
high-frequency stream of per-item micro-verdicts (typically 10–25 per second during active
scrubbing), including a novel explicit negative signal ("steer-away") derived from gesture
trajectory, enabling preference models to converge with substantially fewer sessions than
watch-time-based feeds.

Further disclosed are: an adaptive territory mechanism in which unvisited regions of a bounded
field are materialized from a sampling mixture responsive to the accumulated signals while
visited regions remain immutable; locomotion mechanisms (an intent-gated edge conveyor and a
displacement-to-velocity control region with reticle selection handoff) obeying an asymmetric
envelope in which system-driven motion exists only during active user input; a re-walkable
session record ("trail") carrying per-item dwell weights; and alternative embodiments
including audio-hook previews for audio corpora.

## DETAILED DESCRIPTION

Numerical values below are the tested reference values of a working implementation; each is
illustrative of a workable range, not limiting.

### 1. Field construction

Items are assigned to cells of a two-dimensional lattice with pitch approximately 44 CSS px
(comfortable touch pitch), each cell's render position perturbed by a small persistent jitter
(±4 px) derived from a deterministic hash of the cell coordinates, producing an organic
appearance with stable geometry. Visual channels are budgeted: hue encodes one user-known
taxonomy (≤ ~5–7 values); luminance/opacity encodes read state (read items fade, e.g. to ~26%
opacity, making session coverage visible as texture); size, halo, and motion are reserved for
interaction state. A field may be bounded (a finite "world" with edges and a coverage
odometer) or a viewport onto a larger bounded territory. Item-to-cell assignment is computed
at most once per session boundary and never during an active touch ("stable geography").

### 2. Selection engine

On touch or hover input, candidate targets within a bounded neighborhood of the input point
are evaluated by distance to their static centers (a spatial-hash or bounded scan; no DOM hit
testing). The incumbent selection is retained unless a challenger's distance is less than the
incumbent's distance multiplied by a hysteresis factor (reference 0.80; workable ~0.75–0.85),
eliminating boundary oscillation from sensor noise. A re-entry rule further requires a
recently deselected target (within ~50 ms) to satisfy a stricter factor (reference 0.70).
Input velocity is estimated over a short window (~60 ms) using coalesced input events; when no
events arrive for ~80 ms the estimate decays toward zero. On touch release, the commit target
is resolved by projecting the input point forward along the velocity estimate by ~60 ms
(honoring the target the digit was decelerating toward), and no commit occurs above a release
speed threshold (reference ~1000 px/s), so an interrupted fling does not open an item.

### 3. Feedback grammar (detents)

On each selection change, a discrete feedback event is emitted **synchronously in the input
event handler** (not deferred to a render frame), subject to a minimum inter-event gap
(reference 30 ms; 40 ms above ~1200 px/s or during conveyor locomotion), with excess events
skipped, never queued. Carriers, in order of preference by platform capability: (a) a native
selection-feedback haptic generator (e.g., the platform's picker-detent transient), prepared
at touch start and released at touch end; (b) a short vibration pulse (~10–12 ms); (c) a
synthesized audio tick (~4–8 ms transient comprising a ~1.9 kHz component, a low-frequency
body ~150 Hz, and noise, with ±3% playback-rate jitter per event so rapid sequences read as a
mechanical ratchet); (d) actuation of a hidden platform switch control where (a)–(b) are
unavailable. An activation primer (short pulse or generator preparation) is emitted at touch
start; a distinct stronger transient may accompany commit.

Selection visuals follow a two-spring system: selection-indicator position uses a critically
damped spring (reference stiffness ~900, damping ~60); target swell uses an underdamped spring
(reference ~550/30) producing a single micro-overshoot per crossing. Indicator lag is capped
at ~0.8× pitch by scaling stiffness with separation. Spring integration is performed in
substeps (≤ ~8 ms) for stability across dropped frames. Neighboring targets are displaced
radially from the selected target by a Gaussian falloff (σ ≈ 1 pitch, peak ≈ 6 px, ≤ ~15% of
pitch), computed from the committed selection center only, with hit-testing always against
undisplaced centers.

### 4. Preview coupling

A preview surface presents the selected item's summary content, positioned approximately
80–90 px above the touch point with unsmoothed horizontal tracking, flipping below the touch
point under a hysteretic screen-edge rule, hidden above a flick-speed threshold (~1500 px/s)
and restored after ~80 ms below ~900 px/s. Content swaps are immediate (no crossfade), with
all preview content pre-rendered or synchronously renderable so no selection change awaits
asynchronous loading. Preview depth is dwell-staged: sustained dwell (~1.2 s) deepens the
preview and marks the item consumed ("dwell counts as reading").

### 5. Preference signal acquisition (core)

Each selection interval produces a timestamped event classified by dwell duration and gesture
kinematics. Reference taxonomy and weights:

| Event | Definition (reference) | Signal |
|---|---|---|
| Scrub-past | selected < 200 ms at input speed > 600 px/s | −0.1 |
| Glance | 200–600 ms | 0 (noise floor) |
| Pause | 600 ms–1.5 s | +0.3 |
| Read | > 1.5 s at low speed | +0.7 |
| Open (commit) | lift-open | +1.0 (+ per-second open dwell, capped) |
| Back-scrub | reversal > 120° within ~800 ms returning to a just-left region | +0.5 |
| Direction persistence | heading held within ±25° over ≥ 3 crossings | +0.4 to the heading |
| **Steer-away** | heading change > ~100° sustained ≥ 2 crossings initiated while a preview was displayed | **−0.6 to the abandoned neighborhood, decaying with distance** |

Signals decay with configurable half-lives (reference: in-session taste 90 s; heading intent
30 s; persistent profile ~14 days). During active scrubbing the stream yields approximately
10–25 classified micro-verdicts per second — one to two orders of magnitude more preference
events per minute than serial feeds — and the steer-away event constitutes an **explicit,
low-cost negative signal** unavailable to scroll interfaces, where avoidance and non-exposure
are indistinguishable. Derived metrics include per-session verdict counts and the
rejection-latency distribution. The signal stream trains or conditions a ranking model such
that field adaptation is perceptible within a single session.

### 6. Adaptive territory materialization

In steered embodiments, unvisited cells are materialized on first visibility by sampling a
mixture (reference: 0.55 local continuity, 0.30 accumulated affinity projected on heading,
0.15 exploration injected perpendicular to heading, annealed ~40%→15%, reduced to ~8% under
high direction-persistence and raised to ~25% under prolonged low signal). Local density may
thin toward a floor in low-affinity regions ahead — never behind, and never below a floor that
would create impassable voids. **Materialized cells are immutable for the session** (the
assignment, not the generating recipe, is cached), so revisiting any region reproduces
identical items, positions, and read states ("tape rewind"), preserving spatial memory. In
bounded worlds a coverage odometer (percentage of cells materialized/visited) restores
finishability as a spatial fact.

### 7. Locomotion with an asymmetric envelope

System-driven camera motion exists only while the user actively commands it: velocity ramps in
over ~180 ms and terminates within a frame of release ("attack slow, release zero"). Two
controls are disclosed. **(a) Edge conveyor:** a band (~72 px) at each field edge arms only on
an intent gate — outward input velocity within ~60–600 px/s sustained ~80 ms, or ~150 ms of
low-speed dwell within the band — so fast fly-through skims and strokes along an edge never
arm it; armed velocity follows smoothstep of band penetration up to ~880 px/s, with the sum of
camera and input speeds capped (~1100 px/s ≈ 25 crossings/s at 44 px pitch, input having
right-of-way). Detents fire on relative crossings (the field moving under a stationary digit
ticks identically to the digit moving over the field). **(b) Displacement ring:** a control
region docked in the digit's natural rest zone (reference radius ~44 px) maps displacement
from its center (dead zone ~7 px, saturation ~40 px, smoothstep) to camera velocity; while
engaged, selection is handed to a fixed reticle near the viewport center which the field
streams past, and release halts motion without committing any item. **(c) Recenter-on-lift:**
after an uncommitted release with the selection beyond ~62% of the viewport half-extent, and
after a ~180 ms grace, the camera glides the selection to center over 280–450 ms (scaled by
√distance), cancellable by any touch; no detents are emitted during system glides. A
reduced-motion mode replaces continuous conveyance with discrete half-viewport steps.

### 8. Trail objects

The session record ("trail") is an ordered sequence of visited items with per-item dwell
weights, commit flags, and positions; it is (a) rendered in-field as an age-faded path drawn
in world coordinates; (b) navigable — activating a trail entry glides the camera to the
recorded cell; (c) serializable for sharing, such that a recipient may re-walk the recorded
journey with feedback intensity proportional to the recorder's dwell weights (consumption
rendered as a publishable, re-experienceable artifact).

### 9. Alternative embodiments

Preview content may be an audio hook (~1.5 s excerpt, e.g. cut at energy/variance peaks of a
decoded program stream, cross-faded on selection change), for which the preview is
pre-attentive and no reading is required — suitable for podcast and music corpora ingested
from open syndication enclosures. Fields may present: a communal daily world identical for all
users of a cohort; per-niche daily trend corpora; commerce, image, news, or contact corpora.
Layouts may derive from embedding projections with anchor-stabilized incremental updates.
Rendering may be composited DOM elements or a single canvas with sprite-based glow; input may
be touch, hover (cursor), keyboard (arrow traversal with the same detent grammar), or game
controller/rotary crown (detents mapped to rumble/crown haptics). An accessibility sibling
presents the identical corpus as a first-class list. The signal-acquisition method of §5 is
independent of the specific rendering and may be embodied in any continuous-selection
interface with discrete targets.

## CLAIM-DRAFTING NOTES FOR THE NON-PROVISIONAL (attorney guidance, not filed text)

Per the 2026-09-01 prior-art sweep: do NOT pursue broad claims on (a) haptic detents on item
crossings during continuous input (US 10,365,719, assigned to Google, appears alive to ~2037 —
obtain a professional claim chart before any commercial ship of the detent mechanic), or
(b) generic swipe-kinematics-to-preference mapping (US 10,891,049). The defensible center of
gravity is: per-selection-interval kinematic classification *under hysteresis-governed
nearest-target selection*; the steer-away heading-kinematics negative event as a real-time
weighted recommender input; preference-conditioned territory materialization with
visited-region immutability; and the combined system. Cite GaZIR, US 2013/0246383, and
US 10,891,049 proactively in the non-provisional rather than letting the examiner find them.

## INFORMAL EXAMPLE CLAIMS (scaffolding for non-provisional drafting)

1. A method of acquiring user-preference signals, comprising: presenting items as targets at
   substantially fixed positions in a two-dimensional field; tracking a continuous pointer
   gesture; assigning a selection to the nearest target subject to a hysteresis criterion;
   emitting a synchronous discrete feedback event on each selection change; classifying each
   selection interval by dwell duration and gesture kinematics into weighted preference
   events; and supplying said events to a ranking model.
2. The method of claim 1, wherein a heading change exceeding a threshold, initiated while a
   preview of the selected item is displayed, is classified as an explicit negative signal
   attributed to the abandoned item's neighborhood.
3. The method of claim 1, wherein said events are produced at a rate exceeding five per second
   during active gesturing, including events classifying items rejected without consumption.
4. The method of claim 1, further comprising materializing unvisited field regions from a
   sampling mixture responsive to accumulated preference events, wherein visited regions are
   immutable for the session.
5. The method of claim 1, wherein commit occurs on pointer release resolved by
   velocity-projected lookahead and is suppressed above a release-speed threshold.
6. The method of claim 1, further comprising recording an ordered, dwell-weighted session
   trail, and replaying said trail with feedback intensity proportional to recorded dwell.
7. The method of claim 1, wherein field translation is commanded by an intent-gated edge
   region or a displacement control region, ramps in over an attack interval, terminates
   within one frame of release, and emits feedback events on relative target crossings.
8. A system comprising a touch display, a haptic actuator, and one or more processors
   configured to perform the method of any preceding claim.

## FIGURES (to attach)

FIG. 1 — field at rest: lattice, hue/fade channels, docked preview, odometer.
FIG. 2 — selection engine: Voronoi neighborhood, hysteresis band, re-entry rule.
FIG. 3 — detent timing: input event → synchronous haptic path vs. render path.
FIG. 4 — preview geometry: occlusion offset, flip hysteresis, dwell staging.
FIG. 5 — signal taxonomy timeline with steer-away geometry.
FIG. 6 — territory materialization mixture and immutability of visited cells.
FIG. 7 — locomotion: edge conveyor intent gate and envelope; displacement ring with reticle
handoff; recenter-on-lift thresholds.
FIG. 8 — trail object: in-field path, dwell weights, re-walk.
(Screenshots of the working implementation are suitable; annotate with reference numerals.)

## REDUCTION TO PRACTICE

Working implementations exist as of September 1, 2026, in the inventor's private repository
(`prototypes/the-field.html`, `prototypes/the-drift.html`, native wrapper under `scout/`),
including an automated driven test suite verifying the hysteresis, envelope, intent-gate, and
immutability behaviors described above, and a working audio-hook extraction pipeline
(`scout/scripts/hook-cutter.mjs`) demonstrating the §9 audio embodiment.
