# Lead Engine — The Capture Specification

**What we must capture at scrape time, what we can derive later, what we can buy later, and what we
will deliberately never build.**

Companion to `lead-engine-master-plan.md` (the thesis), `lead-engine-data-plan.md` (the enrichment
economics), and the audit of the shipped system. This doc is the decision record for the one-time
scrape architecture. The owner's framing was correct: *"this is the golden opportunity to add
anything we need — we have to get this right if we're going to take the time to scrape this."*

---

## 0. Honesty preamble — read before you cite anything here

The upstream research was conducted in environments where **the egress proxy blocked every data
portal and vendor domain** (403 CONNECT on `data.cityofchicago.org`, `data.cityofnewyork.us`,
`data.sfgov.org`, `data.austintexas.gov`, `data.seattle.gov`, `api.shovels.ai`, `attomdata.com`,
`regrid.com`, `clay.com`, `abc.ca.gov`, and others). Only `raw.githubusercontent.com` and web
search were reachable, and in one pass the search budget was exhausted (200/200) before work began.

Consequently:

- **Schemas below were reconstructed** from committed DDL, captured metadata JSON, production ETL
  code in third-party repos, and search-result summaries — **not from a live API call.**
- **Only Shovels was verified from primary source** (the official `github.com/ShovelsAI/shovels-docs`
  repo was cloned and read). Dodge, ConstructConnect, BuildZoom, Convex, Building Radar, PermitFlow
  and Construction Monitor figures are search-summary only.
- **Only two prices are primary-source verified**: Shovels intro tier at **$599/month** (their own
  docs) and Regrid at **$200 per county** for the full Premium spreadsheet. Every ATTOM, Cotality
  and LightBox number found was third-party and mutually contradictory — do not budget against them.
- **Per-trade economics research returned nothing.** Job value, sales cycle, contract term and LTV
  for 12 of our 13 trades were not obtained. The only sourced trade figure in the whole corpus is
  acoustics (~$6.50–20/sq ft installed, blended commercial job $5k–12k).

**Before writing any `field_map`, re-validate the dataset against its live
`https://<portal>/api/views/<id>/columns.json`**, which returns `fieldName`, `name`,
`dataTypeName` and `description` for every column. That single call is cheaper than any
assumption in this document.

Fields marked ⚠️ below are explicitly unverified and need a live check before they are hard-coded.

---

## 1. The one-paragraph verdict

The engine is currently **structurally incapable of capturing the most valuable data in the corpus**,
and it is losing that data every hour it runs. Three defects compound: the dedupe key
(`type :: address :: month`, `leadEngine.ts:158-162`) collapses distinct permits at one address;
`ignoreDuplicates: true` (`lead-ingest/index.ts:186`) means a record is never updated once seen; and
`normalizeEvent` (`adapters.ts:208-242`) has exactly nine field-map slots, none of which is a permit
number, a status, a coordinate, a parcel id, or a square footage. Meanwhile the server-side
`where`-clause and `min_valuation_usd` floor discard rows **before persistence**, permanently.
The fix is not more sources — it is **a wider normalized row, a real record identity, an append-only
observation history, and an ingest run log**. All four are near-free at scrape time and
*impossible to reconstruct later*. Everything else on the wish list can wait.

---

## 2. The three buckets

| Bucket | Definition | Rule |
|---|---|---|
| **CAPTURE-NOW** | Data that is destroyed at the source, or that costs ~nothing to take while we already have the row open. Missing it = permanently lost. | Ship before adding a single new city. |
| **DERIVE-LATER** | Computable from what we store, with no external dependency. | Build when a customer's ranking depends on it. Never blocks a scrape. |
| **BUY-LATER** | Paid enrichment against a stable key. The data does not move; the price does. | Buy per-lead, score-gated, at delivery time. Never at ingest. |

The strategic asymmetry, stated plainly: **roughly half of the fields in the research are
recoverable at any future date and half are not.** Static reference data (assessor attributes, APN,
FIPS/CBSA, license registries, firmographic and consumer appends, every rollup we can recompute) can
safely wait forever. **Point-in-time and state-transitional data cannot be backfilled at any price**:
permit status transitions, open bid windows, pending-license states, per-jurisdiction ingestion lag,
contact `last_seen` timestamps, and every freshness-derived field. Anything time-stamped or
state-transitional gets captured now even if nothing reads it yet.

---

## 3. CAPTURE-NOW

Ordered by irreversibility × cost-to-add. Everything in this section is free — it is already in the
HTTP response we are already paying for.

### 3.1 Record identity — the single most damaging omission

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `source_record_id` | The permit/licence number. Without it: no join to any other dataset, ever; no way to detect that a row we hold was **updated**; no reconciliation against a re-scrape; no parent/child linkage. Every future backfill would have to re-derive identity from a truncated address string. | Austin `permit_number`; Seattle `permitnum`; SF `permit_number`; Chicago `permit_`; NYC `job__`; DC `PERMIT_ID`; Nashville `Permit__` | New column on `le_events` + new `field_map` key |
| `parent_record_id` | Collapses trade sub-permits into one project. Permit feeds systematically over-count: one commercial job emits five to ten rows and our address+month key does **not** catch them because the permit numbers differ. Three cities publish the collapse key. | Austin `master_permit_num` / `project_id`; Seattle `parentpermitnum`; NYC `job__` (job-level) + `permit_sequence__` | New column + `field_map` key |

**This is also the dedupe fix.** See §6.

### 3.2 Lifecycle state — destroyed at the source, hourly

Permit status, stage, review milestones, inspection results and corrected valuations are
**overwritten in place** by the portals. We store one frozen snapshot with no history and no anchor
to re-find the row. Every transition that happens between our observations is destroyed upstream and
**cannot be recovered by any future re-scrape.** This is the largest irreversible class in the whole
audit — every duration, funnel, stage and pass-rate metric depends on transitions we are discarding
right now.

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `record_status` (verbatim) + `status_normalized` | Distinguishes "about to build" from "already done" — the #1 complaint in contractor forums about BidClerk/Constructalead is being sold already-awarded work. Normalize to a 4-state ladder (`in_review` / `active` / `final` / `inactive`), keeping the raw string. | Austin `status_current`; Seattle `statuscurrent`; SF `current_status`; Chicago `permit_status` + `permit_milestone` ⚠️ | New columns + `field_map` key |
| `status_date` | **The poll key.** Re-query `status_date > cursor` and you get every permit whose stage moved since the last tick, regardless of permit age. Without it, `permit_stage_change` is impossible. | Austin `statusdate`; SF `current_status_date`; Seattle status fields | New column + a second source row per city (`poll_mode='status'`) |
| `applied_at` | The earliest permit signal — **1–6 months ahead of issuance** for commercial plan review. Paired with `issued_at` it yields per-jurisdiction plan-review duration, which lets us *forecast* the rough-in date for permits still in review. Chicago publishes `processing_time` directly. | Austin/Seattle `applieddate`; SF `filed_date`; Chicago `application_start_date`; LA `submitted_date`; NYC DOB NOW `filing_date` | New column + `field_map` key |
| `issued_at`, `approved_at`, `completed_at`, `expires_at` | Nine-point lifecycle. `completed_at` is the close-out proxy that triggers janitorial / pest / signage / POS. `expires_at` powers an **expiring-permit reactivation** product: the owner must renew or forfeit — high urgency, trivially explained, and it needs no new source, just a second query over data we already hold. | All five wired cities publish most of these | New columns + `field_map` keys |
| `occurred_kind` | Says *which* date `occurred_at` came from. Today `occurred_at` is an unlabelled slot that eight different dates compete for — a filed date and a final date are indistinguishable once stored. | Derived at normalize time | New column |

> **The highest-leverage change available and it costs nothing in new infrastructure:** the engine
> cursors on **issue** dates, the latest possible moment to learn about a job. Every major portal
> publishes an earlier date on the same row. Switching the cursor field — or adding a second `filed`
> event type — buys months of lead time with zero new integrations.

### 3.3 Geography and parcel — free in the row, unlocks everything downstream

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `lat`, `lon` | Radius/territory assignment — the standard way lead-gen prices by ZIP/radius and prevents two customers getting the same lead. **Also mandatory for the storm overlay**, which is the highest-price vertical in contractor lead gen. Every dataset audited carries lat/lng except Philadelphia. | Chicago `latitude`/`longitude`; NYC `gis_latitude`/`gis_longitude`; Austin/Seattle/LA/SF `latitude`/`longitude` | New columns + `field_map` keys. **Also fix `parseRows` (`adapters.ts:174`) — ArcGIS geometry is discarded before `raw` is written.** |
| `parcel_id` | The join key to county assessor data: building sqft, year built, owner of record, assessed value, last sale. This is how a thin permit row becomes a scored lead without paying a vendor. | Austin `tcad_id`; LA `apn`/`pin_nbr`; NYC `bbl`; SF `block`+`lot`; Philadelphia `opa_account_num`; Boston `parcel_num`; DC `SSL`. **Chicago `ydr8-5enu` has none** — plan to geocode-and-spatial-join instead. | New column + `field_map` key |
| `jurisdiction` (stable slug) | `le_events.region` is a free-text human label (`app_0129:59`) used as the join for market rollups and for auto-pitch city matching via `regions.find(r => r.startsWith(biz.city))` (`index.ts:407`). That is a string prefix test standing in for a foreign key. | Assigned per source row | New column on `le_sources` and `le_events` |
| `city`, `state`, `postal_code`, `unit` | `le_events.address` is one text blob. The NYC and Chicago `address_parts` presets **omit the municipality entirely** (`adapters.ts:278`, `:292`), so "100 Broadway" in Manhattan and in Brooklyn produce an identical dedupe key. Cross-borough false merges are guaranteed today. | Portal columns | New columns + `field_map` keys |

### 3.4 The commercial discriminator — replaces the valuation floor

The current filter is wrong in a way that costs real leads. `min_valuation_usd: 25000` plus
server-side clauses like `reported_cost > 25000` (`adapters.ts:275`) keep expensive **residential**
remodels (a $300k kitchen) and drop **commercial** records that leave valuation blank — because SQL
comparisons against NULL are never true, the server-side clause discards them at the portal before
`normalizeEvent`'s generous null-keeping rule (`adapters.ts:226-227`) can save them.

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `property_class` | The clean commercial/residential discriminator. Only three cities let you filter server-side, and it removes the entire residential-junk problem in one clause. | **Austin `permit_class_mapped = 'Commercial'`** (verified in production code, `Tiberius-AI/Bid-Assassin`); **Seattle `permitclassmapped IN ('Residential','Non-Residential')`**; **Philadelphia `commercialorresidential`** (literal column). Boston `occupancytype` and LA `use_code` are decent proxies. NYC needs a composite. **Chicago has no commercial marker at all** — `review_type` (plan-reviewed vs easy-permit) is the size screen there. | New column + `field_map` key; rewrite the `where` clause per city |
| `work_class` | Determines **which trades are even in scope**. `New`/`Shell` means the full chain (concrete → steel → roofing → MEP → finishes, 6–18 months). `Interior Finish Out`/`Tenant Improvement` means no concrete, no steel, no roofing at all — it starts at MEP and runs 8–24 weeks. Routing a concrete contractor to a TI permit is the fastest way to lose a subscriber. | Austin `work_class`; Seattle `permitclass`; NYC `job_type` (A1/A2/A3/NB/DM) | New column + `field_map` key |
| `use_type`, `proposed_use` | The strongest single predictor of which trade applies. Restaurant → pest, grease-trap plumbing, hood cleaning, acoustics. Medical → specialised janitorial, backflow. Warehouse → flat roof, dock doors, LED retrofit, sealcoating. **SF's `existing_use` vs `proposed_use` pair is the cleanest tenant-improvement detector in the entire audit** — when the two differ, the space is changing use, which pulls in mechanical, plumbing, electrical and fire subs simultaneously. | SF `existing_use`/`proposed_use`/`existing_occupancy`/`proposed_occupancy`; LA `use_code`/`use_desc`; Boston `occupancytype` | New columns + `field_map` keys |

### 3.5 Job sizing — turns a lead into a price

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `sqft_total`, `sqft_new`, `sqft_remodel` | Square footage is what converts a lead into a dollar figure: janitorial is quoted per sqft per month, HVAC tonnage is estimated from sqft, flooring/sprinkler/painting all scale with it. **Today a 60,000 sqft warehouse and a 900 sqft kiosk with identical permits score identically.** Austin separating new from remodel sqft means `remodel_repair_sqft > 0 AND permit_class_mapped='Commercial'` is a near-exact TI detector. | Austin `total_new_add_sqft`/`remodel_repair_sqft`/`total_existing_bldg_sqft`; Boston `sq_feet`; LA `square_footage`; NYC DOB NOW `total_construction_floor_area` | New columns + `field_map` keys |
| `stories`, `units`, `year_built` | `stories > 3` unlocks a different trade set entirely (elevator service, high-rise window cleaning, standpipe testing) and rules out residential-style roofing crews. `year_built` is the base clock for every replacement-cycle trade (see §4.1). | Austin `number_of_floors`/`housing_units`; Seattle `housingunits`/`housingunitsadded`; NYC existing/proposed stories & dwelling units; SF existing/proposed units | New columns |
| `fees_usd` | Independent corroboration of true project size when valuation is under-reported (Shovels warns self-reported job value is routinely under-stated). Fee schedules are usually a published function of valuation, so fees can be inverted as a sanity check. **Chicago uniquely publishes a paid/unpaid/waived ledger** — a large unpaid balance marks a stalled project, freshly cleared fees mark imminent groundbreak. No other city exposes payment state. | Boston `total_fees`; Chicago fee series | New column |

### 3.6 Trade tagging — the vertical router

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| `trade_tags text[]` | One filing fans out into a sprinkler lead, a solar lead, a scaffold lead, a green-roof lead — with **zero text parsing**. NYC DOB NOW `w9ak-ipjd` carries **24 separate boolean trade work-type columns** on one filing (`general_construction_work_type`, `sprinkler_work_type`, `solar_work_type`, `green_roof_work_type`, `scaffold_work_type`, `structural_work_type`, `foundation_work_type`, `curb_cut_work_type`, and 16 more). Nothing else found comes close for trade targeting. Elsewhere, derive from `permit_type`/`permit_sub_type` and description. | NYC DOB NOW `w9ak-ipjd`; Austin/Seattle/LA `permit_type`+`permit_sub_type`; LA has dedicated `solar` and `ev` booleans | New `text[]` column + a `tag_rules` block in `query_config` |
| `permit_type`, `permit_sub_type` | Direct trade routing and the strongest free proxy for construction stage: **a separate electrical or plumbing permit on an address that already carries a building permit means that job is entering MEP rough-in right now.** That converts a coarse `permit_issued` into a precise, stage-correct trade signal with no inspection data at all. | All five wired cities | New columns + `field_map` keys |

### 3.7 Parties — all of them, with their phone numbers

`normalizeEvent` builds **at most one** `NamedParty`, role hard-coded to `'applicant'`
(`adapters.ts:217-220`). There is no name joiner (only `address_parts`), so any source splitting
first/last name cannot produce a contact at all. And party data is genuinely perishable: **Chicago
deliberately deleted all 15 contractor address columns and all 15 contractor phone columns in July
2019**, renaming `CONTRACTOR_*` → `CONTACT_*`, because "some applicants started giving incomplete
contact information." NYC has redacted before. Once a portal redacts, no re-scrape recovers it.

| Field | Commercial value | Where from | Implementation |
|---|---|---|---|
| **`contractor_phone` / `applicant_phone`** | **The single highest-value field discovered in the entire audit.** Austin publishes the GC's phone number *inline in the permit row* — a directly dialable decision-maker attached to a dated, valued project. Most cities force you to buy this. A verified mobile direct dial connects at 18–22% vs 5–8% on a switchboard list; direct-dial users are 147% more likely to reach a VP. This field alone bypasses the entire $0.05–0.15/lead enrichment waterfall for every Austin lead. **⚠️ VERIFY FIRST — this is one API call and it should decide which metro gets the pilot.** | Austin `3syk-w9eu`: `contractor_phone`, `contractor_full_name`, `contractor_company_name`, `contractor_trade`, `applicant_phone`, `applicant_full_name`, `applicant_organization` | New `le_event_parties` table |
| All 15 Chicago contact slots | `contact_1_type … contact_15_type` with `_name`/`_city`/`_state`/`_zipcode`, each **TYPE-labelled** (OWNER, CONTRACTOR-GENERAL CONTRACTOR, CONTRACTOR-ELECTRICAL). You get the full project org chart from one row, and filtering on `contact_N_type` lets you **emit one lead per trade**. | Chicago `ydr8-5enu` | `le_event_parties`, one row per slot |
| NYC party set | `permittee_s_*` (incl. **`permittee_s_license__`** — a durable join key for building contractor-level history), `owner_s_*` (incl. **`owner_s_phone__`** and a `non_profit` flag), `site_safety_mgr_*`, `superintendent_*`, `filing_representative_*`. Owner-distinct-from-permittee lets you sell "owner is doing work, no GC named yet" — the highest-intent segment. Filing reps are repeat players and are themselves a sellable lead. | NYC `ipu4-2q9a` + DOB NOW `rbx6-tga4` | `le_event_parties` |
| `party.role` | On commercial TI the applicant is often the architect or owner's rep — the person selecting subs. **The same permit can be sold as two different leads** (GC-seeking-subs vs owner-seeking-GC). Role-typed contacts are exactly what ConstructConnect's Design Team section sells. | Every multi-party source | `le_event_parties.role` |
| `party.license_no` | A durable contractor identity across permits — lets you build permit-count history and rank contractors by activity, which is the core asset of a ranked-lead product. | NYC `permittee_s_license__`; DOB NOW `applicant_license` | `le_event_parties.license_no` |

### 3.8 Observation history — not recoverable for any period already elapsed

| Field | Commercial value | Implementation |
|---|---|---|
| `first_seen_at` / `last_seen_at` / `seen_count` | `found_at` gives first observation, but because duplicates are ignored there is no last-seen and no per-observation log. `data_horizon`, `unresolved_rate`, `minutes_to_delivery` are **not computable retroactively** — the observation events simply were not recorded. | `last_seen_at`, `seen_count` on `le_events` |
| `content_hash` + version rows | Detects that a portal changed a row we already hold. Today `ignoreDuplicates: true` means a corrected status, valuation or contractor is kept at our first-seen version *forever*. | `content_hash` on `le_events`; new append-only `le_event_versions` |
| Per-run ingest log | `le_sources.last_status` is a **single overwritten text field** (`app_0129:29`). There is no record of rows read / new / filtered / failed, so coverage and lag cannot be computed even going forward. | New `le_ingest_runs` table |
| `source_config_hash` | `query_config` and `cursor` are mutated in place with no versioning (`index.ts:234-239`) and `source_id` is `ON DELETE SET NULL`. You cannot later determine which `where`-clause or valuation floor was in effect when a given event was ingested — **the coverage footprint of the corpus is retroactively unknowable.** | `config_hash` on `le_sources`, stamped onto `le_events` |
| `delivered_latency_sec` | Speed-to-lead is the best-evidenced number in lead gen — under 5 minutes = 100x more likely to make contact and 21x more likely to qualify vs 30 minutes (Oldroyd/InsideSales, 15,000+ leads); within 1 hour = 7x vs the next hour, 60x vs 24h+ (HBR, 1.25M leads). Home services: 48% conversion at <5 min, 11% at 30 min, 3% at 24h. **Delivery latency is a product feature we can sell — "delivered N minutes after issuance" — and it is definitionally not backfillable.** | `le_leads.delivered_latency_sec` |

### 3.9 Stop discarding rows

Server-side `where` (`adapters.ts:85`, `:98`) means sub-threshold permits are **never downloaded**;
`min_valuation_usd` drops the rest before persistence. Many portals serve rolling windows — once the
window rolls, those permits are unrecoverable. This is what makes absence queries ("no roofing permit
at this address in 28 years") **permanently unbuildable for any period we ran with a floor**. You
cannot prove absence from a value-filtered subset, and you cannot retroactively unfilter.

**Decision:** replace the valuation floor with the class/use filter wherever a city publishes one
(§3.4), keep a *wide* server-side window, and move the junk rejection to a **stored flag rather than
a drop** — `le_events.qualified boolean` plus a rejection reason. Storage is cheap; the row is not
re-obtainable. Where a city has no class marker (Chicago), keep a filter but **log the count of
rows excluded** in `le_ingest_runs` so the coverage denominator exists.

---

## 4. DERIVE-LATER

Everything here is computable from §3 with no external dependency and no vendor. Build when a
customer's ranking depends on it; never let it block a scrape.

### 4.1 `roof_age_years` and `hvac_age_years` — the highest-ROI derived field, and it inverts the engine

`roof_age = now − MAX(year_built, latest roofing permit on that parcel)`. We already ingest the
permit stream; all that is missing is `year_built` (free from county assessors) and a
permit-classification pass over `title`/`description`. Commercial low-slope membrane roofs run
roughly **20–30 year** service lives and commercial packaged rooftop HVAC roughly **15–20 years**
(⚠️ widely-used industry rules of thumb, *not* verified against a primary engineering source — treat
as tunable constants calibrated against `le_outcomes.contract_value_usd`, not as facts).

**Why this matters more than it looks:** today a lead exists only when an event fires. This makes the
**absence** of an event the lead — a 1998-built commercial parcel with no roofing permit in 28 years
is a reroof lead *precisely because nothing has happened*. That converts the product from a
fixed-size event stream (bounded by how many permits a metro issues per week) into an **addressable
inventory you can size on day one**, which is also a far better sales pitch: you can tell a roofer
his total addressable market in his county before he signs.

### 4.2 The rest of the derive list

| Derived field | Value | Inputs |
|---|---|---|
| `est_contract_value_usd` per trade | Ranks the digest by **dollars** instead of event recency. Janitorial ≈ sqft × $/sqft/month × 12; acoustics ≈ sqft × $6.50–20. Calibrate the rate table from our own `le_outcomes.contract_value_usd` — never hard-code an industry average. | `sqft_*`, `use_type`, `le_outcomes` |
| `owner_occupied` (mail address ≠ situs) | One line of SQL that changes **who to call and which trade to pitch**. Absentee → capital work (roof, HVAC replacement, parking lot, exterior) to the mailing address. Owner-occupied → recurring services to the site. Today roofing pitches are routed to tenants who cannot buy them. | parcel mailing address vs situs |
| `parking_lot_area_sqft` | Parcel polygon area − building footprint area. Sealcoating, striping and snow plowing are all priced off paved area, and **no vendor sells this field**. Recurring revenue (snow contracts renew annually) and competitors buying off-the-shelf feeds will not have it. | parcel geometry + free building footprints |
| Contractor rollups | `permit_count`, `total_job_value`, `avg_job_value`, `active_permits` per contractor. Shovels sells these as separate metered endpoints — same rows, sold twice. Rollups are a product, not a byproduct. | `le_event_parties.license_no` + `source_record_id` |
| `primary_phone` (modal, not first-seen) | Shovels' documented technique: `primary_phone` = the **modal** number across all of a contractor's permits; `phone` = a list ordered by frequency. Pure aggregation over data we already hold, and it directly attacks the "wrong number" complaint that dominates contractor reviews of bought leads. | `le_event_parties` |
| `plan_review_days` → forecast issuance | `issued_at − applied_at` per jurisdiction lets us tell a customer "this job hits MEP rough-in in ~9 weeks" for permits still in review. | `applied_at`, `issued_at` |
| `has_contact`, `days_since_issued`, `lead_grade` | Nobody in the incumbent set ships an explicit lead-actionability field, yet `has_contact` is the direct answer to the single most common complaint about bought leads — being charged for leads with wrong or missing numbers. | `le_event_parties`, dates |
| `right_party_confidence` | Cross-provider agreement + carrier line type + name/address co-occurrence + our own dispositions. **The number that matters:** pooling all ten mobile providers in the 2026 Outbound Kitchen benchmark (1,400 US leaders, 3,000+ numbers, $2,521 spend) gave 99% "has a number" and 96% "valid mobile" but only **68% right person**; best single vendor Wiza was 87% coverage / 51% right-person. Every match rate we are ever quoted is ~1.7x the number that matters, and no vendor will close that gap for us. | our own append results + `le_outcomes` |
| Realized close rate per archetype | Converts our ranking from a guess into a **priced product**. Every published "AI lead scoring gives 31% vs 20%" figure is unattributed vendor marketing; our own loop is auditable and sellable. | `le_outcomes` (already built) |

---

## 5. BUY-LATER

Buy per-lead, score-gated at delivery, never at ingest. The economics make this a rounding error:
contractors pay **$15–85/lead on Angi** (roofing $40–120, HVAC install $30–80) plus ~$300/yr
membership, and **$5–150 on Thumbtack** (avg $20–60) — for leads shared with 4–5 contractors
(Thumbtack) or reportedly **up to 16** (Angi roofing). Exclusive leads cost 2.5–3.5x non-exclusive.
A fully contact-complete lead costs roughly **$0.20–0.50 all-in**. Enrichment is **under 1% of the
sale price**; the discipline is score-gating so junk spends nothing, not minimizing per-record cost.

**Recommended order of operations, cheapest first:**

| # | Step | Cost | Notes |
|---|---|---|---|
| 1 | Website contact scrape | free | Already built (`index.ts:78-85`). Disproportionately effective for micro-businesses where B2B databases have no coverage. **Run before any paid provider.** |
| 2 | Google Places Place Details | $0.017–0.02 | Already wired. **Billing gotcha: you are billed at the highest tier of any field requested** — Place Details $17/1,000 (Pro), but Text Search with reviews/atmosphere is $40/1,000. Free monthly: 10,000 Essentials / 5,000 Pro / 1,000 Enterprise. |
| 3 | SoS officer + assessor owner lookup | free | LLC → human. **FinCEN's March 2025 interim final rule exempted all US-formed entities and all US persons from BOI reporting**, so the beneficial-ownership registry is useless for domestic LLCs — and it was never public anyway. State SoS + assessor mailing address is the only real path. |
| 4 | Consumer append (residential leads only) | $0.02–0.05/match | 5–10x cheaper than B2B append and the correct tier for residential permits and storm leads. DataZapp ~$0.03, The Data Group $0.02. |
| 5 | Email waterfall, **capped at 3 providers** | $0.06–0.10 | Provider 1 covers the majority, provider 2 recovers 15–25% of misses, provider 3 recovers 8–12%, **provider 4 adds only 3–5%**. Single source 40–70%; 3-provider 85–95%. FullEnrich $29/mo/500 credits ($0.058/attempt); Prospeo ~$0.008–0.01/valid; Findymail $19/mo per 1,000. |
| 6 | Email verification at **send** time | $0.0005–0.01 | Highest ROI-per-cent in the stack. Verified lists see up to ~60% fewer hard bounces; catch-alls bounce **~27x** more often than verified, and 15–30% of a typical B2B list is catch-all. Since Feb 2024 (Google/Yahoo) and **May 5 2025** (Microsoft junks non-compliant bulk senders), >0.3% spam or >2% hard bounce is an existential domain risk. MillionVerifier $549/1M = $0.000549/email. **Not backfillable in practice** — a verdict older than ~30 days is worthless at 2.1%/mo decay. |
| 7 | Mobile append, score-gated only | $0.11–0.35 | LeadMagic **$0.11 per right-person number** (cheapest in the 10-vendor benchmark); ZoomInfo $1.27 — an 11.5x spread for data we re-verify anyway. |
| 8 | DNC + litigator scrub at **delivery** | $0.01–0.044 | Not a conversion field, a liability field. The FCC one-to-one consent rule was vacated (11th Cir., Jan 24 2025) and formally repealed Sept 2025, so shared leads are federally legal again — **risk moved to 15+ state mini-TCPAs keyed to the consumer's location**: Connecticut up to $20,000 for one unwanted call; Virginia SB 1339 (eff. Jan 2026) requires honoring text opt-outs for 10 years. FTC registry: first 5 area codes free, $82/area code FY2026, $22,626/yr cap. NumberBroom $0.044/row. |

**Property data, when we need it:** the cheapest real path is **Regrid's per-county Data Store at a
verified $200/county** for the full Premium spreadsheet including vacancy and building counts — a
5-county metro is ~$1,000 one-time, no sales call, no annual commitment, no per-call metering.
ATTOM, Cotality and LightBox are all quote-only enterprise motions with contradictory third-party
pricing. The one ATTOM endpoint that is strategically interesting is **`/property/buildingpermits`**,
because permit history is what makes `roof_age`/`hvac_age` computable in counties we have *not*
scraped — it converts the engine from "works in our metros" to national coverage on day one.

**Free building footprints beat paid sqft:** Microsoft US Building Footprints ships **129,591,852**
US polygons free (98.5% precision, 92.4% recall, <1% estimated false positives). For single-storey
commercial — most strip retail, restaurants and warehouses — **footprint area *is* roof area**, which
fills the gap where the assessor publishes no building sqft. ⚠️ **License caution: ODbL
(share-alike).** OpenAddresses is worse: its output data is explicitly "not relicensed from the
original sources," so some contributing county licenses prohibit commercial redistribution. Since we
**resell** leads, this needs a license review before it touches a paying customer. It is the one
finding that can retroactively invalidate the enrichment layer.

---

## 6. Schema recommendation

Migration `app_0131_lead_capture.sql`. Additive and idempotent, per house style.

### 6.1 `le_events` — new columns

```sql
-- identity (the dedupe fix)
alter table public.le_events add column if not exists source_record_id text;      -- permit/licence number
alter table public.le_events add column if not exists parent_record_id text;      -- master permit / project / job number
alter table public.le_events add column if not exists content_hash text;          -- change detection
alter table public.le_events add column if not exists source_config_hash text;    -- which filter was in effect

-- lifecycle
alter table public.le_events add column if not exists record_status text;         -- verbatim
alter table public.le_events add column if not exists status_normalized text
  check (status_normalized in ('in_review','active','final','inactive','unknown'));
alter table public.le_events add column if not exists status_date timestamptz;
alter table public.le_events add column if not exists applied_at   timestamptz;
alter table public.le_events add column if not exists issued_at    timestamptz;
alter table public.le_events add column if not exists approved_at  timestamptz;
alter table public.le_events add column if not exists completed_at timestamptz;
alter table public.le_events add column if not exists expires_at   timestamptz;
alter table public.le_events add column if not exists occurred_kind text;         -- which date occurred_at is

-- geography / parcel
alter table public.le_events add column if not exists lat numeric;
alter table public.le_events add column if not exists lon numeric;
alter table public.le_events add column if not exists parcel_id text;
alter table public.le_events add column if not exists jurisdiction text;          -- stable slug, not a label
alter table public.le_events add column if not exists city text;
alter table public.le_events add column if not exists state text;
alter table public.le_events add column if not exists postal_code text;
alter table public.le_events add column if not exists unit text;

-- classification / sizing (scoring inputs)
alter table public.le_events add column if not exists property_class text;        -- Commercial | Residential | null
alter table public.le_events add column if not exists work_class text;            -- New | Addition | Remodel | TI | Shell
alter table public.le_events add column if not exists permit_type text;
alter table public.le_events add column if not exists permit_sub_type text;
alter table public.le_events add column if not exists use_type text;
alter table public.le_events add column if not exists proposed_use text;
alter table public.le_events add column if not exists sqft_total   numeric;
alter table public.le_events add column if not exists sqft_new     numeric;
alter table public.le_events add column if not exists sqft_remodel numeric;
alter table public.le_events add column if not exists stories int;
alter table public.le_events add column if not exists units int;
alter table public.le_events add column if not exists year_built int;
alter table public.le_events add column if not exists fees_usd numeric;
alter table public.le_events add column if not exists trade_tags text[] not null default '{}';

-- observation history (irreversible if missed)
alter table public.le_events add column if not exists last_seen_at timestamptz;
alter table public.le_events add column if not exists seen_count int not null default 1;
alter table public.le_events add column if not exists qualified boolean not null default true;
alter table public.le_events add column if not exists disqualified_reason text;   -- store, don't drop

create index if not exists idx_le_events_record on public.le_events(owner_id, jurisdiction, source_record_id);
create index if not exists idx_le_events_parcel on public.le_events(owner_id, parcel_id) where parcel_id is not null;
create index if not exists idx_le_events_status on public.le_events(world_id, status_normalized, status_date desc);
create index if not exists idx_le_events_tags   on public.le_events using gin(trade_tags);
```

**Rationale for the columns that look optional but are not:**
`source_record_id` is the join key to every future dataset and the only way to detect an update.
`status_date` is the *poll key* — without it there is no stage feed. `lat`/`lon` are the only way to
join a storm polygon. `qualified` + `disqualified_reason` replace an irreversible drop with a
reversible flag. `source_config_hash` is what makes the corpus's coverage footprint knowable in
hindsight.

### 6.2 New tables

```sql
-- all parties on a record, with their contact data and provenance
create table if not exists public.le_event_parties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.le_events(id) on delete cascade,
  ordinal int not null default 0,          -- Chicago contact_1..contact_15
  role text,                               -- verbatim: 'CONTRACTOR-ELECTRICAL', 'OWNER', 'applicant'
  role_normalized text,                    -- owner | contractor | applicant | architect | filing_rep | other
  name text, company text,
  phone text, email text,
  address text, city text, state text, postal_code text,
  license_no text,
  source_field text not null,              -- which column this came from (verbatim discipline)
  created_at timestamptz not null default now()
);
create index if not exists idx_le_parties_event on public.le_event_parties(event_id, ordinal);
create index if not exists idx_le_parties_license on public.le_event_parties(owner_id, license_no) where license_no is not null;

-- append-only observation history: every time we see a row and it differs
create table if not exists public.le_event_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.le_events(id) on delete cascade,
  observed_at timestamptz not null default now(),
  record_status text, status_normalized text,
  valuation_usd numeric,
  content_hash text not null,
  changed_fields jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists idx_le_versions_event on public.le_event_versions(event_id, observed_at desc);

-- the coverage log: what each run actually saw. Cannot be reconstructed later.
create table if not exists public.le_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.le_sources(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  request_url text,
  http_status int,
  body_bytes int,
  body_truncated boolean not null default false,   -- the 2MB slice, made visible
  rows_parsed int not null default 0,
  rows_disqualified int not null default 0,
  rows_new int not null default 0,
  rows_changed int not null default 0,
  cursor_before jsonb, cursor_after jsonb,
  config_hash text,
  error text
);
create index if not exists idx_le_runs_source on public.le_ingest_runs(source_id, started_at desc);
```

RLS on all three follows the `app_0129` owner-scoped pattern verbatim.

### 6.3 `le_leads` — new columns

```sql
alter table public.le_leads add column if not exists contact_source text;      -- record | places | website | append:<vendor>
alter table public.le_leads add column if not exists contact_role text;
alter table public.le_leads add column if not exists contact_verified_at timestamptz;
alter table public.le_leads add column if not exists contact_line_type text;   -- mobile | landline | voip | main
alter table public.le_leads add column if not exists contact_confidence int;   -- 0..100, our own derivation
alter table public.le_leads add column if not exists email_status text
  check (email_status in ('valid','catch_all','invalid','role','unverified'));
alter table public.le_leads add column if not exists dnc_status text;
alter table public.le_leads add column if not exists dnc_checked_at timestamptz;
alter table public.le_leads add column if not exists est_value_usd numeric;    -- derived job size for THIS trade
alter table public.le_leads add column if not exists stage text;               -- lifecycle stage at scoring time
alter table public.le_leads add column if not exists score_version text;       -- historic scores stay interpretable
alter table public.le_leads add column if not exists delivered_latency_sec int;
alter table public.le_leads add column if not exists exclusive boolean not null default true;
```

**Rationale.** `contact_source` is currently absent, which means a Google Places phone and a
permit-record phone are the same field with no way to tell them apart — and the append **overwrites
with no history** (`index.ts:87-91`). `email_status` matters because the scraped email is the *first
regex match in up to 300KB of a stranger's HTML* (`index.ts:81-83`), which is a deliverability
liability with nowhere to record its state. `score_version` matters because the recency term decays,
so a stored score becomes uninterpretable the moment the model changes. `exclusive` matters because
non-exclusivity is one of the two dominant complaints in contractor reviews of every lead
marketplace — an explicit flag is a schema-level answer to it.

### 6.4 `le_sources` — new columns

```sql
alter table public.le_sources add column if not exists dialect text not null default 'array'
  check (dialect in ('array','arcgis','ckan','carto'));   -- envelope shape, orthogonal to kind
alter table public.le_sources add column if not exists records_path text;      -- e.g. 'result.records', 'rows'
alter table public.le_sources add column if not exists poll_mode text not null default 'discovery'
  check (poll_mode in ('discovery','status','backfill'));
alter table public.le_sources add column if not exists jurisdiction text;      -- stable slug
alter table public.le_sources add column if not exists config_hash text;       -- stamped onto every event
alter table public.le_sources add column if not exists backfill_cursor jsonb not null default '{}'::jsonb;
```

`dialect` + `records_path` turn Boston (CKAN, `result.records`) and Philadelphia (Carto, `rows[]`)
from a code change into a config row. `poll_mode` is what enables the two-row-per-city pattern in
§7.1 with zero adapter refactoring.

### 6.5 The dedupe fix — the highest-priority code change

Current: `${event_type}::${normalizeKeyPart(address||title)}::${YYYY-MM}` with
`unique(owner_id, dedupe_key)` and `ignoreDuplicates: true`.

Failure modes, all live today:
- Two different permits at one address in one month collapse — **this is the normal case**, not the
  edge case (electrical + plumbing + mechanical sub-permits on one job). Each is a separate trade
  lead and we drop it.
- Dedupe is **owner-scoped, not world-scoped** (`app_0129:68`), so two markets owned by the same user
  with overlapping regions collide and the second silently produces zero leads.
- Dedupe ignores `source_id`, so NYC legacy `ipu4-2q9a` and DOB NOW `rbx6-tga4` collide and one is
  dropped — you can never hold both and reconcile.
- Any record without a parseable date falls into a literal `'undated'` bucket
  (`leadEngine.ts:160`), merging all undated records at one address for all time.
- `normalizeKeyPart` truncates to 120 chars (`leadEngine.ts:152`); where a source has no address the
  *title* becomes identity, so long scope-of-work strings sharing a prefix silently merge.
- `toIso` (`adapters.ts:197-202`) runs `Date.parse` on Socrata's floating `2024-03-15T00:00:00.000`,
  which JS parses as **local time** — on a non-UTC runtime a month-boundary record shifts buckets,
  the key changes, and the same record ingests twice. It also treats any number > 10¹⁰ as epoch
  millis, so a numeric permit id mapped to the date key becomes a plausible-looking date.

Replacement:

```
dedupe_key = `${event_type}::${jurisdiction}::${source_record_id}`          // when a record id exists
           | `${event_type}::${jurisdiction}::${normalized address}::${bucket}`  // documented fallback
unique (owner_id, world_id, dedupe_key)
```

…and change the upsert from `ignoreDuplicates: true` to: on conflict, compare `content_hash`; if
changed, **update the row, bump `seen_count`, set `last_seen_at`, and insert a `le_event_versions`
row**. Parse `toIso` as UTC explicitly and drop the epoch-millis heuristic in favour of a per-source
`date_format` hint.

### 6.6 Two adapter bugs to fix in the same PR

1. **The silent-failure bug.** `index.ts:153-155` calls `parseRows` and then sets `fetchOk = true`
   unconditionally; `parseRows` swallows JSON errors and returns `[]` (`adapters.ts:169-177`). So a
   2MB-truncated body, a changed response shape, or a CKAN/Carto envelope all report
   `"Checked — 0 rows read, 0 new"`. This **directly violates the module's own stated rule** at
   `adapters.ts:162-164` ("an unreadable source is UNREACHABLE, never no change") and means a source
   can be dead for months while the UI says it is healthy. Distinguish parse failure from empty
   result and count it as unreachable.
2. **The cursor skip.** `FETCH_LIMIT = 100` (`adapters.ts:61`) with `$limit` and **no `$offset`**,
   ordered by date ASC, then `nextCursor` = max date seen. Any day with more than 100 qualifying
   records — routine for NYC and Chicago — advances the cursor past that day and **the remaining
   records for that day are never fetched again.** Add `$offset` paging within a tick, or a
   `(last_date, last_id)` composite cursor with a deterministic tie-break.

Also fix in passing: `source_url` **silently falls back to `base_url`** when no permalink is mapped
(`adapters.ts:239`), and **none of the five presets map one** — so every digest line links the
dataset endpoint, not the record, while the product's core promise is *"every lead links its public
record"* (`leadEngine.ts:256`). And the Seattle preset points at **`76t8-zvzf`**
(`adapters.ts:319`), a dataset ID that does not exist: a GitHub code search returns exactly **one**
hit for it — this repo — while the real Seattle Building Permits ID **`76t5-zqzr`** appears in 13
independent repos and Socrata's own foundry URL. **That source has almost certainly been returning
zero rows since it shipped**, reported as a healthy "0 rows read."

---

## 7. Top 5 new sources to wire, ranked by value × accessibility

**Prerequisite (not a new source, but do it first):** add a **second `le_sources` row per city with
`poll_mode='status'`**, cursored on the status-date column instead of the issue-date column, emitting
`permit_stage_change`. Zero new adapter code beyond the §6.4 columns, endpoints and auth already
work, and it converts a static permit dump into a lifecycle feed. This is the highest-ROI change
available and it costs nothing.

| # | Source | Why it wins | Access | Lead time |
|---|---|---|---|---|
| **1** | **NYC DOB NOW: Job Application Filings — `w9ak-ipjd`** | **24 boolean trade work-type flags on one filing** — a ready-made vertical router with zero NLP. Plus `initial_cost`, `total_construction_floor_area`, existing-vs-proposed stories/height/dwelling units (a direct expansion measure), owner and applicant names, `bbl`, lat/lng. ~95 columns. Also fixes a real gap: the legacy `ipu4-2q9a` feed we already run has **no cost column whatsoever** (verified against a committed 55-column `CREATE TABLE`), so a valuation floor there is either a no-op or drops every NYC row. | Socrata SODA JSON, free, no key (app token recommended) | **Months.** `filing_date` precedes `first_permit_date` — the single biggest lead-time upgrade available to us. |
| **2** | **Austin `3syk-w9eu` — fully re-mapped** | Already wired, and roughly 90% of its value is unmapped. ~67–73 columns verified from committed DDL: **`contractor_phone` and `applicant_phone` inline**, `permit_class_mapped='Commercial'` as a server-side filter, `work_class`, `total_new_add_sqft` vs `remodel_repair_sqft` (near-exact TI detector), `master_permit_num`/`project_id` (collapses sub-permits), and **per-trade valuation splits** — building / electrical / mechanical / plumbing / medgas, each with a `_remodel` variant. `medgas_valuation > 0` identifies healthcare/lab facilities specifically. | Socrata, free. **⚠️ Verify the phone columns first — one call, and it should decide the pilot metro.** | At issuance, plus `applieddate` for the earlier signal |
| **3** | **Chicago Food Inspections — `4ijn-s7e5`, filtered `inspection_type='License'`** | The **pre-opening health inspection** — a distinct, filterable value inside an otherwise routine feed, firing days-to-weeks before a restaurant opens. Arguably the most precise free "this restaurant opens within ~30 days" signal available anywhere, and it feeds pest control, janitorial, acoustics, signage, POS and waste *simultaneously*. Health permits are legally **non-transferable**, so a new permit at an existing address is definitionally an ownership change. | Socrata, free; the `health` kind already exists ⚠️ dataset id medium-confidence | **Days to ~30 days** before opening |
| **4** | **NOAA storm feed — IEM Local Storm Reports** (`mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?wfo=ALL&recent=86400&fmt=csv`) | The **fastest signal in the entire stack** and the only one where being six hours late loses the deal. Hail drives 4–8x baseline roofing/siding demand; pre-qualified storm leads convert up to 2x generic roofing leads; **78% of storm service requests come within 48 hours**; the urgency window is ~21 days. Field trigger: hail ≥ 1 inch or wind ≥ 60 mph. IEM re-parses the NWS realtime feed **every 5 minutes**, archive back to 2003. Cross-check with SPC daily CSVs; use NCEI Storm Events for backfill only (it lags 60–120 days). | Free, no key. **Requires `lat`/`lon` on `le_events` (§3.3) to be useful at all.** | **Minutes to hours** |
| **5** | **Chicago Business Licenses — `r5kz-chrr`, filtered `application_type='ISSUE'`** | Isolates **brand-new** licences from renewals, which are the bulk of the file and worthless as leads. The gap between `application_created_date` and `license_start_date` is the pre-opening buying window for signage, security, janitorial, pest, POS and waste. Daily-updated, geocoded, 2002-present. NYC's analogue `ptev-4hud` is even better because it exposes **pending** applications. | Socrata, free, existing `socrata` kind — a `field_map` + `where` clause, no code | Weeks to a few months |

**Next tier, deliberately below the line for now:** Seattle **`76t5-zqzr`** (a bug fix, not a new
source — see §6.6; it also carries `readytoissuedate`, a genuine **pre-issuance** milestone, the
earliest such signal in the audit); NY SLA pending liquor licences `f8i8-k2gm` (60–180 days ahead,
and **pending is a perishable state** — a row disappears once issued, so it is snapshot-or-lose);
WA L&I prevailing-wage Intents `t9je-9qwa` (every GC and sub on every WA public job, filed *before*
work — functionally a free ConstructConnect for Washington public work, and almost entirely
unexploited); Connecticut UCC `xfev-8smz` (free, **nightly**, with collateral description and secured
party — a UCC-1 *is* a financed purchase, and every other state charges $2,000–12,000/yr or offers
nothing).

---

## 8. What this changes in the scoring model

The current `TRADES` matrix (`leadEngine.ts:53-114`) assigns hand-picked integers per event type with
**no economic grounding and no property context**. A `permit_issued` fires acoustics at 30, security
at 35, hvac at 35 and electrical at 35 on *every* property regardless of what the building is, how
big it is, or what stage the job is at. Six changes, in order of impact:

1. **Hard-gate on `property_class`, not valuation.** Replace `min_valuation_usd` with
   `property_class='Commercial'` wherever a city publishes it. Fixes both failure modes at once —
   stops keeping $300k residential kitchens and stops dropping unpriced commercial jobs.
2. **Gate weights on `use_type`.** Pest control should not fire on a warehouse; roofing should not
   fire on an interior TI. This is the single highest-*precision* improvement available to
   `scoreLead()`.
3. **Add a stage dimension.** `score = weight(event_type) × stage_match(stage, trade) × recency`.
   The lifecycle runs: land purchase → zoning approval (6–18mo) → permit application (1–6mo) →
   issuance → foundation → framing → **MEP rough-in** → insulation/drywall → finishes → final
   inspection → C of O → business licence → health permit → liquor → opening. Concrete and steel buy
   at issuance; drywall buys on a passed rough-in; **low-voltage/IT/POS cabling must be pulled while
   the walls are open** — the tightest and most time-critical window in the chain; janitorial, pest
   and landscaping sign at occupancy. Today all twelve trades receive the same event at the same
   moment, and for most of them it is months early or months late. **Stage-aware scoring is what
   makes one event stream sellable to seventeen trades instead of three.**
4. **Rank by `est_value_usd`, not recency.** With `sqft_total` and a per-trade rate table calibrated
   from `le_outcomes`, the digest sorts by estimated contract value. This is the difference between
   a lead list and a pipeline.
5. **Storm as an urgency multiplier.** `TRADES.roofing.buys` already anticipates it ("storm events
   (coming stream) make them urgent"). A hail swath intersected with parcels where `roof_age > 15`
   produces a dated, insurance-motivated, geographically-bounded roofing list — the most valuable
   lead type in commercial trades, because the owner has both urgency *and* a funding source.
6. **Absence as a lead genesis path** (§4.1). A new code path where a lead is created because
   nothing happened.

**Trade coverage gap.** We ship twelve trades; the research names five more that are directly
buyable off this data and are currently unserved: **concrete** and **steel** (fire at issuance,
earliest and least contested), **drywall** (fires on a passed rough-in — a precise, currently
unserved window), **waste/dumpster** (fires at mobilization; recurring revenue, low competition,
trivially qualified by any active permit), and **low-voltage/IT/POS** (two distinct buying moments
from one job: rough-in cabling and final install). Note `waste` is not a `TradeKey` today — adding it
is an enum change (`leadEngine.ts:40-43`), not a config edit.

**Also stamp `score_version`.** Scores are recomputed with a decaying recency term; without a version
stamp, a stored score becomes uninterpretable the moment the model changes, and historical grading is
not reconstructible.

---

## 9. What NOT to do

Be ruthless. These sound valuable and are wrong for a solo operator selling to SMB contractors.

| Don't build | Why not |
|---|---|
| **Third-party intent data** (Bombora, 6sense, G2) | Bombora entry ~**$30K/yr**, mid-market $40–80K, enterprise $250K+, annual contract only, no PAYG — **300–800x** our entire per-lead enrichment budget. Quality is contested: Forrester reports ~50% of users see too many false positives, 52% of sales pros report frequent false positives, 29% cite misattributed IP, and Forrester warns that without decay rules "every company is demonstrating intent." Mechanically it cannot work here — intent panels track B2B content consumption at company/IP level; a hail-damaged roof never surfaces. **Our permit, licence and storm events *are* first-party intent, and they are stronger and free.** |
| **Technographics** (HG Insights, BuiltWith) | HG Insights is quote-only at typically **$25,000+/yr** (contracts reported $40K–$200K+). The lift claims ("28% higher conversion") appear only in vendor SEO content with no methodology. A roofer does not care what CRM the building owner runs. |
| **Purchased employee-count / revenue estimates** | Industry consensus: private SMBs have the **lowest** firmographic accuracy, "often estimated from proxy signals with wide confidence bands"; employee count is "the most common firmographic filter and the one most likely to mislead." We already have a better, free, **primary-source** size signal: the permit's declared valuation plus square footage plus use code. |
| **Job-change / champion tracking** (UserGems) | The numbers are real in their native context (58% lift in opp creation, up to 114% higher close rate) but require an installed base of past buyers changing employers. **A contractor buying a permit lead has no champion graph.** |
| **Clay as the production enrichment runtime** | Repriced March 2026 to Launch $185/mo (2,500 data credits) / Growth $495/mo (6,000). A 5-provider waterfall burns ~15 credits/contact → **~167 fully enriched contacts/month on Launch**, roughly 12x what FullEnrich ($0.058/attempt) or LeadMagic ($0.11/right-person phone) cost via API. Superb prototyping surface; wrong production runtime for high-volume, low-value-per-record work. |
| **TLOxp / LexisNexis Accurint** | It is the accuracy ceiling (88–95% phone) but it is credit-header data requiring professional licensing and a **GLBA permissible purpose that a commercial lead-resale operation generally cannot assert.** The compliance exposure, not the $0.50–2.00 price, is the disqualifier. Stay on the BatchData / DataZapp / PropStream tier. |
| **Shovels (or any aggregator) as the *primary* feed** | Shovels refreshes on the **1st and 15th**, the API can lag the database by up to a week, and it concedes permits reach it a **median of 84 days after work starts** (90% within 188 days). Against a 2–6 week actionable window and a 5-minute/21x speed-to-lead curve, that is disqualifying. Use it for backfill and coverage expansion only; keep direct polling on the critical path. Same logic rules out Construction Monitor's weekly edition as a primary. |
| **Dodge / ConstructConnect project intelligence** | The right data (action stage, bid date, design-team contacts with per-role phone and email, CSI divisions, bidder lists, award history) at the wrong altitude and price: Dodge reported ~$300/user/mo, ConstructConnect $199–$1,000/mo, Bid Management ~$15,000/yr. **None of it is backfillable** — it is a subscription, not a dataset. Revisit only if we sell into commercial GCs rather than trade subs. |
| **The absence-trust product** (coverage_tier, error bars) | The most sophisticated and defensible thing any incumbent ships — Shovels even publishes its ZIP-dominant jurisdiction join error at **6.13%** — but it requires accumulating per-jurisdiction coverage and lag statistics **over years**. Not a solo-operator play. **However: `le_ingest_runs` (§6.2) is near-free and is the input. Build the log now, build the product never (or much later).** |
| **A reusable EnerGov adapter** | Tyler EnerGov has **no standard public open-data schema**; searches surface only Citizen Self-Service user guides. EnerGov jurisdictions expose data per-agency as a bespoke ArcGIS layer or an HTML portal. Treat each as a one-off. Accela is similar — the Construct API documents a real record model but access requires per-agency credentials. |
| **Fire marshal permits as a distinct feed** | No state publishes open bulk fire permit data; every state fire marshal found has moved to a closed vendor portal (Arizona DFFM, Georgia CitizenServe, California OSFM "GOVmotus Fire"). Fire permits are only reachable as **sub-types inside municipal permit data** — mine `permit_type` for "fire alarm"/"sprinkler"/"suppression"/"hood". Do not promise fire-marshal coverage. |
| **Commercial eviction / foreclosure** | No national database, statutory access differs per state, many counties forbid bulk. Free coverage is essentially NYC `6z8x-wfk4` plus aggregate trackers. National NOD/lis pendens requires paid vendors that **skew residential**. Phase 3 at the earliest. |
| **School / municipal bid boards** | BidNet Direct, DemandStar, Bonfire and OpenGov publish **no free public APIs**. This is scraping, not integration. |
| **EPA air permits as a leading indicator** | ECHO and Envirofacts expose permitted **status**, not application dates. Enrichment, not a trigger. The predictive data sits in state air-construction dockets, agency by agency. |
| **SAM.gov Opportunities API** | Personal/non-federal API keys are capped around **ten calls per day**. Use the free, no-key, daily **Contract Opportunities CSV** on `sam.gov/data-services` instead, which does not count against API limits. And **FPDS is dead** — public functionality migrated to SAM.gov on **2026-02-24** and the legacy ATOM feed is being retired. |
| **CSLB's paid contractor file** | $245 non-refundable, up to **30 working days** to fulfil, non-Excel flat files, explicitly **no programming or technical support** — while Washington (`m8qx-ubtq` plus separate Insurance and Bond datasets), Texas TDLR (~183 MB daily) and Florida DBPR are all free and structured. |
| **UCC data outside Connecticut** | CT publishes all active liens free and **nightly** with collateral and secured party. South Carolina is **$12,000/yr**, Minnesota **$12,000** initial, Arizona $2,000+/yr, Delaware nothing at any price. Wire CT, validate the thesis cheaply, stop. |
| **Keying anything on APN** | Shovels returns it on every record but explicitly **refuses to make it searchable**: APNs are county-scoped, "millions collide across counties," and ~30% of properties have none. **Carry it, don't key on it.** |
| **Date-based completion inference** | A permit with `final` status carries no final date about **15%** of the time, and roughly **41%** of permits with no final date are in fact finaled by status. Any date-based "is this job done" test is wrong that often. Model status as its own normalized field. |

---

## 10. What we have that incumbents do not — and how to widen it

### The five real advantages

1. **Latency.** Shovels refreshes twice a month and admits a median 84-day ingestion lag; Construction
   Monitor's flagship is a weekly edition. We poll hourly, direct from the portal. Against a stated
   2–6 week actionable window and the speed-to-lead evidence (5 min = 21x more likely to qualify;
   78% of buyers choose whoever responds first regardless of price or reputation; only ~0.1% of
   field-service businesses respond within 5 minutes, and in a study of 466 home-services companies
   **95% did not respond within five minutes and 40% never responded at all**), a daily-or-better
   direct pipeline is a **structural** advantage, not a marginal one.
2. **The outcome loop.** `le_outcomes` (`app_0129:119-130`) captures what actually happened to a
   delivered lead, reported by the buyer, with contract value, and a `won` mints a commission
   invoice. **No incumbent has this.** Every vendor "AI scoring" lift claim is unverifiable
   marketing; a closed feedback loop on our own leads makes our ranking auditable and lets us price
   leads by **realized close rate**. This is the only genuinely proprietary field in the system.
3. **The bundle.** `pitchFor` already ships a real demo site alongside the sample leads
   (`leadEngine.ts:292-297`). Leads open the door, the website raises the ticket, automation keeps
   the account. Nobody in the lead-data category ships a working site with the pitch.
4. **Verbatim discipline + a per-lead public-record link.** The trust device that directly answers
   the "your data is made up / outdated" objection dominating every lead-service review. ⚠️
   **Currently broken** — `source_url` falls back to `base_url` and no preset maps a permalink
   (§6.6). Fix this before it is claimed in a pitch.
5. **Approvals-gated outbound.** Nothing sends itself. That is a compliance posture no marketplace has.

### What to capture to widen the gap

| Capture | Widens which gap |
|---|---|
| **Delivery latency** (`delivered_latency_sec`) | Turns latency from an invisible advantage into a **sellable claim**: "delivered N minutes after issuance." Definitionally not backfillable. |
| **Status transition history** (`le_event_versions`) | Incumbents expose only the **current** state — the transition itself is not for sale anywhere. Owning the transitions means owning durations, funnels and stage-timed leads that nobody else can offer. |
| **Per-jurisdiction ingest lag** (`le_ingest_runs`) | The input to absence-with-an-error-bar, the most defensible thing in the category. Accumulates only in real time. Free to log, impossible to reconstruct. |
| **Outcome → contract value per trade per event type** | Calibrates the $/sqft rate tables, prices leads by realized close rate, and eventually replaces every bought score. |
| **Exclusivity flag** (`le_leads.exclusive`) | The two failure modes contractors complain about most are both schema-fixable: **non-exclusivity** (Angi/Thumbtack sell one lead to 3–8 contractors; reportedly up to 16 for Angi roofing, so contractors cold-call the same person minutes apart) and **staleness** (BidClerk called "worthless" on Contractor Talk for listing jobs "way past the due date to bid"; Constructalead described as a database with start dates back to 2015). An explicit exclusivity flag plus a hard status gate answer both directly. |
| **`has_contact`** | Nobody in the incumbent set ships an explicit lead-actionability field, yet it is the direct answer to being charged for leads with wrong or missing numbers. |

---

## 11. Execution order

| Phase | Work | Why this order |
|---|---|---|
| **P0 — before any new city** | `app_0131` schema (§6.1–6.4). Dedupe rewrite (§6.5). Silent-failure + cursor-skip fixes (§6.6). Seattle dataset ID fix. Permalink mapping on all five presets. `le_ingest_runs` logging. | Every hour without these permanently loses transitions, collides permits, and mis-reports dead sources as healthy. |
| **P1 — free lifecycle** | Second `le_sources` row per city with `poll_mode='status'`. Re-map all five presets to the full field set (§3). **Verify Austin's phone columns live.** | Pure config + `field_map` against endpoints that already work. Buys months of lead time and free direct dials at zero cost. |
| **P2 — scoring** | Stage dimension, `use_type` gating, `property_class` gate replacing the valuation floor, `est_value_usd` ranking, `score_version`. Add the five missing trades. | Now that the inputs exist, the ranking becomes economically grounded instead of ordinal guesswork. |
| **P3 — new sources** | The five in §7, in order. `dialect`/`records_path` unlocks Boston + Philadelphia as config. | Coverage after correctness. A wider net over a lossy pipeline just loses more. |
| **P4 — derive** | `roof_age`/`hvac_age` (needs `year_built` — one Regrid county at $200 proves it), owner-occupied, contractor rollups, `primary_phone`. | Turns the corpus into an addressable inventory rather than an event stream. |
| **P5 — buy** | The §5 waterfall, score-gated at delivery, in the stated cheapest-first order. | Last, because it is the only bucket that is fully backfillable. |

---

## 12. The live-verification checklist

Before any `field_map` in this document is committed, confirm against
`https://<portal>/api/views/<id>/columns.json`:

1. **Austin `3syk-w9eu` — do `contractor_phone` and `applicant_phone` exist?** Highest-value single
   check in the whole plan; it should decide the pilot metro.
2. Seattle **`76t5-zqzr`** column names (and retire `76t8-zvzf`).
3. NYC `bldg_type` and `residential` enumerated values (never verified from a primary source).
4. Austin's full `work_class` and `permit_class` vocabularies (only "Shell" under class C-328 was
   ever glimpsed).
5. Chicago's current column count and the `permit_condition` column reportedly added Oct 2025.
6. Chicago Contractor Search `d67y-6zvx` column list — the join target that restores the phone data
   Chicago stripped in 2019.
7. SF electrical and plumbing dataset IDs (believed `ftty-kx6y` and `a6aw-rudh`, medium confidence).
8. Boston's complete `occupancytype` value list.
9. Live SAM.gov rate limits for whatever account tier we actually hold.
10. Current SPC CSV filename convention (both `YYMMDD_rpts_hail.csv` and `YYMMDD_rpts_raw_hail.csv`
    forms appear in the wild).

---

## 13. Source URLs

**Portals wired or targeted**
`data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu` ·
`data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr` ·
`data.cityofnewyork.us/Housing-Development/DOB-Permit-Issuance/ipu4-2q9a` ·
`data.cityofnewyork.us/resource/w9ak-ipjd.json` (DOB NOW filings) ·
`data.cityofnewyork.us/resource/rbx6-tga4.json` (DOB NOW approved permits) ·
`data.sfgov.org/resource/i98e-djp9.json` ·
`data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu` ·
`data.seattle.gov/Built-Environment/Building-Permits/76t5-zqzr/about_data` ·
`dev.socrata.com/foundry/data.seattle.gov/76t5-zqzr` ·
`data.lacity.org/resource/pi9x-tg5x.json` ·
`phl.carto.com/api/v2/sql` (Philadelphia L&I) ·
`data.boston.gov` CKAN resource `6ddcd912-32a0-43df-9908-63574f8c7e77`

**Chicago's 2019 contractor-data removal (the perishability proof)**
`raw.githubusercontent.com/Chicago/dev.cityofchicago.org/master/_posts/2019-07-09-building-permits-changes.md` ·
`.../2019-07-16-building-permits-contact-columns.md`

**Storm**
`mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py` ·
`spc.noaa.gov/climo/reports/` · `ncei.noaa.gov/swdiws/` ·
`ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`

**Vendor primary sources (the only ones verified)**
`github.com/ShovelsAI/shovels-docs` · `docs.shovels.ai/docs/data-dictionary-api` ·
`docs.shovels.ai/docs/data-dictionary-edl` ·
`docs.shovels.ai/docs/knowledge-base/getting-started/pricing-structure` ·
`docs.shovels.ai/docs/knowledge-base/data/quality/refresh-frequency` ·
`docs.shovels.ai/docs/knowledge-base/api/properties/absence-queries` ·
`regrid.com/pay-to-download-parcel-data` · `support.regrid.com/parcel-data/schema` ·
`github.com/microsoft/USBuildingFootprints` · `github.com/OvertureMaps/schema` ·
`github.com/openaddresses/openaddresses`

**Benchmarks and economics**
`newsletter.outbound.kitchen/p/the-2026-b2b-mobile-data-benchmark` (10-vendor mobile test) ·
`wizleads.io/blog/email-enrichment-benchmark-2026/` ·
`resources.rework.com/libraries/lead-management/lead-response-time` (Oldroyd/InsideSales) ·
`www.invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026` ·
`www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/` ·
`auto-respond.com/blog/thumbtack-cost-per-lead-2026/` ·
`www.contractortalk.com/threads/has-any-one-used-bid-clerk.20761/` (staleness complaint) ·
`www.federalregister.gov/documents/2025/03/26/2025-05199/...` (FinCEN BOI exemption) ·
`www.daypitney.com/eleventh-circuit-vacates-fccs-one-to-one-consent-rule`

---

## 14. Implementation record — what P0 actually shipped

Migrations `app_0131_lead_capture.sql` + `app_0132_lead_source_url_nullable.sql`; code in
`src/lib/garvis/leadEngine/{leadEngine,adapters}.ts` and `supabase/functions/lead-ingest/index.ts`;
150 checks in `leadEngine.verify.ts`.

**Shipped (CAPTURE-NOW only).**

| # | Change | Where |
|---|---|---|
| 1 | Field map widened to the full §3 set — identity, lifecycle dates, geo/parcel, class/use, sizing, fees — plus a `name_parts` joiner mirroring `address_parts`. Verbatim rule intact: an unmapped or absent column is null. | `adapters.ts` `FieldMap` |
| 2 | Multi-party capture. A `parties[]` config lists several column-sets per row; each yields a `le_event_parties` row with `role`/`role_normalized`, phone, email, licence no. and `source_field` provenance. The single `contact_name`/`contact_company` path still works unchanged. | `adapters.ts`, `lead-ingest` |
| 3 | **Dedupe fix (§6.5).** Identity is `type :: jurisdiction :: source_record_id` when the record has a number, falling back to the documented address+month bucket when it does not. `jurisdiction` is a stable slug on sources and presets. | `leadEngine.dedupeKey` |
| 4 | `ignoreDuplicates` replaced by upsert-on-change: the run reads what it already holds, compares `content_hash`, updates changed rows, bumps `seen_count`/`last_seen_at` on every observation, and appends a `le_event_versions` row carrying `changed_fields`. | `lead-ingest` |
| 5 | Sub-floor rows persist with `qualified=false` + `disqualified_reason` instead of being discarded. Leads are minted for qualified rows only. | `adapters.ts`, `lead-ingest` |
| 6 | Both live bugs — see below. | `adapters.ts` |
| 7 | `le_ingest_runs`: one row per source per run with request URL, HTTP status, body bytes, truncation flag, rows parsed/disqualified/new/changed, cursor either side, config hash, error. | `lead-ingest` |
| 8 | `le_leads` now stamps `contact_source` (`record` from the permit, `places`/`website` from the append), `contact_role`, `stage` (the normalized lifecycle state) and `score_version`. | `lead-ingest` |

**Bug 1 — `source_url` (§6.6).** The `?? source.base_url` fallback is gone. Resolution is now:
a mapped permalink **column** (Seattle and Austin publish a real `Link`), else a per-record
`permalink_template` that resolves to exactly one record, else **null**. A template with any
unresolvable token yields null rather than a half-built URL. All five presets now produce a
per-record link. Where a link is genuinely absent the UI shows *"no direct link"* and the digest
prints the same words — it never links the dataset endpoint. The digest also only claims *"every
lead links its public record"* when that is true of every line in it, and a sample pitch will not
use an unlinkable lead as proof.

**Bug 2 — Seattle: VERIFIED AND FIXED, not removed.** `76t8-zvzf` is confirmed dead; the live
Building Permits dataset is **`76t5-zqzr`**, corroborated by the Seattle portal's dataset page, its
Socrata API foundry entry, the Tyler Data & Insights mirror and the Data.gov catalogue record. The
preset now points there and is re-mapped against that dataset's published columns (`permitnum`,
`permitclassmapped`, `statuscurrent`, `applieddate`/`issueddate`/`expiresdate`/`completeddate`,
`originaladdress1`, `contractorcompanyname`, `latitude`/`longitude`, and the `Link` permalink).
`permitclassmapped='Non-Residential'` replaces the value floor, per §3.4.

**Also fixed in passing, because the dedupe fix depends on them:**

- **Silent parse failure (§6.6.1).** `parseRowsResult` distinguishes *unreadable* from *empty*. A
  truncated body, a WAF page or a changed envelope is now UNREACHABLE with a stated reason instead
  of a healthy-looking "0 rows read"; an empty JSON array is still genuine no-change.
- **`toIso` (§6.5).** Floating Socrata timestamps are pinned to UTC explicitly, so a
  month-boundary record can no longer shift buckets on a non-UTC runtime and re-ingest itself. The
  epoch-millis heuristic is now switchable off via a per-source `date_format` hint, so a numeric
  permit id cannot become a plausible date.
- **Signed coordinates.** The shared numeric reader rejected negatives, which would have nulled
  **every** US longitude the moment `lat`/`lon` were mapped.
- **Socrata structured columns.** `url`-typed columns yield their URL; any other object yields
  null instead of the string `"[object Object]"`.

**Deliberately NOT done here** (the buckets are the point):

- **Server-side `where` filtering stays as it is.** §3.9's stored-flag decision is implemented
  **client-side only**: a row the portal never sends cannot be flagged, so the disqualified-row
  guarantee covers everything we download, not everything that exists. Austin and Seattle move to
  a `property_class` clause (which is *wider* than the value floor it replaces — it stops dropping
  unpriced commercial jobs); Chicago, NYC and SF keep their existing clauses. Widening those
  windows is a coverage decision with a bandwidth cost and belongs with P3, and `le_ingest_runs`
  now records the denominator needed to make it.
- **No BUY-LATER work**: no DNC scrub, no email verification, no mobile/email append beyond the
  Places+website lookup that already existed.
- **No DERIVE-LATER work**: no `roof_age`, no `est_value_usd`, no contractor rollups, no
  `trade_tags` rule engine, no absence queries. The `trade_tags` column exists and stays empty.
- **No scoring changes** (§8) and no new sources (§7). `status_normalized` is captured and stamped
  onto the lead as `stage`, but nothing scores on it yet.
- **The cursor skip (§6.6.2) is still open** — `$limit` with no `$offset` still means a day with
  more than 100 qualifying records advances the cursor past the remainder. The dedupe fix makes
  this *safe to retry* (a re-fetched record now resolves to the same row instead of a duplicate),
  but paging itself is unbuilt.

**Still unverified against a live portal.** The egress proxy blocks every data portal from this
environment (§0), so apart from Seattle's dataset id every column name below remains
search-and-DDL sourced, exactly as §12 requires. Mapping an absent column is safe — it reads as
null, never invented — but a *wrong* mapping is silently empty, so §12's checklist stands, and
**Austin's `contractor_phone` / `applicant_phone` remain the single highest-value check.**

---

*Written against the shipped code: `app_0129_lead_engine.sql`, `app_0130_lead_customers.sql`,
`src/lib/garvis/leadEngine/leadEngine.ts`, `src/lib/garvis/leadEngine/adapters.ts`,
`supabase/functions/lead-ingest/index.ts`. Every line reference in this document was read, not
inferred.*
