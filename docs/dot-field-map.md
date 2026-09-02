# The map — steering by named axes (drift rev. 4)

*Ruling of the seven-agent panel (five lenses, a skeptic, a referee, a critic), 2026-09-02, applied
to `prototypes/the-drift.html` rev. 4 and `src/lib/driftPalette.ts`. Every number is marked
SOURCED (a citation or a measurement of the file) or ESTIMATE (a design guess to be tested).*

> **PRIVATE until the provisional is filed.** Steering by named semantic axes is a claimable
> dependent variant of the signal method (§9). The shared Drift artifact stays at rev. 3; no clip,
> no post, no republish of rev. 4 until the USPTO receipt exists (plan Phase 0.1).

## 0. The sentence, and what survived it

The founder's words: *"you hop in the drift and you can control your algorithm … if you go so far
right you are in extreme sports and from there the deeper you go the more extreme, the more you
pull back the goofier … or you switch drift to another category and same thing. It's almost like a
remote of what you want to see … the colors and everything should mean something."*

What survives every lens: a fixed **Cartesian compass** — west CALM, east WILD, north SERIOUS,
south GOOFY — over named, hand-placed, colour-coded regions whose coordinates never move. Position
carries both axes; **hue names the region; lightness is read state; ember is interaction only.**
Switching worlds keeps your coordinates: east-goofy in sports lands you in punk/skate territory in
music, which is literally "switch drift to another category and same thing."

What the map buys: geography that is **stable by construction** — a placement lookup instead of an
embedding projection — which retires the old §7 "projection stability" risk *for placement only*.
What it costs: the recommender loses the power to reshape the land and keeps only the power to
choose which item fills an unvisited cell. The demo's "territory reshapes as it learns you" weakens
to "the glow and the fill change." That is the honest trade, and this document is the record of it.

Three readings of the sentence were rejected, with reasons:

- **Polar** (angle = topic, radius = intensity — the skeptic's dial). On a polar plane "push right"
  means *more* intense east of centre and *less* west of it, breaking the founder's own requirement
  that a direction mean the same thing everywhere; the two shipped intensity-in-polar conventions
  already contradict each other (Geneva Emotion Wheel outward vs Plutchik inward — SOURCED); and
  polar duplicates the tone axis on both semicircles. The skeptic's real point — that the founder
  may hold a 1-D model — is kept as a **measurement**: if intensity and tone correlate |ρ| > 0.7
  (ESTIMATE) on the first real corpus, the plane collapses to one stakes diagonal.
- **"Pull back" as a gesture.** On the ring, pulling the stick back toward centre is STOP under the
  settled release law. So *goofier is a push south* (down the glass, toward the body), and a westward
  push says CALMER, never goofier. The instrument corrects the intuition live — the lit word says
  CALMER — not a tutorial. **This needs the founder's confirmation (§10).**
- **A fifth word (BACK / HOME).** Rejected under the simplicity doctrine: the home glyph already
  shows bearing and distance. The compass is four words.

"Deeper" = distance travelled east (the camera's position — the dial's setting), not stick
deflection: the ring is a rate controller, release stops dead, and you stay where you set it. That
is why the remote metaphor holds.

## 1. The axes

| | x | y |
|---|---|---|
| words | CALM (W) ↔ WILD (E) | SERIOUS (N) ↔ GOOFY (S) |
| comparatives (ring, while pushing) | CALMER · WILDER | MORE SERIOUS · GOOFIER |
| sign | x ∈ [−1, 1], east positive | y = −1 top row (serious), +1 bottom row (goofy) — rows increase downward, as on the screen |
| lineage | Russell's arousal; Musicovery's calm ↔ energetic (SOURCED) | RATIONAL IS UP / highbrow–lowbrow (Lakoff & Johnson, SOURCED); *not* an Osgood factor |
| per-item scoreability | intensity: usable, runs low vs humans (Nature 2025, SOURCED) | sarcasm/tone agreement α ≈ 0.25 for humans and LLMs (SOURCED) — **unproven** |
| v1 status | region-level coordinate; within-region offset by score is v2 | **editorial, region-level only**; items scatter inside their region by stable hash, never by a tone score |

Rules that follow:

- **y is never a label on a creator's post.** "Goofy" is a compass word and a region coordinate,
  never a verdict; no value words, no quality tint, equal density floors north and south.
- **"Wild" is several dimensions wearing one word** (Cohen, Baluch & Duffy 2018 — SOURCED). Each
  world ships a one-paragraph rubric for what wild means there (sports: injury-risk × speed ×
  contact; kitchen: heat × time × skill) and its region coordinates are argued once, then frozen.
- **One named exception: the creators world's x is measured, not judged** — 24 h engagement velocity
  vs the niche baseline, frozen at the daily drop — and its compass reads **FAMILIAR ↔ NEW**
  (comparatives MORE FAMILIAR · NEWER; the referee's "KNOWN ↔ BREAKING" lost "MORE KNOWN" to the
  critic — not English). The prototype states this on its face: the switch hint reads *"Same compass,
  new places — here right means newer: breaking now."*
- **Mirror x under `dir=rtl`** (SNARC reverses in RTL readers — SOURCED). Not built; noted.

## 2. Geometry

Cells ↔ plane via `placeRegions()`: `col = 1.5 + (x+1)/2·(WCOLS−3)`, `row = 1.5 + (y+1)/2·(WROWS−3)`;
`planePos()` inverts it for the camera (viewport centre). **Origin = home = the world's mainstream
centre of mass** (basketball in sports, pop in music, street food in kitchen, hooks & cuts in
creators) — "centre = mainstream" survives without polar rules. The plane is fixed per edition; when
the production world is bounded to its populated hull (§5) the camera clamps to the hull and the
plane does *not* rescale — otherwise x = 0.8 would mean something different tomorrow.

## 3. The worlds — edition 0 (draft)

Generated by `npx tsx scripts/drift-edition-tables.ts` from the prototype's `WORLDS` literal through the core's
`assignFamilies()` — **the code is the single source of truth**; the referee's hand-written tables
did not reproduce from its own rule (critic, VERIFIED) and are superseded by these. Table order =
index order = collision-rule order. All coordinates ESTIMATE: argued by no one yet. They freeze as
**edition 1** only after one argue-once session (founder + one literate stranger per world), with
the signatory recorded; every later coordinate change is a new edition, announced at the drop,
never silent, never backfilled (spatial memory — Scarr/Cockburn, SOURCED).

Rules the tables obey (all asserted by `verify:driftpalette`):

- region keys ≤ 15 characters (the 390 px label — critic, VERIFIED overflow at 61 chars);
- every region ≥ 2 staged authors and ≥ 3 captions; no key containing "rage" or "bait" — a
  moderation verdict is not geography ("rage-bait" → "hot takes");
- ≤ 8 hues per world; same-family pairs ≥ 0.5 plane-units apart;
- `edition: 0` on every world until argued;
- density = supply, by the hash alone: 0.85 populated, 0.65 where |x|+|y| ≥ 1.1 (ESTIMATE; the
  critic's "four corner regions" had no definition — this rule is the definition).

Deleted from rev. 3/4a and listed here so nothing vanishes silently: **surf** and **stunts**
(sports), **rage-bait** (creators, renamed), the per-region `hue:` fields (dead — `placeRegions()`
overrides them), `REGION_SHARPNESS` and the affinity mixture in `getCell()`.

### sports — edition 0

| # | region | x | y | family | hue | moved by collision | shares hue with | density | nebula sat |
|---|---|---|---|---|---|---|---|---|---|
| 0 | chess | -0.92 | -0.35 | 3 | 169 |  | bat & ball (0.60) | 0.65 | 19% |
| 1 | golf | -0.72 | -0.1 | 2 | 130 | yes (3 → 2) | soccer (0.65) | 0.85 | 22% |
| 2 | pub games | -0.66 | 0.55 | 4 | 208 |  |  | 0.65 | 22% |
| 3 | bat & ball | -0.35 | -0.15 | 3 | 169 |  | chess (0.60) | 0.85 | 26% |
| 4 | soccer | -0.1 | -0.3 | 2 | 130 |  | golf (0.65) | 0.85 | 30% |
| 5 | basketball | 0.05 | 0.05 | 7 | 325 |  | moto (0.74) | 0.85 | 32% |
| 6 | football | 0.22 | -0.45 | 1 | 91 |  | base & freeride (0.76) | 0.85 | 34% |
| 7 | trick shots | 0.2 | 0.8 | 6 | 286 |  |  | 0.85 | 34% |
| 8 | skate & bmx | 0.45 | 0.5 | 5 | 247 | yes (6 → 5) |  | 0.85 | 37% |
| 9 | mma & boxing | 0.7 | -0.4 | 0 | 52 |  |  | 0.65 | 40% |
| 10 | moto | 0.76 | 0.25 | 7 | 325 |  | basketball (0.74) | 0.85 | 41% |
| 11 | base & freeride | 0.92 | -0.15 | 1 | 91 | yes (0 → 1) | football (0.76) | 0.85 | 43% |

### music — edition 0

| # | region | x | y | family | hue | moved by collision | shares hue with | density | nebula sat |
|---|---|---|---|---|---|---|---|---|---|
| 0 | classical | -0.9 | -0.4 | 3 | 169 |  |  | 0.65 | 19% |
| 1 | folk | -0.6 | -0.1 | 2 | 130 | yes (3 → 2) |  | 0.85 | 23% |
| 2 | jazz | -0.48 | -0.5 | 1 | 91 | yes (2 → 1) | electronic (0.96) | 0.85 | 25% |
| 3 | musicals | -0.3 | 0.4 | 5 | 247 |  | novelty (0.50) | 0.85 | 27% |
| 4 | pop | 0 | 0.1 | 6 | 286 |  |  | 0.85 | 31% |
| 5 | hip-hop | 0.2 | -0.1 | 0 | 52 |  | metal (0.71) | 0.85 | 34% |
| 6 | electronic | 0.45 | -0.25 | 1 | 91 | yes (0 → 1) | jazz (0.96) | 0.85 | 37% |
| 7 | novelty | -0.15 | 0.88 | 5 | 247 |  | musicals (0.50) | 0.85 | 29% |
| 8 | punk | 0.62 | 0.35 | 7 | 325 |  |  | 0.85 | 39% |
| 9 | metal | 0.88 | -0.3 | 0 | 52 |  | hip-hop (0.71) | 0.65 | 42% |

### kitchen — edition 0

| # | region | x | y | family | hue | moved by collision | shares hue with | density | nebula sat |
|---|---|---|---|---|---|---|---|---|---|
| 0 | tea & bread | -0.9 | -0.2 | 3 | 169 |  |  | 0.65 | 19% |
| 1 | meal prep | -0.55 | -0.5 | 2 | 130 | yes (3 → 2) |  | 0.85 | 24% |
| 2 | home baking | -0.4 | 0.3 | 4 | 208 |  |  | 0.85 | 26% |
| 3 | fermentation | -0.25 | -0.7 | 1 | 91 | yes (2 → 1) | molecular (0.75), hot chili (1.19) | 0.85 | 28% |
| 4 | street food | 0.1 | 0.2 | 6 | 286 |  | kitchen fails (0.66) | 0.85 | 32% |
| 5 | grilling | 0.35 | -0.1 | 0 | 52 |  |  | 0.85 | 36% |
| 6 | molecular | 0.5 | -0.7 | 1 | 91 |  | fermentation (0.75), hot chili (0.63) | 0.65 | 38% |
| 7 | hot chili | 0.8 | -0.15 | 1 | 91 | yes (0 → 1) | fermentation (1.19), molecular (0.63) | 0.85 | 41% |
| 8 | kitchen fails | 0.2 | 0.85 | 6 | 286 |  | street food (0.66) | 0.85 | 34% |
| 9 | eating contest | 0.88 | 0.55 | 7 | 325 |  |  | 0.65 | 42% |

### creators — edition 0 (x = familiar ↔ new)

| # | region | x | y | family | hue | moved by collision | shares hue with | density | nebula sat |
|---|---|---|---|---|---|---|---|---|---|
| 0 | essays | -0.82 | -0.5 | 3 | 169 |  |  | 0.65 | 20% |
| 1 | tutorials | -0.55 | -0.7 | 2 | 130 |  |  | 0.65 | 24% |
| 2 | storytime | -0.4 | 0.2 | 4 | 208 |  |  | 0.85 | 26% |
| 3 | daily vlogs | -0.25 | 0.45 | 5 | 247 |  | memes (0.71) | 0.85 | 28% |
| 4 | hooks & cuts | 0.05 | -0.15 | 1 | 91 |  |  | 0.85 | 32% |
| 5 | breakouts | 0.5 | -0.45 | 0 | 52 |  | hot takes (0.63) | 0.85 | 38% |
| 6 | reaction | 0.45 | 0.6 | 6 | 286 |  |  | 0.85 | 37% |
| 7 | trends & sounds | 0.72 | 0.5 | 7 | 325 |  |  | 0.65 | 40% |
| 8 | memes | 0.3 | 0.9 | 5 | 247 | yes (6 → 5) | daily vlogs (0.71) | 0.65 | 35% |
| 9 | hot takes | 0.88 | 0.05 | 0 | 52 | yes (7 → 0) | breakouts (0.63) | 0.85 | 42% |

### dot colours per family (solved, against #0B0E14)

| family | hue | unread | read |
|---|---|---|---|
| 0 | 52 | hsl(52 52% 47.6%) | hsl(52 30% 33.9%) |
| 1 | 91 | hsl(91 52% 47.5%) | hsl(91 30% 34%) |
| 2 | 130 | hsl(130 52% 49.1%) | hsl(130 30% 35%) |
| 3 | 169 | hsl(169 52% 47.9%) | hsl(169 30% 34.4%) |
| 4 | 208 | hsl(208 52% 66.2%) | hsl(208 30% 41.5%) |
| 5 | 247 | hsl(247 52% 75.3%) | hsl(247 30% 51.8%) |
| 6 | 286 | hsl(286 52% 71.9%) | hsl(286 30% 46.7%) |
| 7 | 325 | hsl(325 52% 71.1%) | hsl(325 30% 45.7%) |

The collision rule, stated once (the code carries the same comment): in index order, a region that
shares a bearing family with an earlier region less than 0.5 plane-units away moves to the nearest
family — cyclic family distance, so family 7 (325) and family 0 (52) are neighbours across the ember
gap — in which every member is ≥ 0.5 away; ties go to the lower family. **Consequence, stated
honestly:** 9 of 42 regions wear a hue that is not their bearing's, so "same bearing → same hue
across worlds" holds only approximately and "colour approximates location" is a tendency, not a
law. The founder's call (§10): accept this, or hand-assign hues per world and drop the bearing rule.

## 4. The colour grammar — one meaning per channel

| channel | meaning | rule in the file |
|---|---|---|
| **hue** | region identity, nothing else (Bertin: selective, not ordered — SOURCED) | 8 families 39° apart from HSL 52: 52 · 91 · 130 · 169 · 208 · 247 · 286 · 325; the band 5–51 around ember (#E8833A ≈ HSL 26) is never used |
| **lightness** | read state, nothing else | **solved per hue**: every unread dot lands at 8:1 and every read dot at 3.5:1 against `--ground #0B0E14` (`lightnessFor()` in both files; WCAG 1.4.11 floors 4.5 / 3) |
| **chroma** | the one ordered ramp — *nebula layer only* | nebula saturation 18 % → 44 % west → east (ESTIMATE); dots carry a fixed 52 % unread / 30 % read |
| **glow (nebula alpha)** | the engine's current belief — the remote's "signal strength" | 0.18 at rest → 0.30 with affinity (ESTIMATE), sampled on the label's 2 s clock, never while touching, floored so no region vanishes |
| **size, motion** | interface only | swell, bloom, halo, sparks, ≤ 3 "live now" — nothing in the data drives them |
| **ember** | interaction only | halo, knob, needle, reticle, trail, edge glow, lit compass word — never data |
| **shape** | unassigned | the "wry" ambiguity glyph is undecided (§10) |

Why lightness is *solved* rather than fixed: the critic measured the referee's fixed-L palette and
found the cool half failing — read hsl(247 30% 40%) was 2.37:1, hsl(325 …) 2.87:1 against the
ground (VERIFIED). HSL lightness is not perceptual, so a fixed L lets hue leak into brightness and a
read blue looks *more* unread than a read yellow. The solver (bisection on L to a target contrast)
makes brightness mean exactly one thing. The resulting palette:

| family | hue | unread | read |
|---|---|---|---|
| 0 | 52 | hsl(52 52% 47.6%) | hsl(52 30% 33.9%) |
| 1 | 91 | hsl(91 52% 47.5%) | hsl(91 30% 34%) |
| 2 | 130 | hsl(130 52% 49.1%) | hsl(130 30% 35%) |
| 3 | 169 | hsl(169 52% 47.9%) | hsl(169 30% 34.4%) |
| 4 | 208 | hsl(208 52% 66.2%) | hsl(208 30% 41.5%) |
| 5 | 247 | hsl(247 52% 75.3%) | hsl(247 30% 51.8%) |
| 6 | 286 | hsl(286 52% 71.9%) | hsl(286 30% 46.7%) |
| 7 | 325 | hsl(325 52% 71.1%) | hsl(325 30% 45.7%) |

Why the chroma ramp came off the dots: chroma and lightness are not perceptually separable
(Smart & Szafir CHI 2019 — SOURCED; Helmholtz–Kohlrausch — SOURCED), and position already encodes
x in the most accurate channel (Cleveland & McGill — SOURCED). The nebula carries no other ordered
variable, so "the land heats up eastward" survives there at no cost — **but** the critic measured
the ramp at ≈ 1 JND (Oklab ΔE 0.022–0.030 over the ground, VERIFIED). Feel test 11 decides whether
it stays; if strangers say "brighter" rather than "hotter", it goes.

**Accessibility — what is and is not claimed.** Every meaning has a non-hue carrier: axis =
position + compass word + label; region = its name on the land + a boundary tick on crossing; read =
lightness; interaction = ember + geometry. **No CVD claim is made.** The referee's ΔE ≥ 0.05 gate
*fails as specified* (critic, VERIFIED: min deuteranope ΔE 0.030 between families 91 and 325 at 39°
spacing; sports co-locates 169 and 286, near-identical for a protan; tritanopia never simulated).
Until two real CVD testers pass the "name the region from the land" test, the name and the tick are
the carriers and the colour is a convenience. Region names are text on canvas plus an `aria-live`
announcement on entry ("entering moto"); the lit compass word is announced too.

## 5. The engine — how items get coordinates, and how far "stable" holds

**Prototype today (staged):** each cell's region is the **argmax** of the fixed Gaussian region
weights at that cell — a lookup nothing the user does can move. Border blur: a hashed 15 % of cells
take the second-best region when its weight is ≥ 0.35 of the best (ESTIMATE) — the only serendipity
left. Whether a cell is populated is a per-region supply constant decided by the hash alone.
Affinity no longer touches placement; it moves the nebula glow, and is logged. The mixture sampler,
the topic-teleport floor and the affinity-driven empty branch are gone.

**Production (to build):** each item classified once at the nightly drop (Message Batches, ≤ 24 h,
50 % off — SOURCED) into a nominal `region_key` (the reliable judgement), an intensity 0–1 with a
one-line reason, **two independent tone scores** (earnest 0–1, goofy 0–1 — never one bipolar
number; deadpan MMA analysis and ironic chess are high on both), confidence, flags ⊂ {wry,
ambiguous, unsafe}, `rubric_version`. Placement: `x = region.x + (intensity − region.intensity_mean)·k`
with **`intensity_mean`, `k` and the region radius frozen in the edition table as editorial
constants** (the daily mean is reported, never used — otherwise per-day normalisation sneaks back
in; critic); `y = region.y + stable-hash scatter` until tone passes its gate; the cell is the
nearest free cell **whose argmax region equals the item's region** (spiral until true — otherwise
the label says "in chess" over golf dots; critic), collisions in item-id-hash order; the result is
one frozen per-world-per-day JSON with a printed layout hash ("creators · 2026-09-02 · rubric v1 ·
287 items").

**Exactly how far "stable by construction" holds:** within a day nothing can move, because position
is a pure function of (item scores, edition table, collision order) and none depend on the user or
on later arrivals *provided there are no intra-day top-ups* — with top-ups the layout is "stable by
persistence" (persisted layout placed first, new items take only free cells) and must be called
that (critic). Across days only the items change, at the announced drop. Across worlds the compass
and the camera's plane position hold. It does **not** hold if the rubric or model version changes
(an edition event), if coordinates are "fixed" later (an edition event), if anyone quantile-
normalises an axis per day (rejected outright), or if the tiebreak lets rank or recency in (must
be the id hash, in the verify suite). It never claims the **scores** are right — t-SNE/UMAP
instability (Distill 2016, GhostUMAP2 — SOURCED) is replaced by scorer validity, the smaller and
testable risk; on a legible map a wrong position is a visible lie for a whole day.

**Steering is an explicit signal.** A ring or conveyor push is a stated wish, logged as
`explicit_axis_pref` with plane coordinates, separate from the implicit dwell/steer-away channel.
Calibrated in cells, not seconds (at V_MAX 880 px/s a full push crosses the staged world in
≈ 2.3 s — SOURCED from the file): every **4 cells of net camera displacement** along an axis while
armed is one event: +0.4 to regions lying ahead (`along > 0.15`), half-life shared with dwell for
now (the critic's separate 30 s accumulator is an open item), ≤ 200 entries in `steerLog`, count on
`field.dataset.steers`. **A push into the world's edge is logged too** — one `clamped: true` event
per contact, no affinity change — and the live copy says *"as calm as this world gets"*: a doneness
fact, not a failure. Steer-away gains axis attribution in the patent taxonomy (§9).

**The arithmetic nobody can wish away** (ESTIMATE): 55 × 44 = 2,420 staged cells vs a 150–300 item
daily world = 6–12 % fill. Decision: **the production world is bounded to the populated hull + one
cell** (≈ 300 cells ≈ 15 × 20, ~2.5 phone screens) and the odometer counts populated cells; the
staged 55 × 44 stays for the prototype only. Growing instead to 1,500–2,000 items/day costs ≈ $3–6
per day per world on Haiku batch, $6–12 on Sonnet batch — ≈ $0.9–1.9k/month for ten worlds before
double-scoring (ESTIMATE; "cents/day" in the plan is true only at ≤ 300 items on Haiku batch,
≈ $0.0016/item). Shrink vs grow is a founder decision (§10).

## 6. The remote — what the screen does

Under the simplicity doctrine the drift keeps **one primary control (the ring)** and adds no
instrument; the compass lives inside the ring's footprint and the world switcher is a chip strip,
closed by default.

- **Ring compass.** Four 11 px chrome uppercase words (letter-spacing .08em, DESIGN.md micro-label)
  at the rim, alpha .32 at rest so the legend is readable before any push (zero-input value);
  .55 with a thumb in the ring; past the dead zone the word nearest the bearing becomes its
  comparative in ember at .95 — diagonals light two (WILDER + GOOFIER is the founder's "down-right").
  Eight 45° sectors with hysteresis (enter at .42, leave at .34 of the deflection — ESTIMATE) so
  diagonal words never flicker; fade over ~400 ms after release; opacity only under reduced motion.
  A word dims to `--faint` at the wall. No arcs, no colour on the ring, never a fifth word.
- **You are here.** The 2.5 px `--dim` bead at `planePos()·0.7·r` inside the ring: the knob is what
  you push, the bead is where you are; a fresh world shows it dead centre.
- **The fly-out, once.** First ring touch of a session: the four words fly to the four screen edges
  (600 ms, forge easing), hold 2.5 s, return — the compass teaches itself, then collapses. A
  `sessionStorage` flag (try/catch, in-memory fallback) keeps it to once.
- **The label speaks place; the ring speaks direction.** `world · in <region> · N % walked`, with
  the axis words (`wild`, `goofy`, or the world's own `new`/`familiar`) only when no region
  dominates — the place implies the coordinates, and that is what fits 390 px (critic). Region =
  `dominantRegion()` with 0.1 hysteresis and a 0.34 share floor; 2 s cadence; never mid-gesture.
  "Drifting toward …" prose is gone — belief is the glow.
- **Worlds.** The chip opens a strip of world names; **W** cycles; Escape closes. Switching keeps
  the plane coordinates; a 3.2 s hint says *"Same compass, new places — right is still wild, down is
  still goofy"* (creators: *"here right means newer: breaking now"*). **Switching is ignored while a
  thumb is down** (critic: mid-hold switches broke state). Per-world session state (walked cells,
  trail, affinity) is *not* preserved across a switch yet — "the walked world never rewrites" holds
  within a world, not across a round trip; open item.
- **Haptics.** Boundary tick when the selection crosses into a different *placed* region (keyed on
  the argmax, not the blurred fill, so it fires once per crossing — driver-checked); wall thud once
  per contact; kind textures unchanged; reduced motion keeps the boundary tick only. Detent
  intensity is never scaled by x — both Core Haptics scalars are spent on kind.
- **Keyboard.** Shift + arrows steer by half a screen with the same words announced; arrows still
  step dots; H home; W world.
- **Copy.** "A remote for your feed" is the explainer, never the product noun. The verb ships:
  *You don't set your algorithm. You steer it.* (TikTok's Manage Topics and Steam's sliders mean
  "has controls" is not the differentiator — SOURCED.)

## 7. What the prototype proves, and what it fakes

Proves (CDP touch driver, `scratchpad/drive-drift.mjs`, all green on this file): pushing east moves
the plane from x ≈ 0.04 to 0.89 and the label goes from "in basketball" to "in base & freeride";
steer events accrue to the regions ahead (base & freeride 4.8 vs chess untouched by that push); the
steer word is the world's own ("new" in creators, "wild" in sports) and the label follows it; the
chip strip, W-cycle order and Escape work; a switch under a held thumb is ignored; **exactly one
boundary tick** on a moto → base & freeride crossing; **one wall thud** per contact with the
direction and the "as calm as this world gets" announcement and a clamped steer-log entry; the
fly-out ran once without error; rev. 3 (bloom, textures, park lock, parked lift) and rev. 2
(conveyor, release stop, recenter) are unchanged. Probe: zero console errors. `verify:driftpalette`
asserts the grammar against the prototype's own tables.

Fakes, disclosed on its face: positions come from a hand-placed table, not scores; there is no
classifier; steering changes only the glow; the honesty card says so in the referee's words —
*"Positions come from scores, not from learning — they cannot move today. Steering moves you; it is
also logged as a preference, and in this demo the only thing that preference changes is the glow.
Tomorrow's world is new."*

## 8. Must prove — before any world ships

For the driver (automatable):

1. **Placement determinism** — `worldPlacement.verify.ts` (not yet written): identical daily JSON →
   byte-identical cells; with top-ups allowed, previously placed cells never move ("by persistence").
2. **Scorer agreement gate** — 100 items × 3 raters: Spearman ≥ 0.7 rater-vs-scorer on intensity;
   inter-rater ≥ 0.6; Krippendorff α ≥ 0.7 intensity / ≥ 0.6 tone vs the founder's labels; double-
   score with shuffled exemplars, drop items differing > 0.2 (all ESTIMATE targets). Tone placement
   stays locked until tone passes.
3. **Region classification ≥ 90 %** against the founder's hand labels (ESTIMATE) — the judgement v1
   actually relies on.
4. **Intensity–tone correlation**; |ρ| > 0.7 collapses the plane to a diagonal.
5. **LLM intensity runs low** — report the east-edge population before/after calibration.
6. **Colour** — the verify suite's laws, plus the CVD test with two real testers before any claim.
7. **Steering visibly obeyed — measured against the seeded counterfactual** (same cells materialised
   with affinity zeroed; the deterministic seed makes it computable): share of ahead-region fill and
   glow delta, steered vs unsteered. The referee's "≥ 60 % of new cells have greater x" gate was
   vacuous — true of any eastward move by geometry (critic).
8. **Cost and fill** — measured $/item on Haiku batch vs ≈ $0.0016; the populated hull of a real
   300-item day.

For a human:

9. **Learnability** — 5 uncoached strangers, 3 minutes, then "what happens if you push right? down?";
   pass = 4/5 say wilder/more intense and goofier/sillier unprompted. Written for the world that
   ships first (creators: "newer"), not for sports.
10. **The nebula at 30 % brightness** — name the region under the thumb from the land alone in 2 s;
    again with a deuteranopia filter (name + tick).
11. **The ramp** — sliding east, "hotter" (keep) or "brighter/newer" (drop)?
12. **Remote vs ring** — does anyone expect intensity to track deflection and snap back on release?
13. **Habit** — 7-day dogfood in the creators world with a ring-push counter; < 3 pushes per session
    by day 7 means the compass is a demo feature and stays out of the Scout wedge (ESTIMATE).
14. **Explicit vs inferred** — a 10 s east push while dwelling on chess changes unseen composition
    without erasing the dwell-built affinity.

## 9. Plan and patent consequences (applied in this commit)

- `docs/dot-field-drift.md` §4: density = supply; affinity chooses the fill; the mixture formula and
  perpendicular exploration are deleted. §7: the exact stability claim. §9: this revision.
- `docs/dot-field-navigation.md` §3: the hue budget is 8 families with the *name* as the taxonomy.
- `docs/dot-field-strategy.md` §3½: velocity is the creators world's x; region is hue.
- `docs/dot-field-plan.md`: worlds are editions; creators world ships first, bounded to its hull;
  budget honesty; the weekly editorial task; the rev. 4 disclosure rule; the agreement gates.
- `docs/patent/provisional-draft.md`: **never claim the 2-D plane, path selection over mood zones,
  hue-by-angle or per-item scores as such** — Gracenote US 8,855,798, Sony US 7,858,868, Monkeymedia
  US 6,281,899, Musicovery 2006, Moodstream 2008, Every Noise 2013 (SOURCED) are cited in the
  Background. The claimable residue is a **dependent claim** on the existing signal method: target
  positions determined by per-item attribute scores on named axes and invariant for the session;
  heading events attributed as signed preference on those attributes; conditioning materialisation
  of unvisited regions while visited regions remain immutable. §5 gains "Steer-toward (axis)" and
  axis attribution for steer-away. Counsel charts against 8,855,798's sequential-path selection
  before any commercial ship.
- DSA marketing scopes any "non-profiling" claim to the walked world — unseen-territory tilt and
  nebula glow *are* profiling.

## 10. Decisions only the founder can make

1. **Sign the four words and the "pull back" reading.** CALM · WILD · SERIOUS · GOOFY; goofier is a
   push *south*; pulling back is stop. If "pull back" meant calmer/westward, say so — the compass
   does not change, only the hint copy.
2. **Accept the demotion of the algorithm** to "a map plus a density sampler," and re-cut the
   "territory reshapes as it learns you" demo around the compass and the glow.
3. **Shrink or grow:** a ~300-cell hull (weakens the "drift" identity) or a 1,500–2,000-item corpus
   at 5–7× classifier cost.
4. **Creators world first** — the one you open daily; sports/music/kitchen only after gates 9 and 2.
5. **CVD carrier:** declare name + boundary tick the sole carrier (and never call the colour
   accessible), or gate on real testers, or add a second identity carrier (shape).
6. **Cross-world hue consistency:** accept the 9-of-42 collision moves and drop the "same bearing →
   same hue" claim, or hand-assign hues per world.
7. **Top-ups:** none intra-day ("stable by construction") or allowed ("stable by persistence").
8. **The wry glyph:** exclude ambiguous items or give them a shape (then shape enters the grammar).

## 11. Open questions (nobody's to decide yet)

- Sports centre crowding: soccer, football, basketball near the origin — is a seeded sub-arrangement
  plus names enough, or do centre regions need a hand-drawn tiling?
- Which of the founder's 3–10 niches actually have an *east*? Finance, parenting and tech may have a
  thin intensity axis; each new world passes learnability or does not ship.
- Will strangers ask "why did it change?" when the nebula glow moves without a push — and if so
  should belief live only in the label?
- If tone never clears α 0.6, y stays editorial forever: "one measured axis plus a curated one" —
  still the product?
- Is within-region x scatter by score visible enough to be worth the classifier call in v1, or is
  region-only placement the honest v1?
- Per-world session state across switches (walked cells, trail, affinity) — build the map of maps,
  or accept that a world re-seeds on return?
- A separate steer accumulator with its own half-life and per-push cap (the critic's saturation
  finding: two events pin the glow) — before the first stranger test.

## 12. Provenance

Workflow `wf_fdb638ce-a09`: five lenses (semantics of direction; colour and perception; the engine
and the corpus; the remote as a product; the skeptic's refutation), a referee (`map/referee.json`)
and a critic who re-derived the referee's tables and contrasts against the file (`map/critic.json`).
The critic's VERIFIED findings changed the build: the collision rule made deterministic and moved
into code; fixed lightness replaced by the per-hue solver; region keys shortened; boundary keyed on
the placed region; the wall logged and worded; mid-hold switching guarded; `xWords` for creators;
"edition 0 (draft)" instead of "frozen"; the vacuous steering gate replaced by the counterfactual.
The referee's hand tables are superseded by §3 — the code generated those, not a person.
