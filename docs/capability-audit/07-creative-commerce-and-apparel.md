# 07 — Creative Commerce & Apparel: Product Design, Branding, Artwork Provenance, and the Artist Business

*Phase 5.5 capability audit. Domain: launching and running creative product ventures — an
apparel line built on granted artwork (the experience corpus's "Thread & Stone" / brother's-
artwork case), brand development as a reusable asset, and the artist/mural business itself
(portfolio, commissions, opportunity hunting). Rubric, formats, and evidence protocol:
`_charter.md`. Evidence: [R03 §1/§4/§6–§8] · [R05 §9.4–9.6, §9.14, §9.21, §12.3] ·
[R13 §8.6, §8.9–8.10, §9.1, §10.13–10.14] · `docs/capability-audit/11-integrations-build-vs-buy.md`
(cited [D11 §x] — its POD/storefront verdicts are binding here) · `docs/experience-architecture/`
(cited [XA nn §x] — everything cited this way is DOCUMENTED-ONLY by definition) ·
`prototypes/workshop-hands.html` (PROTOTYPE-ONLY) · direct greps of `src/`, `supabase/` inline.*

---

## 0. What this domain is (the honest headline)

This is the audit's inverse of the real-estate domain. Where "Mom" is the most deliberately
BUILT vertical, apparel/creative-commerce is the most deliberately IMAGINED one: the clothing
brand is scenario **S1** of the entire experience architecture [XA 01 §S1], Journey 4 walks it
beat by beat [XA 10 §J4], the Collection Studio is the workshop system's first named exemplar
craft [XA 16 §13.1], the mural business is Journey 3 [XA 10 §J3], and the cross-world artwork
grant is the constitution's canonical isolation case [XA _constitution §13]. One of the five
preserved prototypes — `prototypes/workshop-hands.html` ("P3 · The bench with hands") — renders
exactly this domain: six tee-graphic variants on a bench, critique, constraint moves.

Against all that imagination, the code answer is nearly empty. Greps of `src/` and `supabase/`
for `printful|printify|print-on-demand|product-mockup|mockup|apparel|merch|hoodie` return **no
product capability at all** — the only hits are a builder test fixture (`orchestratorCases.
verify.ts:79` — "Build me a wardrobe room where I render t-shirt designs, try print placements"
routed to `build_app`) and a migration comment reusing the same example (`app_0099`). The
system's own current answer to apparel design is literally "have the builder make yourself a
tool." No asset-grant schema exists anywhere in migrations (grep: only credit grants and
`autonomy_grants`). [R03 §6] lists no product channel; [R07] has no POD provider.

What IS real and load-bearing for this domain: image generation with honesty gates 🔌
[R13 §8.10], the brand/creative board substrate [R05 §9.4], `render-design` real-pixel
rendering [R13 §8.9], the never-strippable AI-provenance stamp [R05 §9.5], vision cataloging
that refuses to invent an artist/title/price [R13 §8.6], the builder + Stripe commerce rails
[R03 §1/§8, R13 §9.1], the paperwork chain [R03 §8], and — the domain's one genuine surprise —
an opportunity engine whose `kind` enum is *literally mural-biased* in production code
(`src/lib/garvis/opportunityHunt.ts:32`: `'mural' | 'public-art' | 'grant' | 'commission' |
'job' | 'other'`), confirmed by [R03 §4]. The artist business already has a working scraping
rail aimed at it; everything between that rail and a sold hoodie is documentation.

---

## 1. Chain 1 — THE APPAREL LINE (brand direction → granted artwork → product → store → learning)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| 1. Brand direction | **WORKING 🔌** | brandBoard AI logo concepts (`LOGO_STYLES`, every result stamped "AI logo concept — a starting point, not final or trademarked art") [R05 §9.4]; brand kits + vault files feed postcards/social/sites [R05 §9.27]; genesis births a Brand vault area [R05 §9.7] | Build (done); see Chain 2 for the token gap | Workshop | none (drafts) | Lens: brand health per venture | Holds; brand FINALIZATION (vector logo, guidelines) is MISSING [01 §13] |
| 2. Artwork sourcing WITH permission grant (the brother's-artwork case) | **DOCUMENTED-ONLY + ARCH-CHANGE** | The entire grant mechanic — approved from the granting world's Queue, listed on both Faces, revocable from either, provenance chip on every use, non-granted work mechanically unplaceable, revocation blocking further publishes but never deleting [XA 10 §J4.1/§J4.5, XA 07 §7.2, XA _constitution §13] — has zero schema: grep migrations = no asset-grant table; worlds are isolation boundaries with world-scoped reads and no controlled-exception mechanism [R03 §8 multi-business isolation] | Build: `asset_grants` substrate (spec below §1.1) | substrate + Mission (the grant request) | approve (from the granting world's side) | Both worlds' Faces list grants; lens: all grants in force | T-ME — the founding move of the venture cannot be represented at all |
| 3. Design placement on REAL product templates | **MISSING** (the SVG prototype is not this) | `workshop-hands.html` draws a `teeSVG()` silhouette over staged data — interaction proof, zero print truth (PROTOTYPE-ONLY, preserved per charter); the real spec — garment templates with named print placements, dimensions, colorway slots; production-ready export of per-placement print files at stated dimensions + colorway separations — exists only at [XA 16 §5.1 place-on-product]; nothing in `src/` renders onto a garment or knows a print dimension, DPI floor, or bleed | Buy the fidelity: Printful mockup + print-file generation ("building a garment renderer is pure waste" — [D11 §2.3], binding); Build: the fail-closed print-fidelity gate (DPI at placement size, bleed, ink/colorway count) as a Capability, in the `partitionMailable` "nothing prints on a guess" mold [R05 §9.11] | Capability (placement + gate) under the Workshop | none (internal) — the gate refuses, like suppression | — | T-ME — without it every design is a picture, not a product |
| 4. Variant generation / critique | **WORKING 🔌 (generation) / MISSING (apparel criteria)** | `generate-image` gpt-image-1 real, credit-metered, provenance-stamped [R13 §8.10, R05 §9.5]; creativeBoard concurrent gen + lineage [R03 §6]; but no apparel rubric exists in code — the criteria pack (print integrity at garment scale, colorway safety, placement conventions, read-at-distance, keep ≥8) is [XA 10 §J4.2, XA 16 §13.1] only. The PATTERN is proven twice in-house: the site anti-slop rubric (`DESIGN_GUIDE` "the indigo/purple-gradient look is the #1 'AI slop' signature", 8 named archetypes) [R13 §10.13] and the five-persona critique chain with simulated-owner + auditor [R05 §13]; `copyJudge` per-channel fail-closed scoring [R13 §10.14] | Build: an apparel channel for the judge + a critique persona ("skeptical screen-printer / boutique buyer") on the existing seam | Workshop bench + Capability (rubric-as-data) | none (internal critique) | Cohort: one apparel criteria pack versioned across ventures | T-ME — ungated variants are exactly the "AI slop" the house style exists to kill |
| 5. Collection assembly | **PARTIAL** | `creativeBoard.ts` substrate is real and right-shaped: tiles with lineage, immutable mutators, `ARCHIVE_GROUP` (nothing deleted), layout math [R05 §9.4]; but no collection/drop noun, no variant SETS carrying their generating constraints, no tournament bracket (all [XA 16 §5.1]) | Build: a collection board adapter on creativeBoard (the postcard/social/email adapters are the template) | Workshop → Artifact ("Drop 01 board") | none | Lens: drops in flight across ventures | T-ME for the tournament; the plain board works today |
| 6. Print-on-demand fulfillment | **MISSING + EXT-REQUIRED** | zero code (grep); [R07] has no POD provider; [01 §14] concurs | **Buy — Printful first, Printify later as margin play ([D11 §2.3], binding).** Three integration surfaces: catalog/variant sync (products, print areas, per-variant COGS), mockup API (bundled free — the step-3 fidelity engine), order submit + order webhooks into the fan-in family [D11 §3.3]. Cost model: no platform fee; per-item COGS ≈ $13–16 printed tee / $25–32 hoodie + shipping (approximate, catalog-synced not hardcoded); a $30 tee grosses ≈ $12–15 before Stripe fees; Printify's multi-vendor network runs ~10–20% cheaper with variable QC (+optional ~$29/mo Premium tier) — an optimization, not a foundation | Capability behind an order executor | approve → earned (an order is money leaving; sample orders could earn autonomy under a cost ceiling, the level-10 hard-ceiling rule generalized [D11 §3.4]) | Control-plane: per-venture POD spend + defect rate | T-ME — the chain's revenue-blocking gap, exactly as Lob is for direct mail |
| 7. Storefront | **PARTIAL 🔌** | The rails are real: builder produces sellable sites [R03 §1], publish + custom domains for prospect sites [R03 §4], Stripe Payment Link → webhook → server-side publish loop proven zero-browser [R13 §9.1], generated apps get merchant-compliance + Stripe guidance (`supabase/functions/_shared/prompts.ts:542–554`) [R13 §10.13]; but the platform owns no product/order/inventory model [01 §14] — a "store" today is a page with a Payment Link | **Build on own rails; Shopify by exception only ([D11 §2.3], binding).** Operator's OWN venture sells on his own Stripe at T-ME (merchant of record is correctly him); a CLIENT's brand is blocked on Stripe Connect [D11 §2.5] | Workshop (Store) → site deep artifact | approve (publish) | Lens: live stores + order volume per venture | T-10 when the store is a client's — Connect is the wall |
| 8. Listing copy | **PARTIAL** | The one-writer-one-judge seam is built and channel-extensible: `board-copy` + `copyJudge` FIELDS/CRAFT contracts, honesty absolute, quality score per draft [R13 §8.8, §10.14]; channels today are postcard/social/email/idea — no product-listing channel (size/fit/material facts, care, shipping/returns as `[EDIT]` holes) | Build: one more channel contract on the existing seam | Capability | approve (public claims about a physical good) | — | Holds once built; a product listing that invents fabric content is a liability, so the honesty contract is load-bearing |
| 9. Launch mission | **WORKING (substrate) / DOCUMENTED-ONLY (template)** | Missions/arcs/wake-loop + approval spine are the house spine [R03 §2]; the "produce Drop 01" plan (sampling → vendor run gated with cost inline → production wait as honest state → lookbook → store publish → announcement send) is [XA 10 §J4.3] only; plays-as-data (`plays.ts`) is the proven encoding for exactly such a sequence [R05 §9.26] | Build: a drop play + mission template on existing spines | Mission | approve at each outward gate | Slate: pending drop gates across ventures | Holds — this is genuinely just data on built rails |
| 10. Sales-data ingestion | **MISSING** | No order webhook, no Orders dataset (the [XA 10 §J4.3] "Orders" artifact has no substrate); nearest real things: `site-events` pixel for storefront visits/QR attribution 🔌 [R13 §7.13], Stripe SaaS webhook (platform-side only) [R07 §2.5], the data workspace's real CSV parser as a manual floor [R05 §9.21] | Build: POD order webhooks + Stripe events → an orders table; CSV import floor exists today | substrate + Standing Order (sync) | none (inbound) | Lens: sell-through per drop per venture | T-ME — without orders-as-rows, step 11 can never exist |
| 11. Outcome learning | **MISSING** | "#3 black: 21 of 38 orders" annotations and the gated Playbook lesson ("hand-inked texture outsells flattened fills 3:1") are [XA 10 §J4.6] only; the mind's decision ledger closes outcomes manually [R06 §8]; the earned-autonomy content-week loop is the in-house proof that outcome→trust loops can work [R03 §6] | Build: order rows → per-design outcome annotations → criteria-pack reweighting, through the existing consolidation gate | ledger + Standing Order | none (internal); lessons human-gated | Cohort compare: which artwork/colorway wins across drops | T-10 — taste that lives in the operator's head doesn't transfer to a second venture |

**Chain verdict.** Steps 1, 4(gen), 9(substrate) ride real rails; steps 2, 3, 6, 10 are the
chain's four absences, and they are load-order-dependent: the grant substrate (2) is the
founding move, Printful (6) supplies the fidelity that decides step 3's build-vs-buy AND the
webhooks that make step 10 possible, and step 10 is the precondition for step 11. The honest
one-line status: **the system can imagine this business in extraordinary detail and cannot yet
represent its first transaction.** Against the charter's central test, the apparel chain today
performs brand concepts and image variants — everything downstream of "put it on a real
garment" is documentation.

### 1.1 What the grant schema needs (the brother's-artwork case, made concrete)

The experience corpus specifies behavior precisely enough to derive the substrate. An
`asset_grants` design that honors it:

- **Grant row**: `granting_world_id`, `receiving_world_id`, `license_class`
  (`print | display | derivative`), `granted_at/by`, `revoked_at/by`, and an **evidence
  pointer** for the counterparty's human yes — Marco never acts in the operator's Queue; his
  consent lives in conversation records [XA 10 §J4.1], so the schema stores a reference, not an
  actor.
- **Membership rows**: grant → specific asset ids (the "12 pieces", extendable to 15 by a new
  approval [XA 10 §J4.4]) — never a world-wide wildcard; the courthouse-mural near-miss
  [XA 10 §J4.5] requires per-piece scoping with a *reason* on excluded pieces ("commissioned
  work — owned by Riverside Cafe"), i.e., ownership metadata on the artist world's assets.
- **Enforcement at the read layer**: today world-scoped reads ARE the isolation mechanism
  [R03 §8]; a grant is a schema-level controlled exception to that invariant — which is
  exactly why this is **ARCH-CHANGE**, not new code: RLS/read paths must learn "visible across
  worlds iff an unrevoked grant row exists," and the mechanical block ("cannot land on the
  bench at all — the boundary is mechanical, not advisory") must be the query, not a UI filter.
- **Derived-work lineage**: every artifact derived from granted material carries the chain
  (creativeBoard tile lineage [R05 §9.4] is the existing pattern to extend); revocation stamps
  derived artifacts and **blocks further publishes** fail-closed, but never deletes
  [XA 07 §7.2] — the disclosureGate/publish-gate pattern [R05 §9.5] is the enforcement mold.
- **Both-Faces visibility + instant revoke**: mirrors `autonomy_grants`' revocable-grant shape
  [R03 §2] — the one grant-like structure the schema already has.

The classification is deliberately harsh: PARTIAL would imply an edge of a loop exists in code.
None does. But the build is smaller than ARCH-CHANGE usually implies, because every enforcement
pattern the grant needs is already proven elsewhere in the estate — revocable grant rows
(`autonomy_grants`), fail-closed publish gates (`disclosureGate`), lineage on derived tiles
(creativeBoard), approval-from-the-owning-side (the spine). The architecture change is ONE
invariant amendment: "world-scoped reads, with grant rows as the sole schema-checked exception."

### 1.2 The POD buy, costed (step 6 expanded — candidates and integration surfaces)

[D11 §2.3] already ruled Printful-first; this table records what the ruling buys and what it
costs, so the executor's cost ceilings can be real numbers. All prices approximate (July 2026
class), catalog-synced at runtime — never hardcoded, per house honesty rules.

| Candidate | Model | Unit economics (tee / hoodie) | Fit with the estate |
|---|---|---|---|
| **Printful** (ruled first) | in-house production, single QC standard | ≈$13–16 / $25–32 printed + shipping; no monthly fee; mockup + print-file APIs bundled free | First-class REST + webhooks (order status, shipment, returns) → drops onto the HMAC-verified fan-in family [D11 §3.3]; per-client stores = per-client store IDs in the connector registry |
| Printify (ruled later) | marketplace of third-party print shops | ~10–20% cheaper; QC varies by shop; optional Premium ≈$29/mo for ~20% catalog discount | Same API shape; a margin optimization once volume justifies QC variance management |
| Gelato / Gooten (not ruled) | distributed-production networks | comparable; strength is international routing | Revisit only if EU/international fulfillment becomes a real order pattern — T-SPEC |

Unit reality for the chain's economics rows: a $30 tee grosses ≈$12–15 before Stripe fees and
shipping subsidy; a drop of 4 designs × 3 colorways carries zero inventory risk (per-order
production) but per-unit COGS roughly 2–3× bulk screen-printing — which is precisely why the
**vendor-run alternative** (the [XA 10 §J4.3] bulk print vendor with quote-cited cost inline)
must stay a sibling path, not be replaced: POD is the zero-risk launch rail; bulk is the
margin rail a proven design graduates to. Both end at the same approval shape — a cost ceiling
the executor enforces, the level-10 rule generalized [D11 §3.4].

Integration surfaces, in build order: (1) **catalog sync** (products, variants, print areas,
COGS — a Standing Order, read-only, safe-autonomous); (2) **mockup API** (the step-3 fidelity
engine — synchronous, credit-metered like `generate-image`); (3) **order submit** (the
executor behind an `approve` gate with the ceiling); (4) **order webhooks** (status →
`orders` rows — the step-10 substrate). Nothing in this list invents a new pattern; every
piece maps onto an existing house rail.

---

## 2. Chain 2 — BRAND DEVELOPMENT (the brand as a reusable asset)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Brand discovery/direction | **WORKING** | genesis Brand vault area born with the world [R05 §9.7]; research-grounded DNA; verticals overlay incl. `creative` + `retail`/`ecommerce` packs (framework data, zero-AI floor) [R05 §9.14] | done | Workshop | none | — | Holds |
| Logo / visual identity concepts | **WORKING 🔌** | brandBoard `LOGO_STYLES`, text/watermark forbidden in prompts, honest "starting point, not trademarked art" note on every result [R05 §9.4] | done | Workshop bench | none | — | Holds as concepts; see finalization row |
| Brand kit as reusable tokens | **PARTIAL** | kits + vault files DO feed postcards, social, and sites [R05 §9.27]; per-brand sender identities/domains carry the brand into email [R03 §5]; builder apps get design-token discipline (semantic tokens on CSS variables) [R13 §10.12] — but there is no ONE brand-token store: each surface reads its own shape, and a palette change re-propagates by hand | Build: one brand-kit substrate (palette/type/logo/voice as data) consumed by mailer, boards, render-design, builder scaffold | substrate | none | Cohort: one brand kit versioned, every surface inherits | T-10 — ten brands hand-synced across five surfaces is drift by construction |
| Voice + isolation | **WORKING** | per-world voice from most recent *posted* row — "one business's voice doesn't bleed into another's" [R05 §9.4]; `VOICE_GUIDE` in the builder [R13 §10.13] | done | Capability | none | — | Holds to T-100 (world-scoped by design) |
| Brand application (render to real pixels) | **WORKING** | `render-design` satori→resvg PNG, "designs become real pixels," no AI disclosure needed for the business's own graphic [R13 §8.9] — but `DESIGN_SIZES` are social sizes only; print-DPI is the same specced-only gap the RE audit logged (level-10 #1) | Build: extend sizes (shared fix with direct mail — one build serves two domains) | Capability | none | — | T-ME for anything printed |
| Brand guidelines / finalization | **MISSING** | no vector-logo delivery, no trademark workflow, no guidelines doc [01 §13] | Build (doc producer on depth engine) + Buy (human designer referral is the honest T-ME answer for a real trademark-grade mark) | Capability | approve | — | T-10 when brands are deliverables to clients |
| Brand evolution / learning | **MISSING** | no outcome loop from channel performance back into the kit; the Playbook mechanism is [XA _constitution §12] only | Build after Chain 1 step 10 exists | Standing Order | none | Cohort brand-performance compare | T-100 |

**Chain verdict.** The strongest of the three chains today — concept-to-application works for
digital surfaces. The single structural gap is that "brand kit" is a convention, not a noun:
five consumers, no shared substrate. One `brand_kits` table + consumers repointed is cheap,
unblocks the apparel Brand area, the mural business's identity, and every client brand at once,
and is the prerequisite for cohort-level brand versioning at T-100.

---

## 3. Chain 3 — THE ARTIST / MURAL BUSINESS (Marco's world)

| Step | Status | Evidence | Build/Buy | Owner object | Approval posture | Portfolio surface | Breaks at |
|---|---|---|---|---|---|---|---|
| Portfolio | **WORKING (showcase) / DOCUMENTED-ONLY (living portfolio)** | the flagship artist scroll-story is a complete real project riding the normal edit/deploy pipeline (`src/lib/flagship/projectApp.txt`, `saveFlagshipAsProject()`) [R05 §12.3]; `/dev/flagship-artist` spike is ungated in production (flagged risk) [R03 §10]; the curated-selection-as-revocable-share whose visits annotate pieces is [XA 03 §7.3] only | Build: portfolio = builder site + site-events (both real); the annotation loop is new | Capability → Artifact | approve (publish) | Lens: portfolio momentum per artist client | T-ME works via builder; the learning loop is T-10 |
| Artwork cataloging | **WORKING** | vision ingest "describe ONLY what is visible; NEVER invent an artist, title, price" [R13 §8.6]; vault files + cluster galleries [R03 §3] | done | Capability | none | — | Holds |
| Physical-art provenance registry (editions, certificates, collector records) | **MISSING** | nothing anywhere; [01 §15] concurs; distinct from the WORKING AI-media provenance stamp [R05 §9.5], which answers "did AI make this?" not "who owns print rights?" | Build: ownership/edition/license metadata on assets — **the same metadata Chain 1 step 2 requires** (the courthouse-mural exclusion is unanswerable without it); certificates ride the paperwork chain | substrate | none | — | T-ME for the grant case; T-10 for collector management |
| Inquiry intake | **WORKING 🔌** | forward-in alias mailbox + reply classification + OpsInbox one stream [R13 §7.6, R06 §12]; site inquiry forms store-never-send [R05 §9.27] | done | Capability | none (inbound) | Slate: new inquiries | Holds; whole-inbox gap applies as everywhere [D11 §2.2] |
| Mural opportunity scraping | **WORKING 🔌** | the opportunity engine is real AND already aimed here: search → fetch → honest extraction with URL-allowlist gauntlet → deduped feed [R03 §4]; `kind` enum in production: `'mural' | 'public-art' | 'grant' | 'commission' | 'job' | 'other'` (`opportunityHunt.ts:32,90,136`) — the file's own comment: "'scrape the internet for mural jobs' had no home" — this rail is the domain's head start | done; Build: fit/effort scoring + map flank are [XA 03 §7.3, XA 16 §14] only | Standing Order (opportunity_hunt exists [R13 §6.3]) | none (read); pitches always approve | Lens: opportunity feed across artist clients | Holds to T-10; the *generic* kind registry (de-biasing the enum) is the T-10 need [R03 §4 notes it] |
| Pitch / proposal | **PARTIAL** | the paperwork chain reuses cleanly: sample → `{{token}}` template → merge with visible holes → refuse-unsendable [R03 §8]; send via the one email path 🔌; DocuSign for accepted commissions 🔌 (sandbox default) [R13 §9.5]; the mural-pitch criteria pack + proposal critique are [XA 03 §7.3] only | Build: a proposal document-bench flow + criteria pack as data (§6) | Workshop (§6) | approve (always — outbound + money terms) | Slate: pitches awaiting approval | Holds at T-ME with hand-carried context |
| Commission pipeline | **PARTIAL** | contacts CRM stages + activity timeline are generic-real [R03 §5]; the commission stage model (inquiry → concept → deposit → wall → final, "wall" as declared judgment stage) is [XA 03 §7.3] only; concept mock-ups against the client's space = creativeBoard + generate-image, real today | Build: stage model as data (timelines.ts anchor+offset pattern is the mold [R05 §9.26]) | Mission per commission | approve at money/send gates | Lens: commissions by stage across artists | T-10 — six unreconciled people tables [R03 §5] carry this debt too |
| Deposits / invoicing | **WORKING 🔌** | invoices + 4-rung chase ladder, approval-gated, "PAID is a fact only the operator confirms" [R05 §9.26, R13 §7.10]; Stripe Payment Links [R07 §2.5B] | done | Standing Order (chase) | approve | Slate: owed vs received | Holds; client-owned money needs Connect at T-100 [D11 §2.5] |
| Prints & products side | **MISSING** | [XA 03 §7.3] "could grow here: Prints & products" — this IS Chain 1 with the artist as both granter and vendor; blocked on the same four absences | see Chain 1 | — | — | — | — |
| Outcome learning | **PARTIAL** | draft_verdicts kept-vs-rewritten feedback is real for replies 🔌 [R13 §7.7]; proposal win/loss annotation → Playbook is [XA 10 §J3] only | Build once proposals are rows | ledger | none | Cohort: which pitch angle wins per opportunity kind | T-10 |

**Chain verdict.** The mural business is the domain's nearest-to-real chain: scraping rail
WORKING and already vocabulary-matched, intake WORKING, invoicing WORKING, portfolio buildable
today on the builder, paperwork chain reusable for proposals. The gaps are data models
(commission stages, criteria packs, art-ownership metadata), not integrations — no EXT-REQUIRED
row in the whole chain. This should be the domain's FIRST shipped vertical, and its
art-ownership substrate is the same table Chain 1's grant case needs.

### 3.1 Near-misses — the domain's built-but-unaimed pieces (the DISCONNECTED check)

The charter demands flagging the built-but-not-connected disease. This domain's variant is
subtler than the inventory's register: pieces built FOR this domain that no venture path can
reach, because the venture itself has no front door.

| # | Built thing | Not connected to | Evidence | Repair shape |
|---|---|---|---|---|
| 1 | The `creative` vertical: keyword detection includes `'mural'`, `'painter'`, `'tattoo'`, `'jewelry maker'`; seed pack includes "How creative work actually sells" — a real artist-economics brief | Any venture template: `WEB_TEMPLATES` contains exactly two entries (`MOM_REAL_ESTATE_TEMPLATE`, `APP_LAUNCH_TEMPLATE`) — genesis can DETECT an artist venture from DNA but has no artist work-web to instantiate, so Marco's world would be born generic | `verticals.ts:50,321`; `workweb.ts:243` | An ARTIST_TEMPLATE row (the mom template proves venture-as-data works); the [XA 03 §7.3] six-area dressing is the spec |
| 2 | The mural-native opportunity `kind` enum + `opportunity_hunt` standing order 🔌 | Any pitch/proposal consumer: a promoted opportunity has nowhere to go — no proposal workshop, no mural criteria pack, no commission record to become | `opportunityHunt.ts:32`; [R03 §4] | Chain-3 pitch row (§6 workshop); the feed's catch currently dead-ends in the feed |
| 3 | The flagship artist portfolio — a complete artist site riding the real edit/deploy pipeline | Genesis: `saveFlagshipAsProject()` creates a showcase PROJECT, never seeds an artist VENTURE; the corpus's best artist asset teaches the builder's ceiling and feeds nothing | [R05 §12.3]; `flagshipProject.ts` | Offer it as the Portfolio-area starter inside repair #1's template |
| 4 | The builder-as-escape-hatch for placement: the orchestrator's own verified case routes "render t-shirt designs, try print placements" to `build_app` (the "wardrobe room") | The platform's product substrate: a bespoke wardrobe room would hold designs as app state — no grants, no provenance chips, no criteria packs, no drop missions, invisible to the portfolio | `orchestratorCases.verify.ts:79`; `actionCatalog.ts:137` | Honest today (the tool exists), wrong at T-10; Chain 1's Workshop is the real answer, and the case should re-route once it exists |
| 5 | `/dev/flagship-artist` spike — ungated in production | The DEV gate the other nine dev pages have | [R03 §10]; `App.tsx:167` | One-line gate; carried here because it is this domain's page |

The pattern across all five: **the domain's working pieces are aimed at demonstration, not
operation.** The enum, the vertical pack, and the flagship site are each real; none of them can
currently participate in an actual artist's actual business, because the venture-shaped
container is missing.

---

## 4. Proposed Workshop: APPAREL / PRODUCT WORKSHOP (charter 14-field spec)

- **Job**: take granted or owned artwork to a sellable product line — variant exploration,
  placement on real garments, critique to a bar, drop assembly, production handoff — at a
  standard where what is approved is what gets printed.
- **Knowledge required**: print-method constraints (DTG vs screen; ink counts), DPI floors at
  placement size, garment placement conventions, colorway safety, read-at-distance judgment,
  per-variant COGS/margin math — none encoded today; the criteria pack of [XA 16 §13.1] is the
  spec to encode as data (verticals.ts `creative` overlay is the mold [R05 §9.14]).
- **Source data required**: granted-artwork set with license class + provenance (§1.1 substrate),
  brand kit, POD catalog sync (garments, print areas, variant COGS), order rows (once step 10
  exists), prior drops' outcome annotations.
- **Direct-manipulation surface**: the gallery/variants bench grammar — variant sets, constraint
  moves, tournament, score — plus the place-on-product move rendering via the bought mockup API;
  `workshop-hands.html` validates the interaction, deliberately not the fidelity.
- **AI's role**: variant generation (gpt-image-1, provenance-stamped), critique against the
  rubric with per-criterion whys, listing copy through the judge seam; never a claimed fact
  about fabric/fit, never an order, never a publish.
- **Tools**: creativeBoard mutators, generate-image, render-design (extended sizes), the
  print-fidelity gate (new), collection/tournament adapter (new), campaignCore-style listing
  compiler (new channel), logMailBatch-style production ledger.
- **External integrations**: **Printful** (catalog, mockups, print files, orders, webhooks) —
  Printify later [D11 §2.3]; Stripe (own account at T-ME; Connect for client ventures);
  existing social/email rails for the drop announcement.
- **Evaluation/critique criteria**: apparel criteria pack ≥8 fail-closed (pattern: board-copy
  judge [R13 §10.14]); print-fidelity gate (DPI/bleed/ink-count) refusing like suppression;
  provenance/disclosure gates on AI-assisted art [R05 §9.5]; grant-in-force check before any
  publish (§1.1); margin floor check on any priced listing.
- **Output Artifacts**: drop board (designs × colorways, versioned), per-placement
  production-ready print files, product mockup set, listing copy set, lookbook, the store page.
- **Missions it creates**: "Produce Drop 01" (sample → vendor run gated with cost inline →
  lookbook → store publish → announcement) — each gate on the spine.
- **Standing Orders it establishes**: order-webhook sync; sell-through digest; restock watch
  (threshold on order rows → draft reorder, gated); overnight variant exploration under a
  budget (the content-week producer pattern).
- **Outcome signals it learns from**: per-design/colorway sales rows, sample QC annotations,
  return/defect rates, kept-vs-rewritten listing verdicts — feeding criteria-pack reweighting
  through the human-gated consolidation loop.
- **Expert controls**: rubric editing (operator criteria join the pack), grant management +
  instant revoke, cost ceilings per order, sample-before-run enforcement, kill switch on the
  store.
- **Fast-path (AI-assisted)**: "make tees from Marco's three new pieces" → grant check →
  twelve variants placed on the default garment set → scored → one review pass → drop board +
  gated sample order.
- **Verdict**: **REUSABLE-FRAMEWORK — conditionally, and the condition is that print fidelity
  is BOUGHT.** The task's deciding criterion is print fidelity, and it cuts thus: with
  Printful's mockup + print-file generation as the fidelity engine, the bench stays the
  gallery/variants grammar and fidelity becomes a fail-closed gate Capability — the same shape
  as the RE workshop's verdict, where print-DPI parity was a render capability, not a surface.
  The DEEP-ENVIRONMENT trigger would be building an in-house true-scale garment canvas
  (placement drag, curved-surface preview, separations) — the direction the SVG prototype
  points — and [D11 §2.3] explicitly rules that out as "pure waste." If that ruling ever
  reverses (e.g., cut-and-sew products Printful can't template), this verdict flips with it.

## 5. Proposed Workshop: BRAND WORKSHOP

- **Job**: develop, codify, and maintain a brand — identity, voice, palette, type, usage rules —
  as one versioned kit every surface inherits.
- **Knowledge required**: identity-design judgment, trademark basics (as honest referral
  boundaries, not encoded law), per-channel application constraints (already partially encoded:
  hashtag caps, sender identities, design tokens).
- **Source data required**: world DNA + business context, brandBoard concept history, vault
  assets, channel performance rows (future), the vertical's compliance overlay.
- **Direct-manipulation surface**: document + gallery benches — the [XA 03 §7.4] Brand area
  shape; kit fields directly editable.
- **AI's role**: concept generation (logo boards), voice drafting, application previews via
  render-design; never finalizes a mark as trademark-ready (the existing honesty note is the
  contract).
- **Tools**: brandBoard, render-design, the brand-kit substrate (new), depth engine for the
  guidelines doc.
- **External integrations**: none required at T-ME; designer-referral is the honest finalization
  path; per-brand sender domains already exist 🔌.
- **Evaluation/critique criteria**: consistency check across surfaces (kit vs actual usage);
  anti-slop design rubric reused from the builder [R13 §10.13]; voice-bleed check (world-scoped
  voice is the existing invariant).
- **Output Artifacts**: the brand kit (versioned), guidelines document, logo concept boards,
  application mockup set.
- **Missions it creates**: "Rebrand X," "Stand up brand for new venture" (a genesis companion).
- **Standing Orders it establishes**: none at charter; brand-consistency sweep at T-100.
- **Outcome signals it learns from**: channel performance by brand version (blocked on Chain 1
  step 10 / social metrics, partially real 🔌).
- **Expert controls**: kit lock (no surface may override), version pinning per campaign,
  revoke-and-repropagate.
- **Fast-path**: "brand for the hot-sauce venture" → three directions from DNA → pick →
  kit seeded → every surface reads it.
- **Verdict**: **REUSABLE-FRAMEWORK.** Document + gallery benches carry it fully; the missing
  piece is the kit substrate (a table), not a surface.

## 6. Proposed Workshop: PROPOSAL WORKSHOP (artist/commission, generalizable)

- **Job**: turn an opportunity or inquiry into a priced, evidenced, sendable proposal —
  mural commissions first, any bid-shaped work eventually.
- **Knowledge required**: pricing-from-evidence (the gallerist-producer stance: "prices from
  evidence, never invents a title or a price" [XA 03 §7.3]), scope framing, deposit conventions,
  the mural-pitch criteria pack (to be encoded as data).
- **Source data required**: the opportunity row with its citation URL (real today 🔌), site
  photos/wall dimensions from intake, portfolio pieces (granted-visibility rules apply),
  prior proposals + their win/loss annotations.
- **Direct-manipulation surface**: document bench primary ([XA 16 §5.2] names proposals as a
  document-bench craft) + table flank for the opportunity rows — the Outreach Studio shape
  [XA 16 §13.2].
- **AI's role**: draft angles, tighten/restructure, score against the criteria pack; never a
  price without an evidence row; never sends.
- **Tools**: the paperwork chain (template/merge/refuse-unsendable — WORKING [R03 §8]),
  opportunityHunt feed, send-email path, DocuSign send, invoice creation on acceptance.
- **External integrations**: all existing 🔌 (Resend, DocuSign, Stripe links); none new.
- **Evaluation/critique criteria**: criteria-pack score with per-criterion whys; merge-hole
  refuse-unsendable gate (exists); suppression/consent checks (exist).
- **Output Artifacts**: the proposal document (versioned), pricing sheet, the pitch email.
- **Missions it creates**: "Win the brewery wall" (pitch → follow-up → close → commission
  mission handoff).
- **Standing Orders it establishes**: opportunity_hunt (exists 🔌); follow-up cadence on sent
  proposals (exists as outreach followups 🔌).
- **Outcome signals it learns from**: win/loss with reasons, response rates per angle per
  opportunity kind, draft verdicts (rail exists 🔌).
- **Expert controls**: price floor override, per-client tone lock, do-not-pitch list
  (suppression pattern).
- **Fast-path**: promoted opportunity → proposal pre-filled from template + portfolio + criteria
  → one review → one approval (send).
- **Verdict**: **REUSABLE-FRAMEWORK.** Document bench + table flank + the already-working
  paperwork/send/e-sign chains; the only new material is criteria packs and the win/loss ledger
  — data, not surface.

---

## 7. The dependency spine (what unblocks what)

Not a roadmap (doc 13's job) — a dependency record, because this domain's gaps are unusually
order-constrained and the ordering IS an audit finding:

1. **Art-ownership metadata + `asset_grants`** (§1.1) unblocks: the founding move of any
   granted-artwork venture, the courthouse-mural refusal, the provenance registry row of
   Chain 3, and every publish gate downstream. Nothing else in Chain 1 is honest without it —
   a design pipeline over unlicensed art is a liability engine.
2. **Printful integration** (§1.2) unblocks three steps at once: real product templates
   (mockup API is the fidelity engine — step 3), fulfillment (step 6), and the order-webhook
   substrate (step 10). It is this domain's Lob: the single buy the whole chain hangs on, with
   the spec pattern already written for the sibling case [D11 §2.2–2.3].
3. **Criteria packs as data** (apparel §4, mural-pitch §6) unblock critique and the mastery
   loop; they cost nothing external and reuse the judge seam — highest ratio of leverage to
   effort in the domain.
4. **Orders-as-rows** (step 10) is the precondition for every learning claim the experience
   corpus makes about this domain (sell-through vitals, outcome annotations, Playbook lessons,
   restock automation). Until it exists, "outcome learning" cannot even be PARTIAL.
5. **The artist venture template** (§3.1 #1) is independent of all four — data-only, buildable
   today, and turns three already-working rails (opportunity feed, invoicing, portfolio) into
   the domain's first operating business. That independence is why Chain 3 should ship first.

The mural business needs items 3 and 5 only. The apparel business needs all five. Same
domain, different distances from reality — and the shared substrate (ownership metadata,
brand kit, criteria-pack machinery) means the mural build is not a detour but a down payment.

---

## 8. The fifteen questions

| # | Question | Answer for this domain |
|---|---|---|
| 1 | Exists-working | Image gen + provenance stamps 🔌, brand boards/kits, creativeBoard substrate, render-design, vision cataloging (never invents artist/title/price), flagship artist portfolio as real project, opportunity engine with mural-native kind enum 🔌, paperwork front half, invoices + chase 🔌, builder + Stripe pay→publish loop 🔌, forward-in inquiry intake 🔌 |
| 2 | Partial/scaffold | Collection assembly (board substrate, no drop/tournament), storefront (rails without product/order/inventory model), listing copy (judge seam without a product channel), brand kit (convention, not substrate), commission pipeline (generic CRM without stage model), proposal flow (chain reusable, no criteria pack) |
| 3 | Docs/prompts/prototypes only | The ENTIRE grant mechanic (constitution §13, J4.1/J4.5, 07 §7.2), place-on-product + production-ready export (16 §5.1), apparel criteria pack + Collection Studio (16 §13.1), drop mission (J4.3), Orders dataset + restock automation (J4.3), outcome annotations + Playbook (J4.6), mural stage model + pitch criteria (03 §7.3); `workshop-hands.html` staged-SVG bench (PROTOTYPE-ONLY) |
| 4 | Missing | POD fulfillment, real product templates + print-fidelity gate, asset-grant schema (grep migrations: none), physical-art ownership/edition registry, product listing channel, order ingestion, outcome learning, brand finalization |
| 5 | Build internal | `asset_grants` substrate + read-layer enforcement, print-fidelity gate, collection/tournament adapter, apparel + product-listing judge channels, brand-kit table, commission stage model, criteria packs as data, drop play/mission template, orders table + annotations |
| 6 | External API | **Printful** (catalog/mockups/print files/orders/webhooks; Printify later) [D11 §2.3]; Stripe Connect at client scale [D11 §2.5]; already live: Stripe, Resend, DocuSign, Ayrshare, gpt-image-1 — no new buy needed for the mural chain at all |
| 7 | Reusable Capability | Print-fidelity gate (serves postcards too), grant substrate (any cross-world asset), brand kit (every venture + client), judge channels, opportunity scoring, vision cataloging |
| 8 | Domain Workshop | Apparel/Product (REUSABLE-FRAMEWORK *conditional on buying fidelity* — §4), Brand (REUSABLE-FRAMEWORK — §5), Proposal (REUSABLE-FRAMEWORK — §6); no DEEP-ENVIRONMENT in this domain while the [D11] garment-renderer ruling stands |
| 9 | Mission | Produce Drop N; Win the wall; Rebrand X; Stand up the store — all fit the existing arc/approval spine |
| 10 | Standing Order | opportunity_hunt (exists 🔌), order-webhook sync, sell-through digest, restock watch, overnight variant exploration under budget, proposal follow-up cadence (exists 🔌) |
| 11 | Requires approval | Every grant (from the granting world's side), every POD order and vendor run (cost inline, hard ceiling), store publishes, pitches/proposals, drop announcements — money and outward sends, per the house invariant |
| 12 | Safe autonomous | Variant generation under credit budget (metered), critique/scoring, catalog/order/metrics syncs (read), mockup rendering; sample reorders could EARN autonomy under a ceiling (content-week pattern) — never first-run vendor spends |
| 13 | Portfolio-level | Grants-in-force lens (both Faces, revoke anywhere), drops in flight, POD spend + defect anomaly per venture, sell-through cohort compare, opportunity feeds across artist clients, one apparel criteria pack versioned across ventures |
| 14 | Breaks at 10/100/1k | T-ME: grant substrate, templates/fidelity, POD, order ingestion all absent — the venture cannot start. T-10: brand-kit drift across hand-synced surfaces; client storefronts hit the Connect wall; six people tables carry commissions. T-100: criteria-pack + kit versioning, per-client POD stores/keys in the connector registry [D11 §3]. T-1K: nothing here survives without the control plane (doc 10) |
| 15 | Mastery needs | Print-production literacy (DPI/bleed/ink/garment — none encoded), licensing/ownership literacy (grants, commissioned-work ownership, trademark boundaries), unit economics per garment, taste-transfer loops (rubric editing + outcome annotations — the corpus's most explicit mastery design [XA 10 §J4.6], zero substrate) |

---

## Matrix rows

| Capability | Class | Evidence | Needed-at | Owner object | Note |
|---|---|---|---|---|---|
| Cross-world artwork grant substrate | DOCUMENTED-ONLY + ARCH-CHANGE | XA _constitution §13, XA 10 §J4.1; grep migrations: no asset-grant table | T-ME | substrate | controlled exception to world isolation; §1.1 spec; autonomy_grants is the nearest shape |
| Physical-art ownership/edition registry | MISSING | [grep]; distinct from WORKING AI-provenance stamp [R05 §9.5] | T-ME | substrate | same metadata the grant case needs (courthouse-mural exclusion) |
| Product templates + print-fidelity gate | MISSING + EXT-REQUIRED | XA 16 §5.1 spec only; workshop-hands.html is staged SVG | T-ME | Capability | fidelity bought (Printful mockups/print files); gate built fail-closed |
| POD fulfillment (catalog/mockup/orders/webhooks) | MISSING + EXT-REQUIRED | [grep]; [01 §14]; [D11 §2.3] Printful-first ruling | T-ME | Capability | per-item COGS, no platform fee; Printify later as margin play |
| Apparel criteria pack + critique channel | MISSING | pack is XA 16 §13.1 only; judge seam exists [R13 §10.14] | T-ME | Capability | site anti-slop rubric [R13 §10.13] is the proven pattern |
| Variant generation (image gen + provenance) | WORKING 🔌 | [R13 §8.10] [R05 §9.5] | T-ME | Capability | honesty gates + never-strippable stamp |
| Collection/drop assembly + tournament | PARTIAL | creativeBoard substrate real [R05 §9.4]; no drop noun/tournament (XA 16 §5.1) | T-ME | Workshop bench | adapter on existing board substrate |
| Storefront on own rails (builder + Stripe) | PARTIAL 🔌 | [R03 §1] [R13 §9.1] [D11 §2.3]; no product/order/inventory model | T-ME | Workshop | own venture on own Stripe; Shopify by exception; Connect for clients |
| Product listing copy channel | PARTIAL | copyJudge seam channel-extensible [R13 §10.14]; no product channel | T-ME | Capability | honesty contract load-bearing for physical-good claims |
| Drop mission template (sample→run→lookbook→publish) | DOCUMENTED-ONLY | XA 10 §J4.3; plays.ts is the encoding mold [R05 §9.26] | T-ME | Mission | data on built rails |
| Order ingestion (webhooks → orders rows) | MISSING | no substrate for XA 10 §J4.3 "Orders"; site-events + CSV floor exist | T-ME | substrate | precondition for all outcome learning |
| Design outcome learning (sales → annotations → rubric) | MISSING | XA 10 §J4.6 only; consolidation gate exists [R03 §3] | T-10 | Standing Order | content-week earned-autonomy loop is the pattern |
| Brand boards + logo concepts | WORKING 🔌 | [R05 §9.4] | T-ME | Workshop | honest "not trademarked art" note |
| Brand kit as one token substrate | PARTIAL | kits feed surfaces [R05 §9.27] but no shared store | T-10 | substrate | five consumers, no noun; drift by construction at ten brands |
| Brand finalization (vector/guidelines/trademark) | MISSING | [01 §13] | T-10 | Capability | designer referral is the honest floor |
| Artist portfolio (builder-based) | WORKING | flagship as real project [R05 §12.3]; /dev spike ungated [R03 §10] | T-ME | Capability | living-portfolio annotation loop is XA-only |
| Artwork vision cataloging | WORKING | [R13 §8.6] "never invent an artist, title, price" | T-ME | Capability | |
| Mural opportunity engine + kind enum | WORKING 🔌 | [R03 §4]; opportunityHunt.ts:32 mural-native kinds | T-ME | Standing Order | domain's head start; generic kind registry needed at T-10 |
| Mural-pitch criteria + proposal workshop | PARTIAL | paperwork chain WORKING [R03 §8]; criteria pack XA 03 §7.3 only | T-ME | Workshop | reuses template/merge/send/e-sign rails wholesale |
| Commission stage model (inquiry→wall→final) | DOCUMENTED-ONLY | XA 03 §7.3; timelines.ts is the mold [R05 §9.26] | T-10 | Mission | rides the six-people-tables debt [R03 §5] |
| Deposits/invoicing for commissions | WORKING 🔌 | [R13 §7.10] [R05 §9.26] | T-ME | Standing Order | |
| Client-venture commerce (Stripe Connect) | MISSING + EXT-REQUIRED | [D11 §2.5] | T-100 | Capability | consistent with doc 11; operator-own ventures unblocked now |
| Creative vertical pack (detection + artist-economics seeds) | WORKING | verticals.ts:50,321 [R05 §9.14] | T-ME | Capability | detects mural/artist DNA; framework data, zero-AI floor |
| Artist/apparel venture template (work-web as data) | MISSING | workweb.ts:243 — only two WEB_TEMPLATES exist | T-ME | Workshop | genesis detects the venture but cannot dress it; XA 03 §7.3/7.4 is the spec |
| Wardrobe-room builder escape hatch | WORKING (misaimed) | orchestratorCases.verify.ts:79 | T-ME | Capability | honest today; re-route to the Apparel Workshop once it exists |
