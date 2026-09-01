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
npm run sync:web        # regenerates www/ from prototypes/the-drift.html
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

## What this is not (yet)

No daily niche assembly, no trail permalinks, no accounts, no App Store. Those get built only
after the feel test passes — in that order, per the strategy doc's kill gates.
