# The seed — a proxy grid over an ordinary page (P15)

*Seventh interrogation round, 2026-09-02. The founder's two messages: "Maybe instead of it
being a full page of dots, it's a dot you hold down and it pops up a small grid of dots for
navigating pages" and "Like say there is a scroll page full of clothes, it pops up and lets you
navigate each preview individually using it." Interpretation built and tested: an ordinary
scrolling catalog keeps working as it always did; one persistent dot sits where the thumb
rests; hold it and a thumb-scale grid of dots blooms under the finger, one dot per garment on
screen in the same arrangement; scrub with one detent per dot while the page itself lights the
piece you are on; push past the edge row and the page turns a row at a time; lift to open;
drag away to let go. Method: five lenses with live web search (prior art and patent position,
ergonomics, product and composition, feel spec and engineering, strategy and honesty), two
independent skeptics set to refute the novelty claims, a referee, a completeness critic. Rule
of reading, as always: every number below is SOURCED (with its source) or an ESTIMATE, and the
founder asked for the honest reading over the flattering one. Prototype: `prototypes/the-seed.html`.*

---

## 1. The ruling

**The seed is a different product, and as an invention it is weaker than any lens first
estimated.** Mechanically it is a controller, not a field: a thumb-scale proxy of the
currently visible items that borrows the drift's engine (hysteresis nearest-target, the
synchronous skip-never-queue detent, the velocity-guarded lift) and sheds every asset the
provisional's centre of gravity rests on — stable geography, heading and steer-away, the
trail, doneness. The skeptics were accepted in full (§2). Nothing on the "not found anywhere"
list survived except the specific assembly, which an examiner would call an obvious
combination, and the one line that connects to the provisional — attributing the §5
preference events to host items via proxy motion — is thin here because two columns yield
almost no heading.

So the seed does **not** strengthen the patent position (it widens freedom-to-operate
exposure from one live patent to four), it **weakens the drift as a paradigm if it becomes
the headline** (the honeycomb failure by construction: the proxy re-maps every page), and its
measured ancestor was 2.5× slower than direct touch for single selections (SOURCED, §3).

What it is good for is exactly two things:

1. **The cheapest demonstration that an ordinary page can carry the detent** — a familiar
   catalog plus one dot is a smaller ask than a screen of dots.
2. **The concrete, cheaper shape of the Shopify "Drift Browse" fallback** — a mobile hover
   state (the primitive touch lacks, per Baymard — SOURCED) with a per-item dwell/skip signal,
   laid over a merchant's existing collection grid instead of a new field.

Build P15 to answer one pre-registered question (§5), file it as a §9A embodiment with the
prior art acknowledged (§7), keep it out of Gate B, and change nothing about Gate A or this
week's two physical actions (the provisional and the wrap).

## 2. What is known, what is new

The refuters were told to default to "refuted" if they found anything combining a
thumb-reachable proxy of on-screen items with per-item haptic feedback and highlight-on-page.
Both did, with live patents.

| Element of the seed | Already known — and where |
|---|---|
| Thumb-reachable abstract proxy region, one sub-region per on-screen object, arrangement preserved; real object highlighted in place; threshold-gated nearest-object adjustment; lift-to-commit, drag-off cancel; proxy-driven scrolling | **ThumbSpace**, Karlson & Bederson, INTERACT 2007 (paper read in full); Karlson & Bederson CHI 2008. No haptics, no hysteresis, no signal channel. |
| Miniature proxy map with nearest-target (bubble) selection | Radar View (Nacenta et al., CHI 2005); Bubble Radar (Aliakseyeu et al., AVI 2006); Object Pointing (Guiard et al., GI 2004) |
| Proxies of distant targets brought to the finger | Drag-and-Pop (Baudisch et al., 2003); Vacuum (Bezerianos & Balakrishnan, CHI 2005); BezelSpace/CornerSpace (Yu et al., MobileHCI 2013) |
| Hold-to-bloom, slide, lift-to-select | Kurtenbach US 5,689,667 (marking menus, **expired**); Pinterest press-and-hold pin menu (**July 2013**, not 2014); Facebook Reactions (2016); webOS Quick Launch (2009) |
| Hold, scrub a miniature, preview, lift to open | iOS 7 Photos "Years" view (2013); Spotify Touch Preview (Jan 2015 — a playlist "explodes into a grid of mini-covers" you scrub) |
| Hold a visible thing → it becomes a proxy pointer → the page is the preview → lift commits | iOS keyboard spacebar trackpad mode (all iPhones since iOS 12) |
| **In-screen reduced touchpad with a vibration per icon the finger overlaps and a pointer on the real screen; invoked from an icon; repositionable; scrolls** | **KDDI US 9,244,544 — in force to 2032-09-01** |
| **Hold-to-invoke thumb input areas distinct from the items they control, highlight of the associated item, haptic indication, traversal without lifting** | **Amazon US 9,389,718 (and continuation US 10,353,570) — in force** |
| Tactile click per item while dragging over a compact list control | Poupyrev & Maruyama, UIST 2003; PocketMenu (Pielot et al., MobileHCI 2012); Apple index scrubber US 10,175,759 (rate-limited) |
| Skip-never-queue tactile rate limiting | Apple US 9,678,571 (omit the output when the previous one is too recent) |
| Pulses as a cursor crosses icons and menu borders on a proxy surface | Immersion US 7,148,875 and US 8,188,981 — both **expired** (free art, not novel) |
| Persistent dot you hold, scrub with haptics, push past the border to auto-page | iOS 14 Home Screen page dots (Apple US 11,416,127 family); Android 9 Quick Scrub (`QUICK_SCRUB_THRESHOLDS`, `goToPageWithHaptic`, `AUTO_ADVANCE_DELAY`); Apple US 8,689,128 (scrub rate when contact leaves the scrubber) |
| Hysteresis before locking a touch selection | Onshape WO 2017/199221 |
| Pointer/touch kinematics as implicit relevance | Huang, White & Dumais, CHI 2011; Guo et al., SIGIR 2013 |

**The residue, honestly small.** (1) The assembly: a persistent seed on an ordinary host that
blooms on sustained contact into an abstract one-dot-per-fully-visible-item lattice preserving
the host arrangement; hysteresis nearest-target with a park lock; synchronous skip-never-queue
detents; host item emphasized in place; deterministic distance-ratchet row paging with the same
proxy dot retained and re-pointed at the item now under it; lift-to-open under a velocity
guard. No single reference has all of it, and none discloses re-mapping the retained dot — but
an examiner would call the combination obvious. (2) The only piece that touches the
provisional: applying the §5 per-interval classification (dwell, scrub-past, felt-not-kept) to
proxy targets standing for host items — rendering-independence of claim 1, claimable only as a
dependent claim. Treat (1) as unpatentable-as-independent and (2) as scaffolding, never a moat.

**Corrections to the record**, found along the way: Pinterest's hold menu shipped July 2013;
Google US 10,365,719's three independent claims all require a *symbol queue* plus an *expanded
item display* with synchronized haptics — narrower than the plan's "detent-on-crossing"
summary, but the seed's lit-tile-plus-chip-plus-detent maps onto that language more literally
than the field's dot swell ever did; Immersion US 8,264,465 (haptics commensurate with
scrolling, active to 2028-07-27) is the live patent nearest a repeating page detent. Web patent
search is shallow and English-only; the KDDI hit came from a Japanese-origin family, which
suggests more of the same exists in KR/JP/CN portfolios. A professional search is still required.

## 3. What the ergonomics say (measured, not felt)

- **The proxy buys reach and peeks, never single-tap speed.** ThumbSpace (n=16, 2007) measured
  direct thumb touch at 811 ms per selection vs 2068 ms through the proxy; the proxy was more
  accurate only on far targets (.94 vs .92), rated more mentally demanding, and slowest on
  *near* targets because the proxy sat under the thumb (SOURCED). Fitts' index of difficulty is
  scale-invariant: shrinking the field into a puck does not make pointing faster. What it does:
  removes reach, replaces absolute fat-finger targeting with relative motion, and turns each
  crossing into a zero-transition peek.
- **Pitch floor.** The thumb's useful resolution is about 1 mm (Eddy et al., CHI EA 2026 —
  SOURCED); contact-centroid roll drift averages ~4 mm (Holz & Baudisch 2011 — SOURCED). At
  32 px pitch a 0.80 hysteresis leaves a 3.6 px (0.6 mm) dead band — under the thumb's
  resolution — so the seed runs **0.70** (5.6 px ≈ 0.93 mm) plus a **park lock**; the drift keeps
  0.80 at 44 px. Below ~30 px pitch no factor keeps the crossing distance above roll drift.
  ThumbSpace's dense 40 px proxies were measurably less accurate than sparse ones (SOURCED).
- **Occlusion is the design, and the one failure to avoid.** The thumb covers the grid; every
  state lives on the page. ThumbSpace's slowest case was a highlighted target under the thumb —
  hence the callout chip beside the plate whenever the lit tile is within ~60 px of the touch.
- **The crux (ESTIMATE, to be measured on P15):** single reachable tile — direct tap ~0.7 s vs
  hold + bloom + detents ~0.6–0.9 s, parity at best; peek-many-open-one — ~0.5 s per peek vs
  ~2 s per open-look-back cycle (~4×); a paging walk of 100 items is *slower* than parallel
  eye-scanning of 17 screenfuls. The proxy cannot claim throughput; it can claim posture (no
  grip shifts), peeks, and per-item signal.
- **Hold gestures die when they are invisible and duplicate a cheaper gesture** (3D Touch
  retired 2019, Force Touch 2020 — SOURCED). Hidden navigation is used less than visible
  (NN/g: 57% vs 86% — SOURCED). Delay before revealing a hold menu has no demonstrated benefit
  (Henderson et al., CHI 2020 — SOURCED). Hence: the seed is always visible; a *tap* peeks the
  grid for 600 ms so the hold is taught in one try; a drag of 8 px blooms without waiting.

## 4. The feel spec as built

Every constant is a tunable ESTIMATE unless tagged; the file is the source of truth.

| Law | Value | Note |
|---|---|---|
| Hold → bloom | 170 ms; or 8 px of drag | under iOS Haptic Touch "fast" (~200 ms, SOURCED); the drag path never waits |
| Tap | peek-bloom 600 ms, then retract; hint text for the first 3 taps only | a tap never opens, never scrolls |
| Arm | no lift-to-open until 120 ms after bloom | a tap can never open |
| Proxy | 2 columns = host columns; rows = fully visible rows (≤5); pitch 34 × 32 px; anchor dot = row 2, right column, under the thumb | abstract dots, never a miniature (KDDI) |
| Bloom | dots spring from the finger (k 700, c 42); usable on frame 0 — hit-testing uses final positions | render and input decoupled |
| Snap | if the page sits >6 px off a row boundary at bloom, glide to it (160 ms) | every dot maps to a whole garment |
| Selection | nearest dot; challenger < 0.70 × incumbent (0.62 on re-entry within 50 ms); park lock: <20 px/s for 120 ms freezes until 0.35 pitch of travel | the field's ratio law, re-tuned for pitch |
| Detent | one per crossing, synchronous, ≥30 ms gap (40 ms above 900 px/s), skip never queue | `Haptics.selectionChanged` natively; 8 ms tick on the web |
| Page-side preview | others dim to 70%; lit tile ×1.035 + ember border in the detent's frame; name · price chip above it (120 ms); second drawn view after 250 ms dwell; callout beside the plate if the tile is under the thumb | the page is the preview; nothing floats under the thumb |
| Paging | push 0.6 pitch past the edge row → one row; each further pitch → one more (deterministic ratchet); parked past the edge → repeat after 260 ms, then every 170 ms (≈1100 px/s, the drift's cap); one page event on a distinct carrier (`impact LIGHT`); the same dot stays selected and re-points; **no per-item tick while the page moves under a still thumb** | row steps, never screenfuls; hold-repeat is the Immersion '465 exposure — first thing to drop |
| Cancel | ellipse from the finger-down point, semi-axes 90 × 152 px; not sticky (re-arms 12 px inside) | paging can never read as cancel |
| Lift | opens only if armed, not cancelled, not in the paging band, speed < 700 px/s; projection 45 ms capped at 14 px (0.45 pitch) | release always collapses |
| Signal | dwell ≥ 300 ms = felt; shorter = scrub-past; open = kept; no heading on two columns | §5 applied to host items; nothing faked |
| Keyboard | Enter/Space blooms; arrows move (edge rows page); Enter opens; Esc lets go; tiles stay ordinary buttons | WCAG 2.5.7 satisfied by the page itself |

**Laws added after the critic's pass (all in the file, all driven by the walkthrough):**

- **Only a pointer-up may commit.** A system `pointercancel`, a lost capture, a backgrounded
  app (`visibilitychange`, `blur`, `pagehide`) all let go without opening — "release always
  collapses" now includes the releases the system makes for you.
- **A press that ends before the arm window is a tap, and a tap teaches.** Slow tappers (a
  170–290 ms press) get the same 600 ms peek and hint as fast ones. The peek blooms *without* the
  row snap, so a tap never moves the page.
- **The host must be still.** A bloom waits until the page has been scroll-quiet for 120 ms
  (momentum scroll would map a moving page); any scroll of the host under a bloom that is not a
  page step lets go (the map is stale); a browser-toolbar resize (height only) never breaks a
  bloom; the seed steps aside (18% opacity) while the page scrolls and returns when it settles.
- **Geometry is measured, not assumed.** Columns come from the host's real tile tops; fewer than
  two fully visible rows (landscape) refuses to bloom and says "turn the phone upright".
- **Assistive tech can operate it.** A synthesized click (VoiceOver, Switch Control) enters the
  same sticky grid the keyboard uses; `aria-haspopup="grid"` / `aria-expanded` track it; the
  live region announces one item per *dwell* (name, price, sizes), never per crossing.
- **The second view carries information.** On 250 ms dwell the tile shows its back view and
  swaps the price for the available sizes — a mirrored drawing alone would have tested nothing.
- **Coalesced pointer samples keep their own timestamps**, so a burst is not zero time and the
  velocity gates read real speed.
- **The native generator is kept warm.** Capacitor's `selectionChanged()` is a no-op unless
  `selectionStart()` ran, and the generator goes cold in seconds — so it is re-prepared every
  1.5 s while the thumb is parked, and `impact()` (the page carrier) is known to be unprepared
  per call (@capacitor/haptics 8.0.2 iOS source, read from the npm tarball).

**What the synthetic touch walkthrough proves today (`npm run walkthrough:seed`; 36 checks,
Chromium 390 × 844, CDP touch; runs in the prototypes CI workflow):**
a tap peeks and retracts without opening; a hold blooms with the anchor dot under the thumb;
one selection per row while scrubbing; a thumb parked between two dots never flickers; a
rolling parked thumb never ticks; a held push past the edge pages five rows and stops the frame
the thumb comes back; the distance ratchet pages exactly two rows for two pitches; a lift in
the paging band opens nothing; drag-off lets go, returning re-arms, and the lift then opens; a
fling opens nothing; a drag before the hold delay blooms at once; a lift within the arm window
opens nothing; a still lift opens the lit piece by name; the ordinary page still scrolls and
taps; bloom on an unaligned scroll snaps to a row; the tile under the thumb gets the callout;
the second view (back view + sizes) appears on dwell and the live region speaks once; a tap on an
unaligned page peeks without moving it; a system touch-cancel mid-dwell, a foreign scroll under
a bloom, and a backgrounded app all let go without opening; a slow tap peeks; a synthesized
click enters and Escape leaves the sticky grid; the keyboard path works; the tap hint falls
silent after three; restart resets. This proves "not broken," not "good" — the feel exists only
in the wrap, and the walkthrough's own header says a red run is a claim until someone reads it.

## 5. The pre-registered micro-study (write the numbers down before the test)

**On device, in the wrap (Gate A logic, unchanged):** at 32 px pitch the detent lands *on* the
crossing (tactile budget ≤50 ms — Kaaresoja, SOURCED); a resting thumb produces 0 spurious
ticks in 20 s. If either fails: retune `HYST`/`PARK_*` first, then raise the pitch to 36 px,
before any other work.

**With ≥5 strangers, after Gate A, never inside a Gate B session**, on the same 40-item
staged catalog, in the wrap (not the browser — the ringer switch silences the web tick):

*Operational definitions, so the two arms are comparable.* A **verdict** is one per-item dwell
event, defined identically in both arms: seed arm — a proxy selection held ≥300 ms (the
file's `felt` event); direct arm — a tile whose centre sits inside the viewport's middle band
for ≥300 ms (logged by an IntersectionObserver in the study build). **Time per verdict** is the
median gap between consecutive verdicts during active input. **Time to accepted item** is from
first touch to the open of the item the participant later keeps. Arm order is counterbalanced
(ABAB per participant, catalogs shuffled per arm); n=5 is a directional pilot with **kill-only**
rules — nothing here can *confirm* the seed, it can only end it. Log per session: tap-duration
distribution (to retune `HOLD_MS` from real thumbs, not from Haptic Touch), spurious ticks
while parked, false blooms, grip shifts (video-coded), and which arm each participant preferred.
Pre-register by committing this section before anyone is tested.

| Measure | Kill line / target (all ESTIMATE) |
|---|---|
| Median time per verdict during a scrub | > 400 ms means the mode cost is not amortized (ThumbSpace's single-selection baseline: 2068 vs 811 ms — SOURCED) |
| Time to an accepted item vs direct scroll-and-tap | parity within 150 ms after 5 minutes of use |
| The 12-tile task with and without the second-view peek | if the seed loses to direct tapping *even with* the peek, it is a remote control with no payload — drop it |
| A tap teaches the hold in one try | ≥ 4 of 5 strangers |
| Recorded, not required | someone reaches for the dot on a page that doesn't have one |

## 6. Product and strategy

- **A layer, not an app.** The seed is the drift's most distributable form and its least
  defensible: shippable as a Shopify theme app-embed block over a merchant's existing grid, as
  a Safari extension, or inside FableForge — and copyable by Apple or Shopify in a release. It
  is the pull-to-refresh outcome the strategy doc already fears; capture depends on the dated
  naming trail and the signal dataset, never the gesture.
- **The Shopify fallback is re-specified** as this layer (plan §3.2): cheaper than a new field;
  visual + audio only on iPhone (no web haptic since iOS 26.5), so its chart is dwell/scrub-past
  heatmap vs click heatmap and product-page click-through — never feel; a ship to many
  merchants triggers the four-patent claim chart before the first install. It does not move
  above Scout: the founder is not a daily mobile catalog shopper (standing rule 5).
- **Finishability shrinks to the host.** Over an infinite feed the seed forfeits "my feed has
  an end." Over a bounded collection it keeps a true odometer ("40 pieces · 12 felt"), so its
  natural host is a catalog, not a feed — and nobody returns day 2 to a navigation widget, which
  is why it stays out of Gate B.
- **The plan does not change**: Gate A unchanged; this week's actions unchanged (file, build
  the wrap, walk it). The wrap now carries the seed as a second page (`scout/www/seed.html`).

## 7. Patent position and the design-around ladder

Done in `docs/patent/provisional-draft.md`, before filing, at no cost: a §9A "Proxy-field
embodiment" with reference values; the ancestors above cited and distinguished in the
Background; informal claim 1 amended from "substantially fixed positions" to "positions fixed
for at least the duration of a selection gesture" so the embodiment does not contradict it;
a new **dependent** claim 8 on the proxy field riding on claim 1's signal method; the system
claim renumbered 9. **Declined:** independent claims on the proxy region, on boundary
persistence paging, on a distinct page-turn event, or on rate-limited crossing haptics — each
is anticipated. **Required before any commercial ship:** a professional claim chart on KDDI
US 9,244,544, Amazon US 9,389,718 / 10,353,570, Google US 10,365,719 and Immersion
US 8,264,465. **Disclosure hygiene:** this embodiment's ancestors are so well known that it is
the one most exposed to a "we saw it in a demo" argument — private repo until the filing
receipt exists.

Also fixed after the critic's read: §1's "never during an active touch" now carries the §9A
exception (the target-to-item association may advance by whole rows while positions stay
fixed); §3(d) no longer names the dead switch carrier as current; the Reduction-to-Practice
section states only what exists in the repository (the seed walkthrough is checked in; the
field and drift drivers were development tools and are described as such); and a counsel note
flags that the Background's characterizations of references are binding admissions — counsel
may prefer a neutral list plus the IDS.

**The design-around ladder, decided now rather than under an examiner's letter.** If counsel
reads a live claim onto the seed anyway: (1) drop hold-repeat paging, keep the deterministic
ratchet (Immersion '465); (2) emphasize the host item without any on-page pointer or chip
(KDDI '544 claims a pointer displayed on the original image); (3) bloom from an explicit mode
toggle rather than a hold (Amazon '718 claims hold-to-invoke). Each rung removes something the
crux may depend on, so the micro-study must record which features were load-bearing — a
design-around must not silently invalidate the study.

## 8. Decisions only the founder can make

1. **Where the seed lives, and for which hand.** The prototype docks it bottom-right. A
   left-hand mirror and a persisted position belong in a setup disclosure (simplicity doctrine),
   never a drag — a drag is the bloom gesture.
2. **What "open" means on a storefront.** The prototype opens a sheet with one primary (Keep).
   A Shopify layer should navigate to the product page instead (analytics untouched, no Keep),
   with the order collapse → `selectionEnd` → navigate, and a `pageshow` reset on return.
3. **Where the signals go, and under whose consent.** The Shopify chart needs the per-item felt /
   scrub-past / kept events beaconed to an app-proxy route, batched per gesture, gated on the
   Shopify Customer Privacy consent state — nothing logged before consent. The plan's
   consent-clean rule applies to merchants' shoppers too.
4. **Which instrumentation is prototype-only.** The header pulse, the per-tile felt/kept marks
   and the hint line are study instruments; the storefront layer ships none of them.
5. **Non-uniform grids.** Real themes have variable tile heights. The storefront build must take
   one synchronous rect pass over the ≤12 candidate tiles at bloom and page by measured rows;
   the analytic mapping is for the uniform prototype only.

## 9. Open questions

1. *(Answered by the critic, from the plugin source)* Capacitor `selectionStart()` creates and
   prepares a `UISelectionFeedbackGenerator`; `selectionChanged()` is a no-op unless it ran;
   `impact()` allocates an unprepared generator per call. Consequence built in (§4); the
   remaining question is the first tick after a 5 s park, measured in the wrap.
2. The WKWebView → Capacitor → UIKit round trip in milliseconds on the founder's phone: at
   32 px pitch crossings are 1.4× denser per px of travel than at 44 px, so a bridge that
   passes Gate A on the drift may still trail on the seed.
3. The exact value of iOS Haptic Touch "Fast" (~200 ms by report); if a device sits at or
   below 170 ms the seed and the system long-press race.
4. Does 0.70 hysteresis plus the park lock silence a rolling thumb on glass, or must the pitch
   rise to 36 px (2 × 3 instead of 2 × 5)? Only the device answers this.
5. Does the second-view peek carry value on its own? (The §5 crux — decide the kill line first.)
6. How does KDDI '544 claim 1 read on an abstract lattice that is not a "reference image …
   reduced size with respect to the original image"? Counsel, not a founder's reading.
7. Does Amazon '718 claim 1 cover the seed regardless of lattice shape? If yes, the Shopify
   layer has a freedom-to-operate problem the field never had.
8. Is hold-repeat paging worth its Immersion '465 exposure when the distance ratchet already
   pages? Default if the chart is unfavourable: drop hold-repeat, keep the ratchet.
9. On a real storefront, where does the second image come from per theme, and can ≤12 be
   pre-decoded before the bloom completes?
10. No KR/JP/CN search has been done; the KDDI hit suggests more exists.

## 10. Provenance

Workflow of 2026-09-02: five lenses (prior art — ~45 live searches, ThumbSpace read in full;
ergonomics; product; feel-spec/engineering — which read the untracked P15 file and listed its
defects, all since fixed; strategy), two skeptics (patent databases; HCI literature and
products), a referee, and a completeness critic whose 31 gaps drove a second pass: seventeen
fixed in the file or the filing text (§4, §7), the rest recorded above as decisions or storefront
work. The prototype was built in parallel and revised against the engineering lens, the referee
and the critic; the dead iOS switch carrier the critic found in the field and drift prototypes
was removed there too and the wrap regenerated. Every constant in the file is labelled an
estimate; every number here is sourced or labelled.
