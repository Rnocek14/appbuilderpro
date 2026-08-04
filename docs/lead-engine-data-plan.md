# Lead Engine — the data & enrichment plan, and the road to money

Companion to `lead-engine-master-plan.md` (now deployed — PR #105). This doc answers two
questions with researched numbers (August 2026): **what data makes a lead maximally
valuable**, and **how long until this makes money**.

The organizing idea: a lead's value is the product of six questions it can answer. Raw
public records answer one and a half of them. Each enrichment layer answers another —
and each answered question measurably raises close rate, which is the only number that
prices this product.

---

## The six questions a perfect lead answers

| # | Question | What answers it | Status |
|---|---|---|---|
| 1 | **What happened?** | The event: permit, license, registration, storm | ✅ Built (5 event types, hourly clock) |
| 2 | **Who exactly do I call?** | Contact layer: name → phone → email → role | ⚠️ Partial (named parties only — the #1 gap) |
| 3 | **Who owns the building?** | Property layer: assessor + LLC piercing | ❌ Not yet |
| 4 | **How big is the job?** | Sizing: valuation, sq ft × type heuristics | ⚠️ Partial (valuation when the record has it) |
| 5 | **Why now — and until when?** | Timing: license runways, permit stages | ⚠️ Partial (recency scoring only) |
| 6 | **Did it close?** | Outcome data — the moat | ✅ Built (le_outcomes + commission invoices) |

Question 2 is where the money is. Speed-to-lead research already showed first-responder
wins; a lead with a direct phone number gets called *today*; a lead that says "applicant:
Jones GC" gets googled next week or never. **Contact completeness is the single highest-
leverage enrichment dollar.**

---

## Layer 1 — More events (what happened), in priority order

1. **Liquor license APPLICATIONS, not just issuances.** Research confirms applications
   land **3–6 months before opening** (Colorado 2–3mo ideal, NY 3–6mo, contested 6–12mo)
   — which is exactly the buying window for signage, acoustics, security, cleaning, POS.
   An application is worth 3× an issuance: same customer, months earlier, less
   competition. State ABC boards publish application dockets; add per-state adapters.
2. **Permit STATUS TRANSITIONS.** We capture issuance; the timing signal is the
   *lifecycle*: applied → issued → inspections → final. "Final inspection scheduled" =
   fit-out finishing = acoustics/signage/cleaning window opens NOW. Implementation:
   re-poll known permits' status fields; a transition is a new event type
   (`permit_stage_change`) feeding time-sensitive trades.
3. **NOAA storm events (free).** SPC hail/wind reports + county overlays → the storm
   restoration stream. Free federal data, insurance-money urgency, highest per-lead
   prices in the industry (StormLead sells NOAA-verified leads at $99+). New event type
   `storm_event`, new trades (roofing, restoration).
4. **Business registration details.** We ingest registrations; add the registered-agent
   and officer fields where states expose them — free LLC piercing (see Layer 3).
5. **Pre-permit planning (later, licensed).** Planning-commission agendas run 6–18
   months ahead of permits; cityminutes.ai licenses this parsed (3,142 counties) —
   evaluate at multi-metro scale, not before.
6. **Review-velocity / "recently opened" signals** from Places — confirms openings the
   paper trail missed. Cheap, already keyed.

## Layer 2 — Contact enrichment (who exactly do I call) — THE conversion lever

Build as a **waterfall, score-gated**: only leads scoring ≥60 spend enrichment money,
cheapest source first, stop on success. All verbatim-tagged by source.

| Step | Source | Cost | What it adds |
|---|---|---|---|
| 1 | **Google Places lookup** — key already in the stack (`GOOGLE_PLACES_API_KEY`, `discover-run` precedent) | ~$0.02 | Business phone, website, hours, category — for the *business at the address* |
| 2 | **Website contact scrape** — `fetch-url` + `deepScan` already built | ~free | Contact page emails/phones, owner names |
| 3 | **Email waterfall** — Hunter ($0.01–0.05/lookup; Starter $34/mo = 2K) or FullEnrich-style multi-provider (~95% vs ~85% single-source) | ~$0.05 | Verified work email for the named party |
| 4 | **Phone append / skip trace** — batch $0.02–0.15/record, returns up to 8 phones + 5 emails, 50–80% hit rate | ~$0.10 | Direct cells for owners/GCs |
| 5 | **Role lookup** — Apollo (1 credit/email, 8/phone) when a *title* matters (facilities manager at a chain) | ~$0.10–0.50 | Decision-maker by title |

**All-in contact-complete lead: under $0.30.** Against a lead that closes $10k jobs at
10% commission, or sells inside a $250–500/mo subscription, enrichment cost is noise —
the discipline is score-gating so junk leads spend nothing.

## Layer 3 — Property & owner data (who owns the building)

Commercial permits often name an LLC or a GC — the *decision-maker* is the owner behind
them. Three tiers:

1. **Free, pilot-metro:** county assessor lookups (owner name + mailing address per
   parcel) + Secretary of State registered-agent search (LLC → human). Tedious but $0;
   fine for one metro.
2. **$499/yr, multi-metro:** ATTOM (160M properties, 3,000+ counties — ownership,
   sq ft, year built, assessed value) or Regrid (parcel API + enhanced ownership,
   ATTOM-partnered). One key replaces per-county scraping.
3. **What it unlocks beyond contacts:** building **sq ft and age** → job sizing when
   permit valuation is blank (Q4); **roof age** → the storm stream's pre-qualifier;
   **owner portfolio** ("this LLC owns 14 buildings") → one relationship, many
   buildings — the account-expansion play sold to janitorial/security customers.

## Layer 4 — Sizing heuristics (how big is the job)

Permit valuation when present (have). When absent: **sq ft × use-type multipliers**
(assessor sq ft from Layer 3), refined per trade — acoustics $6.50–20/sq ft installed,
cleaning ~$0.10–0.25/sq ft/mo recurring, etc. Long-term the real sizing engine is our
own `le_outcomes` data: predicted vs actual contract values, per trade per event type.

## Layer 5 — Timing intelligence (why now, until when)

- Liquor application date + jurisdiction → **projected opening window** (app + 3–6mo);
  leads carry "opens ~Nov 2026 — signage decision window: now".
- Permit stage transitions (Layer 1.2) → "final inspection scheduled" alerts.
- Recency decay already in the score; add **decision-window expiry** so stale leads
  visibly age out instead of lingering.

## Layer 6 — The moat (did it close) — already built, must be fed

`le_outcomes` + commission invoices exist. The discipline that turns them into an asset:
**every delivered lead gets an outcome within 30 days** (owner- or customer-reported).
At ~500 outcomes the dataset prices leads better than any competitor scraping the same
portals; at ~5,000 it *is* the company (close-rate-by-event-type-by-trade — nobody has
this). Tier discounts for customers who report outcomes; it's cheaper than buying the
data any other way.

---

## Build order (each wave ships value alone)

| Wave | When | What | Cost |
|---|---|---|---|
| 1 | Weeks 1–2 | Places contact append + website contact scrape + SoS agent lookup — **every lead ships with a phone** | ~$0 (keys exist) |
| 2 | Month 1–2 | Email waterfall + score-gated skip trace; county assessor for pilot metro; liquor *application* adapters | cents/lead |
| 3 | Month 2–4 | Permit status polling (stage-change events); NOAA storm stream + restoration trades | ~$0 |
| 4 | Month 4+ | ATTOM/Regrid key (multi-metro), AI verify calls (Phase 2, built), owner-portfolio views | $499/yr + ~$1/verified lead |
| 5 | Scale | cityminutes pre-permit license; predicted-value model from outcomes | negotiated |

Unit economics after Wave 2: **contact-complete lead ≤ $0.30 all-in**; after Wave 4
verification: ≤ $2. Sold at $250–500/mo subscriptions (≈$10–25/lead effective) or 10%
commission ($500–1,500 per closed $5–15k job): **90%+ gross margin at every tier.**

---

## How long before this makes money — honest timeline

Costs are ~$0 fixed (existing Supabase project, free data, keys already provisioned),
so "makes money" means first revenue, not break-even.

**The commission path (buddy pilot) — first cash in 60–120 days:**
- **Week 1:** market live, sources wired, first digest in his inbox (doable today).
- **Weeks 2–6:** first quotes. Permit leads are *active projects* — the fastest
  converting; liquor-application leads mature over months 2–6.
- **Months 1–3:** first closed jobs (commercial quotes close in weeks-to-months; his
  close rate on warm referrals should beat the industry ~25% bid average).
- **Months 2–4:** first commission check (paid when his customer pays him).
  **Realistic first dollars: $800–3,000, roughly day 60–120.**
- **Months 4–6:** steady state $800–3,000/mo from one client — plus the close-rate
  dataset, which is the actual prize.

**The subscription path — first MRR month 3–6:**
- Selling the feed before pilot proof is possible but converts poorly (every contractor
  has been burned by lead sellers). With 90-day close-rate numbers in hand:
- **Months 3–6:** first 5–10 subscribers at $250–500/mo (security integrators and
  janitorial first — recurring-account economics; pitch with the buddy's numbers and
  the "you pulled N permits last quarter, here are the jobs you weren't on" opener from
  our own data). **$1,500–5,000 MRR.**
- **Months 9–12:** 20–40 subscribers across 2–3 trades, done-for-you tier for a few →
  **$8–20k MRR ($100–240k ARR run-rate)** — the deep-dive doc's Year-2 arc, pulled
  forward if the pilot converts well.

**The two numbers that decide everything:** pilot quote rate (gate: ≥30%) and closed
jobs (gate: ≥2 by day 90). Hit them and the timeline above holds; miss them and the fix
is lead quality (Wave 1–2 enrichment, trade weights, sources) — not more customers.

---

## Sources

- [Hunter pricing / email API comparison](https://www.salesforge.ai/blog/email-apis-for-developers) · [Apollo credit pricing](https://www.enrich.so/blog/apollo-pricing-breakdown) · [Waterfall enrichment accuracy](https://www.cleanlist.ai/blog/2026-03-05-best-b2b-data-enrichment-apis) · [Contact enrichment tools 2026](https://syncgtm.com/blog/best-contact-enrichment-tools-2026)
- [Skip tracing cost guide 2026](https://dealrun.ai/blog/skip-tracing-cost-guide) · [Bulk skip tracing $0.02/lead](https://www.tracerfy.com/bulk-real-estate-skip-tracing) · [DataZapp 3¢ skip tracing](https://www.datazapp.com/skip-tracing-real-estate-marketing/)
- [ATTOM property data overview](https://blog.iq.dwellsy.com/attom-data-overview-2026-property-ownership-and-market-data-explained/) · [ATTOM assessor data](https://www.attomdata.com/data/property-data/assessor-data/) · [Regrid parcel API + enhanced ownership](https://regrid.com/api)
- [Liquor license timelines (WA: apply ~90 days out)](https://lcb.wa.gov/licensing/apply-liquor-license) · [Colorado 2–3+ months](https://corestaurant.org/blog/how-to-get-a-liquor-license-in-colorado/) · [Expert timeline guide 3–6mo](https://winepos.com/how-long-does-it-take-to-get-a-liquor-license-expert-timeline-guide/)
- Prior research in `lead-engine-plan.md` / `lead-engine-deep-dive.md` (lead prices, RMR multiples, speed-to-lead, acoustic/cleaning economics).
