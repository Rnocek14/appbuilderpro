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

## Testing them

Two harnesses, deliberately separate, because they answer different questions:

```
npm run probe:prototypes        # generic: is this page broken?
npm run walkthrough:prototypes  # wave 1: does each keep its specific promise?
npm run walkthrough:claims      # wave 2: same, for the four above
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
