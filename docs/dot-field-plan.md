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

**⛔ GATE A (end of week 2):** feel survives the wrap → continue. Detents trail the crossing →
one decision: a 1–2 week SwiftUI/Metal spike of *just the scrub-detent loop*, or kill to the
write-up. No third option, no extension.

## PHASE 1 — The stranger and the pipeline (weeks 2–4 · ~$0 · mixed)

**1.1 The stranger test (the most important data in the project).** Hand your phone to 3–5
people who don't love you enough to lie. Say only: "try this." Watch the first 30 seconds
without helping. Record: did they self-teach the scrub? did they smile or shrug? On day 2,
did any of them *mention it or ask for it* unprompted?

**⛔ GATE B:** ≥1 of 5 comes back unprompted → continue. 0 of 5 → the write-up path (publish,
fold the field into FableForge as a flagship component, keep the patent). This gate cannot be
argued with — it is the entire reason the plan exists.

**1.2 Scout pipeline v1 (I build this with you).** One niche — whichever you scout hardest
yourself. A daily batch job (cents/day): pull the niche's last 24h of short-form signals from
your existing research pipeline, select ~150–300 items, assign currents/cells once, freeze the
layout, publish one world/day at a fixed hour. No accounts, no login — app opens straight into
today's world.

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
- **Retention path:** D30 ≥20–25%, verdicts/session holding → don't sell yet; start **Audio
  Drift** (Phase 3.3) and talk at months 9–12 from strength.
- **Neither:** Halide posture (run it profitably, keep the patent) or execute the kill.

**3.3 Audio Drift — world #2, the exit surface (retention path only).** Podcast corpus via
open RSS; hooks cut server-side (`scout/scripts/hook-cutter.mjs` — already proven against a
live feed). **Licensing posture required (audit finding):** technically open ≠ licensed —
there is no "short clip = fair use" rule; excerpting is a case-by-case defense, and Podz's
real defense was driving discovery until it sold to the license-holder. Ship with a
podcaster opt-in/opt-out program and takedown path from day one, and treat hooks as
discovery that links to the source. The paradigm's scent weakness vanishes here: a 1.5s audio hook is judged before a
title could be read. Build **THE CHART**: a simple ranker trained on steer-away/dwell logs vs
a dwell-only baseline — "3 drift sessions predict subscribes better than N sessions of taps."
That chart is the acquisition memo.

## PHASE 4 — The exit machinery (months 7–12 · only if a Phase-3 trigger fired)

- **Data room:** retention dashboard (live, not slides), rejection-latency distribution,
  verdicts-per-session chart, the consent-clean dataset, IP chain (provisional → budget the
  non-provisional ~$8–15K with attorney, **plus a professional claim chart of Google's
  US 10,365,719 — detent-on-crossing haptics, the one identified FTO risk — before any
  commercial ship of the detent mechanic**), AI-provenance page, press/naming trail.
- **The rooms:** Spotify (wound: podcast discovery is broken; comp: Podz ~$50M) + **Match
  Group always as the second room** (they litigated the swipe — they believe gestures have
  cash value) + Snap warm. Pinterest if the moodboard demand moment was manufactured. Apple is
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
the IP-assignment/provenance one-pagers, Audio Drift world, and any spike a gate demands.

**Next physical action: the provisional and the wrap. Both fit in one week. Gate A is waiting.**
