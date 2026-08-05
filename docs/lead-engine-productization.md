# Turning the Lead Engine into something people will pay for

Written 2026-08-05, after the environment's egress policy opened and every preset was checked
against the live city portals for the first time. Everything in the "what we have" section is
**measured**, not estimated — the queries are reproducible against the same public endpoints.
Everything in the "what the market pays" section is cited.

The question this answers: *we have data — is any of it sellable, and as what?*

---

## 1. What we actually have

### Volume, measured 2026-08-05

Eight live feeds, counting only records that clear each preset's own commercial/residential filter,
over the trailing seven days:

| feed | permits/week | has phone | has name/company | has $ value | scoring ≥70 |
|---|---|---|---|---|---|
| NYC (DOB NOW) | 1,463 | 0% | 100% | 100% | 1,448 |
| Austin residential | 614 | 95% | 95% | 26% | 215 |
| Chicago residential | 407 | 0% | 100% | 100% | 383 |
| Austin commercial | 308 | 94% | 95% | 19% | 274 |
| Chicago commercial | 153 | 0% | 100% | 100% | 144 |
| San Francisco | 103 | 0% | **0%** | 100% | 88 |
| Seattle res + comm | 107 | 0% | ~10% | 100% | 102 |
| **total** | **3,155** | 873 | — | — | 2,654 |

~164,000 records a year. This is not a data-volume problem.

### Refresh cadence — the one axis where we already beat the incumbents

Our clock is **hourly**. Shovels — the best-funded developer API in this space, 130M+ permits
across 1,800+ jurisdictions — **refreshes on the 1st and 15th of the month**.[^shovels] Construction
Monitor is a daily-report service; PermitStack refreshes daily at 03:00 UTC.[^ledger]

That gap is the whole thesis. It is worth something because of what the trade itself believes about
response time:

- **78% of customers buy from the company that responds first** — not the cheapest, not the most
  experienced.[^speed]
- Responding within 5 minutes makes a contractor **10× more likely to close** than waiting an hour.
- Median first-response time in home services is **42 minutes**, and only **12% of contractors**
  consistently respond within 5 minutes.[^speed]

A lead that is up to fifteen days old cannot be sold on speed. Ours can.

### The follow-on clock — measured, and the most interesting thing we own

Austin publishes a `masterpermitnum` linking a job's trade sub-permits to its master Building
Permit. Grouping by the permit-number base (`2025-118161 BP` / `2025-118161 MP` are one job) over
**29,607 commercial permits across 24 months**, for the **3,245 master Building Permits issued
Aug-2025 → Jun-2026**:

| trade sub-permit | share of BP jobs | median lag | p25 | p75 | p90 | pulled same day |
|---|---|---|---|---|---|---|
| Electrical | **45%** | **15 d** | 4 d | 53 d | 98 d | 10% |
| Plumbing | 33% | 22 d | 5 d | 60 d | 126 d | 8% |
| Mechanical | 30% | 19 d | 5 d | 55 d | 113 d | 9% |

**50% of commercial Building Permits produce at least one trade sub-permit. 43% give three or more
days' notice before it is pulled.**

Read commercially: when a commercial Building Permit is issued, there is a **45% chance an
electrical sub-permit follows, typically about two weeks later**. Every competitor sells that
electrical job *when the electrical permit appears*. We can sell it **on the day the Building
Permit lands** — roughly a two-week head start on a lead nobody else knows exists yet.

⚠️ **State the spread honestly when selling it.** p25–p75 is 4–53 days for electrical. This is a
*warm window*, not an appointment: "this job will need an electrician in the next few weeks," which
is how a contractor thinks anyway. Claiming precision we do not have would be the fastest way to
lose the first customer.

⚠️ **This is measured on Austin only**, because Austin is the only preset publishing a master/child
link. Chicago, SF and Seattle do not; NYC's DOB NOW has `job_filing_number` which should support the
same analysis and has not been run yet.

### The contractor map — real, but needs one fix first

Austin, trailing 12 months: **4,992 distinct contracting firms**, of which **1,000 pulled 5 or more
permits**. The head of the distribution:

```
1,206  IES Residential, Inc.
  737  Victory Plumbing Company
  729  Texas Multifamily Solution, LLC
  673  Radiant Plumbing & AC
  670  In Charge Electrical Services, LLC
  621  Stan's Heating, Air, Plumbing, & Electrical
```

**The names are not normalized.** `IES Residential, Inc.` (1,206) and `IES Residential Inc` (472)
are one firm counted twice; so are `Radiant Plumbing & AC` (673) and `Radiant Plumbing and Air
Conditioning` (575). Every count above is understated. Name folding is a prerequisite for selling
this, not a polish item.

### What we do not have

| gap | severity | note |
|---|---|---|
| **Email addresses** | blocking | **Zero, on all five portals.** Our entire send path is email. |
| Phone outside Austin | high | 873 of 3,155 weekly leads are directly callable, all Austin. |
| Company name normalization | medium | Blocks the contractor-map product. Contained fix. |
| Master/child links outside Austin | medium | Blocks the follow-on product elsewhere. NYC likely supports it. |
| Job value on Austin | low | Only 19–26% state one. Deliberately left null — see below. |

**On Austin's missing values:** Austin publishes per-discipline valuations that would raise coverage
from 22% to 56%, but summing them reconciles to Austin's own published total in only **59 of 121**
sampled rows. A derived figure that disagrees with the source half the time is exactly the guess the
verbatim rule forbids. Left null.

---

## 2. What this market actually pays

| what is sold | price | who sells it |
|---|---|---|
| Shared consumer lead (roofing, HVAC, remodel) | **$20–150 per lead** | Angi, HomeAdvisor, Thumbtack, Networx[^cpl] |
| Permit-based *exclusive* leads | **$149/mo flat** | PermitGrab[^cpl] |
| Commercial construction lead intelligence | **$150–800/mo** (FL: $400–1,200) | Mercator.ai and similar[^merc] |
| Permit data subscription | **$200–800/mo**, annual terms | Construction Monitor[^ledger] |
| Permit data platform | **$500–2,000+/mo**, annual | BuildZoom[^ledger] |
| Developer permit API | **~$599/mo** entry, sales-gated | Shovels[^shovels] |
| Full-service lead-gen retainer | **$3,000–15,000/mo**, 3–6 mo minimum | agencies[^cpl] |

The economics that make permit data attractive versus marketplace leads: a **$40 shared
HomeAdvisor lead at a 4% close rate costs $1,000 per booked customer**, while a **$149/month
permit subscription closing 3 deals costs ~$50 per customer**.[^cpl] That 20× spread is the pitch,
and it is not ours — it is the category's, already proven by someone else's customers.

**Enrichment costs**, for the email/phone gap: $0.01–0.15 per matched field; one vendor prices an
email at 1 credit and a phone at 10.[^enrich] At 3,155 records/week, appending an email to
everything is roughly **$30–500/month** depending on vendor and match rate. That is not a blocker;
it is a line item.

**The manufacturer/distributor buyer is real and underserved.** Permits precede construction by
weeks to months, so suppliers use them to forecast branch-level demand 30–90 days ahead and place
inventory before the wave.[^bz] PermitCore already sells exactly the contractor-ranking product
described above — "contractors pulling permits ranked by volume, value, and momentum scoped to
specific metros."[^bz] That is validation, not a warning: someone is charging for the artifact we
can already produce.

---

## 3. Three products, in the order they should be built

### A. The trade lead — *the thing already built*

One scored permit, delivered to one contractor, in one trade, in one city.

- **Sell at:** $149–299/mo per contractor per trade per metro, flat. Match PermitGrab's shape;
  don't invent a pricing model in a market that has already settled on one.
- **Ready today in:** Austin only — 922 permits/week with a 94% phone rate.
- **Blocked elsewhere by:** no email, no phone. NYC is 46% of total volume and currently unsellable
  as a *call-this-person* product.
- **Honest ceiling:** this is a commodity. It is the same permit everyone else has, delivered
  faster. Fine as a first dollar; it will not be the business.

### B. The follow-on alert — *the differentiated product*

Fires on the **master Building Permit**, not the trade permit. "A commercial building permit was
issued at 616 E 6TH ST on Aug 5. Jobs like this pull an electrical sub-permit about 15 days later,
45% of the time. Here is the GC and their phone number."

- **Sell at:** $299–599/mo. Above the commodity lead, below Mercator's commercial tier, because
  we're selling timing rather than a full bidding workflow.
- **Why it defends:** it cannot be copied by scraping the same portal. It requires the historical
  corpus and the master/child join. Nobody in the researched set sells permit-to-permit timing —
  the search space is entirely physical trade sequencing (framing → rough-in), not derived
  prediction.
- **Build cost:** small. `permittedTrade`, `isFollowOnTrade` and `FOLLOW_ON_BONUS` already exist in
  the scoring core; what they lack is the *measured window*.
- **Requires:** master/child links. Austin has them. NYC needs verifying.

### C. The market map — *the highest-value, slowest sale*

"The 40 GCs doing commercial fit-outs in Austin, ranked by permit volume and stated job value, with
contacts and 12-month momentum."

- **Sell at:** $500–2,000/mo, annual — the BuildZoom/Construction Monitor band, because that is the
  band this buyer already budgets in.
- **Buyer:** manufacturers, distributors, suppliers. **This is the acoustic-panel-company shape** —
  they do not want one lead, they want to know who to call on.
- **Blocked by:** company name normalization. Non-negotiable; the numbers are wrong until it's done.
- **Sales reality:** longest cycle of the three, and needs a named reference customer. Do not start
  here.

---

## 4. The sequence

1. **Normalize company names.** Cheapest fix on the list, unblocks product C, and immediately
   improves B (identifying the GC on a job).
2. **Append email.** Zero portals publish one and the entire send path needs one. $30–500/mo.
   Without this there is no automation, only a list.
3. **Ship the follow-on window** using the measured Austin numbers. It is the only thing here a
   competitor cannot replicate from the same public source.
4. **Verify the master/child join on NYC.** 1,463 permits/week is 46% of total volume; if DOB NOW's
   `job_filing_number` behaves like Austin's `masterpermitnum`, product B doubles in reach.
5. **Only then** add cities. Eight feeds already produce more than one person can sell.

**Do not build more scrapers.** The constraint is not supply.

---

## 5. What would falsify this

Written down so it can be checked rather than argued:

- If a contractor will not pay for a two-week head start on a 45%-likely job, product B is dead and
  this is a commodity lead business competing on price with PermitGrab at $149.
- If the follow-on window does not hold outside Austin, product B is a single-city product.
- If email append match rates on contractor businesses come in under ~40%, the automation thesis
  fails and this stays a phone business — which means Austin, and only Austin, until phone data is
  bought.

Each is answerable with one experiment, and none of them require building anything first.

---

[^shovels]: Shovels API — 130M+ permits, 1,800+ jurisdictions, 2.3M+ contractor profiles; entry
pricing publicly reported ~$599/mo, sales-gated; **data refreshes on the 1st and 15th of each
month**. <https://www.shovels.ai/api>
[^ledger]: Provider comparison — Construction Monitor ~$200–800/mo on annual terms; BuildZoom
$500–2,000+/mo annual; PermitStack daily refresh at 03:00 UTC.
<https://permitledger.com/blog/building-permit-database-comparison>
[^speed]: Speed-to-lead statistics — 78% buy from the first responder; 5-minute response = 10× close
rate; median home-services first response 42 minutes; only 12% respond within 5 minutes.
<https://www.forbes.com/councils/forbesagencycouncil/2025/11/21/speed-to-lead-the-most-profitable-kpi-for-contractors/>
and <https://pushleads.com/how-contractor-lead-response-time-is-killing-your-conversions-and-the-5-minute-f/>
[^cpl]: Cost-per-lead by platform, permit-based subscription pricing, agency retainers, and the
$1,000-vs-$50 cost-per-booked-job comparison.
<https://permitgrab.com/blog/how-much-do-contractor-leads-cost> and
<https://constructionleadpro.com/how-much-do-construction-leads-cost/>
[^merc]: Commercial construction lead intelligence subscription bands.
<https://www.mercator.ai/articles/construction-lead-generation-pricing-florida-2026>
[^enrich]: B2B enrichment pricing — $0.01–0.15 per matched field; email 1 credit vs phone 10.
<https://www.cleanlist.ai/blog/2026-03-31-best-data-enrichment-tools-2026>
[^bz]: Manufacturers and distributors using permit data to forecast demand 30–90 days ahead;
PermitCore selling contractor rankings by volume, value and momentum.
<https://www.buildzoom.com/blog/how-real-time-permit-data-is-reshaping-construction-sales-for-manufacturers-and-distributors>
and <https://permitcore.io/>
