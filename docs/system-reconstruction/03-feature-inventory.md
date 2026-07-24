# 03 — Feature Inventory: Everything, With Its Honest Status

*Part of the system-reconstruction series. Every feature in the system, classified. State as of
commit `e7fdc54` (July 24, 2026).*

**Status taxonomy** (as requested by the reconstruction brief):
- **OPERATIONAL** — closes its real loop end to end (may still require secrets/heartbeat: 🔌)
- **FUNCTIONAL-ISOLATED** — works, but not connected to the thing that would make it matter
- **PARTIAL** — one edge of the loop missing
- **BACKEND-ONLY** — server/DB machinery with no (or minimal) UI
- **UI-ONLY** — surface exists, machinery doesn't
- **SCAFFOLDED** — schema/stubs exist, engine never built
- **EXPERIMENTAL** — spike/dev-only surface
- **PLANNED** — exists only in planning documents
- **LEGACY** — superseded but deliberately kept ("merge and relocate, never amputate")
- **UNVERIFIED** — code claims to work; no test or live proof found

🔌 = dark until the heartbeat is armed and/or its secret is set (the master gate — see
06-workflows.md §0).

*Evidence sources: direct code reads; the author's own audits (full-system-scan July 19–20 +
addendum, garvis-master-audit, where-we-stand, os-blueprint); agent surveys in docs 02/04/05/07/
08/13. Grades in [brackets] are the author's own pillar grades from where-we-stand.md.*

---

## 1. FableForge — the app builder

| Feature | Status | Evidence |
|---|---|---|
| 11-stage generation pipeline (client-orchestrated: contracts → parallel pages → static QA → tsc compile gate → agentic repair, zombie detect + auto-resume) | OPERATIONAL [A−] | `aiClient.ts` chunkedGenerate; verified logic layer per scan §2.1 |
| Server `generate-app` single-stream pipeline | LEGACY | Scan: "rotting fork… retired path"; still deployed |
| Conversational edit (agentic tool loop, review-before-write diffs, safeedit/pendingEdit) | OPERATIONAL | `verify:safeedit`, `verify:pendingedit`; scan DONE-verified |
| Feature branches + readiness-gated merge (copy-on-write overlays) | OPERATIONAL | `verify:branches`; candidate verified in memory before Main touched |
| Monaco workspace, file tree, per-file version history + diff/restore | OPERATIONAL | schema.sql trigger snapshots; README |
| Sandpack fast preview + WebContainer full runtime (real tsc, terminal, build) | OPERATIONAL (browser-bound) | scan DONE-unverified (CDN/browser dependence) |
| Autopilot (server `job-worker`: checkpointed phases, leases, retries, budget caps) | OPERATIONAL 🔌 | scan §2.1; schema_v2_autopilot |
| Project Brain / plan mode / research / roadmap / ideation | PARTIAL | several are DIRECT-mode-only ("edge mirror coming", `aiClient.ts`) — die when tab closes |
| Deploy to Netlify (`deploy-site`, file-digest deploy) | OPERATIONAL 🔌 | real executor incl. from approvals (`execution.ts:174–307` + deploy_bundles) |
| Backend provisioning (`provision-supabase` managed cloud, nano instances, plan caps) | OPERATIONAL 🔌 | integrations survey #5 |
| Backend deploy (`deploy-backend` edge fns + cron), `apply-migration` (authz-pinned), `db-console` (CC1), `project-logs` | OPERATIONAL 🔌 | legendary-roadmap 8b marked DONE; cloud-console CC2–CC9 PLANNED |
| GitHub export (Git Data API full-snapshot) | OPERATIONAL 🔌 | serial, no retry (scan) |
| Custom domains for builder apps | PLANNED | "NOT BUILT YET" in prompts (scan §2.1); prospect-site domains DO exist |
| Vercel as deploy target | SCAFFOLDED | name reserved in types/UI only (integrations survey) |
| Stripe SaaS billing (Free/Pro, checkout, portal, idempotent webhook) | OPERATIONAL 🔌 | two-generation tables: `stripe_subscriptions` canonical; `subscriptions` LEGACY (still read by Billing.tsx) |
| Credits + `ai-gateway` (meters generated apps' AI at 1.25× margin, per-app keys) | OPERATIONAL 🔌 | app_0017 + app_0094 caller-pin fix |
| Admin panel (users, usage/cost charts, failed generations, logs, model settings) | OPERATIONAL | src/pages/admin |
| Deployment records UI (`deployments` table) | LEGACY | superseded by deploy_bundles + hosting columns (DB survey #10) |
| Cross-file search panel | OPERATIONAL | legendary-roadmap 9b (client-side grep) |
| Rooms: built apps mounted back inside Garvis worlds (iframes) | OPERATIONAL | RoomsPanel + app_0099 — "Custom Rooms step one" real |

## 2. Garvis core — brain, spine, clock

| Feature | Status | Evidence |
|---|---|---|
| Approval spine (`approvals` one queue + `execution_runs` immutable ledger, payload SHA-256, CAS claims) | OPERATIONAL | the system's central invariant; "structurally impossible" to send outside it (integrations #2) |
| One Queue page (merged from 3 rooms; badges from real rows; undo for reversibles) | OPERATIONAL | frontend survey #9; d0cca2f |
| Earned autonomy (trust dial per action class; content weeks: 3 clean approvals → auto_mode, revocable) | PARTIAL | real for content weeks + pre-authorized speed-to-lead; generalized ledger = app_0097 + Queue panel; scan called it partial |
| Heartbeat/clock (11 pg_cron jobs via `garvis_arm_heartbeat()`, Vault secrets, dual-header auth) | OPERATIONAL 🔌 but **never self-arms** | os-blueprint §1; Master Switch + Health board exist; CI self-arm defaults off; doc drift: RUNBOOK says 9, checklist 12, SQL truth 11 |
| Standing orders (6 kinds + 5 drains, per-tick budgets) | OPERATIONAL 🔌 | scan §2.4; no concurrency claim on orders (double-run risk noted) |
| Commander (one call → one typed decision; command_messages transcript; mind_events routing log) | OPERATIONAL | scan DONE-verified; page-local, not global (Line vision PLANNED) |
| Orchestrator (14 actions, parse gauntlet, topo ordering, 35-intent/49-check coverage contract) | OPERATIONAL | 3 verify suites incl. 400-input fuzz |
| Durable arcs + ARC WAKE LOOP (structured blockers, atomic claims, wake sweep, self-resume across approvals) | OPERATIONAL | app_0095, scan addendum; was "browser-bound" pre-fix |
| Situation model (`compileSituation()` budgeted digest → orchestrator compile + Commander) | OPERATIONAL (as LLM input) / UI-ONLY as "the Field" | built post-addendum; rendering worlds-as-orbs home = PLANNED (os-blueprint Phase 1) |
| Depth engine (research → draft → red-team → refine) | FUNCTIONAL-ISOLATED | wired to 1 of ~8 producers (business plans only) |
| Nightly canary (live self-test incl. send-gate refusal test) | OPERATIONAL 🔌 | app_0096 + garvis-canary |
| Scorecard (honest machine metrics cron) | OPERATIONAL 🔌 | garvis-scorecard |
| Health board (/garvis/health: probes every fn, secret presence, cron schedule, heartbeat stamps) | OPERATIONAL | master-audit Tier-1 #4; PR #69 |
| Master Switch (arm/disarm; armed-vs-EXPECTED_JOBS drift visible) | OPERATIONAL | app_0087/0092 |
| Five intention front doors (Command, Orchestrator/plans, Ask, studio chat, cluster-chat) | OPERATIONAL but FRAGMENTED | author's own diagnosis; Line unification PLANNED |
| Intention Router (`utterance → {world, posture, area, action}`) | PLANNED | garvis-first-principles §5; commander is "~⅓ of the target" |
| Postures (Think/Create/Execute/Observe) as UI dressing | PLANNED | "0% built today" (os-blueprint §3.4) |

## 3. Knowledge, memory, exploration

| Feature | Status | Evidence |
|---|---|---|
| Knowledge universe (worlds → clusters → artifacts → edges) | OPERATIONAL | app_0013/0018; the de-facto product noun |
| Explorer / rabbit holes (explorer-turn, credit-gated; ClusterSpike + GalaxyView + IdeaRoom + SceneStage ~2,400 lines) | OPERATIONAL, filed as EXPERIMENTAL | admin-only "Labs" nav yet embedded in Command home; scan grade B "does nothing unattended" |
| Rabbit hole → build brief bridge (`compileBuildBrief` → NewProject) | OPERATIONAL | frontend survey #8 |
| Universe 2D/3D (WebGL inhabited sky; momentum/mass/evidence per orb) | OPERATIONAL | Universe3D route; `Universe.tsx` is the `?mode=flat` fallback (NOT dead as os-blueprint believed — frontend survey) |
| World intelligence (per-world intel/reflection/momentum) | PARTIAL | recomputes on visit, not on the clock (seam #5) |
| Mind (immutable mind_events spine, 20+ writers; beliefs; decisions; identity) | PARTIAL | capture OPERATIONAL; beliefs hand-curated (no distiller); decision outcomes manual; vocabulary drift server-vs-client (B17) |
| Weekly consolidation (events → proposed lessons → approval gate) | OPERATIONAL 🔌 | garvis-consolidate cron |
| Knowledge gate (only approved lessons reach reasoning) | OPERATIONAL | verify:knowledge |
| Embeddings (one polymorphic 1536-dim space, HNSW, owner-scoped kNN RPC) | PARTIAL | writes cover 2 of 6 declared subject types (seam #3) |
| Hybrid retrieval (vector + lexical, honest fallback) via garvis-brain / ask | OPERATIONAL 🔌 | scan §2.2 |
| Documents ingest (pgvector; PDF ingest was "coming") | PARTIAL | master-audit: no PDF ingest, no export; post-audit state unverified |
| Insights ("Garvis noticed a connection") | FUNCTIONAL-ISOLATED | only fires on document upload; no proximity scanner (seam #4) |
| Lab Bench (visual simulations, finite-difference sensitivity, simulation artifacts) | OPERATIONAL (niche) | LabBench/SimVisual/MechanismCanvas + verify:lab |
| Calendar sense | SCAFFOLDED→PARTIAL | app_0098 schema + ICS reads (integrations); no full calendar integration |
| Seed-einstein demo world script | EXPERIMENTAL | scripts/seed-einstein.ts |

## 4. Acquisition — the client-hunt funnel [A−]

| Feature | Status | Evidence |
|---|---|---|
| Daily client hunt (Places discovery → audit → demo build → pitch approval; city roll + national sweep + self-caps) | OPERATIONAL 🔌 | clientHuntRun/Schedule, bigCities; scan DONE-verified |
| Web scrape (safeFetch SSRF-hardened; Chrome fingerprint for WAFs; hidden-email decode; real-photo finding) | OPERATIONAL | PR #75; no proxies, no robots.txt layer (deliberate) |
| Tech fingerprint + automation-opportunity detection (registry + bounded matcher) | OPERATIONAL | techFingerprint.verify, automation/detect.verify |
| Preview/demo site engine (strategist → art director → generator → simulated-owner → auditor; contrast gate; de-generic fallback) | OPERATIONAL | src/lib/preview; PR #71 |
| Bespoke sites (vision-grounded, motion via scroll scenes, render in full) | OPERATIONAL | PR #61/#73 |
| Publish preview + photo re-hosting (durable sold sites) + site-events pixel | OPERATIONAL 🔌 | PR #70; app_0103 |
| Prospect pipeline board (stages, detail drawer, live post-send signals, Replied filter, read-reply in place) | OPERATIONAL | PRs #83, #86, #88 |
| One-click Build & send per lead; review-before-send compare | OPERATIONAL | PRs #72, #85 |
| Placeholder send-gate (no templated text reaches a prospect) | OPERATIONAL | PR #79 (P1) |
| Speed-to-lead instant first touch (deterministic template, all gates) | OPERATIONAL 🔌 | the one zero-touch email path; opt-in |
| Claim flow (prospect claims demo → lead + owner webhook notification) | OPERATIONAL 🔌 | claim-submit |
| Opportunity engine (generalized any-niche scraper: search → fetch → honest extraction → deduped feed) | OPERATIONAL 🔌 | scan DONE-verified; `kind` enum "still mural-biased" |
| Portfolio synergies (`garvis_opportunities` — connections between YOUR ventures) | BACKEND-ONLY / PARTIAL | distinct table from external `opportunities`; thin surface |
| Demo page conversion work ("a yes on automation, honest proof") | OPERATIONAL | PR #76 |

## 5. Outreach & communications [A]

| Feature | Status | Evidence |
|---|---|---|
| send-email — THE one send path (approval hash, kill switch, suppression fail-closed, CAN-SPAM, caps, warmup) | OPERATIONAL 🔌 | "the strongest single piece in the system" (scan) |
| Resend webhooks (delivery/opens/clicks/bounce→suppression), RFC-8058 unsubscribe, inbound replies | OPERATIONAL 🔌 | Svix-verified |
| Per-brand sender identities + verified sending domains | OPERATIONAL 🔌 | app_0085, app_0111, PR #84 |
| Segment batch sends (one approval → claimed per-recipient drain, crash-safe) | OPERATIONAL 🔌 | ~10 recipients/15 min |
| Follow-ups, opened-3×-silent, reactivation crons; inbox reply drafting + draft_verdicts feedback | OPERATIONAL 🔌 | all mint approvals, never send alone |
| OpsInbox (replies + leads in one stream; reply-from-app via the same spine) | OPERATIONAL | master-audit Tier-1 ✅ |
| Whole-inbox awareness (IMAP/Gmail pull) | PLANNED | only replies-to-own-sends + forward-in alias exist ("senses" gap) |
| SMS channel (Twilio, TCPA fail-closed, STOP handling; A2P 10DLC documented) | PARTIAL 🔌 — **latent DB bug** | app_0106; PR #63; CONFIRMED: `approval_kind` enum never gains `'send_sms'` (app_0022 + later alters), but `send-sms/index.ts:36` requires it — every SMS approval insert fails at the DB (see 10-open-questions.md #10) |
| Missed-call text-back (signature-validated voice webhook → auto-text) | OPERATIONAL 🔌 | app_0107; PR #66 |
| Voice/AI receptionist beyond missed-call (calls answered by AI) | PLANNED | "AI-receptionist pillar" language; only booking+missed-call built |
| Contacts CRM (stages, notes, delete, activity timeline) | OPERATIONAL | master-audit Tier-1 ✅; "six unreconciled people tables" debt remains |
| Notification webhooks to the owner (Discord/Slack/generic; leads + positive replies) | OPERATIONAL 🔌 | master-audit fix #5 |
| Reminders (user todos; due ones outrank Garvis's inference) | OPERATIONAL | app_0039 |

## 6. Marketing production [C→B]

| Feature | Status | Evidence |
|---|---|---|
| Cluster Studio shell (chat/tools/artifacts/versions over a chartered cluster) | OPERATIONAL | the "studio is data" pattern |
| Copy/Email/Ads studios; creative/brand/email boards (concurrent gen, groups/archive, zoom/multi-select) | OPERATIONAL | commits 66c55f5/689310b; board-copy fn |
| Campaign composer (postcard + 4 posts + email, [EDIT] holes) | OPERATIONAL | postcard = print-it-yourself by design |
| AI campaign generator (3-stage, research-grounded, verifier) | OPERATIONAL | scan DONE-verified |
| Publish/Schedule marketing assets → REAL social rail (approval → Ayrshare; standing-worker drain) | OPERATIONAL 🔌 | FIXED post-scan (`useMarketing.ts:92–127`); email/manual = deliberate operator handoff |
| Content weeks (producer → drain → auto_mode after clean streak) | OPERATIONAL 🔌 | restored by app_0092 after B1 killed it |
| Social posting (Ayrshare, 9 platforms, per-brand keys fail-closed) + metrics sync cron | OPERATIONAL 🔌 | B2 cron restored |
| Canvas "Change it with Garvis" (ArtifactSheet) → publish | FUNCTIONAL-ISOLATED (dead-end) | decision contract lacks any publish verb; no bridge to queueSocialPost (re-verified by grep) |
| Ads: OAuth connect, read-only Meta/Google sync, daily anomaly watchdog, draft gallery | OPERATIONAL 🔌 (read-only BY DESIGN) | ad placement writes deliberately absent |
| Direct mail (postcards) via print vendor | PLANNED | print-it-yourself is the shipped form |

## 7. Media [B−/C]

| Feature | Status | Evidence |
|---|---|---|
| Image generation (gpt-image-1 path), design renders, screenshots (ScreenshotOne), discover-media | OPERATIONAL 🔌 | render-design deploy-list gap (B3) fixed |
| Storyboard video (beats → garvis-short-script → Shotstack render) | OPERATIONAL-manual 🔌 | grade C: real but hands-on |
| Veo Scene Studio (Gemini/Veo 3.1 → curated photoreal scroll-clip library → bespoke-site motion) | OPERATIONAL 🔌 | PR #62; app_0105; consumption by sites verified in PR #61/#73 chain |
| Reels engine (reel_jobs/reel_clips: Sora/Runway/Luma per-scene pipeline, faceless account roster) | SCAFFOLDED (dead schema) | zero code consumers (DB survey #8) |

## 8. Clients, money, paperwork

| Feature | Status | Evidence |
|---|---|---|
| Client engagements (scope-derived intake, world genesis handoff, Client Book) | OPERATIONAL | app_0090; engagement-email→contact gap noted in scan |
| Client tiers/MRR, close-won → subscription + invoice | OPERATIONAL | verify:clienttiers/clientsale; deliberately manual reconciliation |
| Pay → auto-publish (client pays Stripe link → stashed demo HTML publishes to Netlify server-side, churn no-resurrection guard) | OPERATIONAL 🔌 | integrations #3 — notable zero-browser loop |
| Invoices + 4-rung chase ladder cron | OPERATIONAL 🔌 | invoice-chase; approval-gated |
| Client automations (per-client config, ROI stats at point of sale, attribution to paying clients) | OPERATIONAL 🔌 | app_0108; PRs #64/#67 |
| Trigger engine (window guard, once-only fire keys, claim-first, consent+suppression gates, channel-aware email/SMS) | OPERATIONAL 🔌 | verify:triggers; docs/automation-triggers-seed.sql harness |
| Booking (public page → appointments w/ DB-level double-book exclusion → confirmations + day-before reminders) | OPERATIONAL 🔌 | app_0109; PRs #77/#78 |
| Client connections checklist (hook up each client's accounts) | OPERATIONAL | app_0110; PR #82; some connectors `built:false` (Google Business, calendar sync, per-client e-sign) — SCAFFOLDED |
| Paperwork front half (sample → {{token}} template with persisted fields → merge with visible holes → refuse-unsendable) | OPERATIONAL | app_0093 fixed field persistence |
| DocuSign send + webhook tracking (OAuth refresh, HMAC fail-closed, sandbox default) | OPERATIONAL 🔌 | scan DONE-unverified → hardened |
| DocuSign back half (upload → auto-template → auto-populate from client records → trigger-send → signed-PDF filing) | PARTIAL | filing exists (app_0099); the auto-populate/trigger-send middle missing |
| MLS sync (RESO OData, probe-before-save, incremental, sealed per-user creds) + stats | OPERATIONAL-manual 🔌 | manual button, no cron; one feed per operator |
| Multi-business isolation (world-scoped reads, per-world sender identity) | PARTIAL | six B8 leaks closed (app_0093); author's own "~70% true" estimate for "two companies, cleanly" |

## 9. Genesis & ventures

| Feature | Status | Evidence |
|---|---|---|
| Company genesis (DNA → research-grounded designed world → approval → chartered areas + seed artifacts + intake asks) | OPERATIONAL | app_0028; verify:genesis; depth-engine-backed |
| Work Webs (per-world work graph) | OPERATIONAL | app_0024; WorkWeb.tsx 1,687 lines |
| Missions/tasks | OPERATIONAL but SPLIT | two writers with incompatible lifecycles (useMissions vs workwebRun); world_id not mandatory |
| Charters (cluster → production area upgrade) + workshops (data-driven capability descriptions) | OPERATIONAL | workshops.ts; "a studio is data, not code" |
| Vertical-as-Data (`vertical_specs` table; new venture kind = a row) | PLANNED | os-blueprint §4; today ≥4 code registries must be edited |
| Gardener (knowledge tending), Farm (design pre-generation), Goals, Currents, NextMove anticipation | OPERATIONAL (each niche) | verify suites exist for each; see 05-ai-system.md |
| `apps` table (original portfolio noun) | LEGACY | unreconciled with knowledge_worlds — the "core ambiguity" (os-blueprint §5) |

## 10. Platform, quality, ops

| Feature | Status | Evidence |
|---|---|---|
| RLS everywhere (all tables; deny-all server-only; definer pins; token tables zero-policy) | OPERATIONAL | DB survey; Wave A P0 fix history (preview_sites `using(true)` → RPC, re-sanitized twice) |
| CI (tsc + 116 verify suites + build + deno check all 67 fns + 4-layer Playwright; deploys gated) | OPERATIONAL | post-addendum; deploy-supabase.yml one-button bring-up with migration replay + probes |
| verify:* harness (~116 suites, pure cores) | OPERATIONAL | the house testing style; AI decision layer (brain/executeTool/51 *Run.ts) still uncovered |
| Migration-collision guard (verify:migrations) | OPERATIONAL | response to the 6 duplicate-number regressions |
| e2e (backendless smoke, 27-route sweep, mocked-session mounts, skip-unless-seeded live flows) | PARTIAL | thin over ProjectWorkspace/WorkWeb (the two giants) |
| Health/GoLive/Setup surfacing of 21+ secrets | OPERATIONAL | PR #69; .env.example documents them |
| Sidebar simplification (4-item Core loop + "More"; icon rail shows all) | OPERATIONAL | PR #74 (0cfc8fd) |
| Legacy rooms kept routable, ⌘K-aliased "(legacy)" (old dashboard, control, missions, marketing, opportunities, mind, brain) | LEGACY (deliberate) | frontend survey #4; "merge and relocate, never amputate" |
| Dev preview surface (/dev/*, 10 pages, mock data, screenshot-driven building) | EXPERIMENTAL | 9 DEV-gated; **`/dev/flagship-artist` ungated in production** (App.tsx:167) — flagged risk |
| Data export + account deletion (compliance) | PLANNED | master-audit Tier-3 |
| Mobile 3D auto-fallback | PLANNED | master-audit Tier-3 |

## 11. Planned-only concepts (no code at all — see 09-future-vision.md)

The Field home · global Line bar · Intention Router · posture dressing · VerticalSpec rows ·
engine self-tuning (dry hunts mutate queries) · machine belief-distillation · insights proximity
scanner · whole-inbox senses · rendered-DOM fetch (JS portals) · print-vendor mail · ad placement
writes · client-payment webhook reconciliation · free-floating research (no-world) · Cloud Console
CC2–CC9 · shared free-tier hybrid DB (docs/hybrid-db.md) · Netlify OAuth · voice conversations
with Garvis · the cinematic Field→Mission camera morph (mocked in docs/mockups/).

---

## 12. The one-table summary of the author's own pillar grades (where-we-stand.md, July 2026)

App building A− · Ship A− · Email outreach A · Prospecting A− · Design B+ · Scraping B+ ·
Research B · Explore B · Social B− · Ads B− · Lists/CRM C+ · Video C/D · Marketing brain C ·
Gets-better-with-time C+. *(Several C-grade items were upgraded by the July 20–23 fix campaign —
see 08-project-history.md era 7–8.)*

---

*Anything listed OPERATIONAL 🔌 is simultaneously and honestly describable as "does nothing out
of the box": the heartbeat must be armed and the relevant secret set. That duality — built vs
on — is the single most important thing to understand about this system's status.*
