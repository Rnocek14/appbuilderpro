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
