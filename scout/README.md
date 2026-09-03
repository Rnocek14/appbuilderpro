# Scout v0 — the drift's native feel test

*One question, two weeks: does the drift's detent survive the wrap? This folder wraps
`prototypes/the-drift.html` in Capacitor so it runs as a real iOS app with real Taptic
detents — the thing no web page on an iPhone can do. No backend, no accounts, staged world.
If the feel lands, the daily-niche pipeline gets built behind it (`docs/dot-field-strategy.md`).
If it doesn't, this was the cheapest possible kill.*

## What you need

- A Mac with **Xcode 16+** (App Store). No paid developer account needed for on-device dev
  builds — a free Apple ID signs builds that run for 7 days (re-run from Xcode to refresh).
- **Node 18+** on the Mac.
- Your iPhone + cable (or same-network wireless debugging after first cabled run).

## Build it (first time, ~10 minutes)

```bash
cd scout
npm install
npm run sync:web        # regenerates www/ from prototypes/the-drift.html (+ the-seed.html as seed.html)
npx cap add ios         # generates the ios/ Xcode project (first time only)
npx cap sync ios
npx cap open ios        # opens Xcode
```

In Xcode: select the **App** target → Signing & Capabilities → set your Team (your Apple ID) →
plug in the iPhone, pick it as the run destination → **Run**. Trust the developer profile on
the phone if iOS asks (Settings → General → VPN & Device Management).

After any change to the prototype: `npm run ios` (sync + open) and Run again.

## How the haptics work

The engine in `prototypes/the-drift.html` already carries the native bridge — inert on the
web, live in the wrap:

- **Detent per crossing** → `Haptics.selectionChanged()` — this drives
  `UISelectionFeedbackGenerator`, the exact engine behind the iOS picker wheel's ticks.
  Prepared by `selectionStart()` on touch-down, released by `selectionEnd()` on lift.
- **Open** → `impact(MEDIUM)`, a rounder thunk.
- The "?" card's **test tap** should now say `native Taptic ✓`.
- The audio ratchet stays on as reinforcement; toggle with ♪.
- **What the plugin actually does** (@capacitor/haptics 8.0.2 iOS source, read from the npm
  tarball 2026-09-02): `selectionStart()` creates *and prepares* the selection generator;
  `selectionChanged()` is a **no-op unless `selectionStart()` ran**, and re-prepares after
  each tick; `impact()` allocates a fresh, *unprepared* impact generator per call. A prepared
  generator goes cold after a few seconds, so both pages re-call `selectionStart()` every
  1.5 s while the thumb is parked. Feel test #7: park for five seconds, then cross one dot —
  does that first tick land on time? If not, the Core Haptics plugin in `ios-extras/` (which
  can `prepare()` explicitly) is the next step.

If the fixed selection tick feels too soft or too uniform after real use, `ios-extras/`
carries an optional Core Haptics plugin (`DetentHaptics.swift` + `.m`) with per-tick
intensity/sharpness — install instructions are in the Swift file's header. Don't reach for it
before the stock tick has had a fair two weeks.

## The feel test (the actual point)

Walk it every morning for two weeks, then answer honestly:

1. Park a thumb between two dots — still zero flicker, zero buzz?
2. Half-second edge-to-edge scrub — an even ratchet *in the thumb now*, not just the ears?
3. The drift ring: does traveling feel like wading a current, and does release stop the world
   dead in one beat?
4. Latency: does the tap land *on* the crossing, or trail it? (WKWebView adds a little input
   latency over Safari; on a ProMotion phone the page runs at 120Hz and it should be
   imperceptible. If ticks read late, that's the one finding that forces a native-Swift spike
   of the scrub loop — a finding worth having in week one, not month six.)
5. After two weeks: do you still open it? That answer, not the demo, decides the pipeline.
8. **Neighbour bloom (rev. 3):** stop on a dot — do the labels around it *read* at arm's length,
   and do they get out of the way the instant you skim? If they ever show during a skim, lower
   `BLOOM.HIDE_ABOVE`.
9. **Haptic texture (rev. 3):** with eyes closed, cross ten dots — can you call reels before you
   look? With the stock tick only reels differ; install `ios-extras/DetentHaptics` for photo /
   reel / carousel as click / thud / double-tap. If a texture reads as a *different* event rather
   than a different *kind*, flatten it toward the photo profile.

10. **The wheel (rev. 5):** hand the phone over cold. After three minutes ask "what happens if
    you push away from the middle? sideways? toward HOME?" — 4 of 5 should say *more extreme /
    deeper*, *a different kind* and *back toward the middle / milder* unprompted. If they can't,
    the two ring words become permanent chrome; a tutorial is not an option. (In the creators
    world deeper means *newer*, in movies *deep cut* — test the world that ships.) And: does
    anyone expect the depth to snap back when they let go of the ring? Does the blended middle
    read as "everything" or as "nothing"?
11. **The nebula at 30% brightness:** can an uncoached person name the region under their thumb
    from the land alone within two seconds? Then again with a deuteranopia filter on — the name
    and the boundary tick must carry it, the colour is a convenience.
12. **Hotter or brighter:** sliding east, does the land get "hotter" (keep the nebula ramp) or
    "brighter / newer" (drop it — the ramp is ≈ one JND and brightness is winning)?

## Real worlds in the wrap

`npm run sync:web` also copies every edition under `prototypes/worlds/` into `www/worlds/`, so a
world the pipeline wrote (`docs/dot-field-shorts.md`) appears in the drift's chip strip offline. A
fixture edition shows staged art and says *fixture — no player*; a real one opens YouTube's player
inline. Two things to check the first morning: does autoplay with sound start on the tap, and does
closing the post stop it dead?

## The second page: the seed (P15)

The build also carries `www/seed.html`, derived from `prototypes/the-seed.html` — an
ordinary catalog with one dot you hold; a 2-column proxy grid blooms under the thumb at 32px
pitch (the drift's is 44px). The HUD links the two pages. Same bridge, one extra question:

6. At 32px pitch, does the detent still land *on* the crossing, and does a resting thumb stay
   silent for 20 seconds? If either fails, retune `HYST`/`PARK_*` first, then raise the
   pitch to 36px — before any other work. Do this the morning *after* the drift's test, and
   keep the seed out of the stranger sessions (Gate B measures a world, not a widget). The
   pre-registered micro-study for the seed is in `docs/dot-field-seed.md` §5.

## What this is not (yet)

No daily niche assembly, no trail permalinks, no accounts, no App Store. Those get built only
after the feel test passes — in that order, per the strategy doc's kill gates.
