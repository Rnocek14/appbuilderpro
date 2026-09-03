# The map — the wheel (drift rev. 5)

*Ruling of the seven-agent panel (five lenses, a skeptic, a referee, a critic), 2026-09-02, applied to
`prototypes/the-drift.html` and `src/lib/driftPalette.ts` — then **reversed on one point by the
founder's own clarification the same day** (§0b). Every number is marked SOURCED (a citation or a
measurement of the file) or ESTIMATE (a design guess to be tested).*

> **PRIVATE until the provisional is filed.** Steering by named coordinates is a claimable dependent
> variant of the signal method (§9). The shared Drift artifact stays at rev. 3; no clip, no post, no
> republish of rev. 4 or 5 until the USPTO receipt exists (plan Phase 0.1).

## 0. The sentence, and what survived it

The founder's first sentence: *"if you go so far right you are in extreme sports and from there the
deeper you go the more extreme, the more you pull back the goofier … or you switch drift to another
category and same thing. It's almost like a remote of what you want to see … the colors and everything
should mean something."*

What survived every lens, and still stands: **direction means the same thing in every world**;
named, hand-placed, colour-coded regions whose coordinates never move; **hue names the kind, lightness
is read state, ember is interaction only**; switching worlds keeps your coordinates; steering is an
explicit, logged preference; positions are a placement lookup, not a projection, so the geography is
stable by construction. What it costs also still stands: the recommender loses the power to reshape the
land and keeps only the power to choose which item fills an unvisited cell and how brightly a region
glows. "The territory reshapes as it learns you" became "the glow and the fill change."

### 0b. The reversal — plane to wheel (same day)

The panel ruled **Cartesian**: calm↔wild on x, serious↔goofy on y. Its reasons for rejecting the polar
reading were two: (a) on a polar plane "push right" means *more* intense east of centre and *less* west
of it, and (b) polar duplicates the tone axis on both semicircles. The critic accepted both.

The founder then wrote: *"deeper or shallower drift determines intensity and then direction determines
category … stay in that genre and play around with similar content or more intense, less intense,
similar sport."* That is a wheel, and it changes the argument:

- **The angle is category, not tone.** Reason (b) assumed tone on the angle. With *kinds* on the angle
  there is nothing to duplicate, and "similar sport" becomes a small rotation — something the plane
  could never offer, where chess sat beside golf because both were calm and serious, not because
  they were alike. Category is a kind; intensity is an amount. Kinds around a ring and amounts along
  the radius match how each behaves.
- **"Pull back" is settled.** It means *shallower*, toward the hub — not goofier. The panel's y axis
  was an over-reading of one word. Register survives as a **tag on the card** (serious / goofy),
  never as geometry and never on a dot.
- **Reason (a) is a cost, not a flaw.** In a vehicle, what a push does depends on where you are; that
  is what piloting is. The ring pays the cost by always drawing **HOME at the bearing to the hub** and
  **DEEPER opposite**. The rule a stranger can hold: pull toward HOME for shallower, push away for
  deeper, push sideways for the neighbouring kind.

Costs the wheel introduces, stated honestly: serious↔goofy is no longer a place you can steer to;
near the hub small moves swing the bearing, so a hub disc (radius < 0.15, ESTIMATE) is "the
mainstream" with no kind; the sector order around the wheel is an editorial choice about similarity
(which kinds are neighbours) that no measurement backs yet; and the eight-sector budget means a
world with more than eight kinds must merge some. The panel's measurement still stands: if intensity
and tone correlate |ρ| > 0.7 (ESTIMATE) on the first real corpus, the founder's one-dimensional model
was right all along and the wheel is exactly that model.

## 1. The wheel

| | rule |
|---|---|
| **bearing** | the kind. Eight sectors 45° apart, sector *i* at bearing *i*·45°, 0 = east, counter-clockwise. Each world names its sectors in an editorial wheel order (neighbours are similar kinds — ESTIMATE, argued by nobody yet) |
| **radius** | intensity, in the world's own words: sports *casual → extreme*, music *mellow → intense*, kitchen *comfort → extreme*, creators *familiar → new*, movies *mainstream → deep cut*. 0 is the hub, 1 is the rim |
| **hub** | radius < 0.15: the mainstream. The kind is undefined; the label says the world's shallow word; the ring shows it in HOME's place |
| **rim** | radius = 1: as deep as this world goes. The camera is clamped to it; beyond is dark land; contact is a thud and a logged, clamped wish |
| **home** | the hub. The home glyph, the ring's HOME word and the you-are-here bead all point at it |
| **register** | a tag on a region (serious / goofy / none), shown on the card as a word — never geometry, never on a dot |
| **ring words** | universal: HOME · DEEPER at rest; SHALLOWER · DEEPER lit while pushing; the kind ahead lights at the screen edge |

Lineage, unchanged: intensity is Russell's arousal / Musicovery's calm↔energetic (SOURCED); the
wheel itself is the Geneva Emotion Wheel's geometry with the sign convention "outward = more" and
kinds, not emotions, on the angle (GEW and Plutchik disagree on the sign — SOURCED — so the sign is
stated once here and never varies). Mirror the bearing under `dir=rtl`? Not needed: a wheel has no
left-to-right reading order. Kept as a question.

## 2. Geometry

A square world of 47 × 47 cells at 44 px pitch with the wheel inscribed: hub at the centre cell, rim
radius 22 cells. A region at (sector *s*, radius *r*) sits at cell `(HUB_C + r·RIM·cos θ, HUB_R −
r·RIM·sin θ)` with θ = *s*·45° (screen y grows downward). `polarPos()` inverts it for the viewport
centre. Cells beyond the rim are empty by construction (driver-checked: zero populated cells with
depth > 1; 1,517 cells inside the rim). Region spread grows with depth (3.6 + 2.6·r cells, ESTIMATE):
the inner ring is tight and blends toward the hub; the deep end sprawls.

`switchWorld` carries (bearing, radius) across: deep in *horror* in movies is deep in *air & mountain*
in sports — the same bearing, the same colour, a different kind.

## 3. The worlds — edition 0 (draft)

Generated by `npx tsx scripts/drift-edition-tables.ts` from the prototype's `WORLDS` literal through
the core's `placeRegions()` — **the code is the single source of truth**. Table order = index order.
All coordinates ESTIMATE: argued by no one yet. They freeze as **edition 1** only after one argue-once
session (founder + one literate stranger per world), with the signatory recorded; every later
coordinate change is a new edition, announced at the drop, never silent, never backfilled (spatial
memory — Scarr/Cockburn, SOURCED).

Rules the tables obey (all asserted by `verify:driftpalette`):

- exactly 8 sectors per world (null for an unused one), sector names ≤ 15 characters;
- region keys ≤ 15 characters; every region ≥ 2 staged authors and ≥ 3 captions; no key containing
  "rage" or "bait";
- radius in [0.20, 0.98] — nothing inside the hub, nothing beyond the rim;
- two regions in one sector ≥ 0.3 apart in radius (told apart by depth and name);
- hue = the sector's hue, exactly, so ≤ 8 hues per world and the same bearing is the same colour in
  every world; register tags ∈ {serious, goofy, absent};
- `edition: 0` on every world; the movie world exists with ≥ 12 regions;
- density = supply, by the hash alone: 0.85 populated, 0.65 at radius ≥ 0.75 (ESTIMATE).

Deleted or replaced, listed so nothing vanishes silently: the plane coordinates `x`, `y` and the
`AXES` compass; the deterministic hue **collision rule** (unnecessary once hue is the sector's);
`xWords`/`xLit` (replaced by per-world `depth` words); `TOTAL_CELLS`-based odometer (now cells inside
the rim); the rectangular camera clamp (now the rim).

### sports — edition 0 (depth: casual → extreme)

| # | region | sector | bearing | radius | hue | register | density | nebula sat |
|---|---|---|---|---|---|---|---|---|
| 0 | soccer | ball | 0° | 0.3 | 52 |  | 0.85 | 26% |
| 1 | football | ball | 0° | 0.6 | 52 | serious | 0.85 | 34% |
| 2 | basketball | court | 45° | 0.3 | 91 |  | 0.85 | 26% |
| 3 | mma & boxing | combat | 90° | 0.8 | 130 | serious | 0.65 | 39% |
| 4 | moto | motor | 135° | 0.7 | 169 |  | 0.85 | 36% |
| 5 | base & freeride | air & mountain | 180° | 0.95 | 208 | serious | 0.65 | 43% |
| 6 | trick shots | wheels | 225° | 0.3 | 247 | goofy | 0.85 | 26% |
| 7 | skate & bmx | wheels | 225° | 0.65 | 247 |  | 0.85 | 35% |
| 8 | pub games | mind & pub | 270° | 0.25 | 286 | goofy | 0.85 | 25% |
| 9 | chess | mind & pub | 270° | 0.65 | 286 | serious | 0.85 | 35% |
| 10 | golf | club & field | 315° | 0.2 | 325 |  | 0.85 | 23% |
| 11 | bat & ball | club & field | 315° | 0.5 | 325 |  | 0.85 | 31% |

### music — edition 0 (depth: mellow → intense)

| # | region | sector | bearing | radius | hue | register | density | nebula sat |
|---|---|---|---|---|---|---|---|---|
| 0 | pop | pop | 0° | 0.2 | 52 |  | 0.85 | 23% |
| 1 | hip-hop | hip-hop | 45° | 0.4 | 91 |  | 0.85 | 28% |
| 2 | electronic | electronic | 90° | 0.55 | 130 |  | 0.85 | 32% |
| 3 | punk | rock | 135° | 0.6 | 169 | goofy | 0.85 | 34% |
| 4 | metal | rock | 135° | 0.92 | 169 | serious | 0.65 | 42% |
| 5 | folk | roots | 180° | 0.25 | 208 |  | 0.85 | 25% |
| 6 | classical | roots | 180° | 0.6 | 208 | serious | 0.85 | 34% |
| 7 | jazz | jazz | 225° | 0.45 | 247 |  | 0.85 | 30% |
| 8 | musicals | stage | 270° | 0.35 | 286 | goofy | 0.85 | 27% |
| 9 | novelty | novelty | 315° | 0.3 | 325 | goofy | 0.85 | 26% |

### kitchen — edition 0 (depth: comfort → extreme)

| # | region | sector | bearing | radius | hue | register | density | nebula sat |
|---|---|---|---|---|---|---|---|---|
| 0 | tea & bread | baking | 0° | 0.2 | 52 |  | 0.85 | 23% |
| 1 | home baking | baking | 0° | 0.5 | 52 |  | 0.85 | 31% |
| 2 | meal prep | prep | 45° | 0.3 | 91 | serious | 0.85 | 26% |
| 3 | fermentation | ferment | 90° | 0.6 | 130 | serious | 0.85 | 34% |
| 4 | molecular | lab | 135° | 0.85 | 169 | serious | 0.65 | 40% |
| 5 | grilling | heat | 180° | 0.45 | 208 |  | 0.85 | 30% |
| 6 | hot chili | heat | 180° | 0.85 | 208 |  | 0.65 | 40% |
| 7 | street food | street | 225° | 0.3 | 247 |  | 0.85 | 26% |
| 8 | eating contest | contest | 270° | 0.9 | 286 | goofy | 0.65 | 41% |
| 9 | kitchen fails | fails | 315° | 0.5 | 325 | goofy | 0.85 | 31% |

### creators — edition 0 (depth: familiar → new)

| # | region | sector | bearing | radius | hue | register | density | nebula sat |
|---|---|---|---|---|---|---|---|---|
| 0 | essays | long-form | 0° | 0.25 | 52 | serious | 0.85 | 25% |
| 1 | tutorials | how-to | 45° | 0.3 | 91 |  | 0.85 | 26% |
| 2 | storytime | story | 90° | 0.3 | 130 |  | 0.85 | 26% |
| 3 | daily vlogs | story | 90° | 0.6 | 130 |  | 0.85 | 34% |
| 4 | hooks & cuts | craft | 135° | 0.5 | 169 |  | 0.85 | 31% |
| 5 | breakouts | growth | 180° | 0.75 | 208 |  | 0.65 | 38% |
| 6 | reaction | reaction | 225° | 0.55 | 247 |  | 0.85 | 32% |
| 7 | memes | trends | 270° | 0.55 | 286 | goofy | 0.85 | 32% |
| 8 | trends & sounds | trends | 270° | 0.88 | 286 |  | 0.65 | 41% |
| 9 | hot takes | takes | 315° | 0.9 | 325 |  | 0.65 | 41% |

### movies — edition 0 (depth: mainstream → deep cut)

| # | region | sector | bearing | radius | hue | register | density | nebula sat |
|---|---|---|---|---|---|---|---|---|
| 0 | crowd comedy | comedy | 0° | 0.3 | 52 | goofy | 0.85 | 26% |
| 1 | cult comedy | comedy | 0° | 0.8 | 52 | goofy | 0.65 | 39% |
| 2 | rom-coms | romance | 45° | 0.3 | 91 |  | 0.85 | 26% |
| 3 | slow romance | romance | 45° | 0.75 | 91 |  | 0.65 | 38% |
| 4 | prestige drama | drama | 90° | 0.35 | 130 | serious | 0.85 | 27% |
| 5 | arthouse | drama | 90° | 0.85 | 130 | serious | 0.65 | 40% |
| 6 | big thrillers | thriller | 135° | 0.3 | 169 |  | 0.85 | 26% |
| 7 | slow-burn noir | thriller | 135° | 0.8 | 169 |  | 0.65 | 39% |
| 8 | popcorn horror | horror | 180° | 0.35 | 208 |  | 0.85 | 27% |
| 9 | extreme horror | horror | 180° | 0.9 | 208 |  | 0.65 | 41% |
| 10 | tentpoles | action | 225° | 0.3 | 247 |  | 0.85 | 26% |
| 11 | martial arts | action | 225° | 0.7 | 247 |  | 0.85 | 36% |
| 12 | space opera | sci-fi | 270° | 0.3 | 286 |  | 0.85 | 26% |
| 13 | hard sci-fi | sci-fi | 270° | 0.8 | 286 | serious | 0.65 | 39% |
| 14 | family animated | animation | 315° | 0.25 | 325 |  | 0.85 | 25% |
| 15 | anime & indie | animation | 315° | 0.7 | 325 |  | 0.85 | 36% |

### sectors and their hues (every world)

| sector | bearing | hue | unread dot | read dot |
|---|---|---|---|---|
| 0 | 0° | 52 | hsl(52 52% 47.6%) | hsl(52 30% 33.9%) |
| 1 | 45° | 91 | hsl(91 52% 47.5%) | hsl(91 30% 34%) |
| 2 | 90° | 130 | hsl(130 52% 49.1%) | hsl(130 30% 35%) |
| 3 | 135° | 169 | hsl(169 52% 47.9%) | hsl(169 30% 34.4%) |
| 4 | 180° | 208 | hsl(208 52% 66.2%) | hsl(208 30% 41.5%) |
| 5 | 225° | 247 | hsl(247 52% 75.3%) | hsl(247 30% 51.8%) |
| 6 | 270° | 286 | hsl(286 52% 71.9%) | hsl(286 30% 46.7%) |
| 7 | 315° | 325 | hsl(325 52% 71.1%) | hsl(325 30% 45.7%) |

**The movie world.** Sixteen regions, two per sector: the crowd-pleaser at radius ≈ 0.3 and the deep
cut at ≈ 0.8. Staged from a hand-written list of real titles and years (facts) with studios or
directors as authors; no catalogue API, no posters, no images. It is the one world where the map is
literally a map — a fixed catalogue means positions are frozen for real and "stable by construction"
is trivially true — and where the remote is literally a remote (the phone drifts, the TV would play).
Caveats, unverified: Netflix has no public catalogue; a v1 would sit on TMDB metadata with deep links
to wherever a title streams, and TMDB's commercial terms have not been checked. The genre wheel
order (comedy · romance · drama · thriller · horror · action · sci-fi · animation) is editorial.
Mood-based movie discovery has shipped before (Jinni, among others); the map is never claimed.

## 4. The colour grammar — one meaning per channel

| channel | meaning | rule in the file |
|---|---|---|
| **hue** | the kind — sector identity, nothing else (Bertin: selective, not ordered — SOURCED) | 8 families 39° apart from HSL 52: 52 · 91 · 130 · 169 · 208 · 247 · 286 · 325 = sectors 0–7; the band 5–51 around ember (#E8833A ≈ HSL 26) is never used |
| **lightness** | read state, nothing else | **solved per hue**: every unread dot lands at 8:1 and every read dot at 3.5:1 against `--ground #0B0E14` (`lightnessFor()` in both files; WCAG 1.4.11 floors 4.5 / 3) |
| **chroma** | the one ordered ramp — *nebula layer only* | nebula saturation 18 % → 44 % hub → rim (ESTIMATE); dots carry a fixed 52 % unread / 30 % read |
| **glow (nebula alpha)** | the engine's current belief — the remote's "signal strength" | 0.18 at rest → 0.30 with affinity (ESTIMATE), sampled on the label's 2 s clock, never while touching, floored so no region vanishes |
| **size, motion** | interface only | swell, bloom, halo, sparks, ≤ 3 "live now" — nothing in the data drives them |
| **ember** | interaction only | halo, knob, needle, reticle, trail, edge glow, lit ring word — never data |
| **register** | a word on the card | never a colour, never a shape, never on a dot |

Why lightness is *solved* rather than fixed: the critic measured the referee's fixed-L palette and
found the cool half failing — read hsl(247 30% 40%) was 2.37:1 and hsl(325 …) 2.87:1 against the
ground (VERIFIED). HSL lightness is not perceptual, so a fixed L lets hue leak into brightness. The
solver (bisection on L to a target contrast) makes brightness mean exactly one thing. The palette is
the last table in §3.

Why the chroma ramp came off the dots: chroma and lightness are not perceptually separable (Smart &
Szafir CHI 2019 — SOURCED; Helmholtz–Kohlrausch — SOURCED) and position already encodes depth in
the most accurate channel (Cleveland & McGill — SOURCED). The nebula carries no other ordered
variable, so "the land heats up toward the rim" survives there at no cost — **but** the critic
measured the ramp at ≈ 1 JND (Oklab ΔE 0.022–0.030 over the ground, VERIFIED). Feel test 12 decides
whether it stays.

**Accessibility — what is and is not claimed.** Every meaning has a non-hue carrier: kind = its name
on the land + the sector name at the screen edge while pushing + a boundary tick on crossing; depth =
position + the ring words + the label; read = lightness; interaction = ember + geometry. **No CVD
claim is made.** Eight families 39° apart give simulated deuteranope ΔE as low as 0.030 between
families 1 and 7 (critic, VERIFIED); until two real CVD testers pass "name the kind from the land",
the name and the tick are the carriers and the colour is a convenience. Names are text on canvas plus
`aria-live` announcements ("entering moto"; "deeper · horror"; "as extreme as this world goes").

## 5. The engine — how items get coordinates, and how far "stable" holds

**Prototype today (staged):** each cell's region is the **argmax** of the fixed Gaussian region
weights at that cell — a lookup nothing the user does can move. Border blur: a hashed 15 % of cells
take the second-best region when its weight is ≥ 0.35 of the best (ESTIMATE). Whether a cell is
populated is a per-region supply constant decided by the hash alone; cells beyond the rim are empty.
Each cell remembers how **decisive** its place is (the argmax's share of all weights); the boundary
tick fires only into a cell whose share ≥ 0.34, so the blended land near the hub never chatters
(driver-checked: exactly one tick on a base & freeride → moto crossing at shares 0.42 / 0.48, and none on a
golf → soccer crossing at 0.23 / 0.26). Affinity no longer touches
placement; it moves the nebula glow, and is logged.

**Production (to build):** each item classified once at the nightly drop (Message Batches, ≤ 24 h,
50 % off — SOURCED) into a nominal `sector` and `region_key` (the reliable judgement), an intensity
0–1 with a one-line reason, a register tag with confidence, flags ⊂ {wry, ambiguous, unsafe},
`rubric_version`. Placement: radius = `region.radius + (intensity − region.intensity_mean)·k` with
**`intensity_mean`, `k` and the region's radial extent frozen in the edition table** (the daily mean
is reported, never used — otherwise per-day normalisation sneaks back in; critic); bearing =
`sector·45° + stable-hash scatter within the sector`; the cell is the nearest free cell **whose argmax
region equals the item's region** (spiral until true), collisions in item-id-hash order; one frozen
per-world-per-day JSON with a printed layout hash. For a fixed catalogue (movies) the drop is a
one-time classification and the layout is frozen until the edition changes.

**Exactly how far "stable by construction" holds:** within a day nothing can move, because position
is a pure function of (item scores, edition table, collision order) and none depend on the user or on
later arrivals *provided there are no intra-day top-ups* — with top-ups the layout is "stable by
persistence" and must be called that (critic). Across days only the items change, at the announced
drop. Across worlds the wheel and the camera's (bearing, radius) hold. It does **not** hold if the
rubric or model version changes (an edition event), if coordinates are "fixed" later (an edition
event), if anyone quantile-normalises the radius per day (rejected outright), or if the tiebreak
lets rank or recency in. It never claims the **scores** are right; on a legible map a wrong position
is a visible lie for a whole day.

**Steering is an explicit signal, decomposed on the wheel.** Camera displacement while armed is split
into a radial component (deeper / shallower) and a tangential one (around the wheel); every 4 cells
of net displacement on either is one event: regions **ahead** gain +0.4 — for a radial event, regions
deeper than here weighted by how close their bearing is to the bearing you push toward (so from the
hub "deeper" favours the kind under your thumb, not the whole rim); for a tangential event, regions
around the wheel the way you turn. Logged with (bearing, radius, heading) in `steerLog` (≤ 200);
count on `field.dataset.steers`. **A push into the rim is logged too** — one `clamped: true` event
per contact, no affinity change — and the live copy says *"as extreme as this world goes"*. From the
hub every direction is deeper; there is no shallower.

**The arithmetic nobody can wish away** (ESTIMATE): 1,517 cells inside the rim vs a 150–300 item daily
world = 10–20 % fill at 0.85 density. Decision unchanged: **the production world is bounded to the
populated hull of the wheel** and the odometer counts populated cells; the staged 47 × 47 stays for
the prototype only. A fixed catalogue (movies, ~10k titles) inverts the problem — more items than
cells — and needs the over-subscription rule (affinity chooses the fill) from day one.

## 6. The remote — what the screen does

One primary control (the ring); no new instrument; the world switcher is a chip strip, closed by
default.

- **Ring compass.** Two words, 11 px chrome uppercase (letter-spacing .08em), alpha .32 at rest so the
  legend is readable before a push, .55 with a thumb in the ring: **HOME** on the rim at the bearing
  to the hub, **DEEPER** opposite. They turn with you. At the hub HOME becomes the world's shallow
  word (*casual*, *mainstream* …) below the ring. While pushing, the word you head toward lights in
  ember at .95 — DEEPER, or SHALLOWER in HOME's place — and the **kind ahead** lights with it at the
  screen edge in the push direction ("DEEPER · HORROR"); ~90 ms of hysteresis so a wobbling thumb
  never flickers the words; fade ≈ 400 ms after release; opacity only under reduced motion. DEEPER
  dims to `--faint` at the rim.
- **You are here.** The 2.5 px bead inside the ring at (bearing, radius·0.7·r): the knob is what you
  push, the bead is where you are; at the hub it sits dead centre.
- **The fly-out, once.** First ring touch of a session: the eight kind names leave the ring for their
  bearings at the screen edge (600 ms, forge easing), hold 2.5 s, return — "directions are kinds"
  teaches itself, then collapses. A `sessionStorage` flag (try/catch, in-memory fallback) keeps it to
  once.
- **The label speaks place; the ring speaks direction.** `world · in <region> · N % walked`, with the
  depth word (*casual*, *extreme*, *mainstream*, *deep cut*, *new* …) only when no region dominates
  (radius < 0.3 or > 0.7 — ESTIMATE). Region = `dominantRegion()` with 0.1 hysteresis and a 0.34 share
  floor; 2 s cadence; never mid-gesture.
- **Worlds.** The chip opens a strip of world names; **W** cycles; Escape closes; switching keeps
  (bearing, radius); a 3.2 s hint says *"Same wheel, new kinds — the middle is what everyone watches;
  push out for extreme"* (creators: *"here deeper means newer: the rim is breaking now"*; movies: *"the
  rim is the deep end"*). **Switching is ignored while a thumb is down.** Per-world session state is
  not preserved across a round trip yet (open item).
- **Haptics.** Boundary tick when the selection crosses into a different, *decisive* placed region;
  rim thud once per contact; kind textures unchanged; reduced motion keeps the boundary tick only.
  Detent intensity is never scaled by depth — both Core Haptics scalars are spent on kind.
- **Keyboard.** Shift + arrows steer by half a screen, decomposed on the wheel into one explicit
  event, the same words announced; arrows step dots; H home; W world.
- **Copy.** "A remote for your feed" is the explainer, never the product noun. The verb ships:
  *You don't set your algorithm. You steer it.*

## 7. What the prototype proves, and what it fakes

Proves (CDP touch driver, `scratchpad/drive-drift.mjs`, all green on this file): from the hub a push
east takes the radius from 0.1 to 1.0 and the label from "sports · casual" to "in football"; the steer
word during the push is "deeper"; steer events accrue to the kinds ahead (football 3.5 vs the far
side of the wheel ≈ 1); the rim is reached and logged as a clamped wish; switching to kitchen keeps
(bearing 359°, radius 1.0) and lands "in home baking"; W cycles kitchen → creators → movies → sports →
music; a switch under a held thumb is ignored; creators at the rim says "new" and its depth words are
new / familiar; movies at the hub says "mainstream", a push west says "deeper · horror" before the
sector is entered and "deeper" inside it, and lands "in extreme horror" with the card naming the
region; at the hub the three test pushes read "deeper · horror", "deeper · drama", "deeper · comedy";
**exactly one boundary tick** on a decisive base & freeride → moto crossing and **none** between the blended
golf and soccer cells; **one rim thud** per contact at
(180°, 1.0) with "as extreme as this world goes" and a clamped log entry; zero populated cells beyond
the rim; the fly-out ran once without error; rev. 3 (bloom, textures, park lock, parked lift) and
rev. 2 (conveyor, release stop, recenter) unchanged. Probe: zero console errors. `verify:driftpalette`
asserts the grammar against the prototype's own tables.

Fakes, disclosed on its face: positions come from a hand-placed table, not scores; there is no
classifier; steering changes only the glow; the honesty card says so in the referee's words —
*"Positions come from scores, not from learning — they cannot move today. Steering moves you; it is
also logged as a preference, and in this demo the only thing that preference changes is the glow.
Tomorrow's world is new."*

## 8. Must prove — before any world ships

For the driver (automatable):

1. **Placement determinism** — `worldPlacement.verify.ts` **passes**: identical input → byte-identical
   cells and hash; input order irrelevant; with the previous layout supplied, placed cells never move
   on a top-up ("by persistence"); without it the suite reports how many moved. The production placer
   is `src/lib/worldPlacement.ts`; the shorts pipeline uses it (`docs/dot-field-shorts.md`).
2. **Scorer agreement gate** — 100 items × 3 raters: Spearman ≥ 0.7 rater-vs-scorer on intensity;
   inter-rater ≥ 0.6; Krippendorff α ≥ 0.7 intensity / ≥ 0.6 register vs the founder's labels; double-
   score with shuffled exemplars, drop items differing > 0.2 (all ESTIMATE targets).
3. **Sector classification ≥ 90 %** against the founder's hand labels (ESTIMATE) — the judgement v1
   actually relies on.
4. **Intensity–register correlation**; |ρ| > 0.7 means the register tag is redundant with depth.
5. **LLM intensity runs low** (Nature 2025 — SOURCED) — report the rim population before and after
   calibration.
6. **Colour** — the verify suite's laws, plus the CVD test with two real testers before any claim.
7. **Steering visibly obeyed — measured against the seeded counterfactual** (same cells materialised
   with affinity zeroed): share of ahead-kind fill and glow delta, steered vs unsteered.
8. **Cost and fill** — measured $/item on Haiku batch vs ≈ $0.0016; the populated hull of a real
   300-item day; for movies, the one-time cost of classifying the catalogue.

For a human:

9. **Learnability, on the wheel** — 5 uncoached strangers, 3 minutes, then "what happens if you push
   away from the middle? sideways? toward HOME?"; pass = 4/5 say *more extreme / deeper*, *a different
   kind*, and *back toward the middle / milder* unprompted. Written for the world that ships first.
10. **The nebula at 30 % brightness** — name the kind under the thumb from the land alone in 2 s;
    again with a deuteranopia filter (name + tick).
11. **Remote vs ring** — does anyone expect depth to track deflection and snap back on release?
12. **The ramp** — pushing out, "hotter" (keep) or "brighter / newer" (drop)?
13. **The hub** — does the blended mainstream at the centre read as "everything" or as "nothing"?
14. **Habit** — 7-day dogfood in the founder's world with a ring-push counter; < 3 pushes per session
    by day 7 means the compass is a demo feature (ESTIMATE).
15. **Movies, founder-fit** — does the founder actually browse films weekly? If not, the movie world
    is a demo, not a wedge, whatever the fit of the corpus.

## 9. Plan and patent consequences (applied in this commit)

- `docs/dot-field-drift.md` §9: rev. 4 and rev. 5 recorded; §4/§7 stability language unchanged.
- `docs/dot-field-plan.md`: the movie world as a candidate behind the founder-fit check; the
  creators world still ships first.
- `docs/patent/provisional-draft.md` §6A and claim 9: "named axes" generalised to **named
  coordinates — two axes, or a bearing and a radius**; the Sony hue-by-angle distinction stands
  (their hue is the mood angle; ours names a kind and is never claimed). Never claim the plane, the
  wheel, path selection over zones, hue-by-angle or per-item scores as such — Gracenote US 8,855,798,
  Sony US 7,858,868, Monkeymedia US 6,281,899, Musicovery 2006, Moodstream 2008, Every Noise 2013
  (SOURCED); B&O MoodWheel 2015 is the shipped polar precedent.
- `prototypes/README.md` P14 row; `scout/README.md` feel test 10 rewritten for the wheel.

## 10. Decisions — taken and open

Taken today, by the founder's clarification:

1. **The wheel.** Bearing = kind, radius = intensity, the hub = mainstream. "Pull back" = shallower.
2. **Register is a tag**, shown on the card as a word.
3. **A movie world exists**, staged and private.

Still the founder's:

4. **Accept the demotion of the algorithm** to "a map plus a density sampler."
5. **Shrink or grow** the v1 world; for movies, accept over-subscription (more titles than cells).
6. **Creators world first**, or movies first if films are a weekly habit (must-prove 15).
7. **CVD carrier:** name + tick only (and never call the colour accessible), or gate on real testers.
8. **Sector order** per world: sign the eight kinds and their neighbours once (edition 1).
9. **Top-ups:** none intra-day ("by construction") or allowed ("by persistence").

## 11. Open questions

- The hub: with two to four inner regions blending at radius 0.2–0.3, is "mainstream" felt as a
  place or as noise? A hand-drawn hub tiling may be needed.
- Eight kinds is a hard budget; sports already merges (soccer + football in *ball*). Which of the
  founder's niches fit eight?
- Deep-end sparsity: the rim is honestly sparse at 0.65 density and the camera reaches it; does the
  half-empty screen at the rim read as "the edge of the world" or as broken?
- Per-world session state across switches (walked cells, trail, affinity).
- A separate steer accumulator with its own half-life and per-push cap (two events pin the glow).
- Whether the within-region radius by score is worth the classifier call in v1.

## 12. Provenance

Workflow `wf_fdb638ce-a09`: five lenses, a referee (`map/referee.json`) and a critic who re-derived
the referee's tables and contrasts against the file (`map/critic.json`); rev. 4 built to the ruling
with the critic's VERIFIED corrections. Then the founder's clarification ("deeper or shallower is
intensity, direction is category") reversed the geometry to a wheel in rev. 5, with the reasons in
§0b. The tables in §3 were generated by the code, not written by a person.
