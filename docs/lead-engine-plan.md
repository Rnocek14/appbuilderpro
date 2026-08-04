# Lead Engine — the executable wedge plan

The practical version of the "Commercial Intelligence Network" idea: scrape public
commercial signals in one metro, turn them into ranked leads for one trade, prove they
close, then charge for them. Start on commission with a trusted first customer (the
acoustic panel company), convert to per-lead / subscription pricing for everyone after.

This doc is grounded in researched numbers (August 2026), not vision. Sources at the end.

---

## 1. The market reality (what the research says)

**What contractors already pay for project data**
- Dodge Construction Network: roughly $100–150/month to track one metro; $6k–12k/yr for
  deeper intelligence tiers.
- ConstructConnect: ~$299–$1,000/month depending on tier.
- Exclusive commercial leads (HVAC, roofing): **$100–$300+ per lead** is the going rate.
  Lead-gen agencies package ~10–12 exclusive leads for ~$1,750/month.

Takeaway: the price points are established. Businesses in the trades already pay
$100–1,000/month for exactly this category of product. We don't have to invent a market —
we have to beat generic providers on relevance for one vertical.

**What the raw data costs**
- Building permit data is free in most large metros via Socrata / ArcGIS / Accela open-data
  portals and citizen portals (NYC, SF, Chicago, LA, San Diego, hundreds more). Coverage of
  the big scrapeable platforms is ~63% of the US population.
- Commercial APIs exist if we want to skip scraping: Shovels.ai from ~$599/month
  (250 free API calls to prototype). Apify has off-the-shelf permit scrapers for pennies.
- Other free signals: state liquor-license applications (new restaurants/bars), health
  department food-service permits, Secretary of State business registrations, local
  restaurant-opening press.

Takeaway: data cost at pilot scale is ~$0 in labor-heavy DIY mode, or ~$600/mo if we buy
the shortcut. The moat isn't the data — it's filtering, timing, contact-finding, and the
"why now" context wrapped around each lead.

**Deal economics for the first vertical (commercial acoustics)**
- Office treatment: ~$6.50–$20/sq ft installed. A 2,000 sq ft open-plan office ≈ $13k–16k.
  A conference room ≈ $2k–2.5k.
- Restaurant dining room (1,500–3,000 sq ft): meaningful package ≈ $10k–25k
  (basic panel-only jobs can be $1k–3.5k).
- Realistic blended average commercial job: **$5k–12k**.
- Commercial bid win rates average ~25%; referral/warm leads close better than cold bids.

**Deal flow in one metro**
- ~12,000 new restaurants opened in the US in 2025. A mid-size metro sees 150–300+
  openings/year (Denver: 303; Twin Cities: 163). Add office tenant-improvement permits,
  gyms, churches, schools, studios, medical offices — the acoustic-relevant event stream in
  one metro is comfortably 30–80 signals/month.

**Commission norms (for the referral agreement)**
- Finder's fees: 3–10% of initial contract value; B2B referral 3–5%; consulting-style
  full-service referral 5–15%. Higher involvement → higher percentage.
- We do the full job (find, qualify, contact info, why-now): **10% of contract value on
  closed jobs is defensible and simple.**

---

## 2. Why commission-only doesn't scale (and what does)

Commission works with the buddy because trust makes verification free. With strangers it
breaks on four things: you can't see the close (self-reported), attribution disputes
("we already knew about that job"), 6–12 month cash-flow lag, and enforcement/collections
across dozens of small contracts. This is why Angi, Thumbtack, Dodge, and every survivor
in this industry converged on per-lead or subscription pricing.

**The model: commission with the trusted few → per-lead/subscription with the many.**
The commission pilot's real output isn't the checks — it's verified close-rate data that
prices the subscription for everyone else.

---

## 3. The pilot — acoustic panels, one metro, 90 days

**Customer zero:** the buddy's acoustic panel company, in whatever metro he operates.

**Signal chain (all public):**
| Signal | Source | What it predicts |
|---|---|---|
| Tenant-improvement / commercial remodel permits | City/county open-data portal | Office & retail fit-outs — acoustic window opens ~1–3 months after permit issue |
| Liquor license applications | State ABC board | New restaurants/bars, months before opening |
| Food service permits | County health dept | Restaurant openings, later-stage confirmation |
| New business registrations (gyms, studios, churches, schools) | Secretary of State | Fit-out spend coming |
| Restaurant-opening press / local news | RSS + scraping | Confirmation + contact names |

**Pipeline (v1 is deliberately boring):**
1. Nightly scrape of the metro's permit portal + weekly pulls of liquor/health/SoS filings.
2. Normalize into one `events` table: address, type, valuation, dates, named parties
   (owner/GC on the permit), source link.
3. Score: permit valuation (project size proxy) × stage (issued = construction started) ×
   type match (restaurant/office/gym/church) × timing (acoustics installs near end of
   fit-out).
4. Weekly digest: 10–20 ranked leads, each with business name, address, project size,
   the decision-maker or GC from the permit, and one sentence of "why now."
5. Shared tracking sheet, updated by both sides: contacted → quoted → won/lost → value.
   This sheet IS the product's future pricing data. Non-negotiable.

**The agreement (written, even with a friend):** 10% of contract value on closed jobs
originating from delivered leads, paid when the customer pays, 12-month attribution
window, leads timestamped in the tracking sheet as the attribution record. Written not
because of distrust — because the pilot data has to be clean to price the real product.

**Build note:** the existing stack already covers this — Supabase for the events tables,
edge functions + scheduled standing orders for the nightly scrape, the approval queue for
outbound digests. v1 is a scraper, three tables, a scoring query, and an email. No graph
database, no prediction engine. Postgres is enough for years.

**Success gate at 90 days:** buddy quotes ≥30% of delivered leads and closes ≥2 jobs
attributable to the feed. If leads don't convert better than what he does today, stop and
fix lead quality before doing anything else — nothing downstream works without this.

---

## 4. Scale path — same event, more trades

The key economic fact: **one "new restaurant" event feeds a dozen trades** — acoustics,
signage, security systems, commercial cleaning, POS, coffee service, plants, waste
removal, uniforms, hood cleaning, pest control. The scraping cost is already paid; each
new trade is a new filter and a new customer list on the same pipeline.

**Pricing for strangers (post-pilot):** flat subscription, $250–$500/month per contractor
per metro, positioned as "Dodge, but only your trade, pre-qualified, with the decision-
maker's name." Undercuts ConstructConnect, sits at/above Dodge's metro price, and is far
below the $150+/lead agencies charge. Exclusive-lead upsell later ($100–300/lead) once
close-rate data supports it.

**Expansion order:** 2nd and 3rd trades in the home metro (signage and security are the
easiest sells — same events, visual proof) → same trades in 2–3 more metros with open-data
portals → only then think about the intelligence-layer products from the vision doc.

---

## 5. Honest revenue model

**Commission-only, buddy-only (the original idea, measured):**
1–3 closed jobs/month × $8k–10k average × 10% = **$800–$3,000/month ≈ $10k–36k/yr.**
Good side income, proof-of-concept fuel — not a company. This is the ceiling of pure
commission with one client, and why the model converts to subscriptions.

**Year 1 (pilot + first subscribers):** buddy commission + 5–10 subscribers at
$250–500/mo → **$30k–70k total.** Realistic if the pilot converts; mostly earned in H2.

**Year 2–3 (it's working):** 40–60 subscribers across 3–4 trades and 2–3 metros →
$10k–25k MRR → **$120k–300k/yr.** This is the "quit ambiguity" milestone. Assumes
SMB-lead-gen churn (3–8%/month) is fought with visible close-rate reporting.

**Year 3–5 (the long shot):** 200+ subscribers, several metros, data/API licensing
starting → **$500k–1.2M ARR.** At this point the "commercial graph" vision stops being a
document and starts being a roadmap.

**Failure mode, stated plainly:** permit data is public and non-exclusive — anyone can
look. If the filtering/timing/contact layer doesn't make leads measurably better than
Dodge or word-of-mouth, this stalls at side-project income. The entire bet is that
vertical-specific curation beats generic firehoses. The 90-day pilot exists to test
exactly that for a few hundred dollars of effort.

---

## 6. Next actions (in order)

1. Confirm the metro and get the buddy's yes on a written 10% referral agreement.
2. Inventory that metro's data sources (permit portal type, liquor board, health dept).
3. Build the scraper + events table + scoring query (weekend-scale project on this stack).
4. Ship digest #1. Start the tracking sheet the same day.
5. At day 90: compute close rate and revenue-per-lead → set subscription price → pitch
   the next two trades using the buddy's numbers as the case study.

---

## Sources

- [Shovels pricing structure](https://docs.shovels.ai/docs/knowledge-base/getting-started/pricing-structure) · [Shovels API](https://www.shovels.ai/api) · [Permit API pricing compared](https://permit-stack.com/blog/building-permit-data-api-pricing-compared.html)
- [Dodge vs ConstructConnect pricing](https://constructionbids.ai/blog/dodge-vs-constructconnect-comparison) · [ConstructConnect pricing guide](https://bidfinds.com/blog/constructconnect-pricing-guide-2025)
- [Roofing lead costs (ActiveProspect)](https://activeprospect.com/blog/roofing-leads-cost/) · [HVAC pay-per-lead guide](https://bullseyeinternet.com/hvac-pay-per-lead-guide/) · [B2B roofing lead packages](https://b2broofingsales.com/tiers/)
- [Office acoustic panel costs](https://yuhengwpc.com/office-acoustic-panels-cost/) · [Restaurant acoustic panel costs](https://performance-acoustics.com/blog-restaurant-acoustic-panels/) · [Acoustic panel pricing guide](https://acousticsoundpanels.com/pages/how-much-do-acoustic-panels-cost-faq)
- [Finder's fee guide (ReferralHero)](https://referralhero.com/blog/finders-fees) · [Consulting referral fees](https://www.consultingsuccess.com/consulting-referral-fees) · [Calculating finder's fees](https://referralrock.com/blog/finders-fees/)
- [Commercial bid win rates](https://4bt.us/construction-bid-win-percentage/) · [Bid win rate improvement guide](https://constructionbids.ai/blog/construction-bid-win-rate-improvement-guide)
- [2025 new restaurant openings report](https://restaurantdata.com/2025-new-restaurant-openings-report/) · [Denver 2025 openings](https://www.westword.com/food-drink/over-300-restaurants-and-bars-opened-in-denver-in-2025-40824433/) · [Twin Cities 2025 openings](https://www.startribune.com/minneapolis-st-paul-restaurant-openings-2025/601533634)
- [Socrata multi-city permit scraper](https://apify.com/bujhmml/building-permits-scraper) · [US building permit scraper](https://apify.com/handstands.io/us-building-permit-scraper) · [San Diego open data example](https://data.sandiego.gov/datasets/development-permits/)
- [Sales commission rates by industry](https://www.captivateiq.com/blog/sales-commission-rates-by-industry) · [Construction sales commission guide](https://www.everstage.com/sales-commission/construction-sales-commission)
