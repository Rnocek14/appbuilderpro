# 14 — Prioritized Capability Roadmap (Phase 5.5, wave 2)

Built from the 287-row consolidated matrix [13] under the charter's five scale gates. Ordering
inside each tier is **by dependency, not importance** — the sequencing findings of the domain
audits are binding here: the `world_id` spine before any fleet feature [10 §3, 13 Cut A]; the
service-package noun before care-plan objects [04 §4]; the asset-grant substrate before apparel
[07 §7 #1]; the `send_sms` migration + repair loop as T-ME urgencies [09 §1.1–1.3]; the six
cost-metering call sites before any margin math [12 §1.2, §5 #1]; criteria packs before outcome
learning [02 §4.2, 13: "Outcome → criteria learning join"]; experiment lifecycle after the
compounding seams [08 §6.7]; KEEP-BOTH on the two automation runtimes [09 §2.1].

Citation key: `[13: <row name>]` = a row in 13-gap-matrix.md (class/tier as printed there);
`[NN §x]` = capability-audit doc NN; `[RC13 §5]` = reality-check verdict prototype brief.
Item columns: **Class** = class today per the matrix · **Shape** = migration / edge fn /
wiring / surface / integration / schema / data / doc · **Size** = S/M/L · **⚠** = the matrix
conflict the item must resolve (from 13's 17 ⚠ rows), or —.

The four dependency spines the whole roadmap hangs on (each is a Cut A convergence in [13]):

1. **world_id on the ledgers** — opens T-10; every fleet rollup, margin line, anomaly watch,
   and partitioned context reads it [13 Cut A #1].
2. **service-package + version/cohort nouns** — T10-4 records, T100-1/2 enforce; packages and
   automations deliberately share one definition/instance/pin schema [13 Cut A #2–3; 04 §4;
   09 §1.4].
3. **criteria-pack object** — T-ME noun (ME-7), T-10 feedback edge (T10-17), the instrument
   that converts judgment from prompt to data [13 Cut A #5].
4. **asset-grant substrate** — the one controlled exception to world isolation, before any
   cross-world creative commerce [13 Cut A #4; 07 §7 #1].

---

## Tier 1 — T-ME (the operator, mom's real estate, first clients)

154 matrix rows sit at T-ME; 95 are WORKING. This tier's roadmap is the other 59, bundled into
the items below. The tier's critical path: **fix-first ledger → arm the clock + repair loop →
metering → criteria-pack + asset-grant nouns → the mail money path → D5 bench substrate →
research loop closure**.

### T-ME.0 — Fix-first ledger (the DISCONNECTED register's cheap half — pure one-line/one-verb fixes)

Everything here is already built to standard; the repair is a line or a verb [13 Cut C].
Do these before anything else in the phase — they are the cheapest honesty wins in the corpus.

| # | Fix | Repair (exact, per Cut C) | Unblocks |
|---|---|---|---|
| F1 | SMS rail [13: SMS rail ⚠] | one-line `approval_kind` enum migration adding `'send_sms'` (+ the standing-worker send branch) | every SMS trigger fire; stops the fire-budget burn + email starvation [09 §1.1]; no-email prospect handling [13: No-email prospect handling] · ⚠ 01/05/09 DISCONNECTED vs 03/11 PARTIAL — same repair either way; A2P per client stays the operational gate |
| F2 | Booking + sender-domain deploys [13: Booking/sender-domain deploy-list absence] | two deploy-list lines | fresh-environment onboarding stops silently lacking booking + per-brand sender identity [04 §7 #2] |
| F3 | Unwired verify files [13: Unwired verify files] | register 6 suites (incl. workerParity) in CI | the verify harness actually guards the worker seam |
| F4 | Registry drift one-liners [09 §1.6] | flip `online_booking` from `not_built`, `missed_call_text_back` from `beta` | detection stops refusing to propose shipped rails; structural fix (registry update loop) is T-10 |
| F5 | Uptime/SSL watch at sale [13: Uptime/SSL watch on sold sites] | one insert in `handleClientSale` creating the per-site `watch_url` order | "your site was down yesterday" stops arriving from the client [04 §7 #3] |
| F6 | Canvas → publish verb [13: Canvas ArtifactSheet → publish bridge] | one publish verb in the ArtifactSheet decision contract → existing Ayrshare rail | canvas work stops dead-ending before the publish rail [06] |

### T-ME.1 — Arm the clock, catch the failures (nothing 🔌 is real until this block)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-1 | Heartbeat self-arm | PARTIAL | migration + CI default | S | every 🔌 row in the WORKING register hangs on it [13: Heartbeat self-arm]; P1's "dark heartbeat" premise [RC13 §5 P1] | — |
| ME-2 | Automation failure ledger + auto-pause (repair loop) | MISSING | schema + edge fn | M | honest monitoring (failure side of [13: Automation monitoring]); the §1.1 enum class would have been reported months earlier [09 §1.3]; imports the child substrate's dead-letter pattern per KEEP-BOTH [09 §2.1]; feeds T-10 exception compiler | tier ⚠ resolved in matrix: 12 filed T-10, 09's live-bug proof pulls T-ME |
| ME-3 | safeFetch default timeout + standing-order error escalation | PARTIAL | edge fn | S | closes [13: Fetch timeouts]; `went_quiet`-style row on double error [12 §5 #7] | — |
| ME-4 | Meter the six unmetered AI call sites | PARTIAL | edge fn (one chokepoint, six sites) | S | [13: Per-action AI cost recording]; prerequisite for T-10 margin line + T-100 cost anomaly watch [12 §1.2, §5 #1] | — |
| ME-5 | Builder secrets out of localStorage | PARTIAL | migration (→ Function Secrets/Vault) | S | [13: Builder-project secrets at rest]; [12 §5 #5] | — |
| ME-6 | World-scoped reads completion (~70% → contract-true) | PARTIAL | wiring + audit | M | [13: World-scoped reads / multi-business isolation]; prerequisite for taking a second business seriously; the T-10 policy-test class ratchets it | tier ⚠ resolved: 01 filed T-10, 12 T-ME — earliest kept |

### T-ME.2 — The two substrate nouns (before their domains)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-7 | Criteria-pack object (named, versioned, score-carrying) | DOCUMENTED-ONLY | schema + judge-seam hook | M | [13: Criteria-pack object]; instances ME-24 (apparel/mural), T-10 theory packs [13: Theory critique packs]; the T-10 outcome→criteria join writes INTO packs — build packs first [02 §4.2, 13 Cut A] | — |
| ME-8 | Asset-grant substrate + art-ownership/edition registry | DOCUMENTED-ONLY + ARCH | migration + RLS read-path amendment | M | founding move of any granted-artwork venture; every apparel publish gate downstream — "a design pipeline over unlicensed art is a liability engine" [07 §7 #1]; covers [13: Physical-art ownership/edition registry] (same metadata); `autonomy_grants` is the shape to copy [07 §1.1] | ⚠ tier: 07 (domain owner) T-ME vs 01 T-SPEC — 07 honored |

### T-ME.3 — The mail money path (render → validate → executor → vendor → senses)

Order inside this block is the vendor chain: DPI parity is "prerequisite for any vendor API"
[13: Print-DPI parity render]; CASS shares the vendor; the executor must exist before Lob has
anything to execute.

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-9 | Print-DPI parity render (bleed-true artifact) | DOCUMENTED-ONLY | edge fn (extend render-design) | S | any print vendor; shared build with apparel print fidelity [07 §2 "one build serves two domains"] | — |
| ME-10 | CASS address validation | MISSING + EXT | integration (Lob verify/Smarty/Melissa), fail-closed | S | [13: CASS address validation]; same vendor as print [13 Cut B] | — |
| ME-11 | `send_mail` approval kind + cost-ceiling executor | MISSING | migration + edge fn | M | [13: send_mail approval kind]; the mail twin of send-email [05] | — |
| ME-12 | Lob mail fulfillment | DOCUMENTED-ONLY + EXT | integration | M | "the domain's #1 revenue-blocking gap" [13: Mail fulfillment]; downstream: T-10 per-piece attribution + delivery webhooks | ⚠ class only: 01 MISSING vs 03/05/11 DOCUMENTED-ONLY (full level-10 spec exists) — spec-led build |
| ME-13 | Inbound senses v1: portal-lead parsing + extraction rules engine + contact creation from inbound | DOC-ONLY / MISSING / PARTIAL | edge fn on forward-in substrate | M | [13: Portal-lead parsing; Inbound extraction rules engine; Contact/lead creation from inbound mail]; most agents' top lead source [03/05] | — |
| ME-14 | Whole-inbox connection (Gmail/IMAP/Nylas) | MISSING + EXT | integration | L | the "senses" gap [13: Whole-inbox connection]; forward-in is the shipped wedge, so this can trail the rest of the block | ⚠ tier: 01/05 T-ME vs 11 T-10; CASA verification is the real cost — start the clock now, land whenever |

### T-ME.4 — Real-estate depth (mom's business)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-15 | MLS rows → campaign composer seam | DISCONNECTED | wiring (campaignCore typed inputs) | S | listing facts stop being retyped by hand [13 Cut C] | — |
| ME-16 | Geo/territory deep environment | MISSING + EXT | surface (buy tiles MapTiler/Protomaps, build canvas) | L | [13: Territory map UI]; DEEP-ENVIRONMENT ruling [02 §2.1]; farm work becomes visual | — |
| ME-17 | Homeowner/property data acquisition (ATTOM-class) | MISSING + EXT | integration | M | [13: Homeowner/property data]; licensing/display rights + DNC scrub are part of the buy [13 Cut B]; feeds ME-16 and farm selection | — |

### T-ME.5 — The workshop session grammar (D5 first, surface ceremony last)

Per 02 §5's composition stack: the manipulation substrate and session substrate are each
"code, once" — built under all nine benches, never per bench.

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-18 | D5 bench manipulation substrate (undo, drag, scrub, latency budgets) | PROTOTYPE-ONLY | surface substrate (once, under all nine benches) | L | [13: Bench manipulation substrate]; P3's entire premise [RC13 §5 P3]; ME-21, T-10 board/timeline/table benches | — |
| ME-19 | Unified commit rail + grounded session open | PARTIAL ×2 | wiring + surface | M | [13: Unified commit rail; Grounded session open]; every bench exit and every session start [02] | — |
| ME-20 | Session Ledger + six-part session anatomy v0 | DOCUMENTED-ONLY ×2 | surface (once) + schema | L | [13: Six-part session anatomy; Session Ledger]; the delegation instrument; after ME-18/19 — the anatomy renders what the rail records [02 §5] | — |
| ME-21 | Gallery/variants bench + drop assembly/tournament | DOC-ONLY + PARTIAL | surface on ME-18 | M | [13: Gallery/variants bench; Drop/collection assembly]; P3's concrete bench; boards graduate from single-shot generators [02] | — |
| ME-22 | Document bench completion (forks + rubric dock) | PARTIAL | surface | S | [13: Document bench] — "closest generic bench to done" [02] | — |
| ME-23 | Map/graph bench evidence columns + prediction registry | PARTIAL | surface | M | [13: Map/graph bench]; feeds P2's map [08] | — |

### T-ME.6 — Creative commerce chain (strictly after ME-7/8/9; order = 07 §7)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-24 | Apparel + mural-pitch criteria packs | MISSING / PARTIAL | data on ME-7 | S | critique + mastery loop; "highest ratio of leverage to effort in the domain" [07 §7 #3] | — |
| ME-25 | Artist venture template + drop mission template | MISSING / DOC-ONLY | data on built rails (plays.ts mold) | S | [13: Artist/apparel venture template; Drop mission template]; independent of the POD buy — "why Chain 3 should ship first" [07 §7 #5]; the mural business needs only this + ME-24 | — |
| ME-26 | Printful POD: product templates + fidelity gate + fulfillment + order ingestion | MISSING + EXT ×3 | integration (catalog/mockup/orders/webhooks → fan-in family) | M | unblocks three steps at once — "this domain's Lob" [07 §7 #2]; [13: POD fulfillment; Product templates + print-fidelity gate; Order ingestion]; order rows are the precondition for ALL outcome learning [07 §7 #4] | ⚠ tier: 07 T-ME vs 11 T-10 vs 01 T-SPEC — domain owner honored |
| ME-27 | Storefront on own rails + product listing copy channel | PARTIAL ×2 | schema (product/order/inventory) + surface | M | [13: Storefront on own rails; Product listing copy channel]; own venture on own Stripe — no Connect needed yet [07] | — |

### T-ME.7 — Research loop closure (seams → engine → experiments → surface LAST)

Order is 08 §6.7 verbatim; the surface is deliberately last — "every mechanism it renders must
have real rows behind it first."

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-28 | Depth engine wiring (remaining ~8 producers) | DISCONNECTED | wiring | S | [13: Depth engine wiring]; the cheapest of the five compounding seams [08 §6.7 #1] | — |
| ME-29 | Multi-hop research arc + free-floating research | MISSING ×2 | arc kind on orchestrator + edge fn | M | [13: Multi-hop research engine; Free-floating research]; "depends on nothing new; unblocks serious-undertaking research everywhere" [08 §6.7 #2]; P1's research half | — |
| ME-30 | Assumptions ledger | MISSING | schema + surface | S | [13: Assumptions ledger]; honest sims + theory work [08] | — |
| ME-31 | Experiment lifecycle | MISSING | mission kind on missionRun verified-handoff spine | M | "the single highest-leverage build in the domain" — calibration, theory tallies, sim-evidence write-back in one stroke [08 §6.7 #3]; AFTER the compounding seams (pull the decision outcome-observation seam forward with it — the experiment close writes a `mind_decisions` outcome) | — |
| ME-32 | Beacon guesses + calibration auto-close | PARTIAL ×2 | schema (`loops.ts` guess field, persist to `knowledge_worlds.mind`) + cron | S | [13: Beacons with held guesses; Prediction calibration]; feeds ME-31's calibration [08 §6.7 #4] | — |
| ME-33 | Conversation + live-map dual surface + theory cards | DOCUMENTED-ONLY ×2 | surface | L | [13: Conversation + live-map dual surface; Theory cards / evidence tallies]; P2's surface — LAST per [08 §6.7 #5], else "the surface performs depth the substrate doesn't have" | — |

### T-ME.8 — Client-care minimum (package-shaped, per the 04 §4 trap)

Both items below are built as **establishable order kinds**, not hand-wired per-client
features, so T-10's `packageEstablishes()` can seed them — the 04 §4 trap ("one-off
per-client features without the package object… would make T-10 → T-100 a rewrite").

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| ME-34 | Client change-request intake + loop | MISSING | schema + form variant + classifier branch | S | the care plan's front door [13: Client change-request intake]; feeds the WORKING refine→republish loop [04 §7 #4] | — |
| ME-35 | Per-client recurring report | MISSING | standing order + producer | S | "all numbers exist as ledger rows — cheapest big win" [13: Per-client recurring report]; covers site/outreach/social [04/05/06] | — |
| ME-36 | Cold-audience routing for client verticals | PARTIAL | wiring | S | discovery machinery stops draining only into the agency funnel [13: Cold-audience routing] | — |
| ME-37 | Post-performance → producer/Playbook wiring | DISCONNECTED | wiring (divergence input at socialRun.ts:79) | S | [13: Post-performance → producer learning]; the T-ME instance of the T-10 learning join — machinery already exists [06] | — |

**T-ME tier gate** (when this tier is honestly closed): the fix-first ledger is empty; the
heartbeat arms itself and failures write rows instead of silence [09 §1.3]; a listing becomes
a mailed, CASS-validated, Lob-fulfilled campaign with no operator printing [05]; the farm is
visible on a map over licensed data [03]; a drop can be assembled on a bench with hands and
fulfilled through Printful under grant + provenance gates [07]; a question becomes a cited
multi-hop brief and an experiment with a close date [08 §6.7]; and every client sale seeds an
intake channel + a monthly report without hand-wiring [04 §8 T-ME]. P1, P2, P3 run on real
rows.

---

## Tier 2 — T-10 (ten active clients)

The matrix's inversion point: 51 MISSING vs 1 WORKING at this tier — "where the current build
stops being a system and starts being a to-do list" [13 Counts]. Dependency law of the tier:
**world_id spine first** [10 §3], **package noun second** [04 §4], everything fleet-shaped
reads through them.

### T-10.1 — The world_id spine (before ANY fleet feature)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-1 | `world_id` on the ledgers (`execution_runs` + `usage_events` + `inbound_mail`), stamped at the three chokepoints (metering fn, standing-worker, resend-inbound); per-client forward-in aliases | MISSING + ARCH | migration + stamps | M | head of EVERY control-plane dependency chain [13 Cut A]; "cheapest now, archaeology later" [10 §3]; T10-6, T10-8, T10-9, T-100 anomaly watches all read it | ⚠ 10 calls it ARCH (every writer/reader changes) vs 12 additive migration — both agree MISSING at T-10; build it as 12's additive migration, treat as ARCH in review scope |
| T10-2 | Isolation ratchet: `worldIsolation.verify.ts` policy-test class + standing-order concurrency claim + rotation/revocation runbook | MISSING ×3 | schema-test + migration + doc | S | [13: Isolation policy-test class; Standing-order concurrency claim; Rotation/revocation runbooks]; "the cheap ratchet" [12 §5 #3/#6] | — |
| T10-3 | World-scoped semantic retrieval + embedding coverage (6/6 subjects) | MISSING / PARTIAL | migration (world column + kNN param on app_0021) + worker calls | S | [13: World-scoped semantic retrieval; Embedding coverage]; "before the corpus is too big to backfill" [12 §5 #4]; also compounding seam #1 [08 §6.7] | — |

### T-10.2 — The service-package noun (before care-plan objects)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-4 | `service_packages` table + `package_version` on subscriptions + `packageEstablishes()` | MISSING + ARCH | schema + seeding fn (seedForTier is the proven mold) | M | [13: Service package as versioned object; Package establishes orders at sale]; "unblocks report/watch/refresh at once"; version recording now means T-100's registry "inherits history instead of reconstructing it" [04 §4; 10 §3] | — |
| T10-5 | Care-plan establishable orders: `site_refresh` kind, renewal-risk detection, quarterly re-audit/upsell, churn offboarding mission | MISSING ×4 | standing orders + mission | M | [13: Site content-refresh order; Renewal-risk detection; Ongoing upsell re-audit; Churn offboarding]; all become package lines, seeded by T10-4 — never hand-wired [04 §3b] | — |
| T10-6 | Per-client safety gates (caps/warmup/kill per world) + per-client cron caps | MISSING ×2 | migration + gate params | M | [13: Per-client safety gates; Per-owner cron caps → per-client]; send-email safety is per-human today — "deliberate single-tenant design, must be re-decided" [05]; reads T10-1's world stamps | — |

### T-10.3 — Fleet view v0 + the slate (P4's capability set)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-7 | Per-client cost attribution + margin line | PARTIAL + ARCH | rollup query + surface (over T10-1 columns) | S | [13: Per-client cost attribution]; revenue side is already per-client [10 §2.3] | — |
| T10-8 | Fleet health rollup per world (state incl. `dark`) | MISSING + ARCH | standing order + board (Health-board pattern re-aimed at clients) | M | [13: Fleet health rollup per world]; questions 1+4 of the eleven fleet questions at n=10 [10 §3] | — |
| T10-9 | Credential registry + expiry/probe sweep + client credential offboarding | MISSING ×2 | standing order (ads-sync pattern) + mission | M | [13: Credential registry + expiry/probe sweep; Client credential offboarding]; at 10×~9 connectors, "discovered at send failure" is a monthly client-facing incident [10 §3; 12 §5 #8] | — |
| T10-10 | Exception compiler + cross-client approval slates (manifest approval kind, hash-bound, outliers out) | MISSING + PROTOTYPE-ONLY | substrate + approval kind | L | [13: Exception compiler; Cross-client approval slates]; ~30–35 decisions/day is where walking items stops scaling [10 §3]; content_week is the WORKING one-class precedent; AFTER T10-1/7/8 — outlier detection needs baselines | — |

### T-10.4 — Automation lifecycle hardening (order = 09's step numbers)

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-11 | Registry update loop (drift check) | MISSING | standing order | S | [13: Registry update loop]; F4's structural fix [09 §1.6] | — |
| T10-12 | Automation test harness (dry-run / time-travel / fixture packs / sandbox send) + arming gate | MISSING ×2 | bench + gate (pure injectable-clock core makes it cheap) | M | [13: Automation test harness; Arming gate]; approval payload = plan hash [09 §1.2] | — |
| T10-13 | Automation version recording v0 (definition rows + per-client pins, recorded not enforced) | (matrix files versioning T-100) | migration | S | fires stamp `definition_version`; laggards become a query [09 §1.4] | ⚠ deliberate tier split: [13: Automation versioning] is T-100 ⚠, but 10 §3 mandates recording from T-10 ("crack already visible") — record now, enforce at T-100 |
| T10-14 | Earned autonomy generalized + builder-as-capability from missions | PARTIAL ×2 | wiring (route `build_app` into job-worker autopilot) | M | [13: Earned autonomy generalized; Builder-as-capability]; "every client gets a portal app" stops being hand-driven [09 §3] | — |
| T10-15 | Visual flow design bench (recipe objects + shadow replay + staged arm) | MISSING | surface (deep) + execution engine | L | [13: Visual flow design bench]; "an execution engine, not a rendering" [02 §2.4]; after T10-12 — the bench renders what the harness can already prove | — |
| T10-16 | Heartbeat trace UX | PROTOTYPE-ONLY | surface | S | [13: Heartbeat trace UX]; Health board is the floor [09] | — |

### T-10.5 — Learning joins + people model

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-17 | Outcome → criteria learning join (+ instances: demo outcome learning, design outcome learning) | MISSING ×3 | substrate + standing orders | M | [13: Outcome → criteria learning join; Demo outcome learning; Design outcome learning]; requires ME-7 packs to write into [02]; content-week earned-autonomy loop is the pattern [07] | — |
| T10-18 | Unified people model (+ commission stage model riding it) | PARTIAL + ARCH | migration (six tables → one) | L | [13: Unified people model; Commission stage model]; "prerequisite for any multi-client CRM" [01/03/05]; also unblocks apps↔worlds noun bridge [13: apps↔worlds noun bridge] | — |

### T-10.6 — Channel scale-out (mail/RE/social), on the T-ME money path

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T10-19a | Batch drain throughput + per-client cron fairness | PARTIAL | edge fn (drain arithmetic) | M | first in the mail block — ~10 recipients/15 min "arithmetic fails at client volumes" [13: Batch drain throughput]; everything else in [05]'s T-10 register sends through it | — |
| T10-19b | Send quality: per-recipient personalization (token merge beyond agency pitches), branded HTML shell, email template library (versioned), variable-data groundwork | PARTIAL/MISSING (3 rows) | edge fn + schema (data-shaped) | M | [13: Per-recipient personalization; Branded HTML email shell; Email template library] | — |
| T10-19c | Sequence/flow designer (beyond 2 fixed bumps, incl. A/B ladders) + email A/B testing + SMS quiet hours | DOC-ONLY / MISSING ×2 | schema + edge fn (gates-live-at-send rule per spec) | M | [13: Sequence/flow designer ⚠; Email A/B testing; SMS quiet hours — TCPA exposure without it] | ⚠ sequence designer: 05 DOCUMENTED-ONLY (level-10 #4 spec exists) vs 01 MISSING — 05 current, spec-led |
| T10-19d | Deliverability + inbound intelligence: per-brand deliverability analytics, delivery webhooks + returned-mail learning, intent classification, behavioral segment engine, reply-to-client visibility, inbound→knowledge ingest bridge | PARTIAL/MISSING/DOC-ONLY (6 rows) | edge fns + surfaces on existing event ledgers | M | [13: Per-brand deliverability; Mail delivery webhooks; Intent classification; Behavioral segment engine; Reply-to-client visibility; Inbound mail → knowledge ingest]; outreach_events substrate already recorded [05] | — |
| T10-20 | Print/RE attribution bundle: per-piece QR attribution, variable-data merge, list provenance, open-house capture | PARTIAL/MISSING (4 rows) | edge fns + ledger | M | closes the loop ME-12 opened [03/05] | — |
| T10-21 | RE data bundle: MLS scheduled refresh + multi-feed, DocuSign back half, rendered-DOM fetch, builder-app custom domains | PARTIAL/DOC-ONLY (4 rows) | cron + integrations | M | [03/04] | ⚠ MLS refresh: 03 PARTIAL 🔌 vs 01 MISSING — cron trivial, multi-feed is the design work |
| T10-22 | Call tracking (Twilio numbers) · voice AI receptionist (optional) | ⚠ / DOC-ONLY + EXT | integration | M / L | [13: Call tracking; Voice AI receptionist] | ⚠ call tracking: 03/05 MISSING+EXT vs 11 PARTIAL — 11: build on live voice-inbound; consent gates for recording |
| T10-23 | Contact enrichment (verification only, hybrid) + demographics feed (Census ACS, tract⇄farm join) | MISSING + EXT ×2 | integration | S | [13: Contact enrichment; Demographics data feed]; keep owned discovery [13 Cut B] | — |
| T10-24 | Social per-client bundle: Ayrshare per-client profiles, social connector checklist row, failed-post exception loop, standing content-strategy object | PARTIAL/MISSING (4 rows) | integration + wiring + schema | M | [06]; profiles are the P5 client-birth dependency for social | — |
| T10-25 | Content calendar deep surface / timeline-planner bench (one build) | MISSING ×2 | surface on ME-18 | M | [13: Content calendar object/view; Timeline/planner bench] — 06's calendar IS the domain instance of 02's generic bench; also serves farm cadence + launches | — |
| T10-26 | Social intelligence bundle: reel engine via Shotstack, trend research over Serper rail, audience/competitor intel, listening/community mgmt | MISSING + EXT (4 rows) | edge fns + integration | M | [06] | ⚠ reel engine granularity (01 vs 06 — wire Shotstack before buying Sora/Runway); ⚠ listening: 06 T-10 via Ayrshare comments API vs 11 T-SPEC until a reputation package exists — do the Ayrshare-comments half only |
| T10-27 | Bench build-out: board bench, table/dataset grid bench, export-to-craft relay | MISSING/PARTIAL ×3 | surfaces + substrate on ME-18 | L | [13: Board bench; Table/dataset bench; Export-to-craft relay] — the relay is "the baton of every multi-bench toolchain" [02] | — |
| T10-28 | Production design surface (placements, print fidelity, brand tokens) + brand kit as one token substrate | MISSING + EXT / PARTIAL | surface (deep) + schema | L | [13: Production design surface; Brand kit as one token substrate]; after ME-9/ME-26; brand-kit noun is "prerequisite for cohort-level brand versioning at T-100" [07] | — |
| T10-29a | Client-ops unified bench + publish-to-client approval kind + fallback-spec critique pass + client analytics reports on the owned pixel | PARTIAL (4 rows) | surface + wiring | M | [13: Client-ops unified bench; Publish-to-paying-client behind the spine; Fallback-spec critique; Client analytics on site-events]; REUSABLE-FRAMEWORK ruling — no new deep surface [04 §6] | — |
| T10-29b | Per-client connectors: GBP / calendar / esign (the three built:false checklist rows) + client e-commerce on own rails | PARTIAL / ⚠ | integration + schema | M | GBP is "the first care-plan ask" and the first per-client OAuth through the future vault scope (T100-4) [04; 11] | ⚠ GBP: 04 PARTIAL (checklist scaffolds) vs 11 DOCUMENTED-ONLY+EXT (unbuilt OAuth); client-OWNED money stays blocked on Connect (T100-8) |
| T10-30a | The remaining compounding-seam crons: insights proximity scanner on the clock + world-intel on the clock + belief distillation cadence | DISCONNECTED ×2 (+ seam) | wiring (scheduled sweeps replacing upload-only / visit-only triggers) | S | [13: Insights proximity scanner; World intel on the clock]; together with T10-3 (embedding coverage) and ME-31's outcome-observation pull-forward this closes all five seams of [08 §6.7 #1] — schedule at this tier's FRONT since the research loop reads through them | — |
| T10-30b | Research state + sources: exploration state cloud-held (`mind` column ready), first-class source management, theory critique packs (on ME-7), sim-evidence edge labeling, explorations lens, decay/re-entry story | PARTIAL/MISSING/DOC-ONLY (6 rows) | schema + surfaces | M | [08]; localStorage-held loops/currents is the T-10 break named in [08 §14] | — |
| T10-30c | Simulation expansion: external compute (Pyodide first, E2B/Modal later) + user-defined/domain sim models (templates-as-data direction) | MISSING + EXT / MISSING | integration + schema | M | [13: External compute / notebooks; User-defined / domain sim models]; parallel track per [08 §6.7 #6] — only ME-31 optionally depends on it | — |
| T10-31 | Ops hygiene: data export/deletion + backup drills, AI-layer test coverage | DOC-ONLY / MISSING | runbooks + suites | S | [13: Data export / deletion; AI-layer test coverage]; compliance + offboarding double-duty [12] | — |

**T-10 tier gate** (from 10 §3's mandatory list, restated as checks): margin-per-client is a
query over stamped ledgers (T10-1 + T10-7); the fleet health board answers "which client is
broken" without memory (T10-8); credential failure is discovered by the nightly sweep, not by
a send failure (T10-9); the morning is one slate decision with outliers surfaced (T10-10);
`packageEstablishes()` seeds every new client's orders with a recorded package version
(T10-4/5, T10-13); and no automation arms without a stored dry-run plan hash (T10-12). P4 and
P5 run on real rows.

---

## Tier 3 — T-100 (one hundred clients)

Nearly everything here funnels through the eight ARCH convergence clusters [13 Cut A]. Order:
version/definition nouns → cohort machinery over them → policy/attention → connector + isolation
structure → money.

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T100-1 | Automation versioning enforced: definition/instance split + templates-as-data library + step memoization + child fleet rollup (the ONE cross-substrate seam) | MISSING + ARCH ×4 | migration + wiring | L | [13: Automation versioning ⚠; Templates-as-data; Step memoization; Child fleet automation rollup]; T10-13 recorded the history this enforces; same schema as templates-as-data — one migration [09 §1.4]; KEEP-BOTH boundary respected [09 §2.1] | ⚠ 09/10 +ARCH vs 01 plain MISSING — ARCH honored |
| T100-2 | Cohort rollout lifecycle (pin → cohort → bake → promote → rollback) for automations AND packages | DOC-ONLY + ARCH / MISSING + ARCH | substrate + missions (garvis-canary pattern) | L | [13: Cohort rollout ⚠; Cohort package rollout/migration]; ~600–900 adoption decisions/year unadministrable without it [10 §3]; strictly after T100-1 + T10-4 — "building it before the package noun exists would be building it twice" [04 §8] | ⚠ 10 DOCUMENTED-ONLY (exp-arch specs exist) vs 01/09 MISSING — spec-led |
| T100-3a | Policy engine over existing gate seams (monitor mode as the bake path → enforce on platform rails) + bake/canary cohort verdicts from fire ledgers | MISSING ×2 | substrate + standing order (content-week judge generalized) | L | [13: Declarative policy engine; Bake/canary cohort verdicts]; gate seams already centralize [10 §2.4] | — |
| T100-3b | Trust at fleet scale: cohort-evidence provisional autonomy (`autonomy_grants` gains world/package scope — today per-owner per-class only, app_0097), dwell-weighted streaks + sampled audits, trigger-class earned autonomy | MISSING + ARCH / MISSING ×2 | migration + standing orders | L | kills the ~50–70-approval per-client apprenticeship tax [10 §3]; per-fire approvals can't scale [13: Trigger-class earned autonomy]; exception-only attention completes here | — |
| T100-4 | Connector consolidation: unified connector registry, per-client credential vault scope ((user,provider) → (user,provider,world)), webhook fan-in platform, uniform sandbox/test modes, provider budget ledger | PARTIAL + ARCH (5 rows) | migration + schema | L | [13 Cut A people/noun cluster; 11]; migrate Ayrshare keys / Twilio numbers / sender identities into the scoped vault | ⚠ vault scope: 11 PARTIAL+ARCH (extend the vault) vs 01 MISSING+ARCH — 11's extend-don't-rebuild honored |
| T100-5 | Isolation structural: counterparty-isolation contract (scoped query layer or world-keyed RLS), world-partitioned AI context, prompt-injection input defenses | DOC-ONLY + ARCH / MISSING + ARCH / PARTIAL | schema + edge fns | L | [12 §5 T-100 #1/#7]; the situation digest "lists every client by design" until this | — |
| T100-6 | Cost + limits: per-world budgets, per-provider rate budgets, cost anomaly watch (fleet + own spend), per-world deviation watch (adsWatchCore generalized), per-client credit sub-ledgers, per-client provider accounts (Twilio subaccounts) | MISSING (+EXT/ARCH) (6 rows) | standing orders + migration + integration | L | [12 §5 T-100 #2/#3; 10]; "one 402 fails all clients" ends here; A2P per-brand registration is the hidden serial cost — start early | — |
| T100-7 | Capacity + ops: paid Postgres tier + pooling, log retention/lifecycle, shadow-DB migration testing in CI | PARTIAL / MISSING ×2 | infra + CI | M | [12 §5 T-100 #5/#6] | — |
| T100-8 | Money at fleet scale: Stripe Connect (client-venture commerce), client billing/payment reconciliation, client portal | MISSING + EXT / MISSING ×2 | integration + surface | L | [13: Client-venture commerce; Client billing reconciliation; Client portal]; merchant-of-record risk concentrates on the operator until Connect [07]; "100 clients' MRR cannot be hand-reconciled" [10 §3] | — |
| T100-9 | Workshop composer ("open a workshop for X") + learned-workshop distillation | DOC-ONLY + ARCH / DOC-ONLY | archetype-renderer inversion + gate | L | [13: Workshop composer; Learned-workshop distillation]; requires the nine benches to exist as configurable renderers — i.e., after ME-18/21/22/23, T10-15/25/27 [02 §5] | — |

**T-100 tier gate** (charter definition + 10 §4c acceptance): a package/automation v2 reaches
40 clients as pin → canary cohort → bake → promote with a demonstrated rollback (T100-1/2);
the policy engine runs enforce-mode on platform rails with monitor-mode as the bake path
(T100-3); attention is exception-only — nothing normal surfaces; one client's credit
exhaustion or credential failure cannot touch a sibling (T100-4/5/6); MRR reconciliation is
automated (T100-8).

---

## Tier 4 — T-1K (one thousand clients)

"Nothing normal is ever seen; everything normal is auditable" [10 §3].

| # | Item | Class | Shape | Size | Unblocks | ⚠ |
|---|---|---|---|---|---|---|
| T1K-1 | Policy coverage of generated-app children (proxy outbound through platform rails, or per-child policy sidecar) | MISSING + ARCH | edge fn + contract | L | [13: Policy coverage of generated-app children]; the enforcement boundary "must be closed, not documented" [10 §3] | — |
| T1K-2 | Rotation floor + quarterly staged hygiene; per-service secrets replacing the one WORKER_SECRET; per-world liveness SLOs as the canary's subject; real observability (structured logs, alerting) | MISSING (2 rows + 12's T-1K ladder) | standing orders + infra | L | [13: Rotation floor + staged hygiene]; at 500+ worlds ~450 never surface on event ranking alone [10 §3; 12 §5 T-1K] | — |
| T1K-3 | Multi-operator delegation | MISSING + ARCH | schema + spine | L | [13: Multi-operator delegation] — out of the audits' scope, named honestly [10 §3]; nothing below prepares it; do not fake it earlier | — |

---

## Tier 5 — T-SPEC (speculative)

| # | Item | Class | Shape | Size | Note | ⚠ |
|---|---|---|---|---|---|---|
| SP-1 | Native platform publish APIs (Ayrshare alternative) | MISSING + EXT | integration ×9 | L | 9 app reviews; "the buy is live and correct" — revisit only if per-profile fees break the T-100 margin line [13: Native platform publish APIs; 06] | — |
| SP-2 | Social listening VENDORS (beyond Ayrshare comments) | MISSING + EXT | integration | M | deferred until a reputation service package exists [11; T10-26 carries the ⚠] | ⚠ 06 vs 11 |

---

## Do-not-build-yet (the matrix tempts; dependencies forbid)

1. **Cohort rollout machinery before the package + version nouns** — "building it before the
   package noun exists would be building it twice" [04 §8]; T100-2 waits on T10-4 + T100-1.
2. **Care-plan objects as one-off per-client features** — the 04 §4 trap; ME-34/35 are built
   only as establishable kinds, the rest wait for `packageEstablishes()` (T10-5).
3. **The [EA-04] research surface before its mechanisms have rows** — "the surface performs
   depth the substrate doesn't have — the invented-confidence sin at architectural scale"
   [08 §6.7 #5]; ME-33 is last in its block for this reason.
4. **Outcome learning before criteria packs** — the join (T10-17) writes into pack objects;
   without ME-7 "packs stay hand-fed" [13: Outcome → criteria learning join; 02].
5. **Any apparel pipeline before art-ownership metadata + asset grants** — "a design pipeline
   over unlicensed art is a liability engine" [07 §7 #1]; ME-26/27 wait on ME-8.
6. **Unifying the two automation runtimes** — 09 §2.1's binding KEEP-BOTH: unify patterns and
   monitoring (ME-2's dead-letter import, T100-1's fleet seam), never the runtimes.
7. **The fleet control plane as one umbrella build** — [13: Fleet control plane ⚠] is
   deliberately decomposed; build the granular rows (T10-7…10, T100-3/5/6), never "the plane."
8. **Experiment lifecycle before the compounding seams** — ME-31's stated dependency [08 §6.7].
9. **Buying what the audits ruled against**: Plausible-class analytics (build on owned pixel
   [11/04]), Shopify for client e-commerce (own rails, exception only [11]), social-listening
   vendors (SP-2), Sora/Runway before Shotstack is wired (T10-26 ⚠), ad-platform write APIs
   before T-100 (deliberate deferral [13: Ad placement writes]).
10. **Multi-operator delegation scaffolding** — T-1K, honestly out of scope until then [10 §3].

---

## The five validated prototypes → the tier at which each becomes real

Per [RC13 §5], each prototype is a validated interaction; this maps its underlying capability
set to roadmap items — the point where the prototype stops being staged data.

**P1 — Minute Zero → real at T-ME (early).** The making rails are already WORKING (11-stage
generation, Explorer, bespoke sites [13 WORKING register]). What P1 actually lacks is: F1–F6 +
ME-1 (the "dark heartbeat" premise is literally [13: Heartbeat self-arm]), ME-29 (free-floating
research — today research is verify-pinned to a world), and ME-19 (grounded session open).
P1 is the cheapest prototype to make real; it is mostly the fix-first ledger plus three items.

**P2 — Explore that surprises → "Make it real" → real at T-ME (late), by design last.**
Needs the research block in 08 §6.7's exact order: ME-28…32 (seams, multi-hop, experiments,
beacons/calibration) before ME-33 (the dual surface) and the promotion ceremony
[13: "Make this real" promotion — PROTOTYPE-ONLY, data model ready]. Building P2's surface
first is do-not-build-yet #3.

**P3 — The bench with hands → real at T-ME (mid-tier).** Exactly as the phase brief predicted:
the D5 substrate (ME-18) + criteria packs (ME-7, apparel instance ME-24) + the gallery/variants
bench with tournament (ME-21). The apparel material it manipulates becomes commercially real
with ME-26/27; the deeper production-design surface (T10-28) extends it at T-10 but is not
required for the prototype's verdict flip.

**P4 — The morning at ten clients → real at T-10.** Its slate needs T10-10 (exception compiler
+ slate approval kind) which needs T10-1 (world_id spine), T10-7 (margin line), and T10-8
(fleet health rollup); the planted-outlier catch needs T10-1's baselines plus ME-2's failure
ledger (an unreported failure can't surface as an outlier); the Field-at-10-clients switcher
reads T10-8. P4 is the reason the world_id spine leads the tier.

**P5 — Client birth from close-won → skeleton at T-ME, complete at T-10.** The birth event is
already WORKING ([13: Close-won → engagement → client world]); F2 (sender-domain/booking
deploys) makes the born world actually able to speak. "Complete, correct client environment in
under sixty seconds" requires T10-4 (`packageEstablishes()` seeding the orders), T10-1
(per-client forward-in aliases), T10-6 (per-client safety gates), and T10-24 (per-client social
profiles). The deferred grants+identity ceremony is the existing approval spine — no new build.

---

*Traceability: every item cites a 13-gap-matrix row (by register + row name) or a numbered
section of docs 02/04/05/06/07/08/09/10/11/12; all 17 ⚠ conflict rows from the matrix are
carried on the item that resolves them, none silently dropped.*
