# Dot field: what it becomes — the strategy ruling

*Third and final interrogation round (after `dot-field-navigation.md` and `dot-field-drift.md`).
The operator's question, verbatim: "what do you think it should become if we continue — should it
be searching the internet with AI algorithm? Should it be social media, what would hit big for
people?" Four strategists (hit-pattern analysis, the AI-search design, the social path, the
cold-blooded read) plus a referee who was required to force one answer. The operator is on an
iPhone, which settles the platform question: the feel is native-app territory.*

---

## 1. The spine — where every analysis agreed

1. **iPhone-native first.** The detent under the thumb is the entire bet; Safari cannot deliver
   it. Everything web-based is a demo, not the product.
2. **The 50-account content engine is the rarest asset on the table.** Consumer installs cost
   $3–8 through paid channels; the operator can generate them at marginal cost, and the luminous
   canvas is natively short-form content — the app is its own ad unit. ByteDance can copy the
   gesture in a weekend; it cannot copy the distribution engine. (Precedent: Cal AI — an
   ordinary app taken to eight figures almost entirely through short-form creator clips.)
3. **The trail is the real object.** A designed, shareable, compounding artifact — a daily
   Wrapped / Strava map / consumption ledger — not a tab. Nobody captures value from a gesture
   (Loren Brichter invented pull-to-refresh and captured none of it); value pools in artifacts
   and networks.
4. A general consumer feed bet on day one is how this dies.

## 2. The three futures, ruled

**"Search the internet with AI" — not as search; shelved as the year-two expansion.** The
version that survives design scrutiny is not question-answering but *decompressing a taste
intent into a territory*: "cottagecore kitchens" → an assembled, walkable world of ~150 real
web items. A router must refuse answer-shaped queries (every visual-search product that died —
Kartoo, Wonder Wheel, Globe Explorer — died by visualizing queries that wanted answers). The
real competitor is not Google or Perplexity but **Pinterest** — $35B of proof that vibe-queries
are a habit, currently ads-choked and static, and structurally unable to assemble worlds
on demand. "Every taste query returns a world" is a genuine flank in the AI-search wars — the
browsing demand the answer engines are actively orphaning. But live per-query assembly costs
$0.05–0.15/world, requires the projection-stability problem solved at the operator's expense,
and enters the most capital-saturated war in software. Wrong first move; right second act.

**Social — the prize, not the wedge.** The Pinterest loophole is real and has three legs:
supply from the open web (AI assembly gives this for free), a curation artifact that is useful
before anyone follows you (the trail), and — the forgotten leg — **SEO distribution**: trails
must render as public, crawlable web pages, not canvas-only permalinks. The social object that
does not exist anywhere else: a published trail carrying its dwell-weights — someone's walk you
can re-scrub, their pauses felt as heavier detents; consumption made legible enough to publish.
The 2020 social graveyard (BeReal, Clubhouse, Dispo, Poparazzi) died of one pattern: novelty
spike → no compounding artifact → supply or attention starves → incumbent clones the gimmick.
Trails compound and AI supply never gets tired — but the attention cold-start applies in full.
Odds priced honestly: consumer social bet day one ≈ 3–5%; social *emerging* from a
single-player-useful tool (the Pinterest/Strava/Letterboxd sequence) ≈ 20–25% to a real
compounding product. Social scale is a conversation had from retention data, not a solo build.

**The tool — the wedge, because for this operator it collapses all three options into one.**
The operator's own daily job (trend-scouting across niches for the content engine) is exactly
the paradigm's honest home: bounded, heterogeneous, sub-400ms scent, finishable.

## 3. What would actually hit big — the three missing ingredients

From the hit-pattern audit (Tinder, Wordle, Snapchat, TikTok, Flappy Bird, Monument Valley,
Pinterest, BeReal):

1. **A shared daily object.** The single highest-leverage change available: one communal,
   AI-curated, bounded world per niche per day — *identical for everyone who opens it*, dropped
   at the same time. Wordle's engine was never the puzzle; it was the shared referent ("did you
   find the breakout sound in the corner?"). A private field is a tool; a shared field is a
   culture. Zero-login first session: thumb on glass within 5 seconds of first launch.
2. **A designed shareable artifact.** The trail card, auto-generated at field completion:
   named nebulas walked, dwell stops, finish time, streak. A daily Wrapped built for
   screenshot, plus the public trail page for links.
3. **A transmissible outcome.** Haptics don't transmit through video; *closure does*. The
   demo clip that sells is a doneness meter draining to zero and "FINISHED · 11 min · day 47,"
   with the detent audio as the haptic surrogate. Sell the full stop, not the anti-scroll
   sermon — "I don't scroll" as virtue is BeReal's grave; "my feed has an end and I reached it"
   is a feeling scroll structurally cannot offer.

## 4. The ruling

**Build "Scout" (working name): a native iOS app that turns one niche's last 24 hours of
short-form — top posts, sounds, formats, breakout accounts, ~150–300 items — into a single
bounded, walkable, finishable world, the same world for everyone in that niche, dropped daily.
The trail card is the receipt and the ad.**

- **Pitch:** *"Your niche's entire day on one screen — walk it with your thumb, finish it,
  keep the trail."*
- **First two weeks:** Capacitor wrap of the existing drift prototype + a Core Haptics detent
  plugin, staged data, on the operator's phone. One question: does the feel survive the wrap?
  No backend, no accounts. This is the cheapest kill in the whole plan. (Known risk: WebView
  touch latency may blur the detent — if so, the fallback is a minimal SwiftUI/Metal spike of
  just the scrub-detent loop, not abandonment.)
- **Days 15–90:** daily batch assembly for ONE niche — the one the operator scouts hardest
  personally (batch-once-daily caps API cost at cents and sidesteps the projection-stability
  problem; small daily sets, frozen layouts). Two weeks of dogfooding every morning. Then
  trail cards + public trail pages, and TestFlight to 100 iPhones recruited from the operator's
  own audience. The metric is ritual, not virality.
- **Proves it:** ≥25% of TestFlighters open 4+ days/week in weeks 3–4, unprompted, some
  finishing whole worlds. **Kills it:** <15% D30 return-to-ritual, or median <3 sessions/week
  at day 90, or the wrap feel fails and only a full rewrite would fix it. Kill means kill:
  publish the write-up, fold the field into the app-builder platform as a flagship component,
  keep the ledger idea.
- **Months 4–12, only if earned:** replicate the pipeline across 5–10 owned niches, each
  marketed by its matching accounts; clips end on the trail card; track installs per trail-link
  view (if <1% after real volume, reprice as a $10/mo prosumer tool and stop consumer spend).
  Add follow + trail-crossings only in niches where published-trail density earns it
  (≥1 fresh followed-trail crossing per user-day). The taste-query "worlds" product and any
  social surface grow from this position or not at all.
- **Do NOT build:** live per-query search worlds; a day-one follow graph or general-interest
  feed; an SDK; Android; a Swift/Metal rewrite before Capacitor invalidates itself; accounts
  or payments before TestFlight proves ritual.

## 5. Honest odds, stated to the operator

~90%: a gorgeous niche tool with a few hundred devoted users that never escapes its vertical —
the mymind/Halide shape, perhaps $1–3k MRR. That case still pays: a daily instrument for the
content business, a flagship demo for the app-builder, and the write-up. ~10%: ritual retention
plus near-zero CAC through the engine compounds into a Cal-AI-shaped consumer path — reachable
*only* through the wedge. The one unforgivable move is the middle path: months spent building
the full search/social vision on zero validation. The wrap ships in days; the feel test comes
first.

*Panel details preserved in the session record; the drift's feel spec and invariants that any
native build must honor are in `dot-field-drift.md` §3–5.*
