# The Drift — a complete overview for an outside review

*Written 2026-09-03 for the founder to hand to a second reviewer. Self-contained: no prior context
needed. Every number is marked SOURCED (a citation or a measurement of the code), ESTIMATE (a design
guess), or UNVERIFIED (a fact quoted from memory that nobody has checked). Nothing here is hype; the
founder asked for the opposite, and the odds section says what we actually think.*

**Before you share this.** The mechanism below is the subject of an unfiled provisional patent. A
private chat with an AI is not a public disclosure, but a consumer chatbot may use conversations for
training unless that is switched off. Share it with training disabled or in a temporary chat, do not
paste the patent draft itself, and do not post any of it publicly until the filing receipt exists.
Europe has no grace period: a public demo before filing kills European rights permanently.

---

## 1. What it is, in one paragraph

A new way to browse content on a phone. Instead of a vertical feed you flick through, the content is
a field of small dots on a dark canvas. You scrub your thumb across it; the nearest dot is always
selected, with a physical tick each time the selection changes, so you feel each item pass without
looking. Slow down and the dots around your thumb grow names. Stop on one and it opens. Rest your
thumb in a ring at the bottom and push in any direction and the whole world flows under you, like
steering a vehicle: the direction is a kind of content, how far you go is intensity, the middle is the
mainstream and the rim is the deep end. Let go and it stops dead. The world is finite, everything you
have walked stays exactly where it was, your route is drawn on the land, and a counter says how much of
today's world you have covered. The founder's sentence for it: *"a remote for your feed. You don't set
your algorithm. You steer it."*

## 2. The problem it attacks

Serial feeds have four structural properties, all of which this design inverts:

- **Rejection is expensive.** Declining an item is a flick and an animated transition, several hundred
  milliseconds, and on full-screen video you must start watching before you may skip. Here a
  rejection is one tick under the thumb, roughly 40 ms (ESTIMATE from the prototype's detent gap).
  *Scroll makes you watch to skip; scrub lets you skip without watching.*
- **Signal is poor.** A feed sees about one implicit signal per item shown, and cannot tell "avoided"
  from "never seen." Scrubbing yields a graded verdict per crossing, plus a direction: turning away
  from an item is a distinct, measurable act. Rough rate while scrubbing: 10 to 25 micro-verdicts per
  second (ESTIMATE).
- **The ranking is hidden.** A feed's order conceals what the recommender thinks. Here the land is
  legible before you touch it: kinds are named on the map, positions never move, and what the engine
  believes about you shows as glow, not as reordering.
- **There is no end.** A feed is infinite by design. Here a world is finite and the odometer says so.
  "My feed has an end" is the one promise no feed can copy.

## 3. The mechanism, in detail

**The field.** A lattice of cells at 44 px pitch with a small jitter, one dot per populated cell,
rendered on a canvas with a glow. Dots are about 10 px; colour carries the kind (hue) and read state
(lightness). Size, halo and motion are reserved for the interface and never carry data.

**Selection.** The nearest dot to the thumb is selected, with hysteresis (enter at 0.80 of a pitch,
re-enter at 0.70 within 50 ms) so a thumb parked between two dots never flickers. A park lock keeps a
resting thumb silent. Selection changes emit a synchronous detent: a haptic transient with a minimum
30 ms gap, skip-never-queue (a fast skim drops ticks rather than playing them late). Each kind of
item has its own texture (a photo clicks, a video thuds, a carousel double-taps) through Core Haptics
in the native wrap; the web can only play a sound. Crossing into a new region of the map is a longer
tick; reaching the edge of the world is a thud.

**Scent.** While the thumb and the world are both slow (under 350 px/s combined), the six nearest
dots swell and grow small labels placed away from the thumb; they vanish above 560 px/s so a skim is
never cluttered. Above the field a card shows the selected item's author, caption and kind. Lifting
on a dot, or pressing it, opens the item.

**Travel: the ring.** A spring-loaded puck sits in the thumb's resting place at the bottom of the
screen. Its displacement is a velocity vector: push, and the world streams past a fixed reticle near
the centre of the screen, ticking as dots cross it. Attack 180 ms, release zero. *You push, it never
pushes.* Letting go stops the world within a frame. This "release stops dead" law is settled: a world
that keeps moving after you let go was the one thing that broke trust in testing. There is also an
edge conveyor: push into a screen edge with intent and hold, and the world flows; brushing an edge
mid-scrub never moves it.

**The wheel (the map).** The world is a disc. Eight sectors 45° apart are the kinds (in the sports
world: ball, court, combat, motor, air & mountain, wheels, mind & pub, club & field). Radius is
intensity in the world's own words (casual to extreme; mellow to intense; mainstream to deep cut).
The hub is the mainstream; the rim is as deep as the world goes, and the camera is clamped to it.
Regions are named places at a sector and a radius, drawn as coloured nebulas with their names printed
on the land, so the map is readable before any touch. The ring shows two words that turn with you:
HOME on the rim at the bearing to the hub, DEEPER opposite. While you push, the depth word you head
toward lights and the kind ahead lights at the screen edge ("DEEPER · HORROR"). Pull toward HOME for
shallower, push away for deeper, push sideways for the neighbouring kind. The first ring touch of a
session flies the eight kind names out to their bearings once, then they collapse. Switching worlds
(a chip strip; the W key) keeps your bearing and depth: deep in horror in the movie world is deep in
air & mountain in sports.

**Colour grammar, one meaning per channel.** Hue is the kind: sector *i* wears family hue *i* in every
world, eight hues 39° apart starting at HSL 52, never entering the band around the interface's ember
orange. Lightness is read state only, solved per hue so every unread dot sits at 8:1 and every read
dot at 3.5:1 against the ground (a fixed lightness let hue leak into brightness; blues failed 3:1). The
one ordered ramp, saturation rising toward the rim, lives on the nebula layer only, because chroma and
lightness are not perceptually separable on a dot. Nebula brightness is the engine's current belief
about you. Register (serious / goofy) is a word on the card, never geometry and never a colour.

**Legibility instruments.** A one-line label, updated every 2 s and never mid-gesture, names the
place: `sports · in mma & boxing · 31% walked`. The trail is drawn on the land and is also an object
(a tab lists your stops; tap one to glide back). A home glyph shows bearing and distance to the hub.
The odometer counts what has passed under you.

**The signal loop.** Each selection interval is classified by dwell and kinematics: scrub-past
(under 200 ms at speed) is a slight negative; glance (200–600 ms) is noise; pause (600 ms–1.5 s) is
positive; read (over 1.5 s, slow) is more positive; open is the only unambiguous positive; steer-away
(a sharp turn off a live preview) is a strong negative on that neighbourhood; steer-toward (net
displacement along a bearing while steering, one event per four cells) is an explicit, logged
preference on the axis. Signals decay (session half-life 90 s, ESTIMATE). In the current build these
signals change exactly one visible thing: the glow of regions ahead. They never move a dot.

**Placement, and how far "stable" holds.** Positions are a lookup, not a projection. Each item has a
kind and a depth; a pure placement core puts it in the nearest free cell inside the rim whose region
is its own, visiting items in a hash order so input order is irrelevant. Same input gives byte-identical
cells ("stable by construction"). Given yesterday's layout, placed items keep their cells and new items
take free cells ("stable by persistence"). A layout hash is printed with every edition. The walked
world never rewrites. What the engine may still do: choose which item fills an unvisited cell when
more items than cells exist, and set the glow. The classifier that would score intensity per item does
not exist yet; today depth comes from an editorial region radius plus a bounded keyword rubric that is
named as such.

**A second embodiment, the seed.** The same engine as a widget on an ordinary page: hold a persistent
dot on a scrolling catalogue and a thumb-sized proxy grid blooms under the finger, one abstract dot per
item on screen in the same arrangement; scrubbing it highlights the real item in place; pushing past
the edge row turns the page a row per tick; lift to open. It is the version most exposed to prior art
and is claimed only as a dependent.

## 4. What exists today

All in one private repository, one branch, gated by a typecheck, a build, verify suites and a
synthetic-touch driver before every push.

- **Three prototypes**, single HTML files with a canvas renderer: the bounded field (P13), the drift
  (P14, at revision 5, the wheel), and the seed (P15). All run on the web with sound in place of
  haptics.
- **A native iOS wrap** (Capacitor with a Core Haptics bridge) that carries the drift and the seed.
  Built and scaffolded; **not yet run on a phone**. Apple closed the web haptics path in iOS 26.5
  (per an audit note in the plan), so the native wrap is the only way to feel the tick on an iPhone.
- **Five staged worlds** on the wheel (sports, music, kitchen, creators, movies) with hand-placed
  regions at "edition 0", meaning nobody has argued the coordinates yet.
- **A real-content pipeline** for YouTube Shorts: a script that searches per region through the
  YouTube Data API, keeps only embeddable short-form, places everything with the placement core, and
  writes one frozen edition JSON with a layout hash, plus a manifest the drift loads at boot. The
  drift treats a real world's cells as placed, shows the real thumbnail, and opens YouTube's own
  player inline. Without an API key the script writes a fixture that is labelled as one and never
  opens a player. **The first real drop ran on 2026-09-03**: 948 videos fetched, 946 short-form, 602 placed on the wheel with none unplaced, inside one day's free quota.
- **Pure cores with verify suites**: the colour grammar (checked against the prototype's own tables),
  the placement core (determinism, order independence, persistence, hash sensitivity, input
  validation), and the shorts world (filters, rubric bounds, edition shape, fixture honesty).
- **Documents**: a navigation synthesis, the drift specification, the seed interrogation, the map
  ruling (a seven-agent panel and its reversal), the shorts pipeline, a strategy document, an exit
  document, a phased plan, and a provisional patent draft.
- **Reviews**: each revision went through an adversarial multi-agent review; the last one confirmed
  thirty defects in the pipeline's first cut, all fixed the same day.

## 5. What is proven, and what is not

**Proven by the driver and the probe** (synthetic touch in headless Chromium at 390 × 844): brushing an
edge mid-scrub never moves the world; release stops it within a frame; back-scrubbing meets the same
dots; parking between dots never flickers; labels never show during a skim; a parked lift opens the
card's item and never a neighbour; from the hub a push east takes the radius to the rim and the label
from "casual" to "in football"; steer events accrue to the kinds ahead; exactly one boundary tick per
decisive region crossing and none across blended hub cells; one rim thud per contact with a logged,
clamped wish; world switching keeps bearing and depth and is ignored under a held thumb; the fixture
world loads, every placed cell's region matches its item's, and opening a fixture dot shows the
fixture wording and no player; zero console errors.

**First external signal.** Three people close to the founder have tried the web version, without
haptics. Their reactions, as reported, each land on a different claim: one friend, asked what he
thought, read it as *"scanning a large amount of info, like a research project"* (the bandwidth claim,
and an unprompted research framing rather than an entertainment one); a second was fully impressed,
said he *"can't believe it's not a thing,"* called the algorithm controller an amazing idea, and used
it on a computer with a mouse (the control-loop claim survives without touch or haptics); the
founder's brother, not technical, really enjoyed it (the learnability claim). This is real and it is
the softest category of evidence, because people who know you tend to be kind. It counts as a pilot
that passed, not as a gate: the plan's stranger test is written for people "who don't love you enough
to lie." Still to extract from the three: whether the brother taught himself the scrub and the ring
unaided, and whether any of them opened it again on a later day.

**Not proven, and these are the three that matter:**

1. **Whether the tick lands on the crossing on a real iPhone.** Only the native wrap can answer this,
   and it has not been run on a device.
2. **Whether a stranger self-teaches it** in thirty seconds and can say what "push away from the
   middle" does.
3. **Whether anyone comes back the next day.** Nothing in a demo can show this.

Also unproven: the intensity classifier (agreement with human raters), the nebula ramp's visibility
(measured at about one just-noticeable difference), any colour-vision-deficiency claim (the hue
spacing fails a simulated ΔE gate; the region name and the boundary tick are the carriers), and the
YouTube API terms for a commercial browse layer.

## 6. Prior art and the patent position

Two sweeps were made, with agents instructed to kill the idea. Known and cited:

- **Haptic ticks on crossing items during continuous input**: Google US 10,365,719 appears alive to
  about 2037 and requires a symbol queue with an expanded item display; a professional claim chart is
  needed before any commercial ship of the detent mechanic. Apple US 10,175,759 (index scrubber with
  rate-limited tactile output), Apple US 9,678,571 (omit a tactile output when too recent), Immersion
  US 7,148,875 and US 8,188,981 (expired; pulses across icons and menu borders), Poupyrev & Maruyama
  UIST 2003, Pielot et al. PocketMenu 2012.
- **Hold-to-reveal and proxy fields**: Kurtenbach US 5,689,667 (expired) marking menus; ThumbSpace
  2007 and the radar/bubble-radar/vacuum line of reach techniques; KDDI US 9,244,544 (reduced image as
  an in-screen touchpad with vibration); Amazon US 9,389,718 and US 10,353,570 (thumb-reachable input
  areas); Android 9 Quick Scrub; the iOS 14 page-indicator scrub; Apple US 8,689,128.
- **Two-dimensional semantic maps of media**: Gracenote US 8,855,798 (energy × valence grid with
  path selection), Sony US 7,858,868 (hue by mood angle), Monkeymedia US 6,281,899 (steering a focal
  point across a topic space), Musicovery 2006, Moodstream 2008, Every Noise at Once 2013, B&O
  MoodWheel 2015. **The map itself is never claimed.**
- **Kinematics to preference**: US 10,891,049; Guo et al. SIGIR 2013.

What is claimed in the draft, as scaffolding for a non-provisional: a method of acquiring preference
signals by presenting items as targets at positions fixed for at least the selection gesture,
assigning selection to the nearest target under a hysteresis criterion, emitting a synchronous discrete
feedback event per selection change, classifying each selection interval by dwell and kinematics into
weighted preference events, and supplying them to a ranking model. Dependents: steer-away as an
explicit negative on the abandoned neighbourhood; event rates above five per second including
rejections without consumption; materialisation of unvisited regions from accumulated preference
while visited regions stay immutable; commit on release with velocity lookahead; the dwell-weighted
trail; the intent-gated conveyor and ring; the proxy field; and positions determined from per-item
scores on named coordinates (two axes, or a bearing and a radius) with heading events attributed as
signed preference on them. **Not filed.** The US allows a 12-month grace period after public
disclosure; Europe allows none. Demonstrations so far: the founder, plus three people known to him,
privately, on the web version; nothing posted. A demonstration to people without a duty of
confidence can count as disclosure in Europe, so the dates should be logged, the three asked to keep
it private, and the filing made promptly.

## 7. Content and economics

**Where real short-form content can legally come from.** One door: YouTube Shorts through the Data
API with YouTube's official embedded player. Smaller doors: Twitch clips, Bluesky video over the open
AT Protocol, the founder's own fifty-account content network. Closed: TikTok and Instagram expose no
discovery API and scraping breaks their terms. So "a remote for the internet" is a metaphor; the
product is a remote for worlds you build over catalogues you are allowed to index.

**Quota and scale** (UNVERIFIED figures, quoted from memory of the API's quota table): 10,000 units a
day free; a search costs about 100 units and returns up to fifty ids; listing a channel's uploads
costs about one unit per fifty videos. Today's spec runs 25 searches for a few hundred shorts. The
plan for "more": channel-based fetching (thousands of candidates a day within the same quota), a
rolling seven-day window (the placement core already supports it), over-subscription (more items than
cells, with an unvisited cell filled from its region's pool by affinity), and a wheel sized to the
pool. Endless is deliberately not the goal; a world you cannot finish in a session but can finish in a
week is.

**Cost per user is near zero** because the world is built once a day and is identical for everyone.
The API quota, the placement and any classifier are spent per world per day, not per user. Video plays
in YouTube's player on YouTube's bandwidth; thumbnails come from their host; the steering runs on the
phone. Your side serves one JSON edition per world per day plus a static app. ESTIMATES: a classifier
at roughly $0.50 a day per world on a batch model when it exists; static hosting on a free tier to
about $10 a month at 10k daily users; a $99 a year developer account. The only path where per-user
cost becomes real is hosting your own video, which is why the design stays on the embed model.

**Risks on this side.** Platform dependency (Apollo for Reddit died in 2023 when Reddit priced its
API; YouTube has shut third-party clients before). The API terms for a commercial browse layer are a
counsel question. No ads of your own can run over their player, so revenue is a paid app, a research
tool, or an acquisition.

## 8. Business framing

**Two claims, different odds.** "The new scrolling" is a claim about a gesture, and it is live: the
drift is a primitive, like infinite scroll, pull to refresh or the swipe, each invented once in one
app and spread because it was better in the thumb. "The new social media" is a claim about a network
(content, graph, creators, moderation, capital), and it is the least likely path; the strategy
document ruled building the network first the wrong first move and the right second act.

**How primitives pay.** Rarely to the inventor of the gesture (infinite scroll's inventor made
nothing). Usually through owning something when a platform wants it: a product with users, a patent,
or both (pull to refresh was acquired with the app it shipped in). Hence three assets in order:
priority (the filing), evidence of use (retention numbers, even small), and clean ownership (one
entity holds the IP and the app; the founder's content business stays separate).

**Standing rules** (never suspended): never sell dot positions; the walked world never rewrites; the
register axis is a coordinate, never a verdict printed on a creator's post; no corp-dev meeting before
the filing and a public chart that is moving; never enter a vertical the founder does not use daily;
worlds are versioned editions and coordinate changes are announced, never silent; no wellbeing claims
in marketing, sell the full stop, never the virtue.

**The plan's gates.** Gate A (end of week 2): the feel survives the native wrap; if the tick trails
the crossing, one decision, a short native spike of the scrub loop or stop. Gate B (weeks 2–4): hand
the phone to three to five strangers with only "try this"; at least one comes back unprompted on day
two, or the project becomes a write-up and a patent.

**Honest odds.** Most likely outcome: small or nothing. That is true of every new product and the
founder asked not to be hyped. What is different here: the invention is real (see §6), the per-user
cost is near zero, the test is cheap, and the downside is a patent and an unusually good demo of a
new interaction.

## 9. Known weaknesses and open questions

- The wheel trades away the second semantic axis; serious/goofy is now a tag.
- Near the hub two to four inner regions blend; whether "mainstream" reads as a place or as noise is
  untested. A hand-drawn hub tiling may be needed.
- Eight kinds per world is a hard budget; sports already merges kinds.
- A real 300-item day fills about a fifth of the staged wheel's cells; the deep end is honestly sparse.
  Fix by channel fetching, a rolling window and over-subscription, or by shrinking the wheel.
- Per-world session state does not yet survive a round trip between worlds.
- The steering accumulator shares a half-life with dwell; two events can pin the glow.
- The classifier does not exist; depth today is editorial plus a keyword rubric.
- Frequency: browsing shorts is many times a day, movies a few times a week; the retention gate must
  be worded for the world that ships.
- Colour-vision deficiency: no claim is made; name and tick are the carriers.
- The finite-versus-infinite tension: speed and size must match, and the founder's instinct that a
  few hundred items is too few is correct.

## 10. What we would like from a second reviewer

1. Try to refute the novelty in §3 and §6. In particular: any shipped or patented system that
   combines hysteresis-governed nearest-target selection over a lattice with a synchronous haptic per
   crossing and per-interval kinematic preference classification feeding a recommender; and any polar
   browse control where a rate controller steers over kinds by bearing and intensity by radius.
2. Critique the retention thesis. Is "a finite world with an end" a feature people return to, or a
   demo virtue that dies on day two?
3. Critique the business path: primitive first, client second, network third. Where does it break?
4. Check the numbers marked UNVERIFIED: the YouTube quota table, the three-minute Shorts limit, the
   API terms for third-party browse layers.
5. Say what you would test first with five strangers and one iPhone, and what result would make you
   stop.
