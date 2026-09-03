# Real content — the shorts world

*2026-09-02. The first world in the drift built from content that exists: YouTube Shorts, fetched by a
drop script intended to run daily (no scheduler yet — §7), placed on the wheel by a pure placement core, frozen as one edition JSON, and loaded
by the prototype as a fifth-and-a-half world. Everything below is either SOURCED (a measurement of the
code or a documented API fact), ESTIMATE (a design guess), or UNVERIFIED (a legal reading no counsel
has checked).*

> **PRIVATE.** Same rule as rev. 4 and 5: no artifact, no clip, no post until the provisional is filed.

## 0. What this is, in one paragraph

You do not control YouTube's algorithm. You control **this app's**: which few hundred shorts make up
today's world, where each one sits on the wheel, and — by steering — what glows. Nothing you do fills
or empties a cell: today's cells are frozen in the edition. The content is real, the player on open is YouTube's own, and the footer of the drift
names the source, the date, the item count and the layout hash of the edition you are looking at.
Without an API key the pipeline writes a **fixture** drop with synthetic ids that says it is one and
never opens a player. That is the honesty contract, and the verify suites enforce it.

## 1. The one door, and the closed ones

| source | discovery | playback | status |
|---|---|---|---|
| **YouTube Shorts** | Data API v3: search and video details; free daily quota (figures UNVERIFIED — quoted from memory of the published quota table; paste the link before relying on them) | the official embedded player | **built** |
| Twitch clips | Helix API | official embed | possible, not built |
| Bluesky video | AT Protocol firehose, fully open | direct | possible, small |
| your own 50-account engine | your pipeline | yours | the honest seed for a creators world |
| TikTok, Instagram Reels | none — embeds of URLs you already know only; scraping breaks terms | — | **closed** |

## 2. How the pipeline runs

```
YOUTUBE_API_KEY=… npx tsx scripts/shorts-drop.ts --date 2026-09-02          # a real drop
npx tsx scripts/shorts-drop.ts --fixture                                     # no key, no network
```

Per region in the spec, each search query runs `search.list` (type video, duration short, embeddable
only, ordered by view count, published in the seven days before the drop date and never after it,
moderate safe search, an English relevance bias via `relevanceLanguage=en`), then one `videos.list`
per fifty ids fetches snippet, duration, statistics and embeddability. The sports spec runs 25
searches — the script prints the count — at the published cost of about 100 units each ≈ 2,500 units
plus a handful of lookups, roughly a quarter of the free day (UNVERIFIED: the quota table is quoted
from memory; either way the binding figure is about a hundred searches a day). Output is
`prototypes/worlds/shorts.json` plus a `worlds/index.json` manifest the drift reads at boot; the
wrap's sync copies the folder into `scout/www/worlds/`. The script validates `--date` and `--per`,
writes atomically, refuses to write an empty edition, refuses to overwrite a real edition with a
fixture unless `--force`, and prints per-region counts, the unplaced list, the layout hash, and the
searches and units spent.

**Short-form is a heuristic** (ESTIMATE). The API has no "is a Short" field. An item counts when its
duration parses, is at most 180 s (SOURCED: YouTube's October 2024 announcement that Shorts may run to
three minutes — confirm the current limit before shipping), and is
either at most 60 s or carries a `#shorts` marker in its title or description. Non-embeddable videos
are dropped before anything else.

## 3. The spec — sports shorts, edition 0

The code (`SPORTS_SHORTS` in `src/lib/shortsWorld.ts`) is the source; this table describes it. Eight
sectors on the wheel, two regions in most, each fed by one or two queries. Depth words: *casual →
extreme*. All radii ESTIMATE, argued by nobody yet; the same-sector radial gap is ≥ 0.3 by assertion.

| sector (bearing) | regions (radius) | register tag |
|---|---|---|
| ball (0°) | soccer (0.30) · nfl (0.60) | nfl: serious |
| court (45°) | basketball (0.30) · dunks (0.60) | |
| combat (90°) | boxing (0.50) · mma (0.85) | mma: serious |
| motor (135°) | rally (0.45) · moto (0.75) | |
| air & mountain (180°) | ski & snow (0.55) · base & wingsuit (0.95) | base & wingsuit: serious |
| wheels (225°) | skate (0.45) · bmx & parkour (0.75) | |
| mind & pub (270°) | darts & pool (0.25) · chess (0.60) | darts & pool: goofy · chess: serious |
| club & field (315°) | golf (0.20) · cricket (0.50) | |

**Rubric v0 is a keyword list, and is named as one.** An item's radius is its region's radius ± 0.025
per whole-word hit on a "deeper" or "shallower" keyword, clamped to ± 0.10 (ESTIMATE), so it never leaves its
region's territory. This is a placeholder for the classifier in `docs/dot-field-map.md` §8 (must-prove
2 and 3: scorer agreement and sector accuracy against the founder's labels) — do not read the rubric
as a judgement of intensity. `RUBRIC_VERSION` is printed into every edition and into the footer, so a
change of rubric is visibly an edition change.

## 4. Placement — stable by construction, and by persistence when you say so

`src/lib/worldPlacement.ts` puts every item into exactly one cell. Items are visited in the order of a
hash of their id, so input order is irrelevant. Each starts at its target cell — its region's bearing
scattered ± 14° by the same hash, at its radius — and spirals outward to the nearest free cell that is
inside the rim and **whose argmax region is the item's own**, so the label never says "in chess" over
golf dots. The spiral is capped at 14 cells; an item that finds nothing is reported, never silently
dropped. The layout hash is FNV-1a over the sorted `c,r,id` triples. Bad input is an error, never a
silent drop: an unknown region, a non-finite radius or sector, a duplicate item id or a duplicate
region key all throw, and two items claiming one persisted cell are resolved in hash order, not input
order.

Two claims, kept apart (critic's finding, `dot-field-map.md` §5):

- **By construction:** the same items, regions and geometry give byte-identical cells. Within a day
  nothing moves.
- **By persistence:** given the previous layout, previously placed items keep their cells and new
  items take only free cells. A top-up without persistence may move items — the suite measures how
  many (32 of 150 in the synthetic case) and says so.

`verify:worldplacement` asserts determinism, order independence, one item per cell inside the rim under
its own region, persistence across a top-up, that a moved item changes the hash, that unknown regions
throw, and that the prototype's staged geometry (spread, weight floor, rim, region placement) uses the
same formulas as the core. `verify:shortsworld` asserts the short filter, the rubric bounds, the spec's
shape, and that a fixture edition is deterministic, fully placed, obviously synthetic and carries no
player id, while a YouTube edition carries one per item and drops the long, the non-embeddable and the
duplicate.

## 5. What the prototype does with an edition

- At boot (when served over http or bundled in the wrap; `file://` cannot fetch a sibling) it reads
  `worlds/index.json`, loads every edition listed, installs each as a world, and the chip strip and
  W-cycle gain them. A file named like a staged world is refused with a console warning.
- Its cells are **placed, not sampled**: a cell is the item the pipeline put there or it is empty.
  The boundary tick and label work unchanged on the region table.
- **The preview is instant.** Thumbnails are prefetched around the reticle as the field draws (nearest
  first, six in flight; the selection jumps the queue), so the card paints the real thumbnail on the
  frame the selection changes, with the channel name and *on YouTube* (never an invented handle) and
  *short · m:ss*. After 650 ms still on a real short (ESTIMATE) a **muted preview plays inside the
  card** through YouTube's own player, one instance reused across selections; it stops the moment the
  selection moves, never plays under reduced motion, never while the post is open, and never in a host
  that blocks players. An edition may carry thumbnails inline (`thumbData`); the private artifact does,
  because its host blocks image and frame hosts, which is why it links out to YouTube instead of
  embedding.
  Opening a dot with a player id shows **YouTube's own player** (privacy-enhanced embed, inline
  playback) in the post view, keeps keyboard focus inside the dialog, and stops the player on close; a
  fixture item shows the staged art and the words *fixture — no player*.
- The footer today reads `shorts · fixture · 2026-09-02 · 80 shorts · <hash>`; a real drop would read,
  e.g., `shorts · YouTube · <date> · <n> shorts · <hash>`.
- The odometer for a real world is the share of today's *placed* items that has passed under you.

Observed with a synthetic-touch driver kept outside the repo (a session tool, not a checked-in
suite, served over a local http server): the fixture world loads and joins the strip; every populated
cell's region matches its item's; opening a dot shows the fixture wording and no player; closing
clears the player; the W-cycle includes `shorts`; every earlier check (rev. 2–5) still passes.

## 6. Terms and risks — read before any public ship

- **YouTube API Services Terms** (UNVERIFIED reading): use the official player, never download or
  cache media, show the channel, do not overlay or block the player, respect quota. Whether a
  third-party *browse layer over Shorts* is acceptable for a commercial app is a counsel question;
  the terms restrict services that substitute for YouTube itself. Budget the review.
- **No ads of your own** can run over their player. This is a paid app, a research tool, or an
  acquisition story — all legitimate, none of them "ad-supported feed."
- **One company can turn the door off.** A world built on their API is a world they can close. Keep
  the placement core and the drift independent of the source, which they are.
- **Autoplay with sound** needs a user gesture on iOS; opening a dot is one. Verify on the wrap.
- **Moderation.** `safeSearch=moderate` is the only filter today. A world for strangers needs a block
  list per region and a report path before Gate B.

## 7. Not done, said plainly

- **The first real drops ran on 2026-09-03** with `--per 40`. The first pass placed 618 of 629 and
  left 11 unplaced in soccer and golf, whose inner territory holds fewer than 40 cells; that exposed
  the rule now in the code: a region's cap is the smaller of the requested cap and 85 % of its own
  land (`territorySizes`, ESTIMATE share). Two queries also pulled the wrong sport ("rally" returned
  volleyball rallies; "bmx" returned a child on a bicycle) and were sharpened. The second pass: 26
  searches, 948 videos fetched, 946 short-form, 602 placed, 0 unplaced, layout `e4bf9bd4`, about
  2,619 units by the script's own count (the API does not report usage, so unit costs stay
  UNVERIFIED; both runs fit inside one free day). Language bleed remains: the English relevance
  bias is soft and Portuguese, Korean and Uzbek shorts appear; query curation is the weekly editorial
  task the plan names. The edition is committed as `prototypes/worlds/shorts.json`.
- **No scheduler.** The script is meant to run once a day; nothing runs it yet.
- **A review pass** (four reviewers, two verifiers per finding) confirmed thirty defects in the first
  cut, all fixed in the same day: input validation and duplicate handling in the placer, quota and
  date handling in the script, and honesty of labels and copy in the drift and this document.
- **No classifier.** Rubric v0 is a keyword list; the scorer and its agreement gate are must-prove 2.
- **One world.** The creators world can use the same pipeline with your own engine as the source.
- **No per-user persistence** of walked cells across editions; no intra-day top-ups (the core supports
  them; the script does not yet pass the previous layout).
- **The player is untested on a phone.** Embeds in the Capacitor wrap need one morning's check.
