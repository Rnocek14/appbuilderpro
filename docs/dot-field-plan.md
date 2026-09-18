# THE DRIFT — the full operating plan

*The consolidated runbook. Everything decided across the six interrogation rounds, in
execution order. Rules of reading: the **structure** (gates, sequencing, kill criteria) is the
trustworthy part; every **probability and dollar band** is a generated estimate — direction,
not fact. The gates exist so no feeling — yours or the AI's — ever gets a vote. Detail lives
in: `dot-field-navigation.md` (the paradigm), `dot-field-drift.md` (the feel spec),
`dot-field-strategy.md` (wedge + velocity thesis + verdict + capture),
`dot-field-exit.md` (buyers + dealcraft), `docs/patent/provisional-draft.md` (ready to file),
`scout/` (the native wrap + hook-cutter).*

---

## PHASE 0 — Protect and feel (this week · ~$200–800 · your hands required)

**0.1 File the provisional patent.** Open `docs/patent/provisional-draft.md`; fill in your
legal name and address; delete the cover note; export to PDF. Optional but recommended: one
hour of a patent attorney's review (~$300–500). File at USPTO Patent Center as a provisional
(cover sheet SB/16; micro-entity fee ~$65 / small ~$130 — verify current). Save the receipt
and application number. **Iron rule: this happens before ANY public post, video, or App Store
listing about the mechanism** — the US gives inventors a 12-month grace period but the EPO's
absolute-novelty rule has none: a public demo before filing kills European rights
permanently. The 12-month conversion clock starts at filing — calendar it now.
(Seed amendment, 2026-09-02: the draft now carries §9A, the proxy-field embodiment — the
"seed" of `docs/dot-field-seed.md` — as a dependent claim only, with ThumbSpace, KDDI
US 9,244,544 and Amazon US 9,389,718 cited and distinguished. That embodiment's ancestors are
so well known that it is the one most exposed to a "we saw it in a demo" argument: it stays in
the private repo until the filing receipt exists.)
(Map amendment, 2026-09-02: drift rev. 4 — steering by *named semantic axes* with positions
fixed by per-item scores — is a claimable dependent variant (draft claim 9). The shared Drift
artifact stays at rev. 3; no clip of the compass, no post, no republish until the receipt exists.
The 2-D plane itself is prior art and is never claimed — `dot-field-map.md` §9.)

**0.2 Entity hygiene (same week, ~1 hour + state fee).** The drift IP + apps live in one
entity; the 50-account content engine stays in another (or stays personal). Never bundle them
— the engine is the CAC machine for your next three companies and bundling invites platform-ToS
diligence into a deal. Sign a one-page IP assignment of the invention into the app entity.
Keep the AI-provenance one-pager with it (all code authored in your own repos/accounts —
standard 2026 diligence; I can draft both pages).

**0.3 Build the wrap (a Mac + ~10 minutes).**
`cd scout && npm install && npm run sync:web && npx cap add ios && npx cap open ios` →
set Signing team (free Apple ID works; 7-day dev builds) → plug in iPhone → Run.
Then walk it every morning. The feel checklist is in `scout/README.md`; the one question that
matters: **does the detent land ON the crossing, or trail it?**
(Audit note, 2026-09-01: Apple patched the programmatic switch-haptic trick in iOS 26.5 — the
mobile web can no longer produce the detent at all. The native wrap is the *only* path to the
feel on iPhone; web demos are visual + audio only, permanently.)
The wrap bundles two pages: the drift, and the seed (P15) as a second page behind the same
Taptic bridge, so the 32px-pitch detent can be checked the morning after the drift's — a
script change, not a gate.

**⛔ GATE A (end of week 2):** feel survives the wrap → continue. Detents trail the crossing →
one decision: a 1–2 week SwiftUI/Metal spike of *just the scrub-detent loop*, or kill to the
write-up. No third option, no extension.

## PHASE 1 — The stranger and the pipeline (weeks 2–4 · ~$0 · mixed)

**1.1 The stranger test (the most important data in the project).** Hand your phone to 3–5
people who don't love you enough to lie. Say only: "try this." Watch the first 30 seconds
without helping. Record: did they self-teach the scrub? did they smile or shrug? On day 2,
did any of them *mention it or ask for it* unprompted? **The seed stays out of this session**:
Gate B measures a world, and a stranger's "huh, neat" on a familiar catalog would contaminate
the day-2 signal. The seed gets its own five-minute, pre-registered micro-study after Gate A
(the numbers are in `dot-field-seed.md` §5 — write them down before the test, not after).

**⛔ GATE B:** ≥1 of 5 comes back unprompted → continue. 0 of 5 → the write-up path (publish,
fold the field into FableForge as a flagship component, keep the patent). This gate cannot be
argued with — it is the entire reason the plan exists.

**1.2 Scout pipeline v1 (I build this with you).** One niche — whichever you scout hardest
yourself: **the creators world ships first**, on its edition-0 region table (`dot-field-map.md`
§3), because it is the one you open daily. A daily batch job: pull the niche's last 24h of
short-form signals from your existing research pipeline, select ~150–300 items, classify each
once (region key; intensity with a one-line reason; two independent tone scores kept locked
until they pass the agreement gate), place them by the frozen table — absolute scores, never a
per-day normalisation — bound the world to its populated hull plus one cell, freeze the layout,
print the layout hash, publish one world/day at a fixed hour. Honest empty land where supply is
thin. No accounts, no login — app opens straight into today's world.
*Real content (2026-09-02):* the fetch → place → freeze half of the pipeline exists —
`scripts/shorts-drop.ts` pulls YouTube Shorts per region through the Data API, places them with
`src/lib/worldPlacement.ts`, and writes one frozen edition the drift loads (`docs/dot-field-shorts.md`);
the classifier, the tone scores, the hull bound and a scheduled daily drop do not (§7 there). The first real run needs `YOUTUBE_API_KEY`
in the repo's environment; until then it writes a fixture that says it is one. The API terms for a
commercial browse layer over Shorts are a counsel line item before Gate B.
*Budget honesty:* "cents/day" holds only at ≤ 300 items on Haiku batch (≈ $0.0016/item,
ESTIMATE). A 1,500–2,000-item world is ≈ $3–12/day; ten worlds ≈ $0.9–1.9k/month before
double-scoring. Shrink-vs-grow is decision 3 in `dot-field-map.md` §10 — decide it with the
real $/item from the first week, not before.

**1.2a A candidate world with a fixed catalogue: movies (rev. 5, private).** The map is most
literally a map, and the remote most literally a remote, over a catalogue that does not change daily:
positions frozen for real, a one-time classification, posters built for a glance, read state =
watched (a Letterboxd import turns years of viewing into a walked map), the phone as the remote and
the TV as the screen. The prototype carries a staged movie world on a genre wheel. Before it becomes
more than a demo: **founder fit** — do you browse films at least weekly? — then the catalogue reality
(no public Netflix catalogue; TMDB metadata + deep links to wherever a title streams; TMDB commercial
terms UNVERIFIED). "Control your algorithm" becomes "pilot a map" here, which is the honest promise
for a fixed catalogue. Decision 6 in `dot-field-map.md` §10.

**1.2b The editorial job the pipeline did not budget.** Hand-placed regions plus a per-world
"what wild means here" rubric are an ongoing weekly task for a solo founder, not a one-time
build: argue the coordinates once with one literate stranger (edition 1), then review the drop
weekly for items the table mis-places. Sports, music and kitchen follow the creators world only
after two gates pass — the five-stranger learnability test ("what happens if you push right?
down?" — 4/5 say wilder and goofier unprompted) and the scorer agreement gate (Spearman ≥ 0.7
on intensity, α ≥ 0.6 on tone vs your own labels; all ESTIMATE targets, `dot-field-map.md` §8).

**1.3 Dogfood two weeks.** You, every morning, before scripting videos. Honest log: did it
actually change which trends you caught?

## PHASE 2 — Ritual proof and the name (months 2–3 · ~$0–500)

**2.1 TestFlight-100.** Recruit ~100 iPhones from your own audience (small creators in the
niche). Zero-friction first session: open → today's world → thumb on glass in 5 seconds.
Instrument: D1/D7/D30, sessions/week, verdicts/session, % of worlds finished,
rejection-latency distribution. (I build the dashboard.)

**2.2 Publish the naming write-up** (only after 0.1 is filed): "the drift," dated, on your own
site — the interaction, the rejection-speed thesis, the demo video cut for Apple-press taste
(haptics, restraint, finishable). This starts the canonical-origin trail that pays in every
future scenario.

**2.3 Optional fuel:** $100–300K on SAFEs from acquirer-alumni angels (ex-Apple input people,
ex-Tinder product) — intro networks without a preference stack. A priced VC round is
explicitly off-plan (it poisons a sub-$30M exit). Skip entirely if you'd rather stay clean.

**⛔ GATE C (day ~90):** ≥25% of TestFlighters open 4+ days/week in weeks 3–4, unprompted,
some finishing whole worlds → proven ritual, go to Phase 3. <15% D30 return-to-ritual OR
median <3 sessions/week → kill to Halide posture or the write-up path. Pre-committed; no
"one more month."

## PHASE 3 — Launch and the fork (months 4–6)

**3.1 App Store launch.** Pricing: free first world daily + Pro (~$10/mo: more niches, trail
export). All 50 accounts fire: screen-recorded walks with the tick audio (the haptic
surrogate on video), every clip ending on the trail card and a visible **doneness meter
hitting zero** — "FINISHED · 11 min · day 47." Track two numbers only: installs per clip-view,
and trail-link → install %.

**3.2 THE MONTH-6 FORK (pre-decide your temperament now — decision #3 below):**
- **Velocity path:** ≥100K installs and still accelerating → open buyer conversations within
  30 days. The Mailbox/tbh window is 8–16 weeks from inflection and does not reopen.
- **Retention path:** D30 ≥20–25%, verdicts/session holding → don't sell yet; start the
  **creator-asset drift** (Phase 3.3) and talk at months 9–12 from strength.
- **Fallback (applications research 2026-09-01; re-specified by the seed referee 2026-09-02):**
  if Scout misses the D30 gate, the platform effort pivots to **Shopify "Drift Browse"** — now
  the **seed layer** over a merchant's *existing* collection grid (a theme app-embed block,
  merchant-activated, mobile-only, per-theme grid adapters for Dawn and the top themes, "not
  available on this theme" rather than mis-mapping) at $29/$99/$299. Cheaper than a new field.
  Honest limits: on iPhone it is visual + audio only (no web haptic since iOS 26.5), so its
  chart is dwell/scrub-past heatmap vs click heatmap and PDP click-through — never feel; and a
  ship to many merchants triggers the four-patent claim chart (Phase 4) *before* the first
  install. It does not move above Scout on the seed's account — rule 5 stands.
- **Neither:** Halide posture (run it profitably, keep the patent) or execute the kill.

**3.3 Creator-asset drift — world #2, the founder-fit version (retention path only).** The
sounds, sound effects, music beds, b-roll clips, fonts and templates a short-form maker hunts
for every day — which is exactly what your own 50-account video pipeline hunts for every day,
so you are user #1 again. Every dot plays or shows its asset on crossing: audio and image scent
are the truest sub-400ms verdicts there are. Corpus, legally free: Freesound (714K sounds, 72%
CC0 — mostly SFX), Pexels/Pixabay video, Mixkit, Google Fonts. Payers via affiliate: Adobe Stock
($43 per subscription referral — verified), Epidemic Sound, Artlist, Envato Elements (programs
exist; rates to verify). Buyers in the world you already operate in: Canva, Adobe, CapCut,
Envato, Epidemic Sound. Build **THE CHART**: a ranker trained on steer-away/dwell logs beating a
dwell-only baseline — "3 drift sessions predict what a creator keeps better than N sessions of
clicks." *(The producer sample-library variant — Splice, Loopcloud — keeps every technical
virtue but fails founder fit: you don't live there, can't dogfood it, and your accounts don't
reach producers. It is a later adjacency if the mechanic proves, not an entry point. Podcasts
remain in the drawer — see `dot-field-applications.md`.)*

## PHASE 4 — The exit machinery (months 7–12 · only if a Phase-3 trigger fired)

- **Data room:** retention dashboard (live, not slides), rejection-latency distribution,
  verdicts-per-session chart, the consent-clean dataset, IP chain (provisional → budget the
  non-provisional ~$8–15K with attorney, **plus a professional four-patent claim chart before
  any commercial ship of the detent mechanic**: Google US 10,365,719 — whose independent
  claims are narrower than "detent-on-crossing" (all require a symbol queue plus an expanded
  item display with synchronized haptics), but the seed's lit-tile-plus-chip-plus-detent sits
  closer to that language than the field's dot swell; Immersion US 8,264,465 (scroll-
  commensurate haptic repetition, active to 2028-07-27 — the seed's hold-repeat paging is the
  exposure; drop hold-repeat if the chart says so); KDDI US 9,244,544 (in-screen reduced
  touchpad with per-icon vibration and on-page pointer, active to 2032-09-01 — the seed must
  never carry a miniature image; the abstract lattice is the distinguishing hook); Amazon
  US 9,389,718 / 10,353,570 (hold-to-invoke thumb proxy areas distinct from the items, with
  highlight and haptic). The field's own exposure is unchanged apart from the '719 correction.),
  AI-provenance page, press/naming trail.
- **The rooms:** Canva / Adobe / CapCut / Envato / Epidemic Sound (wound: every creator-asset
  library is a search box over a grid — nobody owns *browse* for assets; comp: Splice→Spitfire
  ~$50M for a judging-dense audio catalog) + **Match Group always as the second room** (they
  litigated the swipe — they believe gestures have cash value) + Pinterest/Snap warm. Apple is
  press strategy, not a meeting.
- **LOI discipline:** never one bidder, never name a number first, no exclusivity >30 days,
  **no earnouts tied to their roadmap**, M&A lawyer at first LOI (no banker under ~$50M).

## STANDING RULES (never suspended)

1. Never sell dot positions. Sponsored *regions* only, labeled, and only ever in year-two+.
2. No corp-dev meeting before the provisional is filed AND a public chart is moving — an early
   meeting is free due diligence for their clone team.
3. The walked world never rewrites; the list sibling always ships; no wellbeing sermons in
   marketing — sell the full stop ("my feed has an end"), never the virtue.
4. Gates decide. Not enthusiasm — yours or the AI's.
5. Founder fit. Never enter a vertical you don't use daily — every world must have you as
   user #1, reachable by your own accounts, dogfoodable every morning. A corpus that scores
   perfectly on the mechanic but fails this test (the producer sample-library variant) is an
   adjacency for later or an acquirer's expansion slide, never an entry point.
6. Worlds are editions. A region table (sectors, radii, rubric, classifier version) is
   versioned and frozen; any change is a new edition announced at the drop — never silent,
   never mid-day, never backfilled. Every coordinate change breaks someone's spatial memory.
   The wheel's words are universal (HOME · DEEPER); each world names only its kinds and its
   depth pair.
7. The register axis is a coordinate, never a verdict. "Goofy" is a compass word and a region's
   place; no tone label is ever printed on a creator's post, and no value word enters the
   compass. Any "non-profiling" marketing claim is scoped to the walked world — unseen-territory
   fill and nebula glow *are* profiling.

## THE THREE DECISIONS ONLY YOU CAN MAKE (decide before month 6)

1. **Would you work 2–4 years inside an acquirer?** If no: steer to IP/asset-sale structures
   early and accept ~half the headline.
2. **Is the content engine ever part of a deal?** Default: no — separate entity, forever.
3. **Velocity-seller or retention-builder?** If the chart hockey-sticks, selling at peak fear
   is the tbh move and it will feel wrong on the day. Pre-commit now, in writing, to which
   person you are.

## HONEST ODDS (generated estimates — direction, not fact)

~55% no exit (spanning "killed at a gate for ~$200" to "a $100–500K/yr craft business plus a
permanently better content company") · ~18% acquihire offers at $1–5M (default: refuse; the
fallback is why you can — but it's your life) · ~20% product acquisition $10–50M (the target
every step services) · ~4% the fear-scale outcome (recognize it; never need it).

## WHO DOES WHAT

**Only you:** the Mac/Xcode build+run, the USPTO filing, entity setup, handing phones to
strangers, the three decisions, every conversation with a human buyer.
**Me, on your word:** the Scout pipeline + daily world assembler, the metrics dashboard, the
trail-card generator + public trail pages, the naming write-up draft, the ranker experiment,
the IP-assignment/provenance one-pagers, the creator-asset world, the free small-web Stumble
field demo, the seed micro-study protocol and its Shopify app-embed spike (fallback only), and
any spike a gate demands.

**Next physical action: the provisional and the wrap. Both fit in one week. Gate A is waiting.**
