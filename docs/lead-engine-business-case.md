# Will this actually make money, and how?

Written 2026-08-05. The honest version, including the part where the obvious plan probably fails.

Everything under "measured" was pulled from the live portals today. Everything under "market" is
cited. Where I am guessing, it says so.

---

## The short version

**Selling permit leads will probably not work.** Not because the data is bad — it is good, and it
is now correct — but because the buyer's problem is not a shortage of leads, and the competitor
who *is* funded to win that fight has 20,000 jurisdictions to our five.

**Selling permit leads plus the response to them is a different business, and nobody sells it.**
That one is worth roughly 4–10× per customer, churns far less, and the platform is already built.
The permit engine stops being the product and becomes the fuel that makes the platform valuable on
day one instead of month six.

The constraint is not data. It is distribution — and we happen to already own the prospect list.

---

## 1. The market, with numbers

**Size is not the problem.** The 2017 Economic Census counted ~**648,000 specialty trade contractor
establishments** in the US — electrical, plumbing, HVAC, roofing, framing, painting — against
~272,000 building-construction establishments.[^census] Plumbing/HVAC alone (NAICS 238220) was
104,776 businesses as of 2020. At even 0.01% penetration that is 65 customers.

**What the category charges:**

| product | price | who |
|---|---|---|
| Shared consumer lead | $20–150 each | Angi, HomeAdvisor, Thumbtack, Networx[^cpl] |
| Permit-based exclusive leads | **$149/mo** | PermitGrab[^cpl] |
| Commercial lead intelligence | $150–800/mo | Mercator.ai[^merc] |
| Permit data subscription | $200–800/mo, annual | Construction Monitor[^ledger] |
| Permit data platform | $500–2,000+/mo, annual | BuildZoom[^ledger] |
| Developer permit API | ~$599/mo entry | Shovels[^shovels] |
| **AI receptionist / answering** | **$25–899/mo, most pay $49–150** | My AI Front Desk, Rosie, AgentZap, Smith.ai[^recept] |
| Lead-gen agency retainer | $3,000–15,000/mo | agencies[^cpl] |

**What the competition actually is.** Shovels — the best-funded pure play — has raised **$7.64M
total since 2022** and processes 180M permits across **all 20,000 US permit jurisdictions**.[^shov2]
We have five cities. On coverage this is not a fight; it is a rout. Note also what that funding
number says about the category: $7.6M over four years is not a rocket ship. Nobody is getting rich
selling permit rows.

---

## 2. Why selling leads probably fails

This is the finding that should change the plan, and it is not about us:

> **The average contractor loses 40–60% of the leads they already generate.**[^loss]
> Most contractors lose 50%+ to slow follow-up, missed calls and broken handoffs.
> Contractors "often don't have a lead generation problem but rather have a lead response
> problem."

Alongside:

- **78% of customers buy from whoever responds first** — not the cheapest, not the most
  experienced.[^speed]
- Respond within 5 minutes and you are **10× more likely to close** than at one hour; within 5
  minutes vs 30 minutes is **21× more likely to qualify**.[^loss]
- Median first-response time in home services is **42 minutes**. Only **12% of contractors**
  consistently answer within five.[^speed]

Put those together and the lead-selling business has a structural defect:

1. We sell a contractor 40 permits a month.
2. They work maybe half, slowly.
3. They close few, because they answered on day three and someone else answered on day one.
4. They conclude *the leads were bad* and cancel — sometimes eating a cancellation fee up to 35%
   of the annual contract to get out.[^loss]

We would be selling a genuinely good product into a workflow that cannot metabolise it, and taking
the blame when it does not convert. That is the documented failure mode of the entire category, and
being faster and more accurate than PermitGrab does not fix it. **It makes it worse** — the
follow-on window's whole value is a 15-day head start, and a contractor who takes three days to
call has already spent 20% of it.

**The differentiated data only pays off if something acts on it quickly. A human contractor will
not. That is the argument.**

---

## 3. What we actually have that nobody else does

The Lead Engine was built inside a platform that already does the other half. Checked in the repo,
today:

| capability | module | what it does |
|---|---|---|
| Missed-call text-back | `missedCall.ts` | Texts back within seconds when the business line goes unanswered — described in its own header as "the single highest-value automation for local trades" |
| SMS channel | `sms.ts` | Second delivery channel; converts far better than email for local trades |
| Online booking | `booking/schedule.ts` | Open slots + slot legality, so a reply can become an appointment |
| Answering desk | `assist.ts` | Drafts a reply from the world's knowledge base, with an honesty gate |
| Approval queue + one send path | `execution`, `send-email` | Nothing goes out unreviewed |
| Standing orders on a 15-min tick | `standingRun.ts` | Work happens with the laptop closed |
| ROI proof for the sale | `automationStats.ts` | The stats that sit next to the price |

Now look at the competitive set again:

- **Shovels** sells data to developers. No outreach, no response, refreshes twice a month.
- **PermitGrab** sells a list at $149. No response layer.
- **AI receptionists** ($49–150/mo) answer *inbound* calls. **They have no lead source at all.**
- **Jobber**, the dominant field-service platform for home services, **does not sell a native AI
  receptionist as of 2026**.[^recept]

Nobody sells *a source of jobs and the thing that works them*. That gap is not a marketing angle;
it is the literal seam between two funded categories.

---

## 4. The product, and what it is worth

**"Permits in your city, worked for you."** The engine finds the job the hour it is filed; Garvis
texts and emails the contact, drafts the reply when they answer, and books it. The contractor sees
appointments, not a spreadsheet.

**Price anchor matters more than the number.** At $149 the buyer compares us to a lead list and we
lose to Shovels' coverage. At **$500–1,500/mo** the buyer compares us to *hiring someone* — a
part-time salesperson is $3,000–4,000/mo loaded — and we win that comparison easily. Same product,
different shelf.

Sanity ladder (my estimate, not measured):

| customers | price | monthly | annual | realistic when |
|---|---|---|---|---|
| 10 | $500 | $5,000 | $60k | ~90 days, solo, one metro |
| 50 | $600 | $30,000 | $360k | 12–18 months, still mostly solo |
| 200 | $750 | $150,000 | $1.8M | needs a real sales function |

The first row is the only one worth planning against right now. The others are arithmetic, not a
plan.

**Why churn should be better than the category's:** a list is a cost line the contractor cuts in a
slow month. Something that answers their phone and books their calendar is operational
infrastructure they cannot cancel without visibly breaking something. That is the whole reason to
sell the combination rather than the data.

---

## 5. The real constraint: distribution — and we already own the answer

We do not have a data problem. We have a *"how do fifty contractors find out this exists"* problem.
That is what kills solo products, not missing features.

**The contractor map is the prospect list.** Measured on Austin, trailing 12 months:

- **4,992 distinct contracting firms** pulled a permit
- **1,000 of them pulled 5 or more** — real businesses, not a guy with a truck
- **94% of Austin permits publish the contractor's phone number**

We can find our own customers with our own engine, and reach them through our own send path. The
pitch is the demo:

> "You pulled 47 permits in Austin this year — I found you the same way I find your jobs.
> Three commercial buildings were permitted in your trade this week. Want them?"

That is not a cold email. It is a proof of the product, delivered by the product, and it costs
nothing per prospect. **This is the highest-leverage thing available and it requires no new code —
point a market at contractors instead of at end customers.**

---

## 6. What kills this

Ranked by how likely I think each is:

1. **Distribution never happens.** The engine runs, the data is right, nobody is ever asked to pay.
   This is the default outcome of every technically-good solo product and it is the risk to
   actually manage.
2. **Selling the list instead of the outcome.** Lands at $149, churns in three months when the
   contractor does not work the leads, and the differentiated timing signal is wasted on a buyer
   who cannot act inside the window.
3. **Chasing coverage.** Adding cities to compete with Shovels' 20,000 jurisdictions. Unwinnable,
   and every city added is maintenance forever. Eight feeds already produce 3,155 permits a week —
   more than one person can sell.
4. **Email dependence.** No public source publishes contractor emails — verified across five permit
   portals and four licensing registries, zero email columns anywhere. The send path assumes email.
   Phone-first is not a workaround; it is the correct design, and the speed-to-lead research says
   the same.
5. **Support load.** Fifty contractors on a platform that texts their customers is a real support
   surface for one person. This is a good problem, and it arrives sooner than expected.

---

## 7. What I would do, in order

1. **Point a market at Austin contractors** — the map is built, the phones are there. Use the
   engine to build the prospect list for the engine.
2. **Sell the combination, not the list.** $500+/mo, framed against hiring, with the follow-on
   window as the reason the contractor hears about a job before their competitor does.
3. **Get to ten paying customers before building anything else.** Ten proves price, message,
   churn and support load — every number in §4 is a guess until then.
4. **Then** decide: more cities, more automation depth, or the manufacturer/supplier market map.
   Ten customers will make that obvious. Nothing before them will.

**Explicitly not now:** more scrapers, more trades, email vendors, the market-map product. All
defensible later; all a way of avoiding step 3 today.

---

## 8. How to check whether I am wrong

- If ten contractors will not pay $500/mo for leads-plus-response, the combination thesis is dead
  and this is a $149 list business competing with PermitGrab on price.
- If contractors *will* pay for the list alone at $149+ and stay past 90 days, §2 is wrong and the
  simpler business is the better one — build coverage, not automation.
- If the follow-on window does not convert better than an ordinary permit lead, the differentiation
  is theoretical and price has to come down.

Each is answerable with phone calls, not code.

---

[^census]: 2017 Economic Census — ~648,000 specialty trade contractor establishments;
NAICS 238220 (plumbing/HVAC) 104,776 businesses as of 2020.
<https://www.bls.gov/iag/tgs/iag238.htm> · <https://naicslist.com/naics/238220>
[^cpl]: Cost per lead by platform, PermitGrab's $149/mo, agency retainers, and cancellation fees up
to 35% of the annual contract. <https://permitgrab.com/blog/how-much-do-contractor-leads-cost> ·
<https://constructionleadpro.com/how-much-do-construction-leads-cost/>
[^merc]: Commercial construction lead-intelligence subscription bands.
<https://www.mercator.ai/articles/construction-lead-generation-pricing-florida-2026>
[^ledger]: Construction Monitor ~$200–800/mo annual; BuildZoom $500–2,000+/mo annual.
<https://permitledger.com/blog/building-permit-database-comparison>
[^shovels]: Shovels — ~$599/mo entry, sales-gated; refreshes on the 1st and 15th of each month.
<https://www.shovels.ai/api>
[^shov2]: Shovels raised $7.64M total ($1.07M seed + $6.57M Series A), founded 2022, 180M permits
across all 20,000 US permit jurisdictions.
<https://tracxn.com/d/companies/shovels/__jzIhWYTInxg_TRix7B2pLFXZ237f5SHISuFrjB1z91w>
[^loss]: Contractors lose 40–60% of the leads they already generate; 5-minute vs 30-minute response
is 21× more likely to qualify; contractors have a response problem, not a lead problem; cancellation
fees up to 35% of the annual contract.
<https://fatcatstrategies.com/podcast/why-contractors-lose-30-50-of-their-leads-without-realizing-it/>
· <https://instantsalesfunnels.com/contractor-leads/>
[^speed]: 78% buy from the first responder; 5-minute response = 10× close rate; median home-services
first response 42 minutes; only 12% answer within five.
<https://www.forbes.com/councils/forbesagencycouncil/2025/11/21/speed-to-lead-the-most-profitable-kpi-for-contractors/>
[^recept]: AI receptionist pricing $25–899/mo, most small businesses pay $49–150; Jobber does not
sell a native AI voice receptionist as of 2026.
<https://agentzap.ai/blog/ai-receptionist-pricing-complete-guide-2026> ·
<https://answeringagent.com/blog/top-6-ai-receptionist-services-for-small-businesses>
