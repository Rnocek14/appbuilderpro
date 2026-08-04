# Lead Engine — deep dive: what the v1 plan was missing

Companion to `lead-engine-plan.md`. That doc holds the 90-day pilot; this one holds the
findings that change the ceiling: which trades are worth 10–50x more per lead, why speed
is the actual product, the two customer tiers above SMB contractors, the closest
competitor (and the gap they left open), the legal guardrails, and the valuation math
for making this genuinely valuable rather than just profitable.

Researched August 2026. Sources at the end.

---

## 1. The biggest miss: recurring-revenue trades make a lead worth 10–50x more

The v1 plan priced leads against one-time project trades (acoustics: win a job, get paid
once). The trades that should anchor this business are the ones where a won account is a
**recurring annuity** — because the lead's value is the account's lifetime value, and in
some trades the account is literally a tradeable asset:

- **Commercial security/alarm**: won monitoring accounts are bought and sold at
  **40–55x recurring monthly revenue** for large commercial fire/burglar accounts.
  A $400/mo commercial account the dealer wins from one of our leads is a **$16k–22k
  asset on their balance sheet**. A lead that converts into that is rationally worth
  $1,000–3,000 — and the security industry already thinks in exactly these terms.
- **Janitorial/commercial cleaning**: average revenue per commercial contract ≈
  **$1,850/month** ($22k/yr); daily service on a 5,000 sq ft office runs $1,500–3,000/mo.
  Multi-year retention makes a single won account worth $50k+ in lifetime revenue.
- **Fire & life safety, elevators**: code-mandated recurring inspections — every new
  commercial building is legally required to buy these services forever. The event
  ("new building") doesn't just *predict* demand, it *guarantees* it.
- Also in this class: waste, pest control, landscaping/snow, coffee service, HVAC
  maintenance contracts.

**Implication:** keep the acoustic pilot (trust = clean data), but the go-to-market list
for paying strangers should be **security integrators, janitorial companies, and fire/
life-safety firms first** — same event stream, drastically higher willingness to pay.
A $500/mo subscription is trivial against $22k/yr accounts; the premium tiers below
become sellable at $1,500–3,000/mo.

## 2. Speed is the product, not a feature

The research is unambiguous: **78% of buyers go with the first company that responds**;
contacting a lead within 5 minutes makes qualification **21x more likely** than at 30
minutes; conversion falls from ~70% (5 min) to ~5% (24 hrs). (MIT/Oldroyd study,
15,000 leads.)

Incumbent project-data products (Dodge, ConstructConnect) are daily/weekly batch
firehoses. The differentiated product is: **portal record appears → alert + drafted
outreach in the customer's hands within minutes**. First call wins the account in
trades where every competitor is working from the same public data a day later.
The existing Garvis speed-to-lead + approval-queue machinery is exactly this shape.

## 3. Two customer tiers above SMB contractors (this is where "a ton of money" lives)

**Tier 2 — Manufacturers with dealer networks.** Carrier/Trane-style dealer programs
already pay **$50–150+ per phone call** routed to dealers, funded by manufacturer
marketing budgets. Acoustic panel makers, security OEMs, flooring, lighting, and
fixture manufacturers all run dealer/rep networks and all want project leads flowing to
their channel. One manufacturer deal ($30k–100k/yr ACV) equals 50–100 SMB subscriptions
with one buyer, one contract, near-zero churn. Building Radar explicitly targets this
segment — proof it pays. This is the natural Year 2–3 move once the SMB tier generates
case-study data.

**Tier 3 — Data/API licensing.** The by-product nobody else has: **verified close-rate
data by event type by trade** (from the outcome tracking built into every tier). That
dataset prices leads, powers the prediction claims, and is licensable to suppliers,
lenders, and PE — but only exists if outcome tracking is enforced from day one.

## 4. Competitive reality: Convex validated the market and left the flanks open

**Convex** (YC W19, **$60M raised**) sells sales intelligence to exactly these trades —
HVAC, janitorial, security, fire/life safety, elevators, waste — with 62M commercial
properties, equipment/permit fields, and decision-maker data. Enterprise, sales-led
pricing aimed at mid-market and national service companies.

This is good news twice over: VCs fund this category, and Convex's positioning leaves
three open flanks:
1. **Events vs. state.** Convex is a property *database* (what a building is); the wedge
   here is a real-time *event* feed (what just changed). "Something happened → act now"
   is a different product than "browse properties."
2. **SMB price point.** Sales-led enterprise pricing leaves the $250–500/mo self-serve
   segment — the local 5–50 person contractor — unserved.
3. **Done-for-you outreach.** Convex hands data to sales teams; small contractors don't
   have sales teams. Booked appointments (below) is a tier they structurally won't build.

**StormLead** ($99+/lead tied to verified NOAA hail events) proves the event-driven,
per-lead model in storm restoration. NOAA weather data is free — commercial storm
restoration (roofs at $50k–500k) is a strong second event stream later, and its leads
carry insurance-money urgency.

## 5. The product ladder (how pricing power compounds)

Each rung uses the same event stream and roughly triples the price:

| Tier | What they get | Price | Anchor |
|---|---|---|---|
| Feed | Ranked weekly leads, one trade, one metro | $250–500/mo | Dodge metro ≈ $100–150/mo, generic |
| Real-time + contacts | Minutes-level alerts, decision-maker enrichment, drafted outreach | $500–1,000/mo | Exclusive leads sell at $100–300 each |
| Done-for-you | Compliant outreach run for them; booked appointments | $1,500–3,000/mo or $100–300/appt | Agencies charge $1,750/mo for 10–12 leads |
| Territory exclusive | One contractor per trade per metro | +50–100% premium | Standard in home-services lead gen |
| Manufacturer/enterprise | Feed + API for a dealer network | $30k–100k/yr | Dealer programs pay $50–150/call today |

## 6. Legal guardrails (cheap to respect, expensive to ignore)

The outreach tier lives or dies on compliance:
- **Cold email is the safe default** — CAN-SPAM is opt-out based; fine for B2B.
- **Calls to business landlines**: generally permitted B2B; keep 8am–9pm windows.
- **Cold SMS is a minefield** — TCPA is $500–1,500 *per text*, and mobile numbers lose
  most of the B2B exemption. Don't cold-text; get written consent first.
- **State mini-TCPAs are the real risk** for multi-state calling: Florida (3-call/day cap,
  $500–1,500/call), Texas SB 140 ($10k bond, $5k/violation), Connecticut (up to
  $20k/call), 15+ states total. Apply the strictest relevant state rule before dialing.
- Scraping government open-data portals is fine — it's public record, published for reuse.
- "We handle outreach compliantly" is itself a selling point to small contractors who
  are one lawsuit away from a very bad year.

## 7. Valuation math — profitable vs. valuable

Market multiples (2026): median private SaaS trades at **4–5x ARR**; vertical SaaS
carries a **25–30% premium** (7–9x+ with NRR >120% and Rule-of-40 >50). Proprietary-data
and API revenue push the multiple up further. The exit market is real: **Levelset sold
to Procore for $500M** on construction lien/payment data; Procore, CoStar, ZoomInfo,
and the PE rollups behind Dodge/ConstructConnect are all systematic acquirers of
construction/commercial data assets.

What that means concretely:
- **$1M ARR** (SMB subscriptions, 2–3 metros) → worth roughly **$4–6M**.
- **$3M ARR** with manufacturer deals + multi-trade NRR → **$15–25M**.
- **$10M ARR** as a vertical data platform with API revenue → **$70–90M+**.
- The venture-scale path (Convex/Building Radar territory) exists if the outcome-data
  moat compounds — but it isn't required for a life-changing result.

The three levers that move the multiple, in order: **NRR** (sell more trades on the same
event stream to the same metro — expansion revenue is built into the model), **revenue
mix** (every enterprise/API dollar is worth ~2x an SMB dollar at valuation), and the
**outcome dataset** (the only thing here a well-funded copycat can't scrape).

## 8. Revised roadmap deltas

Changes to `lead-engine-plan.md` in light of the above:

1. **Pilot unchanged** — acoustic buddy, 90 days, written 10%, tracking sheet. It's the
   cheapest clean-data source available and the case study for everything after.
2. **First paid vertical after the pilot: security integrators**, then janitorial, then
   fire/life safety — recurring-account economics support 3–10x the subscription price
   the one-time trades will bear. Frame the security pitch in their own language:
   "accounts you win from this feed are worth 40–55x RMR when you sell the company."
3. **Build real-time alerting before adding metro #2.** Speed is more defensible than
   coverage; portal-polling frequency and drafted-outreach latency are the spec, and the
   existing standing-order/approval-queue stack already fits it.
4. **Add the done-for-you tier in months 4–9** (email-first for compliance). It triples
   revenue per customer and produces the booked-appointment metrics that make the
   manufacturer pitch concrete.
5. **Open the manufacturer conversation in year 2** with the buddy's industry —
   acoustic panel manufacturers are small enough to reach and the case study is native.
6. **Outcome tracking is contractual at every tier**, not a favor — discounts for
   customers who report wins/losses. The dataset is the company's terminal value.
7. **Storm/NOAA events become stream #2** when ready for restoration trades — the
   event-driven model is proven there and the data is free.

**Revised revenue arcs** (replacing the v1 model's upper bands):
- Year 1: pilot + 5–10 subscribers, first real-time tier → **$40–90k**.
- Year 2–3: 40–80 customers weighted to recurring-revenue trades, 10–20 on done-for-you
  tier, first manufacturer deal → **$400k–900k ARR**.
- Year 3–5: multi-metro, 2–3 manufacturer/enterprise deals, storm stream live →
  **$1.5–3M ARR**, plausibly worth **$8–20M**. Beyond that is the venture path.

The failure mode hasn't changed — public data means the only durable edges are speed,
curation quality, and the outcome dataset. Every roadmap item above feeds at least one
of those three.

---

## Sources

- [Alarm company RMR multiples 2026](https://ctacquisitions.com/alarm-company-sale-or-acquisition/) · [Security monitoring business valuation](https://ctacquisitions.com/security-monitoring-business-valuation/) · [How to sell alarm accounts](https://www.agmonitoring.com/resources/how-to-sell-your-alarm-accounts-pillar)
- [Commercial cleaning pricing guide](https://www.housecallpro.com/resources/how-to-price-commercial-cleaning-jobs/) · [Janitorial KPIs & ARPC](https://financialmodelslab.com/blogs/kpi-metrics/janitorial-agency) · [Commercial cleaning rates](https://www.bigleagueclean.com/commercial-cleaning-rates-us-pricing-guide/)
- [Speed-to-lead statistics (Verse)](https://verse.ai/blog/speed-to-lead-statistics) · [Lead response time & the 5-minute rule](https://resources.rework.com/libraries/lead-management/lead-response-time) · [Chili Piper speed-to-lead data](https://www.chilipiper.com/article/speed-to-lead-statistics)
- [Convex raises $60M](https://www.convex.com/news/press-release/convex-raises-60-million-in-funding) · [Convex platform](https://www.convex.com/commercial-services-platform) · [Convex industries served](https://www.convex.com/)
- [Building Radar early-stage detection](https://www.buildingradar.com/construction-blog/how-ai-transforms-early-identification-of-construction-projects) · [Building Radar for manufacturers](https://www.buildingradar.com/construction-blog/from-data-to-decisions-how-ai-helps-manufacturers-target-the-right-projects)
- [StormLead NOAA-verified hail leads](https://stormlead.co/) · [Storm damage repair costs](https://www.homeadvisor.com/cost/disaster-recovery/repair-storm-or-wind-damage)
- [Carrier dealer program](https://www.carrier.com/us/en/residential/become-a-dealer/) · [HVAC manufacturer lead gen landscape](https://www.gushwork.ai/blog/lead-generation-services-for-hvac-manufacturers)
- [Cold calling laws 2026](https://martal.ca/cold-calling-laws-lb/) · [State mini-TCPA guide](https://www.avair.ai/resources/blog/state-mini-tcpa-laws-guide) · [TCPA & SMS compliance 2026](https://subscriberverify.com/blog/tcpa-sms-carrier-restrictions-cold-calling-2026) · [State DNC laws for B2B](https://www.smarte.pro/blog/state-do-not-call-laws)
- [SaaS valuation multiples 2026](https://windsordrake.com/saas-valuation-multiples/) · [Vertical SaaS premium data](https://livmo.com/blog/saas-valuation-multiples-2026/) · [Private SaaS multiple ranges](https://www.l40.com/insights/saas-multiples)
- [Levelset $500M acquisition](https://www.procore.com/press/procore-completes-acquisition-of-levelset-to-simplify-lien-management-workflows-for-construction) · [Deal structure detail](https://www.builtinaustin.com/articles/procore-acquires-levelset-construction-management-platform)
