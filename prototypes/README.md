# The Prototypes — the defining moments, built to be felt

*Not the product; the moments that decide whether the product is worth building. Each is one
self-contained HTML file — open it in a browser, no server, no keys, no setup. Staged data, real
timing, real interaction.*

## Wave 1 — Phase 5, the five defining moments

Each exists to settle specific wounds from `docs/reality-check/` and to validate specific
amendments (D1–D8) from the verdict.

| # | File | The moment | Settles | Inevitable when |
|---|---|---|---|---|
| P1 | `minute-zero.html` | New account → real result in under 3 minutes, ceremony deferred | W1 · D1 | A stranger gets a live result first session and describes a maker, not a chatbot |
| P2 | `explore-make-real.html` | Curiosity with a live map → one unasked connection → "make this real" grows the world around the map | W7 · D2 | The volunteered thought lands as magic; promotion reads as growth, not migration |
| P3 | `workshop-hands.html` | The apparel bench with hands: drag, scrub, keep/kill/undo, AI appending alongside | W3 · D5 | Ten minutes of work without typing a sentence; "vending machine" flips to "instrument" |
| P4 | `morning-brief.html` | Ten clients, 7am: calm Brief, evidence on hover, slate approval that still catches the planted bad send | W2 · W4 · D3 · D4 · D8 | The morning takes five minutes and the bad send gets caught |
| P5 | `client-birth.html` | Close-won → a complete client world in 60 seconds, zero questions; ceremony arrives at first outbound | W1 · D1 · D6 | "I signed another client" → inhabitable world with everything already connected |

## Wave 2 — moments the system already *has* but never let you *feel*

Wave 1 prototyped the moments that decide whether to build. These four prototype the parts already
built and shipped, whose behaviour nobody has ever seen. Each rides on real substrate, and each
makes one falsifiable claim that `scripts/claims-walkthrough.mjs` tries to catch lying.

| # | File | The moment | Rides on | The claim it must keep |
|---|---|---|---|---|
| P6 | `the-ledger.html` | "What did this client actually cost me?" — every figure opens into the rows that produced it | `usage_events.world_id` (app_0114) | An independent sum of the rows on screen equals the headline — and the unmetered window is named, not zeroed |
| P7 | `the-breaker.html` | An automation fails, keeps failing, and pauses *itself* at five | `automation_triggers.consecutive_failures` (app_0113) + the standing-worker break | It stops at exactly five, refuses to fire while paused, and the saving it quotes is real arithmetic |
| P8 | `the-handoff.html` | A client leaves and nothing is destroyed — stop, retain-with-a-reason, or carry unresolved | `offboarding_inventories` + `retained_services` (app_0119) | Delete is offered nowhere; a retention without a reason blocks the inventory; every item is accounted for |
| P9 | `the-return.html` | Nine days away, four of which the clock was not running | the heartbeat + pg_cron/pg_net seam named in `scripts/shadow-db/LIMITATIONS.md` | An unobserved day renders as *unknown*, never as zero — and no row or timestamp is ever fabricated inside the gap |

## Wave 3 — the rest of the client operating chain

The vertical slice shipped `fleetView.ts`, `changeRequests.ts` and `clientReport.ts` with verify
suites and a route — and no way to see what any of it feels like. These are that.

| # | File | The moment | Rides on | The claim it must keep |
|---|---|---|---|---|
| P10 | `the-fleet.html` | Ten clients, and a screen that mostly stays empty | `fleetView.ts` + `/garvis/fleet` (real thresholds: breaker at 5, requests aging at 10 days, cost outlier at 3× / $5) | No well-served client appears anywhere on it — and signing an eleventh adds no row |
| P11 | `the-request.html` | A client's email becomes an object whose shape refuses to bend | `change_requests` (app_0117) — same 11 states, same append-only history | You cannot skip a step; a *deployed* change can never be declined; refusals are recorded too |
| P12 | `the-report.html` | The month compiled, with its holes left in | `clientReport.ts` | An absent source becomes a named unknown, an empty one a measured zero, and one observation refuses to become a percentage |

## Concept probes — paradigms, not product claims

Waves 1–3 prototype *this product's* moments. A concept probe tests an interaction
paradigm on staged content, before any product commitment. Same contract (`DESIGN.md`),
same harnesses; what it must prove is a feel, not a schema.

| # | File | The question | Grounded in | Inevitable when |
|---|---|---|---|---|
| P13 | `the-field.html` | Can navigation be *felt*? A day's feed as a bounded dot field: scrub with hysteresis, one detent per crossing, preview above the hand, lift to open, fade on read | `docs/dot-field-navigation.md` (the six-lens interrogation and the feel spec it implements) | A thumb parked between two dots never flickers; a half-second edge-to-edge scrub is an even ratchet; after a minute you reach for a dot you *remember* |
| P14 | `the-drift.html` | Can you *steer* an algorithm with your thumb? The field becomes a bounded territory: push into an edge with intent and the world flows under the thumb; dwell tilts what unseen ground materializes ahead; the walked world never rewrites; the journey is an object. Rev. 3: the ring of dots nearest the selection blooms into readable labels while the thumb is slow, and each kind has its own detent | `docs/dot-field-drift.md` (the four-lens referee spec it implements; §8 for rev. 3) | A fast skim through the edge band never moves the world; release stops it dead in a beat; back-scrubbing meets the exact same dots; the "drifting toward" label names what you actually wanted; you read three neighbours while feeling one, and a skim never shows a label |
| P15 | `the-seed.html` | Can an *ordinary* page be felt? A catalog scrolls as it always has; hold one persistent dot and a thumb-scale proxy grid blooms under the finger — one dot per garment on screen, same arrangement; one detent per dot; the page itself lights the piece you are on; push past the edge row and the page turns a row per tick; lift to open; drag off to let go | `docs/dot-field-seed.md` (the five-lens interrogation, the referee spec, what is and isn't prior art) | A tap teaches the hold in one try; a screenful is judged without the thumb travelling more than a coin's width; parking between two dots never flickers; a fling opens nothing; someone reaches for the dot on a page that doesn't have one |

## Testing them

Two harnesses, deliberately separate, because they answer different questions:

```
npm run probe:prototypes        # generic: is this page broken?
npm run walkthrough:prototypes  # wave 1: does each keep its specific promise?
npm run walkthrough:claims      # waves 2+3: same, for the seven above
```

`scripts/probe.mjs` knows nothing about any particular page — it discovers the controls and
exercises them, which is why it can be pointed at something that does not exist yet. It proves
"not broken". **That is not the same claim as "good"**, and it says so when it runs.

The claim suites are the other half: they know what each page asserts and try to falsify it. P6's
is the sharpest — it does not read the page's own verdict, it scrapes every row value out of the
DOM and sums them in Node, so a page that printed a stored total would be caught.

**A finding worth keeping in mind:** the first run of the generic prober reported six problems
across wave 1. Five were the *prober's* fault — it called a live stopwatch "never settled", called
an already-selected tab "dead", and reported overflow that only existed because it resized a
desktop layout instead of loading fresh at phone width. One was real (a 5px overflow in
`minute-zero`, since fixed). A tester with a 5-in-6 false-positive rate is worse than no tester;
the control group is what exposed it.

**How to review:** each prototype has a "?" in its corner HUD listing what to feel for. Don't
evaluate visual polish first — evaluate the *feeling*: Would you believe it? Would you show
someone? Where did it drag?

Shared visual language: `DESIGN.md` (binding on all of them).
