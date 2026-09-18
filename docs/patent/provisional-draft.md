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

Two-dimensional semantic arrangements of media are themselves known and are not claimed herein:
Gracenote, US 8,855,798, discloses a two-dimensional energy × valence grid of media items with
selection of a sequential path across zones and zone colouring by item count; Sony, US 7,858,868,
discloses mood-classified items arranged by angle with hue mapped to mood angle and saturation to
mood strength; Monkeymedia, US 6,281,899, discloses steering a focal point across a topic space to
select content; and the shipped services Musicovery (2006), Getty Moodstream (2008) and Every Noise
at Once (2013) present music on named two-dimensional axes. None of these discloses hysteresis-
governed nearest-target selection with synchronous per-crossing feedback, per-interval kinematic
classification of preference, or the attribution of heading events as signed preference on the
axes of arrangement while visited regions remain immutable; the named-axis embodiment of §6A is
directed only to that combination.

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

[Counsel note: the paragraph below characterizes what each reference teaches. Statements in the
specification are binding admissions; consider listing these references neutrally here ("the
applicant is aware of…") and carrying the characterizations in the non-provisional's IDS
instead, keeping only the closing distinguishing sentence.]
Further prior art relevant to the proxy-field embodiment of §9A, acknowledged and
distinguished (live sweep, 2026-09-02): Karlson & Bederson, "ThumbSpace," INTERACT 2007, and
Karlson & Bederson, CHI 2008, disclose an abstract, non-miniature proxy region within thumb
reach, partitioned into one sub-region per on-screen object with the objects' relative
arrangement preserved, an in-place "object cursor" highlighting the corresponding real object,
a directional ten-pixel jump to the nearest object, lift-to-commit with drag-to-cancel, and
proxy-driven scrolling of a focused widget — without haptic feedback, without hysteresis, and
without preference-signal acquisition; the same work measured such a proxy at roughly 2.5×
the selection time of direct touch. Nacenta et al., "Radar View," CHI 2005; Aliakseyeu et al.,
"Bubble Radar," AVI 2006; Guiard et al., "Object Pointing," GI 2004; Baudisch et al.,
"Drag-and-Pop," INTERACT 2003; Bezerianos & Balakrishnan, "Vacuum," CHI 2005; and Yu et al.,
"BezelSpace/CornerSpace," MobileHCI 2013 disclose miniature or proxy representations that bring
distant targets within reach. Kurtenbach, US 5,689,667 (expired), discloses hold-to-reveal
marking menus with stroke-to-select; shipped hold-bloom-slide-lift controls include Pinterest's
press-and-hold pin menu (July 2013), Facebook Reactions (2016), and Palm webOS Quick Launch
(2009). KDDI, US 9,244,544 (in force), claims a reduced reference image of the display acting as
an in-screen touchpad with a vibration when the finger overlaps each reduced icon and a pointer
displayed on the original image; Amazon, US 9,389,718 and US 10,353,570 (in force), claim
thumb-reachable input areas distinct from the locations of the selectable items they control,
presented on a held squeeze, with visual distinction of the associated item and haptic
indication. Poupyrev & Maruyama, UIST 2003, and Pielot et al., "PocketMenu," MobileHCI 2012,
disclose a tactile click per item while dragging over a compact list control; Apple, US
10,175,759, claims an index scrubber with rate-limited tactile outputs; Apple, US 9,678,571,
claims omitting a tactile output when the previous one is too recent; Immersion, US 7,148,875
and US 8,188,981 (both expired), disclose pulses as a cursor traverses icons and menu borders.
Android 9 "Quick Scrub" and the iOS 14 Home Screen page-indicator (Apple, US 11,416,127 family)
disclose holding a persistent indicator, scrubbing with per-page haptics, and auto-advancing
when the finger persists past a boundary; Apple, US 8,689,128, discloses a scrubbing rate applied
when contact leaves a scrubber region; Onshape, WO 2017/199221, discloses hysteresis before
locking a touch selection; Guo et al., SIGIR 2013, infers relevance from touch kinematics. On
US 10,365,719 the applicant notes that all three independent claims require a symbol queue and
an expanded item display with synchronized haptics. The §9A embodiment is distinguished from
the foregoing by the combination of hysteresis-governed nearest-target selection with a
speed-gated park lock over a hold-revealed abstract lattice mapped to exactly the host items
currently displayed, synchronous skip-never-queue crossing events, in-place host emphasis with
an occlusion fallback, deterministic single-row host translation that retains and re-associates
the selected proxy target, and per-interval preference classification attributed to host items;
no independent claim is directed to the proxy region, the boundary translation, or the
translation feedback event as such.

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
at most once per session boundary and is never rearranged during an active touch ("stable
geography"); in the proxy-field embodiment of §9A the target-to-item association may advance
by whole rows during host translation while the target positions themselves remain fixed.

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
mechanical ratchet). Carriers available on some platform versions have included actuation of a
hidden platform switch control where (a)–(b) were unavailable; that path is no longer available
on current mobile web platforms and the audio carrier (c) is the sole web fallback. An
activation primer (short pulse or generator preparation) is emitted at touch
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
| **Steer-away** | heading change > ~100° sustained ≥ 2 crossings initiated while a preview was displayed | **−0.6 to the abandoned neighborhood, decaying with distance**; where targets are arranged on named axes (§6A), additionally a signed preference on the axis of retreat (e.g., retreating from the high-intensity edge is "too intense") |
| Steer-toward (axis) | net field displacement ≥ 4 target pitches along a named axis commanded through the locomotion control (§7) while armed | +0.4 · sign on that axis to regions lying ahead, half-life ~30 s; logged as an explicit axis preference with the field coordinate; a displacement into the field's boundary is logged once per contact as a clamped preference with no weight change |

Signals decay with configurable half-lives (reference: in-session taste 90 s; heading intent
30 s; persistent profile ~14 days). During active scrubbing the stream yields approximately
10–25 classified micro-verdicts per second — one to two orders of magnitude more preference
events per minute than serial feeds — and the steer-away event constitutes an **explicit,
low-cost negative signal** unavailable to scroll interfaces, where avoidance and non-exposure
are indistinguishable. Derived metrics include per-session verdict counts and the
rejection-latency distribution. The signal stream trains or conditions a ranking model such
that field adaptation is perceptible within a single session.

### 6. Adaptive territory materialization

In one steered embodiment, unvisited cells are materialized on first visibility by sampling a
mixture (reference: 0.55 local continuity, 0.30 accumulated affinity projected on heading,
0.15 exploration injected perpendicular to heading, annealed ~40%→15%, reduced to ~8% under
high direction-persistence and raised to ~25% under prolonged low signal). In the named-axis
embodiment of §6A the region of every cell is instead a fixed placement and accumulated
preference conditions only which item fills an unvisited cell and the rendered belief
indication of each region. Local density may
thin toward a floor in low-affinity regions ahead — never behind, and never below a floor that
would create impassable voids. **Materialized cells are immutable for the session** (the
assignment, not the generating recipe, is cached), so revisiting any region reproduces
identical items, positions, and read states ("tape rewind"), preserving spatial memory. In
bounded worlds a coverage odometer (percentage of cells materialized/visited) restores
finishability as a spatial fact.

### 6A. Attribute-scored placement on named coordinates

In a further embodiment the field is a bounded region whose two coordinates carry named
attributes. In a first variant the coordinates are two Cartesian axes (reference: an intensity
axis and a register axis, presented as four compass words on the locomotion control — e.g.,
CALM/WILD and SERIOUS/GOOFY). In a second, preferred variant the coordinates are polar: the
bearing about a hub names a nominal category (reference: eight sectors of 45°, each carrying a
kind and a hue) and the radius carries an ordinal intensity attribute in the field's own words
(reference: casual → extreme; mainstream → deep cut), the hub being the field's mainstream and
the rim its bound; the locomotion control then displays a home word at the bearing toward the hub
and a depth word opposite, both turning with the viewport's position, and while a displacement is
commanded the depth word toward which the user heads is emphasized in the interaction colour
together with the name of the category ahead, both announced to assistive technology. Named
regions are assigned fixed coordinates in a versioned region table (an "edition"); each content
item is assigned a region and per-item attribute scores by a classifier executed once per
publication interval (reference: a daily batch; for a fixed catalogue, once per edition), and its
target position is a pure function of (item scores, region table, deterministic collision order),
so that positions are invariant for at least the session and, absent republication, for the
publication interval. Region identity is rendered as hue selected from a family table by the
region's bearing about the origin (in the polar variant one hue per sector, identical across
fields); read state is rendered as lightness solved per hue to a constant contrast against the
ground; an ordered intensity ramp, where present, is rendered only on a background ("nebula")
layer and never on a target; a register attribute, where present, is rendered as a word on the
preview and never as a visual channel of the target. Heading and displacement events of §5 are
attributed as signed preferences on the named coordinates — in the polar variant decomposed into
a radial component (deeper / shallower) and a tangential component (toward a neighbouring
category), with the commanded heading recorded so that a radial event from the hub favours the
category under the heading — and are logged with the coordinate at which they occurred;
accumulated preference conditions the choice of item for unvisited cells and a per-region belief
indication (reference: nebula alpha 0.18–0.30 updated at the label cadence and never during a
gesture), while materialized cells remain immutable per §6. Crossing into a differently placed
region whose placement is decisive (reference: argmax share ≥ 0.34) emits a distinct feedback
transient; reaching the field's bound emits a distinct transient once per contact, dims the
corresponding word and logs a clamped preference. Switching between field instances ("worlds")
preserves the viewport's coordinate. A field whose intensity coordinate is a measured quantity
(reference: 24 h engagement velocity against a baseline, frozen at publication) presents its own
depth words. Nothing in this embodiment claims the two-dimensional or polar arrangement, the
path selection, or the hue-by-bearing mapping as such (see Background; Sony US 7,858,868 maps hue
to a mood angle, and Bang & Olufsen's MoodWheel (2015) is a shipped polar precedent); the
contribution is their combination with the selection engine of §2, the feedback grammar of §3
and the signal acquisition of §5.

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

#### 9A. Proxy-field embodiment ("the seed")

In a further embodiment the two-dimensional field of §1 is a transient proxy field presented
over an ordinary scrolling host view (for example a two-column product list) that is otherwise
operated by conventional direct touch. A persistent activation target is displayed within the
operating digit's rest zone. Upon sustained contact with the activation target (reference
170 ms; any value below the platform long-press interval), or upon displacement exceeding a
small threshold (reference 8 px) before that interval elapses, a proxy field is presented
centred on the contact point, comprising one abstract target (a dot, not a miniature image of
the host) per content item currently fully displayed by the host view, arranged to preserve
the items' relative row and column positions, at a pitch of approximately 32–36 px. A brief
contact shorter than the sustained-contact interval presents the proxy field transiently
(reference 600 ms) and dismisses it without commit, teaching the sustained gesture. The
selection engine of §2 operates over the proxy targets with a hysteresis factor tuned to the
proxy pitch (reference 0.70, with a re-entry factor of 0.62 within 50 ms) and a park lock that
freezes selection while pointer speed remains below a threshold (reference 20 px/s for 120 ms)
until displacement exceeds a fraction of the pitch (reference 0.35). The feedback grammar of §3
emits one synchronous discrete event per proxy-target crossing, rate-limited by skipping rather
than queuing. The preview of §4 is the host view's own item, emphasized in place (opacity,
border, and a scale of approximately 1.035 applied in the same frame as the feedback event),
optionally revealing an alternate representation of the item after a dwell threshold
(reference 250 ms); when the emphasized host item lies within an occlusion radius of the
contact point (reference 60 px), a compact representation of it is displayed adjacent to the
proxy field instead. When the selection lies in a boundary row of the proxy field and the
pointer is displaced beyond the proxy boundary by a threshold fraction of the pitch (reference
0.6), the host view is translated by one item-row extent per additional pitch of displacement,
the previously selected proxy target is retained and re-associated with the host item newly
displayed at its position, and a feedback event on a carrier distinct from the crossing event
accompanies each translation; no crossing event is emitted while the host translates beneath a
stationary pointer. Release commits the emphasized host item subject to the velocity guard of
§2 (reference: no commit above 700 px/s; commit target resolved by projection of at most 0.45
pitch), is suppressed while the pointer is within the translation region and within an arming
interval after presentation (reference 120 ms), and always dismisses the proxy field; a pointer
leaving an elliptical region about the contact point (reference semi-axes 90 × 152 px) clears
the selection without commit and re-arms on re-entry. The signal acquisition of §5 attributes
each selection interval to the corresponding host item (dwell-classified felt, scrub-past, and
kept events); heading-kinematics events are not computed where the proxy has fewer than three
columns. Because the host view remains directly operable throughout, this embodiment satisfies
single-pointer accessibility requirements without an alternative view. A reference
implementation is `prototypes/the-seed.html` (P15), exercised by a synthetic touch driver.

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

- **Proxy-field embodiment (§9A) — dependent only.** Do not pursue independent claims on the
  proxy region, on boundary-persistence translation of the host, on a distinct page-turn
  feedback event, or on rate-limited crossing haptics as such: each is anticipated (ThumbSpace
  2007; Android 9 Quick Scrub; iOS 14 page dots; Apple US 8,689,128; Apple US 9,678,571;
  Immersion US 8,264,465). Claim 8 rides on claim 1's signal method — its value is showing the
  hysteresis + detent + kinematic-signal stack independent of the dot-field rendering. The
  embodiment must never carry a miniature image of the host (KDDI US 9,244,544 claims a reduced
  reference image); the abstract lattice is the distinguishing hook. Before any commercial ship
  of this embodiment obtain a professional claim chart on KDDI US 9,244,544, Amazon US 9,389,718
  / 10,353,570, Google US 10,365,719 and Immersion US 8,264,465.
- **Named-coordinate placement (§6A) — dependent only.** Do NOT claim the two-dimensional
  semantic plane or the polar wheel, path or steer selection over mood zones, hue-by-angle /
  saturation-by-strength, or per-item attribute scores as such: Gracenote US 8,855,798, Sony
  US 7,858,868, Monkeymedia US 6,281,899, Musicovery (2006), Moodstream (2008), Every Noise at
  Once (2013) and Bang & Olufsen MoodWheel (2015) anticipate each. Claim 9 rides on claim 1: the
  residue is positions fixed by scores on *named* coordinates for the session, heading and
  displacement events attributed as *signed preference on those coordinates* (radial and
  tangential in the polar variant, with the heading recorded), and that preference conditioning
  only unvisited regions. Chart specifically against 8,855,798's sequential-path selection and
  7,858,868's angular mood layout before any commercial ship of a steerable world.

## INFORMAL EXAMPLE CLAIMS (scaffolding for non-provisional drafting)

1. A method of acquiring user-preference signals, comprising: presenting items as targets at
   positions fixed for at least the duration of a selection gesture in a two-dimensional
   field; tracking a continuous pointer
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
8. The method of claim 1, wherein the two-dimensional field is a proxy field presented in
   response to sustained contact on a persistent activation target and comprising one abstract
   target for each content item currently displayed by a separate scrolling host view,
   arranged to preserve the items' relative positions; wherein assigning the selection
   emphasizes the corresponding host item in place; and wherein the classified preference
   events are attributed to the corresponding host items.
9. The method of claim 1, wherein the positions of the targets are determined from per-item
   attribute scores on at least two named coordinates — two axes, or a bearing naming a category
   and a radius carrying an intensity attribute — according to a versioned region table and are
   invariant for at least the session; wherein heading and displacement events are attributed
   as signed preference on said named coordinates; and wherein said attributed preference
   conditions the materialization of unvisited field regions while visited regions remain
   immutable.
10. A system comprising a touch display, a haptic actuator, and one or more processors
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

Working implementations exist as of September 2, 2026, in the inventor's private repository
(`prototypes/the-field.html`, `prototypes/the-drift.html`, `prototypes/the-seed.html`, native
wrapper under `scout/`). Each page passes the repository's generic behavioural prober. The
proxy-field embodiment (§9A) is exercised by a synthetic-touch walkthrough
(`scripts/seed-walkthrough.mjs`) asserting the hold/peek distinction, one detent per crossing,
silence while parked, deterministic row paging, the cancel ellipse, the velocity guard on
release, and that release always dismisses the proxy field; the field and drift pages were
exercised during development by equivalent synthetic-touch drivers that are not part of the
repository's checked-in suites. A working audio-hook extraction pipeline
(`scout/scripts/hook-cutter.mjs`) demonstrates the §9 audio embodiment. The named-coordinate embodiment
(§6A) is implemented in `prototypes/the-drift.html` revision 5 in its polar variant (five staged
worlds — including a fixed film catalogue — on an edition-0 region table of eight sectors, the
ring's home and depth words, category names emphasized at the screen edge, boundary and rim
transients, displacement-counted radial and tangential preference with a heading-aware log, world
switching that preserves bearing and radius) with the colour grammar and wheel geometry held in
`src/lib/driftPalette.ts` and asserted by `src/lib/driftPalette.verify.ts` against the prototype's
own tables; revision 4 implemented the Cartesian variant. The private synthetic-touch driver
asserts one boundary transient per crossing into a decisive region and none between blended
cells, one rim transient per contact with the logged clamped preference, that no target is
placed beyond the rim, and that the label and depth words follow the active world.
