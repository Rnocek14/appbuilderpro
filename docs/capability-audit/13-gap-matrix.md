# 13 — Consolidated Gap Matrix (Phase 5.5 aggregation)

Aggregated from docs 01–12 `## Matrix rows` per the charter's row protocol. Duplicate ratings
merged (most specific class kept, all sources cited). ⚠ marks a genuine cross-document
disagreement — both verdicts kept, one-line explanation, nothing silently picked.
Suffixes `+EXT` (= EXT-REQUIRED) and `+ARCH` (= ARCH-CHANGE) are inline per the charter.
Sections sorted by Needed-at tier (T-ME → T-SPEC), then domain.
Domains: Auto · Builder · Creative · Ctrl · Infra · Integr · Mail · RE · Research · Social · Web · Wksp.

## WORKING

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| Automation opportunity detection | Auto | WORKING | T-ME | Capability | 09 | pure, no model call; gaps = roadmap signal |
| Automation registry (honest maturity) | Auto | WORKING | T-ME | substrate | 01/09 | not_built never proposed; drift found: online_booking `not_built` vs shipped app_0109 |
| Trigger engine — email execution | Auto/Mail | WORKING 🔌 | T-ME | Standing Order | 01/05/09 | dual runner, one pure core, claim-first; warm lists + window guards (05); SMS leg severed (see DISCONNECTED) |
| Per-client automation config + attribution + ROI | Auto/Web | WORKING 🔌 | T-ME | Capability | 04/09 | automationReady gate |
| Automation monitoring (fires/runs/report) | Auto | WORKING | T-ME | ledger | 09 | success-side only; failure side MISSING |
| Generated-app automation substrate | Auto | WORKING 🔌 | T-ME | Capability | 09 | backoff/dead-letter/step-memo — better ops than parent |
| Child self-arming cron | Auto | WORKING 🔌 | T-ME | Capability | 09 | children self-arm; the parent doesn't (heartbeat PARTIAL) |
| Standing orders + drains + arc wake | Auto | WORKING 🔌 | T-ME | substrate | 01/09 | 21-action orchestrator catalog |
| Booking + reminders (config-as-automation) | Auto/Web | WORKING 🔌 | T-ME | Capability | 01/09 | absent from deploy lists (see DISCONNECTED) |
| 11-stage app generation | Builder | WORKING | T-ME | Capability | 01 | A− pillar |
| Agentic edit + branches + merge | Builder | WORKING | T-ME | Capability | 01 | |
| Autopilot builds (job-worker) | Builder | WORKING 🔌 | T-ME | Mission | 01 | |
| Deploy/provision/backend rail | Builder | WORKING 🔌 | T-ME | Capability | 01/09 | real executors; "the automation factory" (09) |
| Code+preview deep environment (the Builder) | Builder/Wksp | WORKING | T-ME | Workshop (deep) | 01/02/09 | the existence proof for DEEP-in-grammar |
| ai-gateway for generated apps | Builder | WORKING 🔌 | T-ME | substrate | 01 | 1.25× margin |
| Image gen + honesty gates (variant generation) | Creative/Social | WORKING 🔌 | T-ME | Capability | 01/07 | |
| AI-media provenance stamps | Creative | WORKING | T-ME | substrate | 01/07 | never strippable |
| Brand boards + logo concepts + kits | Creative | WORKING 🔌 | T-ME | Workshop | 01/07 | honest "not trademarked art" note |
| Artist portfolio (builder-based) | Creative | WORKING | T-ME | Capability | 07 | /dev spike ungated [R03 §10] |
| Artwork vision cataloging | Creative | WORKING | T-ME | Capability | 07 | "never invent an artist, title, price" |
| Mural opportunity engine + kind enum | Creative | WORKING 🔌 | T-ME | Standing Order | 07 | generic kind registry needed at T-10 |
| Deposits/invoicing + chase ladder | Creative/Web | WORKING 🔌 | T-ME | Standing Order | 01/07 | |
| Creative vertical pack (detection + seeds) | Creative | WORKING | T-ME | Capability | 07 | zero-AI floor |
| Wardrobe-room builder escape hatch | Creative | WORKING (misaimed) | T-ME | Capability | 07 | re-route to Apparel Workshop once it exists |
| Operator cockpit (system-control/health/canary/scorecard/ads-watch/pulse) | Ctrl | WORKING 🔌 | T-ME | substrate | 01/10 | single-operator scope; quiet-when-green |
| Ads read-only sync + watchdog | Ctrl/Social | WORKING 🔌 | T-ME | Standing Order | 01 | deliberate read-only |
| Situation digest | Ctrl | WORKING | T-ME | substrate | 01 | Field UI docs-only |
| Next Move + goals + triage | Ctrl | WORKING | T-ME | substrate | 01 | deterministic ranking |
| Pricing table + credit kinds | Infra | WORKING | T-ME | substrate | 12 | 2 kinds price unbuilt providers |
| Stripe SaaS + credits / client-facing tier pricing | Infra | WORKING 🔌 | T-ME | substrate | 01/12 | manual, margin-blind; legacy-table read drift (01) |
| Token vault (zero-policy RLS) + OAuth PKCE | Infra | WORKING | T-ME | substrate | 01/12 | tokens never reach browser |
| Vault-backed cron secrets | Infra | WORKING | T-ME | substrate | 12 | |
| Per-client infra isolation (sites/DBs/keys) | Infra | WORKING | T-ME | substrate | 12 | strongest isolation layer |
| Leases/retries (jobs, agent runs, arcs) | Infra | WORKING | T-ME | substrate | 12 | |
| Execution ledger (immutable, indexed) | Infra | WORKING | T-ME | substrate | 12 | |
| Migration replay + collision guard | Infra | WORKING | T-ME | substrate | 12 | born from real regressions |
| CI + verify harness | Infra | WORKING | T-ME | substrate | 01 | 116 suites; 6 unwired files (see DISCONNECTED) |
| Integration estate (25 live, gated, degrading honestly) | Integr | WORKING | T-ME | substrate | 11 | the foundation is real |
| Per-world sender/social identity (per-brand Resend domains) | Integr/Mail | WORKING 🔌 | T-ME | Capability | 05/11/12 | identities, not accounts; sender-domain in no deploy list (see DISCONNECTED) |
| send-email one path (fan-in hub) | Mail | WORKING 🔌 | T-ME | substrate | 01 | 7 callers |
| Warmup/caps/suppression/unsubscribe gates | Mail | WORKING 🔌 | T-ME | substrate | 05 | owner-global scope (per-client gates MISSING) |
| Batch segment sends | Mail | WORKING 🔌 | T-ME | Capability | 01 | one approval, clock drains |
| Follow-up/reactivation crons | Mail | WORKING 🔌 | T-ME | Standing Order | 01 | approvals only |
| Reply ingest + classify (forward-in alias capture) | Mail | WORKING 🔌 | T-ME | Capability | 01/05 | raw store; 3-tier sentiment + unsubscribe regex only |
| Overnight reply drafts + verdict learning | Mail | WORKING 🔌 | T-ME | Standing Order | 01/05 | the corpus's best learning loop |
| OpsInbox unified stream | Mail | WORKING | T-ME | Capability | 05 | operator-only reader |
| Speed-to-lead first touch (site pixel + site-events) | Mail/Web | WORKING 🔌 | T-ME | Standing Order | 01/05 | pre-authorized, deterministic |
| Missed-call text-back | Mail | WORKING 🔌 | T-ME | Capability | 01/05/09 | bypasses send-sms by design; survives the enum bug |
| Places discovery grid | Mail | WORKING 🔌 | T-ME | Standing Order | 01 | |
| Claude scout discovery | Mail | WORKING | T-ME | Capability | 01 | citation-grounded |
| Contacts CRM + timeline | Mail | WORKING | T-ME | Capability | 01 | |
| MLS sync (RESO, manual button) | RE | WORKING 🔌 | T-ME | Capability | 01/03 | no cron, one feed/operator (see PARTIAL) |
| Listing → full marketing set (campaignCore + verifier) | RE | WORKING | T-ME | Workshop | 01/03 | zero-AI floor, honesty gates, [EDIT] holes |
| Farm territories + household dedup + do-not-mail gate | RE | WORKING | T-ME | Capability | 01/03 | best-in-corpus fail-closed honesty |
| Farm economics screen | RE | WORKING | T-ME | Capability | 03 | pure, verified |
| Postcard compiler (print-it-yourself) | RE/Mail | WORKING | T-ME | Workshop bench | 01/03 | USPS geometry + enforceListingHonesty |
| Postcard QR/site-events attribution (batch-level) | RE/Mail | WORKING 🔌 | T-ME | ledger | 03/05 | household/per-piece level is PARTIAL (05) |
| Transaction timelines | RE | WORKING | T-ME | Mission | 03 | per-state variants at T-100 |
| RE compliance-as-data (Fair Housing/TCPA) | RE | WORKING | T-ME | Capability | 03 | needs an update loop by T-100 |
| Content weeks earned autonomy | RE/Social/Web | WORKING 🔌 | T-ME | Standing Order | 01/03/04/06 | the system's one real autonomy loop; per-client streaks don't aggregate (T-100); nothing establishes per client (04) |
| Explorer rabbit holes | Research | WORKING 🔌 | T-ME | Workshop | 01/08 | spike UI, real data model; credit-gated |
| Explore → build brief → app → Room | Research | WORKING | T-ME | Mission | 08 | the shipped promotion |
| Cited single-hop research (web_search + Serper) | Research | WORKING 🔌 | T-ME | Capability | 01/08 | Anthropic-only edge; [n]+SOURCES honesty |
| PDF/docx ingest | Research | WORKING | T-ME | Capability | 08 | was "coming" — now built; no OCR |
| Builder research persistence | Research | ⚠ WORKING (08) / DISCONNECTED (01) | T-ME | Capability | 01/08 | 08 verified FIXED post-Phase-1 (aiClient.ts:359–376); 01's row is stale — 08's verdict is current |
| Theory scaffold (falsifier-required) | Research | WORKING | T-ME | Capability | 01/08 | rejects no-falsifier by name |
| Compare instrument (hinges/discriminators) | Research | WORKING | T-ME | Capability | 08 | |
| Lab Bench (5 deterministic sim templates) | Research/Wksp | WORKING | T-ME | Workshop | 01/02/08 | closed-form only; honest-assumptions pattern already right |
| Hardened scrape (fetch-url + safeFetch) | Research | WORKING | T-ME | substrate | 01 | |
| Brand/voice grounding (world-scoped exemplars) | Social | WORKING | T-ME | substrate | 06 | no cross-business bleed |
| Post ideation/creation (boards + producers + judge) | Social | WORKING | T-ME | Workshop | 06 | copyJudge ≥8 fail-closed |
| Social graphics (image gen + brand cards) | Social | WORKING 🔌 | T-ME | Capability | 06 | per-client template library thin |
| Social publish rail (Ayrshare ×9, fail-closed keys) | Social | WORKING 🔌 | T-ME | Capability | 01/06 | holds to T-100; per-profile fees at scale (11) |
| Scheduled-post drain on the clock | Social | WORKING 🔌 | T-ME | Standing Order | 06 | 15-min tick |
| Social metrics read-back | Social | WORKING 🔌 | T-ME | Standing Order | 01/06 | nullable-honest; learning loop not closed (see DISCONNECTED) |
| Storyboard → Shotstack video (manual) | Social | WORKING 🔌 | T-ME | Workshop | 01 | grade C; reel engine is a separate MISSING row |
| Veo scene library | Social | WORKING 🔌 | T-ME | Capability | 01 | |
| Prospect→client funnel (end to end) | Web | WORKING 🔌 | T-ME | Standing Order + Mission | 04 | the A− chain; weak steps carried as own rows |
| Demo-site intelligence chain | Web | WORKING | T-ME | Capability | 01 | strategist→auditor personas |
| Tech fingerprint | Web | WORKING | T-ME | Capability | 01 | |
| Bespoke honest HTML sites | Web | WORKING | T-ME | Capability | 01 | deterministic honesty gate |
| Zero-AI fallback site spec | Web | WORKING | T-ME | Capability | 01 | the floor |
| Publish preview + photo re-host | Web | WORKING 🔌 | T-ME | Capability | 01 | |
| Pay → auto-publish loop | Web | WORKING 🔌 | T-ME | Capability | 01/04 | the zero-browser proof |
| Client-checkout + payment links | Web | WORKING | T-ME | Capability | 04 | honest 503 when unconfigured |
| Close-won → engagement → client world | Web | WORKING | T-ME | Mission | 01/04 | engagement-email→contact seam open |
| Connections checklist (evidence-derived) | Web | WORKING | T-ME | Capability | 01/04 | the per-client control-plane pattern; 3 connectors built:false |
| connect-domain (DNS-verified, never MX) | Web | WORKING 🔌 | T-ME | Capability | 01/04 | no registrar API (manual-by-client) |
| Operator site refine → republish in place | Web | WORKING | T-ME | Capability | 04 | coarse (whole-spec) + browser-bound |
| Website creation deep surface (PreviewEngine) | Web/Wksp | WORKING | T-ME | Workshop (deep) | 04 | DEEP-ENVIRONMENT ruling |
| Churn booking (no-resurrection) | Web | WORKING 🔌 | T-ME | Capability | 04 | honest MRR down |
| Upsell at pitch + point of sale | Web | WORKING | T-ME | Capability | 04 | signal-grounded, honest inventory |
| Prospect pipeline board | Web | WORKING | T-ME | Workshop | 01 | live signals |
| DocuSign send/webhook/filing | Web/RE | WORKING 🔌 | T-ME | Capability | 01 | sandbox default; back half PARTIAL |
| Work-Web area grammar (7 archetypes × flavors) | Wksp | WORKING | T-ME | substrate | 02 | the shipped composition-by-data proof |
| Client analytics on site-events | Web | WORKING | T-10 | Capability | 11 | reporting layer PARTIAL; build reports on owned pixel, do not buy Plausible |

## DISCONNECTED

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| SMS rail (send_sms enum) | Mail/RE/Auto | ⚠ DISCONNECTED (01/05/09) / PARTIAL (03/11) | T-ME | Capability + substrate | 01/03/05/09/11 | approval_kind enum lacks 'send_sms' — one-line migration; 03/11 rate PARTIAL because everything around the enum is built; 09: dead branch burns fire budget + starves email fires; A2P per client remains the operational gate |
| Canvas ArtifactSheet → publish bridge | Social | DISCONNECTED | T-ME | Capability | 01/06 | decision contract lacks a publish verb; one verb to the existing rail |
| Depth engine wiring (red-team producers) | Research | DISCONNECTED | T-ME | substrate | 01/08 | 1 of ~9 producers wired |
| Booking/sender-domain deploy-list absence | Web/Auto | DISCONNECTED | T-ME | substrate | 01/04/05/09 | two one-line fixes |
| Post-performance → producer/Playbook learning | Social | DISCONNECTED | T-ME | Standing Order | 06 | metrics read-back was built to close this loop and doesn't; socialRun.ts:79 sole reader |
| Uptime/SSL watch on sold sites | Web | DISCONNECTED | T-ME | Standing Order | 04 | watch_url exists; nothing creates per-site watches |
| Unwired verify files | Infra | DISCONNECTED | T-ME | substrate | 01 | 6 files, incl. workerParity |
| MLS rows → campaign composer seam | RE | DISCONNECTED | T-ME | Capability | 03 | campaignCore inputs typed by hand while mls_listings holds the facts |
| Insights proximity scanner | Research | DISCONNECTED | T-10 | Standing Order | 01/08 | upload-only trigger; machinery exists |
| World intel on the clock | Ctrl | DISCONNECTED | T-10 | Standing Order | 01 | visit-only recompute |

## PARTIAL

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| Heartbeat self-arm | Auto | PARTIAL | T-ME | substrate | 01/09 | ships OFF; CI step defaults off; every 🔌 above hangs on it |
| Drop/collection assembly + tournament | Creative | PARTIAL | T-ME | Workshop bench | 07 | adapter on existing board substrate; no drop noun |
| Storefront on own rails (builder + Stripe) | Creative | PARTIAL 🔌 | T-ME | Workshop | 07 | no product/order/inventory model; own venture on own Stripe |
| Product listing copy channel | Creative | PARTIAL | T-ME | Capability | 07 | copyJudge seam channel-extensible; no product channel |
| Mural-pitch criteria + proposal workshop | Creative | PARTIAL | T-ME | Workshop | 07 | paperwork chain WORKING; criteria pack docs-only |
| Per-action AI cost recording | Infra | PARTIAL | T-ME | substrate | 12 | 6 unmetered fns; chokepoint real for 21 surfaces |
| Builder-project secrets at rest | Infra | PARTIAL | T-ME | substrate | 12 | localStorage "interim" |
| World-scoped reads / multi-business isolation | Infra | PARTIAL | T-ME | substrate | 01/12 | "~70% true"; six leaks closed; 01 filed it T-10, 12 T-ME — earliest kept |
| Fetch timeouts | Infra | PARTIAL | T-ME | substrate | 12 | B15 closed at call sites; safeFetch no default |
| Cold-audience routing for a client's vertical | Mail | PARTIAL | T-ME | Capability | 05 | discovery machinery built; drains only into the agency funnel |
| Contact/lead creation from inbound mail | Mail | PARTIAL | T-ME | Capability | 05 | site-events leads create contacts; inbound_mail creates nothing |
| Beacons with held guesses | Research | PARTIAL | T-ME | Capability | 08 | open loops exist; guess + calibration missing |
| Prediction calibration (auto-close) | Research | PARTIAL | T-ME | Standing Order | 08 | honest math shipped; manual close |
| Parameter sweeps / run compare | Research | PARTIAL | T-ME | Workshop | 08 | single-bump only |
| No-email prospect handling | Web | PARTIAL | T-ME | Capability | 04 | SMS substitute severed by the enum |
| Document bench (living doc + forks + rubric dock) | Wksp | PARTIAL | T-ME | Workshop | 02 | closest generic bench to done |
| Map/graph bench (claims, evidence columns) | Wksp/Research | PARTIAL | T-ME | Workshop | 02 | evidence-columns + prediction registry missing |
| Unified commit rail (→Artifact/Mission/Automation) | Wksp | PARTIAL | T-ME | substrate | 02 | gates exist; ceremony and provenance don't |
| Grounded session open (Palette gather pre-run) | Wksp | PARTIAL | T-ME | substrate | 02 | compileSituation WORKING; per-workshop staging absent |
| Earned autonomy generalized | Auto | PARTIAL | T-10 | substrate | 01 | eligible-not-granted |
| Builder-as-capability from missions | Auto | PARTIAL | T-10 | Mission | 09 | build_app = handoff; wire into job-worker autopilot |
| Brand kit as one token substrate | Creative | PARTIAL | T-10 | substrate | 07 | five consumers, no noun; drift by construction at ten brands |
| MLS scheduled refresh + multi-feed | RE | ⚠ PARTIAL 🔌 (03) / MISSING (01) | T-10 | Standing Order | 01/03 | 03 counts the WORKING manual sync as the base; cron trivial, multi-feed is design work |
| DocuSign back half (auto-populate / trigger-send) | RE/Web | PARTIAL | T-10 | Capability | 01/03 | front half + filing real; middle missing |
| Unified people model | Mail/RE/Creative | PARTIAL + ARCH | T-10 | substrate | 01/03/05 | six unreconciled people tables; two customer substrates; prerequisite for any multi-client CRM |
| apps↔worlds noun bridge | Ctrl | PARTIAL + ARCH | T-10 | substrate | 01 | the core ambiguity |
| Per-client cost attribution + margin line | Ctrl | PARTIAL + ARCH | T-10 | substrate | 10 | revenue side already per client; cost side needs world_id spine |
| Per-recipient personalization in batches | Mail | PARTIAL | T-10 | Capability | 05 | token merge + unknownTokens refusal; AI drafting only on agency pitches |
| Batch drain throughput | Mail | PARTIAL | T-10 | substrate | 05 | ~10 recipients/15 min; arithmetic fails at client volumes |
| Email template library (versioned) | Mail | PARTIAL | T-10 | Workshop bench | 05 | scattered templates; data-shaped work |
| Per-brand deliverability analytics | Mail | PARTIAL | T-10 | Capability | 05 | events + batch stats exist; no per-domain surface |
| Intent classification (beyond sentiment) | Mail | PARTIAL | T-10 | Capability | 05 | |
| Per-piece QR/URL attribution (household-level) | Mail | PARTIAL | T-10 | ledger | 05 | batch level WORKING; household level specced only |
| Source management (first-class) | Research | PARTIAL | T-10 | Capability | 08 | in-artifact text only |
| Embedding coverage (2/6 subjects) | Research | PARTIAL | T-10 | substrate | 08 | worker ready |
| Exploration state cloud-held (loops/currents) | Research | PARTIAL | T-10 | substrate | 08 | localStorage; `mind` column ready |
| Ayrshare per-client social profiles | Social/Integr | PARTIAL 🔌 + EXT | T-10 | Capability | 06/11 | Profile-Keys resolved fail-closed; linking lives on Ayrshare's dashboard; Business-tier fees multiply per client |
| Standing per-client content strategy object | Social | PARTIAL | T-10 | Workshop → Artifact | 06 | strategy is a per-campaign draft; producers never re-read it |
| Failed-post exception loop | Social | PARTIAL | T-10 | substrate | 06 | recorded, never remediated; no webhook |
| Google Business / calendar / esign connectors | Web/Integr | ⚠ PARTIAL (04) / DOCUMENTED-ONLY + EXT (11, GBP) | T-10 | Capability | 04/11 | built:false scaffolds exist — 04 counts the checklist scaffolding, 11 rates the unbuilt OAuth; GBP is the first care-plan ask |
| Fallback-spec critique pass | Web | PARTIAL | T-10 | Capability | 04 | ai-source only; fallback sites skip simulated owner |
| Publish-to-paying-client behind the spine | Web | PARTIAL | T-10 | Mission | 04 | confirm dialog today; should be an approval kind |
| Client-ops unified bench | Web | PARTIAL | T-10 | Workshop | 04 | ClientBook + ClientBilling + Readiness split; REUSABLE-FRAMEWORK |
| Client e-commerce (own builder + Stripe) | Web/Creative | PARTIAL | T-10 | Workshop | 11 | Shopify by exception; blocked on Connect for client-owned money |
| Export-to-craft relay (segment → sibling Palette) | Wksp | PARTIAL | T-10 | Capability | 02 | hard-wired seams only; the baton of every multi-bench toolchain |
| Table/dataset bench (virtualized grid) | Wksp | PARTIAL | T-10 | Workshop | 02 | hand-rolled tables; no grid lib |
| Unified connector registry | Integr | PARTIAL + ARCH | T-100 | substrate | 01/11 | merge three connection systems behind one schema |
| Per-client credential vault scope | Integr | ⚠ PARTIAL + ARCH (11) / MISSING + ARCH (01) | T-100 | substrate | 01/11 | 11 counts the (user,provider) vault as the base to extend; add scope column, migrate Ayrshare keys / Twilio numbers / sender identities in |
| Webhook fan-in platform | Integr | PARTIAL | T-100 | substrate | 11 | per-provider excellence; registry-routed, raw-event-first |
| Provider budget ledger | Integr | PARTIAL | T-100 | substrate | 11 | AI credits only; feeds cost-anomaly control plane |
| Uniform sandbox/test modes | Integr | PARTIAL | T-100 | substrate | 11 | ad hoc today; onboard clients in test mode |
| Single shared credit balance | Infra | PARTIAL | T-100 | substrate | 12 | one 402 fails all clients |
| One-project Postgres capacity | Infra | PARTIAL | T-100 | substrate | 12 | auto-pausing tier is the backend |
| Prompt-injection input defenses | Infra | PARTIAL | T-100 | substrate | 12 | output gates real; input side open |

## PROTOTYPE-ONLY

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| Bench manipulation substrate (D5: undo, drag, scrub, latency budgets) | Wksp | PROTOTYPE-ONLY | T-ME | substrate | 02 | prototypes/workshop-hands.html; built once, under all nine benches |
| "Make this real" identity-preserving promotion | Research | PROTOTYPE-ONLY | T-ME | Workshop | 08 | data model ready; ceremony unwired |
| Cross-client approval slates (slate approval kind) | Ctrl/Social | PROTOTYPE-ONLY | T-10 | Mission + substrate | 06/10 | morning-brief prototype; manifest, hash-bound, outliers out; content_week is the WORKING one-class precedent |
| Heartbeat trace UX | Auto | PROTOTYPE-ONLY | T-10 | Workshop bench | 09 | Health board is the WORKING floor |

## DOCUMENTED-ONLY

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| Cross-world artwork grant substrate | Creative | ⚠ DOCUMENTED-ONLY + ARCH, T-ME (07) / T-SPEC (01) | T-ME | substrate | 01/07 | controlled exception to world isolation; autonomy_grants is the nearest shape; 07 (domain owner) pulls it to T-ME |
| Drop mission template (sample→run→lookbook→publish) | Creative | DOCUMENTED-ONLY | T-ME | Mission | 07 | data on built rails; plays.ts is the mold |
| Mail fulfillment (Lob send_mail executor) | Mail/RE | ⚠ DOCUMENTED-ONLY + EXT (03/05/11) / MISSING + EXT, T-10 (01) | T-ME | Capability + Mission executor | 01/03/05/11 | the domain's #1 revenue-blocking gap; full level-10 spec exists (which is why 03/05/11 outvote 01's MISSING); print-it-yourself is the shipped floor |
| Print-DPI parity render (bleed-true artifact) | Mail/RE | DOCUMENTED-ONLY | T-ME | Workshop bench | 03/05 | render-design is social-sizes only; prerequisite for any vendor API |
| Portal-lead parsing (Zillow/Realtor) | Mail/RE | DOCUMENTED-ONLY | T-ME | Capability | 03/05 | most agents' top lead source; forward-in alias is the substrate |
| Conversation + live-map dual surface | Research | DOCUMENTED-ONLY | T-ME | Workshop | 08 | shipped grammar is drift, not dialogue |
| Theory cards / evidence tallies | Research | DOCUMENTED-ONLY | T-ME | Workshop | 08 | edges + epistemics shipped; view absent |
| Six-part session anatomy (Bench/Palette/Counsel/Moves/Ledger/rail) | Wksp | DOCUMENTED-ONLY | T-ME | Workshop | 02 | the grammar itself, unbuilt |
| Session Ledger + driver stamps + resumable story | Wksp | DOCUMENTED-ONLY | T-ME | substrate | 02 | the delegation instrument |
| Criteria-pack object (named, versioned, score-carrying) | Wksp | DOCUMENTED-ONLY | T-ME | substrate | 02 | judges hard-coded today; converts judgment from prompt to instrument; domain instances in 07/08 |
| Gallery/variants bench (variant sets, tournament, compare) | Wksp | DOCUMENTED-ONLY | T-ME | Workshop | 02 | boards WORKING as single-shot generator surfaces only |
| Voice AI receptionist | Mail | DOCUMENTED-ONLY + EXT | T-10 | Workshop | 01 | Twilio-only today |
| Sequence/flow designer (beyond 2 fixed bumps, incl. A/B ladders) | Mail | ⚠ DOCUMENTED-ONLY (05) / MISSING (01) | T-10 | Capability | 01/05 | level-10 #4 spec exists incl. gates-live-at-send rule — 05's class is current |
| SMS quiet hours | Mail | DOCUMENTED-ONLY | T-10 | Capability | 05 | TCPA exposure without it |
| Mail delivery webhooks + returned-mail learning | Mail/RE | DOCUMENTED-ONLY + EXT | T-10 | Standing Order | 03/05 | monotonic ranks specced; receiver patterns exist to copy |
| Commission stage model (inquiry→wall→final) | Creative | DOCUMENTED-ONLY | T-10 | Mission | 07 | rides the six-people-tables debt |
| Exploration decay/re-entry story | Research | DOCUMENTED-ONLY | T-10 | Workshop | 08 | storage never deletes; rendering absent |
| Explorations lens (cross-world) | Research | DOCUMENTED-ONLY | T-10 | substrate | 08 | gardener is the shipped seed |
| Sim-evidence edge labeling | Research | DOCUMENTED-ONLY | T-10 | Capability | 08 | record-level honesty shipped |
| Rendered-DOM fetch (JS portals) | Web/RE | DOCUMENTED-ONLY | T-10 | Capability | 01/04 | thin profiles degrade demo quality |
| Builder-app custom domains | Web | DOCUMENTED-ONLY | T-10 | Capability | 01 | prospect domains exist |
| Data export / deletion + backup/restore drills | Infra | DOCUMENTED-ONLY | T-10 | Capability | 01/12 | compliance + offboarding double-duty |
| Cohort rollout (pin→cohort→bake→promote→rollback) | Ctrl/Auto | ⚠ DOCUMENTED-ONLY + ARCH (10) / MISSING + ARCH (01/09) | T-100 | Mission + substrate | 01/09/10 | exp-arch 08 §6.2 / 09 §10.2 make it DOCUMENTED-ONLY; canary-per-cohort; batch-adopt made concrete |
| Counterparty-isolation contract (testable) | Infra | DOCUMENTED-ONLY + ARCH | T-100 | substrate | 12 | no structural enforcement |
| Workshop composer ("open a workshop for X") | Wksp | DOCUMENTED-ONLY + ARCH | T-100 | substrate | 02 | requires archetype-renderer inversion |
| Learned-workshop distillation (definition → genome) | Wksp | DOCUMENTED-ONLY | T-100 | substrate | 02 | provenance-carrying genome growth |

## MISSING

| Capability | Domain(s) | Class | Needed-at | Owner object | Sources | Note |
|---|---|---|---|---|---|---|
| Automation failure ledger + auto-pause (repair loop) | Auto/Infra | MISSING | T-ME | substrate + Standing Order | 09/12 | standing-worker catch is silent; once-only fire, no dead-letter; 12 filed it T-10, 09's live-bug proof pulls to T-ME |
| Physical-art ownership/edition registry | Creative | MISSING | T-ME | substrate | 07 | same metadata the grant case needs |
| Product templates + print-fidelity gate | Creative | MISSING + EXT | T-ME | Capability | 07 | fidelity bought (Printful mockups/print files); gate built fail-closed |
| POD fulfillment (Printful catalog/mockup/orders/webhooks) | Creative | ⚠ MISSING + EXT — T-ME (07) / T-10 (11) / T-SPEC (01) | T-ME | Capability | 01/07/11 | class agreed; tier disagreement — domain owner 07 says T-ME; Printful first, Printify later as margin play |
| Apparel criteria pack + critique channel | Creative | MISSING | T-ME | Capability | 07 | instance of 02's criteria-pack object; judge seam exists |
| Order ingestion (webhooks → orders rows) | Creative | MISSING | T-ME | substrate | 07 | precondition for all outcome learning |
| Artist/apparel venture template (work-web as data) | Creative | MISSING | T-ME | Workshop | 07 | genesis detects the venture but cannot dress it |
| Whole-inbox connection (Gmail/IMAP/Nylas) | Mail | ⚠ MISSING + EXT — T-ME (01/05) / T-10 (11) | T-ME | Capability | 01/05/11 | the "senses" gap; forward-in is the wedge; CASA verification is the real cost of the buy |
| send_mail approval kind + cost-ceiling executor | Mail | MISSING | T-ME | Mission executor | 05 | the mail twin of send-email |
| Inbound extraction rules engine | Mail | MISSING | T-ME | Capability | 05 | inbound_mail is a raw insert; precision-over-recall doctrine already written |
| Territory map UI / geo deep environment | RE/Wksp | MISSING + EXT | T-ME | Workshop (deep) | 01/02/03/11 | no map lib anywhere; buy tiles (MapTiler/Protomaps), build the geo canvas; 01 alone filed it T-10 |
| Homeowner/property data acquisition (ATTOM-class) | RE | MISSING + EXT | T-ME | Capability | 01/03/11 | CSV import only today; licensing/display rights + DNC scrub are part of the buy |
| CASS address validation | RE/Mail | MISSING + EXT | T-ME | Capability | 03/05/11 | farm.ts self-declares; fail-closed like suppression; same vendor as print (Lob verify/Smarty/Melissa) |
| Free-floating research (no world) | Research | MISSING | T-ME | Capability | 08 | deliberate, verify-pinned hole; Explore side door exists |
| Multi-hop research engine | Research | MISSING | T-ME | Mission | 08 | all primitives in-house; arcs exist |
| Assumptions ledger | Research | MISSING | T-ME | Capability | 08 | strings in artifacts only |
| Experiment lifecycle/tracking | Research | MISSING | T-ME | Mission | 08 | kinds + sparks + records exist; no loop |
| Client change-request intake + loop | Web | MISSING | T-ME | Capability | 04 | the care plan's front door |
| Per-client recurring report (site/outreach/social) | Web/Mail/Social | MISSING | T-ME | Standing Order | 04/05/06 | all numbers exist as ledger rows — cheapest big win; 06's social variant filed T-10 |
| Registry update loop (drift check) | Auto | MISSING | T-10 | Standing Order | 09 | code-only library goes stale; drift already found |
| Visual flow design bench (recipe objects + shadow replay + staged arm) | Auto/Wksp | MISSING | T-10 | Workshop (deep) | 02/09 | an execution engine, not a rendering; 09 rules it not-yet-needed but T-10 |
| Automation test harness (dry-run/sim/fixtures/sandbox) | Auto | MISSING | T-10 | Workshop bench | 01/09 | seed SQL is the whole harness; pure injectable-clock core makes it cheap |
| Arming gate (dry-run-before-active) | Auto | MISSING | T-10 | substrate | 09 | approval payload = plan hash |
| Brand finalization (vector/guidelines/trademark) | Creative | MISSING | T-10 | Capability | 07 | designer referral is the honest floor |
| Design outcome learning (sales → annotations → rubric) | Creative | MISSING | T-10 | Standing Order | 07 | content-week earned-autonomy loop is the pattern |
| Fleet health rollup per world (state incl. `dark`) | Ctrl | MISSING + ARCH | T-10 | Standing Order | 10 | heartbeat is job-scoped today |
| World/client attribution on execution_runs + usage_events | Ctrl/Infra | ⚠ MISSING + ARCH (10) / MISSING (12) | T-10 | substrate | 10/12 | head of every dependency chain; 12 calls it an additive migration + stamp at chokepoint, 10 calls the spine change ARCH — both agree MISSING at T-10 |
| Credential registry + expiry/probe sweep | Ctrl/Infra | MISSING | T-10 | Standing Order | 10/12 | probes exist unscheduled; lazy refresh only |
| Exception compiler (severity tiers, maintenance batch) | Ctrl | MISSING | T-10 | substrate | 10 | the control plane's one output |
| Isolation policy-test class | Infra | MISSING | T-10 | substrate | 12 | the cheap ratchet |
| World-scoped semantic retrieval | Infra/Research | MISSING | T-10 | substrate | 12 | kNN mixes clients today; no world param/column on app_0021 |
| Standing-order concurrency claim | Infra | MISSING | T-10 | substrate | 12 | double-run risk on record |
| Rotation/revocation runbooks | Infra | MISSING | T-10 | Capability | 12 | one WORKER_SECRET, undocumented |
| Client credential offboarding | Infra | MISSING | T-10 | Mission | 12 | |
| Contact enrichment (third-party, email finder) | Integr/Mail | MISSING + EXT | T-10 | Capability | 01/11 | hybrid: keep owned discovery, buy only verification (Apollo/Clearbit-class) |
| Demographics data feed (Census ACS) | Integr/RE | MISSING + EXT | T-10 | Capability | 01/11 | free API; effort is the tract⇄farm join |
| Per-client safety gates (caps/warmup/kill per world) | Mail | MISSING | T-10 | substrate | 05 | send-email safety is per-human today; deliberate single-tenant design, must be re-decided |
| Behavioral segment engine | Mail | MISSING | T-10 | Capability | 05 | outreach_events substrate already recorded |
| Email A/B testing | Mail | MISSING | T-10 | Capability | 01/05 | small-list guard specced |
| Branded HTML email shell | Mail | MISSING | T-10 | Capability | 05 | plain default |
| Inbound mail → knowledge ingest bridge | Mail/Research | MISSING | T-10 | Capability | 01/05 | no bridge to ingest-document |
| Per-owner cron caps → per-client caps | Mail | MISSING | T-10 | substrate | 05 | 10/owner/sweep; fairness across clients |
| Per-client forward-in aliases (inbound world attribution) | Mail | MISSING | T-10 | substrate | 05 | one alias/operator; inbound_mail has no world_id — part of the world_id spine |
| Reply-to-client visibility (digest/portal) | Mail | MISSING | T-10 | Capability | 05 | OpsInbox is operator-only |
| Call tracking / per-campaign numbers | Mail/RE | ⚠ MISSING + EXT (03/05) / PARTIAL (11) | T-10 | Capability | 03/05/11 | 11 counts live voice-inbound as the base to build on (Twilio numbers or CallRail); recording needs consent gates |
| Variable-data merge (per-piece content) | RE/Mail | MISSING | T-10 | Capability | 03/05 | address block only; per-household tokens specced |
| List provenance + permission tracking | RE | MISSING | T-10 | substrate | 03 | a bad list is a liability at client scale |
| Open-house capture | RE | MISSING | T-10 | Capability | 03 | small build on existing rails |
| Theory critique packs | Research | MISSING | T-10 | Capability | 08 | copyJudge precedent; instance of 02's criteria-pack |
| User-defined / domain sim models | Research | MISSING | T-10 | Capability | 08 | templates-as-data direction |
| External compute / notebooks | Research | MISSING + EXT | T-10 | Capability | 08 | Pyodide first; E2B/Modal later; WebContainer in-house asset |
| Outcome → criteria learning join | Wksp | MISSING | T-10 | substrate + Standing Order | 02 | meters exist, join nowhere; packs stay hand-fed without it (04's demo-outcome and 06's post-performance rows are instances) |
| Demo outcome learning loop | Web | MISSING | T-10 | Standing Order | 04 | signals collected, never fed back |
| Social connector row in client checklist | Social | MISSING | T-10 | Capability | 06 | deriveStatus over world_social_profiles |
| Social audience + competitor intel | Social | MISSING | T-10 | Capability | 06 | Ayrshare account analytics + existing watch_url |
| Social-native trend research | Social | MISSING + EXT | T-10 | Standing Order | 06 | trend_scan over the existing Serper rail is the cheap start |
| Social listening / community management (comments, DMs) | Social | ⚠ MISSING + EXT — T-10 (06) / T-SPEC (11) | T-10 | Capability | 06/11 | 06 wants Ayrshare comments/messages API at T-10; 11 defers listening VENDORS until a reputation service package exists |
| Content calendar object/view | Social | MISSING | T-10 | Workshop (deep surface) | 06 | data model complete; the surface is the whole gap; generic sibling is 02's timeline bench |
| Reel render engine | Social | ⚠ MISSING + EXT (01) / PARTIAL 🔌 + EXT (06) | T-10 | Workshop bench | 01/06 | granularity split — 06 rates video overall (manual Shotstack WORKING) PARTIAL; the reel engine itself is schema-dead, priced, zero code; wire through Shotstack before buying Sora/Runway |
| Section-level site edit | Web | MISSING | T-10 | Workshop (deep) | 04 | directive regenerates whole spec today |
| Site content-refresh order | Web | MISSING | T-10 | Standing Order | 04 | needs `site_refresh` kind |
| Churn offboarding (takedown/transfer/win-back) | Web | MISSING | T-10 | Mission | 04 | zombie sites accumulate |
| Renewal-risk detection | Web | MISSING | T-10 | Standing Order | 04 | payment-fail is the only signal |
| Ongoing upsell re-audit of active clients | Web | MISSING | T-10 | Standing Order | 04 | expansion revenue by memory today |
| Service package as versioned object | Web | MISSING + ARCH | T-10 | substrate | 04 | no package/care-plan noun; seedForTier proves the seeding pattern |
| Package establishes orders at sale | Web | MISSING | T-10 | substrate | 04 | unblocks report/watch/refresh at once |
| Board bench (cards, balance, gap-scan) | Wksp | MISSING | T-10 | Workshop | 02 | shared build; serves campaign + social + lineup |
| Timeline/planner bench (lanes, cadence, overlay compare) | Wksp | MISSING | T-10 | Workshop | 02 | serves social, farm cadence, launches; 06's content calendar is the domain instance |
| Production design surface (placements, print fidelity, brand tokens) | Wksp/Creative | MISSING + EXT | T-10 | Workshop (deep) | 02 | template-bound compile is the T-ME floor |
| AI-layer test coverage | Infra | MISSING | T-10 | substrate | 01 | brain/executeTool/*Run.ts |
| Trigger-class earned autonomy | Auto | MISSING | T-100 | substrate | 09 | per-fire approvals can't scale; triggers not an autonomy class today |
| Automation versioning (definition/instance + pins) | Auto/Ctrl | ⚠ MISSING + ARCH (09/10) / MISSING (01) | T-100 | substrate | 01/09/10 | no version columns on app_0076; crack already visible at T-10 — record versions from T-10 (10) |
| Templates-as-data automation library | Auto | MISSING + ARCH | T-100 | substrate | 09 | vertical_specs has zero code hits; same schema as versioning; child substrate proves the shape |
| Child fleet automation rollup | Auto | MISSING + ARCH | T-100 | substrate | 09 | no parent read over child runs; the ONE seam the two substrates should share |
| Step memoization for standing-worker chains | Auto | MISSING | T-100 | substrate | 09 | child has it; parent re-runs chains — import the pattern |
| Cohort package rollout/migration | Web/Ctrl | MISSING + ARCH | T-100 | substrate | 04 | service-package sibling of the automation cohort row; wait for control plane |
| Client-venture commerce (Stripe Connect) | Creative/Web | MISSING + EXT | T-100 | Capability | 07/11 | merchant-of-record risk concentrates on operator until then; prerequisite for client e-commerce |
| Per-world deviation watch (generalized adsWatchCore) | Ctrl | MISSING | T-100 | Capability | 10 | proven core, wrong scope |
| Cost anomaly watch (per-client + own-spend) | Ctrl/Infra | MISSING + ARCH | T-100 | Standing Order | 01/10/12 | ads-watch is the template, re-aimed at fleet + own AI spend |
| Declarative policy engine over existing gates | Ctrl | MISSING | T-100 | substrate | 10 | gate seams centralize already |
| Bake/canary cohort verdicts from fire ledgers | Ctrl | MISSING | T-100 | Standing Order | 10 | content-week judge generalized |
| Dwell-weighted streaks + sampled audits | Ctrl | MISSING | T-100 | Standing Order | 10 | trust vs fatigue distinguishable |
| Cohort-evidence provisional autonomy | Ctrl | MISSING + ARCH | T-100 | substrate | 10 | kills the O(N) apprenticeship; app_0097 is per-owner per-class only |
| Fleet control plane (umbrella) | Ctrl | ⚠ MISSING + ARCH — T-100 (01) / T-1K (12) | T-100 | substrate | 01/10/12 | single-operator substrate today; doc 10 decomposes it — the granular rows above are the real register |
| Client billing / payment reconciliation | Web/Infra | MISSING | T-100 | substrate | 01/04 | deliberate today |
| Client portal | Web | MISSING | T-100 | Workshop | 04 | email/forms suffice before T-100 |
| Ad placement writes | Social/Ctrl | MISSING + EXT | T-100 | Capability | 01 | deliberate deferral |
| Per-client provider accounts (Twilio subaccounts) | Integr/Infra | MISSING + EXT | T-100 | substrate | 11/12 | per-client from-number column is the interim; A2P per-brand registration is the hidden serial cost |
| Per-world / per-automation budgets | Infra | MISSING | T-100 | Standing Order | 12 | loop caps ≠ budgets |
| Per-provider global rate budgets | Infra | MISSING | T-100 | substrate | 12 | channel caps only |
| Log retention/lifecycle | Infra | MISSING | T-100 | Standing Order | 12 | append-only forever on nano tier |
| Shadow-DB migration testing | Infra | MISSING | T-100 | substrate | 12 | migrations hit prod live |
| World-partitioned AI context | Infra/Ctrl | MISSING + ARCH | T-100 | substrate | 12 | situation digest lists every client by design |
| Policy coverage of generated-app children | Ctrl | MISSING + ARCH | T-1K | substrate | 10 | enforcement boundary open |
| Rotation floor + staged hygiene | Ctrl | MISSING | T-1K | Standing Order | 10 | silent rot is T-1K steady state |
| Multi-operator delegation | Ctrl | MISSING + ARCH | T-1K | substrate | 10 | out of scope; named honestly |
| Native platform publish APIs (build alternative to Ayrshare) | Social | MISSING + EXT | T-SPEC | Capability | 06 | 9 app reviews; the buy is live and correct |

Ruling carried without a class: doc 09 rules parent/child automation substrates KEEP-BOTH — unify patterns + monitoring, never runtimes.

## Cut A — ARCH-CHANGE register

Every row carrying +ARCH (or converging on the same structural noun), grouped by the shared schema change it converges on.

| Convergence (shared schema/noun) | Rows converging on it | Sources | Structural change |
|---|---|---|---|
| **world_id on the ledgers** — one additive `world_id` column stamped at existing chokepoints (metering fn, standing-worker, resend-inbound), read by every rollup | World/client attribution on execution_runs + usage_events ⚠ · Per-client cost attribution + margin line · Fleet health rollup per world · Cost anomaly watch · Per-client forward-in aliases (inbound_mail world_id) · World-partitioned AI context · World-scoped semantic retrieval (embeddings) | 05/10/12 | head of every control-plane dependency chain; 12 shows the migration is additive — the ARCH is that every ledger writer and reader changes |
| **service-package + cohort nouns** — versioned package definition, per-client instance with pin, cohort membership | Service package as versioned object · Package establishes orders at sale · Cohort package rollout/migration · Cohort rollout (pin→bake→promote→rollback) ⚠ · Cohort-evidence provisional autonomy · Bake/canary cohort verdicts | 04/09/10 | one definition/instance/pin schema serves packages AND automations; kills O(N) apprenticeship |
| **versioned automation definitions** — definition/instance split + version pins on app_0076 | Automation versioning ⚠ · Templates-as-data library · Registry pins (10) · Arming gate payload = plan hash | 01/09/10 | same schema as the package noun; record versions from T-10, enforce at T-100 |
| **asset-grant substrate** — cross-world grant rows (scope, revocation, provenance) | Cross-world artwork grant ⚠ · Physical-art edition registry (same metadata) | 01/07 | controlled exception to world isolation; autonomy_grants is the nearest existing shape |
| **criteria-pack object** — named, versioned, score-carrying judgment instrument | Criteria-pack object (02) · Apparel criteria pack (07) · Theory critique packs (08) · Outcome → criteria learning join (02) | 02/07/08 | no +ARCH suffix in source docs, but a new first-class noun replacing hard-coded judges; the learning join is its feedback edge |
| **world-scoped embeddings/retrieval** | World-scoped semantic retrieval · Embedding coverage (2/6) | 08/12 | world column + filter on app_0021 kNN; without it retrieval mixes clients |
| **people/noun unification** | Unified people model · apps↔worlds noun bridge · Unified connector registry · Per-client credential vault scope ⚠ | 01/03/05/11 | six people tables → one; three connector systems → one schema; vault key (user,provider) → (user,provider,world) |
| **fleet control plane umbrella** | Fleet control plane ⚠ · Policy coverage of children · Multi-operator delegation · Workshop composer inversion (02) | 01/02/10/12 | the T-100/T-1K superstructure; decomposed into the granular rows above rather than built as one thing |

## Cut B — EXT-REQUIRED register

Every external dependency, with doc 11's build-vs-buy verdict. ⚠ where a domain doc and doc 11 disagree.

| External dependency | Rows | Doc-11 verdict | Domain-doc agreement |
|---|---|---|---|
| Map tiles (MapTiler/Protomaps + MapLibre) | Territory map UI | BUY tiles, BUILD geo canvas | agree (02/03) |
| Property data (ATTOM/DataTree/PropertyRadar) | Homeowner/property data · property enrichment (03) | BUY; licensing + DNC scrub gates are part of the buy | agree (01/03) |
| Demographics (Census ACS) | Demographics feed | BUY (free API); build the tract⇄farm join | agree (01) |
| Address validation (Lob verify/Smarty/Melissa) | CASS validation | BUY, same vendor as print, fail-closed | agree (03/05) |
| Direct mail (Lob; PostGrid alternate) | Mail fulfillment · delivery webhooks | BUY — highest-leverage buy in the register | ⚠ class only: 01 MISSING vs 03/05/11 DOCUMENTED-ONLY (full spec exists) |
| Contact enrichment (Apollo/Clearbit-class) | Third-party enrichment | HYBRID — keep owned discovery, buy only verification | agree (01) |
| Whole inbox (Gmail API) | Inbox connection | BUY; CASA verification is the real cost | ⚠ tier: 01/05 T-ME vs 11 T-10 |
| POD (Printful → Printify later) | POD fulfillment · product templates | BUY Printful first | ⚠ tier: 07 T-ME vs 11 T-10 vs 01 T-SPEC |
| Stripe Connect | Client-venture commerce | BUY at T-100; Payment Links until then | agree (07) |
| Ayrshare (social publish + per-client profiles) | Publish rail · per-client profiles | KEEP BUYING — live and correct; watch per-profile fees | agree (06); native APIs deferred T-SPEC (06) |
| Social listening vendors | Social listening ⚠ | DEFER to T-SPEC until a reputation package exists | ⚠ 06 wants Ayrshare comments API at T-10 |
| Call tracking (Twilio numbers vs CallRail) | Call tracking ⚠ | BUILD on Twilio (voice-inbound live); consent gates for recording | ⚠ class: 03/05 MISSING+EXT vs 11 PARTIAL |
| Twilio subaccounts | Per-client provider accounts | structural buy at T-100; from-number column interim | agree (12) |
| Google Business Profile | GBP connector ⚠ | BUY — first per-client OAuth through new vault scope | ⚠ class: 04 PARTIAL vs 11 DOCUMENTED-ONLY+EXT |
| Site analytics (Plausible-class) | Client analytics | DO NOT BUY — build reports on owned pixel | agree (04) |
| Client e-commerce (Shopify) | Client e-commerce | OWN RAILS; Shopify by exception only | agree (07) |
| Reel render (Sora/Runway/Shotstack) | Reel render engine ⚠ | no doc-11 verdict — 06 rules: wire Shotstack before buying | n/a (11 silent) |
| External compute (Pyodide → E2B/Modal) | External compute | no doc-11 verdict — 08 rules: Pyodide first | n/a (11 silent) |
| Voice AI receptionist (Twilio-stack) | Voice AI receptionist | no doc-11 verdict | n/a (11 silent) |
| Ad platform write APIs | Ad placement writes | no doc-11 verdict; 01 defers deliberately to T-100 | n/a (11 silent) |

## Cut C — DISCONNECTED register

Every built-but-not-wired item and the exact connection it must make.

| Disconnected item | Built thing | Must connect to | Sources |
|---|---|---|---|
| SMS rail ⚠ | send-sms fn, triggers, templates, quiet-hour spec | `approval_kind` enum migration adding 'send_sms' + standing-worker send branch | 01/03/05/09/11 |
| Canvas → publish bridge | ArtifactSheet decision contract | a publish verb → the existing Ayrshare rail | 01/06 |
| Depth engine wiring | depth red-team engine | the remaining ~8 content producers | 01/08 |
| Booking/sender-domain deploys | booking + sender-domain functions | the deploy lists (two one-line fixes) | 01/04/05/09 |
| Post-performance learning | social metrics read-back | producer/Playbook divergence input (diverge from results, not concepts) | 06 |
| Uptime/SSL watch | watch_url machinery | per-site watch creation at publish time | 04 |
| Unwired verify files | 6 verify suites incl. workerParity | CI suite registration | 01 |
| MLS → campaign seam | mls_listings rows | campaignCore typed inputs | 03 |
| Insights proximity scanner | scanner machinery | a scheduled sweep over all subjects (not upload-only trigger) | 01/08 |
| World intel on the clock | world-intel recompute | standing-order tick (not page-visit) | 01 |

Resolved during audit: Builder research persistence — 01 filed DISCONNECTED; 08 verified it fixed in code (aiClient.ts:359–376). Counted WORKING.

## Counts (honest)

Total deduped rows: **287** (from ~260 source rows across docs 01–12; merges and granularity splits roughly cancel). Cross-document conflict rows (⚠): **17** — none silently resolved.

| Class | T-ME | T-10 | T-100 | T-1K | T-SPEC | Total |
|---|---|---|---|---|---|---|
| WORKING | 95 | 1 | — | — | — | **96** |
| DISCONNECTED | 8 | 2 | — | — | — | **10** |
| PARTIAL | 19 | 27 | 8 | — | — | **54** |
| PROTOTYPE-ONLY | 2 | 2 | — | — | — | **4** |
| DOCUMENTED-ONLY | 11 | 11 | 4 | — | — | **26** |
| MISSING | 19 | 51 | 23 | 3 | 1 | **97** |
| **Total** | **154** | **94** | **35** | **3** | **1** | **287** |

Suffix totals: **+ARCH-CHANGE 22 rows** (8 convergence clusters, Cut A) · **+EXT-REQUIRED 23 rows** (20 dependencies, Cut B).

Reading: the T-ME layer is majority-WORKING (95 of 154) but ships with 8 disconnections, 19 T-ME holes outright MISSING, and 11 T-ME capabilities that exist only in docs — mail fulfillment, the geo environment, and the whole workshop-session grammar among them. T-10 inverts: 51 MISSING vs 1 WORKING — the ten-client tier is where the current build stops being a system and starts being a to-do list. Nearly everything T-100+ funnels through the eight ARCH convergences.
