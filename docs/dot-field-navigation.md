# Dot-field navigation — the concept, interrogated

*A field of dots instead of a feed. You drag a thumb across the screen; the nearest dot
selects with a tiny haptic detent; a preview floats above your hand; lift to open. No
scrolling — a bounded, feelable map of today. This document is the full interrogation of
that idea: six independent analyses (interaction physics, HCI lineage, information
architecture, the "Instagram without scrolling" thought experiment, a kill report, and a
design-space sweep) refereed against each other. The feelable half is
`prototypes/the-field.html` — the numbers below are the ones it ships with.*

---

## 1. What it is, and why it is sound

The concept decomposes into four atoms, every one of which has shipped at billion-user
scale — only the assembly is new:

1. **Continuous drag over a 2D field of discrete targets** — iOS A–Z index scrubber,
   swipe typing, the Apple Watch honeycomb.
2. **A haptic detent per target crossing** — iPod click wheel, picker wheels, the
   Digital Crown.
3. **A live preview decoupled from the finger** — video scrub thumbnails, the text
   magnifier, peek-and-pop.
4. **Commit on lift, cheap escape** — swipe typing's word commit, marking menus.

The academic warrant: nearest-centre hit-testing **is the bubble cursor** (Grossman &
Balakrishnan, CHI 2005). The motor target is not the 10px dot, it is the dot's entire
Voronoi cell — so initial contact has effectively zero Fitts cost ("land anywhere and
slide"), and all precision moves to the settle, which the spring-follow and the detent
subsidize. The paradigm is not a gimmick; it is a known pointing accelerator wearing a
preview.

**Why now:** every phone since ~2016 carries a detent-grade haptic engine, 120Hz panels
halve the visual latency of a spring-follow, and coalesced touch events give sub-frame
positions. The honeycomb shipped in 2015 with none of those organs; the same idea today
has all three off the shelf.

**What the graveyard demands** (the two dead ancestors died of specific, avoidable causes):

- *Honeycomb died* because identical 12px circles carried no meaning, positions were
  chaos, and there was no scrub-preview. → The untouched field must be legible in two
  seconds (hue + fade are load-bearing), and geography must be stable.
- *3D Touch died* because the affordance was invisible, effortful, and duplicated a
  cheaper gesture. → The field must be a primary surface, not a bonus mode; the first
  touch must visibly teach the mechanic; and it must degrade to full function without
  haptics.

## 2. The feel spec (the numbers the prototype ships with)

The illusion is "my finger is dragging a physical detent strip." It has hard walls:

| Parameter | Value | Why |
|---|---|---|
| Selection → visual swell | same frame (≤16.7ms) | past one frame the channels decouple |
| Selection → haptic | synchronous, in the `pointermove` handler | deferring to rAF/state is the #1 way builds die |
| Vibration pulse | 10ms, never longer | 20ms+ reads as buzz, not click |
| Detent gap | ≥30ms, **skip never queue** (40ms above 1200px/s) | a late tap attributes to the wrong dot |
| Hysteresis | challenger must be **20% closer** (`d_cand < d_cur × 0.80`); re-entry within 50ms needs 30% | naive nearest-centre strobes at 30–60Hz on the Voronoi boundary — haptic "angry buzz" |
| Halo position spring | k=900, c=60 (critically damped) | overshoot on position is poison |
| Swell spring | k=550, c=30 (one micro-overshoot) | the "pop" that makes it alive |
| Halo lag cap | 0.8× pitch, via stiffness ×clamp(sep/35, 1, 3) | fast scrubs never leave the halo a row behind |
| Neighbour nudge | ≤6px (≈14% of pitch), gaussian σ=1 pitch, two rings, computed from the *selected centre*, never the finger | past ~25% of pitch the map breaks; hit-testing always runs on static centres |
| Card offset | ~90px above the touch point, raw x-follow, zero easing | thumb occlusion is ~55–60px; an eased card is a drunk drone |
| Card flip | hysteretic (down at top-24, back at top-64), ~120ms ease on the flip only | otherwise a finger at the threshold seesaws it |
| Card at flick speed | hide above ~1500px/s, re-show 80ms after < 900px/s | a teleporting card is noise |
| Content swap | hard swap, zero crossfade; **everything pre-rendered before first touch** | any async fetch on crossing kills the sheet-of-glass |
| Lift commit | velocity-projected ~60ms ahead; no open above ~1000px/s | fixes "lifted, got the neighbour"; a flick-lift is not a choice |
| Hot path | cached `Float32Array` centres, bucket search, no layout reads, transforms/opacity only | one leaked style read = 30fps on mid-range Android |

**Platform reality (2026):** Android Chrome has `navigator.vibrate` — full-fat. iOS
Safari has no vibration API and never will; the `<input type="checkbox" switch>` click
side-effect (Safari 17.4+) yields a real Taptic tick — ship it behind detection as
progressive enhancement, never load-bearing. The cross-platform detent carrier is a
**2–5ms audio tick** (pre-decoded buffer, fresh source node per crossing, ±3% pitch
jitter so a fast scrub sounds like a ratchet, not a machine gun). Without haptics you
keep most of the feel *if* the visual detent is sharp and sound covers the rest. Rich
haptic grammar (double-taps for close friends, muffled ticks for stale items) is
native-only; the web gets binary tick/no-tick.

**Acceptance test:** scrub edge-to-edge in half a second — an even ratchet, the halo
within one dot of the finger, the card readable the instant you stop. Park a thumb
*between* two dots — nothing may flicker.

## 3. The information-architecture laws

- **A dot is ~3 bits.** Channel budget at 10px: hue (≤8 region families per world — the
  region's printed *name* is the taxonomy the user knows; five was the pre-map budget and the map
  ruling of 2026-09-02, `dot-field-map.md` §4, raised it with the name as the carrier) + fade
  (read/unread) carry the data; **size, halo, and motion belong to
  the interface** — nothing in the data may impersonate interaction state, and motion is
  rationed to 1–3 dots ("live now"), or the field reads as broken.
- **One soft semantic axis.** Newest enters top, the day flows downward, rows stay
  packed at full pitch. The field becomes a calendar you can feel without the dead space
  and stuttering haptic rhythm of a true scatter. Feeds get a reading order; archives
  get coordinates; only a map app gets a map. **Fisheye is rejected** — it moves every
  dot per frame, destroying spatial memory and cached hit-testing at once.
- **Stable geography is the whole asset.** Never move a dot mid-session — not for
  read-state, not for rank, not for filtering. New items append at an edge. Relayout
  only at session boundaries, visibly animated. Yesterday's field is a frozen page.
  One silent reshuffle voids the paradigm's entire payoff over a list.
- **Filter = dim, never relayout.** Non-matches drop to ~15% opacity and leave the
  hit-map (the thumb glides over dead cells — a felt *absence*). Compaction invalidates
  every "over there" the user holds.
- **Doneness is first-class.** A field has edges; the solid/faded ratio *is* the
  progress bar (never add a meter). When the last dot fades, say so. "I'll clear
  today's field" is a plannable act; "I'll scroll for a bit" isn't — the strongest
  retention argument and the strongest wellbeing argument are the same feature.
- **Scale regimes** (390×~620px of field at 44px pitch ≈ 110–140 dots): one screen is
  the native regime; ~300 paginates into whole *chapters* (Today / Yesterday), never a
  panning field (a panning field is the honeycomb again); ~1,000 goes hierarchical
  (scrub clusters, lift to enter a sub-field, two levels max); ~10,000 zooms between
  2–3 *fixed* density steps, never continuously.
- **When a list is simply better** — any of: strict priority order is the content;
  items need per-item triage actions; long-form sequential reading; N < 15; the user
  always wants "next"; screen-reader-primary contexts. The field's home turf:
  **medium-N (30–500), heterogeneous, browse-don't-rank, glanceable-state, finishable.**

## 4. The Instagram inversion

Rebuilt as a field: one dot per post since you last opened (~60–180), hue = relationship
(close / following / suggested), fade = seen, rank encoded **radially** — the ranker's
best sit where the thumb rests, its 140th choice in a corner, one drag away instead of
139 flicks. The preview card is the post; lift opens full-screen; returning drops you on
your faded dot with the spring settling — place kept, which is the single worst failure
of returning from a scroll feed, solved structurally.

The deep shift: a scroll feed makes ranking a *decision* (the algorithm chose what's
next); a field makes it a *recommendation* (the algorithm chose where things sit; the
thumb chooses what's next). **"The algorithm suggests, the thumb decides."** Any design
that sneaks sequence back in — auto-advancing selection, a "next" affordance — has
reinvented scroll with extra steps.

Honestly scored: infinite scroll is a variable-ratio schedule with no terminal state —
the field breaks both properties (pull not push, visible doneness), so expect sessions
that are shorter but denser, winning satisfaction and retention-per-open while losing
raw time-in-app. That trade kills it inside an incumbent whose ad load and payouts hang
from session length, and makes it a *positioning weapon* for a challenger whose brand is
the bound — provided the mechanic has depth under the constraint (the map, the texture,
the doneness ritual). Mixed dwell-time content needs a second verb: flick a dot upward
→ a "Later" tray (riffle now, commit later — triage feeding a queue). A sponsored dot
must be labeled *to the finger* before selection (distinct shape + longer buzz), capped,
and never placed in the thumb-rest cluster — selling the top of the map kills the map.

Better hosts than Instagram, ranked: **email triage** (doneness is the product; flick =
archive), **podcast/YouTube subscriptions** (bounded, triage-shaped), **news briefs**
(the origin spec; headlines are the perfect 300ms scent), **Spotify new releases**
(preview = 5s audio hook — the audio field needs no card at all), **dating** (a field of
tonight's 40 restores agency the deck removed).

## 5. The kill report (what did not survive)

The skeptic's case, accepted where it held:

- **Throughput.** A scroll feed evaluates 4–6 items in parallel at full fidelity; the
  field is serial by construction. For "catch up on everything," the field is
  structurally slower — this is architecture, not polish. The field's counter-claim is
  not speed of evaluation but **speed of the whole loop**: whole-set state in one
  glance, zero open-act-back cycles, and (by day 30) ballistic reaches to remembered
  positions.
- **Occlusion + fatigue.** Thumb-down browsing occludes a third of the screen and holds
  an isometric contraction; eyes ping-pong dot↔card. The field is a **10–90 second
  interaction, not a 20-minute one** — design for micro-sessions or fight physiology.
- **Learnability.** A dot grid has zero information scent. Mitigations, not cures: a
  pre-selected dot with its preview showing (zero-input value), a one-line hint, the
  first touch visibly stirring neighbours.
- **Accessibility.** Drag-and-hold is harder than tapping for tremor; a
  `touch-action:none` surface collides head-on with explore-by-touch. The list sibling
  is **legally load-bearing** (WCAG 2.5.7 — dragging requires a single-pointer
  alternative), so it ships as a first-class visible tab, never a buried fallback.
- **iOS web.** The signature feel is absent in the majority mobile browser. The web
  build proves the interaction; **the paradigm's full claim is native** (Core Haptics /
  `VibrationEffect`).

**The claim that survives every attack:** for a bounded set of roughly ≤150
daily-refreshed items with stable positions, each able to pitch itself in under 400ms,
the haptic field is a superior "glance the whole day, pick one, feel when you're done"
opener — offered beside a list, never instead of one. What dies is "field as universal
navigation": unbounded feeds, ranked search, long reads, tiny N. The referee's ruling on
the mode-vs-only-path tension: **field as the default opening surface, list as a
first-class sibling** — habit needs a default; parity needs the sibling.

## 6. The wider design space (the primitive is "a field you can feel")

Thirteen mutations were generated; the short list:

- **Meaningfield** — layout = a stable 2D embedding projection snapped to a hex lattice;
  scrubbing is *semantic* navigation (you feel your way from "tax stuff" into
  "receipts"); cluster boundaries get a longer tick. The 2026-native variant; also the
  cheapest kill-test of the grand idea (if scrubbing meaning-neighbourhoods of your own
  notes isn't magical, stop).
- **Sortfield** — act-on-lift triage: flick up off a dot = archive, straight lift =
  open. Email/QA queues at ~400ms per decision with zero screen transitions. The
  *utility* proof — instrument decisions-per-minute against swipe-rows before believing it.
- **Pocketfield** — eyes-free: coarse memorized grid, haptic tick + 300ms audio preview
  per crossing, phone stays in the pocket. The *modality* proof: an interface that works
  unseen cannot be dismissed as a prettier grid — and it is a legitimately strong blind-
  user interface, not a compliance checkbox.
- Also mapped: timeline fields (scrub a decade of photos like a ratchet), live ops
  fields (sweep a fleet and *feel* where it hurts — breathing rationed to anomalies
  only, per the channel budget), two-finger compare (pin one, scrub on), dot-to-dot
  relationship gestures (the preview becomes the *diff*), TV/controller fields (rumble
  is a trained haptic grammar), decay/garden fields (a backlog that honestly shows
  what's alive), and the field as a *creation* surface (spatial notes with felt muscle
  memory).

Shared risk to retire first, for all of them: stable layouts and haptic distinctness
(can five users blind-distinguish three tick types in twenty minutes?). If both hold,
the field is a platform, not a feature.

## 7. Where it could land in this portfolio

Scored against §3's honest criteria (bounded, heterogeneous, 400ms scent, finishable):

- **Traction Engine — the research loop.** The day's scraped viral candidates
  (products, hooks, formats) are exactly a bounded, browse-don't-rank, finishable set;
  scent = thumbnail + hook line; doneness = "research done today." The strongest fit in
  the portfolio, and Sortfield's flick-to-queue maps to "send to production."
- **Garvis** — mostly an *anti*-fit, and that's worth writing down: the Queue is strict
  priority with per-item verbs (list wins by rule), and the Fleet is deliberately
  near-empty (N < 15). The plausible seam is the opportunity/prospect discovery surface
  on mobile — a morning field of the pipeline's new candidates. Do not force it
  anywhere the simplicity doctrine already settled a one-decision surface.
- The paradigm's real home may be a standalone bounded-feed product where the bound is
  the brand.

## 8. The prototype

`prototypes/the-field.html` (P13) — a staged social day (~110–130 posts, seeded, stable
geography) with the full feel spec: hysteresis, dual springs, synchronous detents,
audio ratchet, iOS switch-haptic enhancement, velocity-projected lift, dwell-deepening
card, dwell-marks-read, doneness moment, first-class List tab, arrow-key + Enter path,
reduced-motion support, desktop hover-scrub. Every number above is implemented, not
aspirational. What it must prove is in its "?" card; the two-line version: **park a
thumb between two dots and feel nothing; scrub the whole field and feel everything.**

## 9. Where it went next

The operator's follow-up — recentering so a liked direction can continue, the field as a
steerable feed — became its own interrogation and prototype: **the Drift**
(`docs/dot-field-drift.md`, `prototypes/the-drift.html`), where the bounded field grows into
a territory and the thumb's trajectory becomes the recommendation signal.
