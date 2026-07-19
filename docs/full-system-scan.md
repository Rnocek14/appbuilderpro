# Full System Scan — July 19, 2026

Six parallel deep audits over the entire codebase: the app builder, the intelligence core, marketing
& outbound, automation & scraping, clients/paperwork/money, and infrastructure/security. Every
capability was classified (done-verified / done-unverified / partial / stub / missing) and its
wiring checked — UI-reachable, deployed, cron-armed — not just whether files exist. This document
is the synthesis: what's been done, what's broken right now, and what still needs to be built.

**The numbers:** 104 migrations · 97 tables (97/97 with RLS) · 56 edge functions · 56 routes ·
~50 pages · 14 orchestrator actions · 6 standing-order kinds · 10 armed cron jobs (should be 11) ·
94 verify suites on disk (54 wired to CI, 40 orphaned) · 4 e2e spec files.

---

## 1. Executive verdict

The system's **safety architecture is genuinely production-grade** — arguably better engineered
than most commercial products: 97/97 tables have RLS; every email exits through exactly one
function that requires an owned, approved, hash-checked approval row and re-runs every gate
(kill switch, suppression fail-closed, CAN-SPAM, caps, warmup) server-side at send time; social
posts clone the same spine; every parse gauntlet between model output and real action is
fail-closed and fuzz-tested; secrets never reach the client; the honesty contract ([EDIT]/[YOU
FILL] holes, never-invent, approval-gated outbound) is enforced at the exits, not just in
prompts.

The **creation and outbound machinery is real, not stubbed**: verified app generation with a
compile gate and agentic repair, branch/merge with readiness gating, research-grounded business
plans that get red-teamed, real Resend sends with bounce/suppression/metrics loops, real Ayrshare
posting, real DocuSign envelopes, real Stripe billing with idempotent webhooks, a generalized
opportunity scraper that works for any niche.

The gaps are in three bands:

1. **Regressions and wiring breaks found by this scan** (§3) — about 20 concrete defects,
   two of which kill whole features (content weeks are un-creatable at the DB layer; the social
   metrics cron fell off the heartbeat). All fixable in one focused pass.
2. **The delivery pipeline is the existential risk** (§5) — nothing between "merge" and
   "production" typechecks the 56 edge functions or tests the 104 migrations, and 40 of the 94
   written safety tests never run in CI. The system that verifies everything doesn't verify
   itself end-to-end.
3. **The holy-grail structural gaps remain open** (§4) — situation-aware planning, server-side
   arc execution, custom rooms, earned autonomy beyond one loop, self-tuning engines, senses,
   deep multi-business isolation, the nightly canary.

---

## 2. What's been done — subsystem by subsystem

### 2.1 App Builder

| Capability | Status | Notes |
|---|---|---|
| Generation pipeline (blueprint → contracts → parallel pages → static QA → real tsc compile gate → agentic repair) | DONE-verified (logic layer) | Client-orchestrated (`src/lib/aiClient.ts` chunkedGenerate); zombie detection + auto-resume regenerates only missing pages |
| Chat editing (agentic tool loop: read/write/edit_file/grep/typecheck, prompt caching) | DONE | Review-before-write diffs; context guardrail blocks writes to unseen files |
| Editing safety (pendingEdit, safeedit, import redaction) | DONE-verified | `verify:safeedit`, `verify:pendingedit` |
| Feature branches + readiness-gated merge | DONE-verified | Copy-on-write overlays; candidate verified (QA + tsc + repair) in memory before Main is touched; `verify:branches` |
| WebContainer full runtime (real tsc, terminal, build for deploy, observability shim) | DONE-unverified | Inherently browser-bound; high build quality |
| Fast preview (Babel/CDN sandbox, element-select-to-chat, runtime→chat feedback) | DONE-unverified | CDN-dependent |
| Deploys: static publish (Netlify), backend deploy, DB provisioning, migrations, DB console, logs | DONE-unverified | All approval-gated through the spine; Netlify-only |
| GitHub export | DONE-unverified | Full-snapshot commit; serial, no retry |
| Autopilot (job-worker: checkpointed phases, leases, retries, budget caps) | DONE-unverified | Server-side background build queue |
| Split-screen workspace (chat/editor + always-live preview) | DONE | The "canvas + sandbox" idea is real |
| Custom Rooms (generated apps mounted inside Garvis — the wardrobe room) | **MISSING** | Honestly declared as a hole in the coverage suite |
| Custom domains | **MISSING** | Declared "NOT BUILT YET" in prompts |

### 2.2 Intelligence core

| Capability | Status | Notes |
|---|---|---|
| Orchestrator pure core (compile contract, parse gauntlet, topo ordering, WaitingError, derivePlanStatus) | DONE-verified | 3 suites incl. 400-input fuzz |
| Action catalog: 14 actions | DONE-verified | 12 real executors, 2 thin handoffs (`build_app`, `template_document`); spec/executor drift throws at load |
| Durable arcs (plans table, waiting states, idempotent resume, stall nagging) | DONE | **Browser-bound**: runs only while a tab is open; no server resume, no concurrency claim |
| 35-intent coverage contract (49 checks, catalog-coverage enforcement) | DONE-verified | Grades the contract, not live model output |
| Depth engine (research → draft → red-team critique → refine) | DONE-verified | **Wired to only 1 of ~8 producers** (business plans) |
| Memory spine (typed mind events, evidence-gated beliefs, budgeted digest) | DONE-verified | Server writers drift from the client vocabulary |
| Weekly consolidation (events → proposed lessons through the approval gate) | DONE | Cron-armed, thin-guard, citations required |
| Knowledge gate (only approved knowledge reaches reasoning) | DONE-verified | |
| Embeddings + hybrid retrieval (vector + lexical, honest fallback) | DONE | |
| Adaptive channel recs, expertise packs, verdict feedback, nextMove anticipation | DONE-verified | Tunes the operator's choices, not the engines |
| Commander / Ask / Studio chat / garvis-brain | DONE-verified | Commander and Orchestrator are parallel front doors, unaware of each other |
| Situation model (plans compiled from current reality) | **MISSING** | Compile sees catalog + sentence only |
| Unified context assembler | **MISSING** | ≥4 assemblers see different memory slices |
| Catalog expansion program / learned actions | **MISSING** | Hardcoded 14 |
| Engine self-tuning (dry hunts mutate queries, dead campaigns change strategy) | **MISSING** | Measurement exists; actuation doesn't |
| Earned autonomy (per-action-class trust dial) | **PARTIAL** | Real for exactly one class (content weeks: 3 clean approvals → auto_mode, revocable) + pre-authorized speed-to-lead |
| Free-floating research (no world required) | **MISSING** | Honestly pinned as a hole |

### 2.3 Marketing & outbound

| Capability | Status | Notes |
|---|---|---|
| send-email — THE one send path | DONE-verified | The strongest single piece in the system |
| Resend webhooks (delivery/opens/clicks/bounce→suppression), unsubscribe (RFC 8058), inbound replies | DONE-verified | |
| Segment batch sends (one approval → claimed per-recipient drain, crash-safe) | DONE-verified | ~10 recipients / 15 min |
| Followups, reactivation, inbox reply drafts | DONE-verified | All mint pending approvals; never send alone |
| Social posting via Ayrshare (9 platforms), approval-gated, per-brand keys fail-closed | DONE-verified | Single provider, pasted key; account linking on Ayrshare's dashboard |
| Social metrics sync (honest nulls, plan-gated degrade) | DONE code / **BROKEN wiring** | Cron dropped by the latest arm redefinition (§3, B2) |
| Campaign composer (one form → postcard + 4 posts + email, [EDIT] holes) | DONE-verified | Postcard is print-it-yourself by design |
| AI campaign generator (3-stage, research-grounded via orchestrator) | DONE-verified | Publish half partial: scheduled assets never drain (§3, B6) |
| Producers (research w/ real citations, business plan w/ red-team, social, video, ads copy, specs) | DONE | Fail-soft to deterministic floors, honestly labeled |
| Studios & boards (copy, email, ads, creative, brand, storyboard) + content week engine | DONE-verified | Content week **dead at the DB layer** (§3, B1) |
| Ads: draft gallery + read-only Meta/Google metrics + daily watchdog | DONE-verified | Ad *placement* deliberately missing |
| Contacts CRM, client hunt (Places → audit → demo build → pitch approval) | DONE-verified | |
| Media: image gen, video render, design render, discovery, screenshots | DONE-verified | render-design **not in any deploy list** (§3, B3) |

### 2.4 Automation, scraping & heartbeat

| Capability | Status | Notes |
|---|---|---|
| Standing worker (6 kinds + 5 drains, per-tick budgets, honest failure lines) | DONE (core verified) | No concurrency claim on orders — double-run doubles spend, not records |
| Opportunity engine — generalized any-niche scraper | DONE-verified | Query builder takes arbitrary focus/region; `kind` enum still mural-biased |
| Watch pages (unreachable ≠ "no change", baseline discipline, dedupe) | DONE-verified | |
| Heartbeat: arm function, 10 pg_cron jobs, Vault secrets, Master Switch panel | DONE | Should be **11** jobs (§3, B2); arm never validates the secret against the live env |
| safeFetch SSRF defense (private-IP tables, DNS rebinding, per-hop redirect re-validation) | DONE | No robots.txt/politeness layer anywhere |
| Automation triggers (window guard, once-only fire keys, claim-first, consent + suppression gates) | DONE-verified | |
| Speed-to-lead instant first touch (deterministic template, active-thread guard, all send gates) | DONE | The one zero-touch email path; opt-in |
| garvis-worker autonomy loop (atomic claims, leases, retries, $ budget, step caps) | DONE | |
| Nightly canary (live self-test of the whole pipeline) | **MISSING** | |
| Senses: rendered-DOM fetch / whole inbox / calendar | **MISSING / PARTIAL / MISSING** | JS pages counted as "thin" and handed to the operator; forward-in alias exists, no IMAP/Gmail pull; no calendar at all |

### 2.5 Clients, paperwork & money

| Capability | Status | Notes |
|---|---|---|
| Client engagements (scope-derived intake, world genesis handoff, Client Book) | DONE-verified | Engagement email never becomes a contact; intake never auto-checks |
| Paperwork front half (sample → extracted {{token}} template → merge with visible holes → refuse-unsendable) | DONE (core verified; suite not in CI) | Extracted field hints **discarded on save** (§3, B7) |
| DocuSign send (approval + hash + claim + honesty re-check + OAuth refresh) and tracking (HMAC webhook fail-closed + poll) | DONE-unverified | No monotonic status guard on webhook redelivery |
| DocuSign back half (upload file → auto-template → auto-populate from client record → trigger-send → file signed PDF) | **MISSING** | Every stage absent; honestly declared in catalog/docs |
| Own billing: Stripe checkout, portal, idempotent webhook, credits (atomic, RLS-pinned, honest zero) | DONE | No refund handling; portal returnUrl unvalidated |
| Client billing v1 (tiers, MRR math, close-won → subscription + invoice) | DONE-verified | Deliberately manual: no webhook reconciles client payments |
| Invoices + 4-rung chase ladder (cron-armed, approval-gated, kill-switch aware) | DONE | Chase copy hand-duplicated from money.ts; its verify not in CI |
| MLS sync (RESO OData, cursor, honest caps) + stats | DONE-unverified | Manual-button only, no cron; one feed per operator |
| Multi-business (world) isolation | **PARTIAL — leaky** | 6 read-path leaks (§3, B8): templates, envelopes, signer search, Money page, MLS, sender identity all owner-global |

### 2.6 Infrastructure, security & quality

| Area | Status | Notes |
|---|---|---|
| RLS: 97/97 tables; deny-all on server-only tables; definer functions pinned + grant-locked | DONE | Two cross-user credit grants are the exception (§3, B10) |
| Secret hygiene (no service key in src/, Vault for cron, constant-time webhook compares, nothing logged) | DONE | Worker/cron secret compares are plain `===` in ~18 functions |
| CI: typecheck + 54 verify suites + build + hermetic e2e on every push | DONE | Edge functions typechecked **nowhere**; deploy not gated on CI; migrations never tested |
| Honesty architecture (one-send-path invariant, fail-closed gauntlets, hole discipline at exits, double hash-binding) | DONE | Holds under fuzz; the only zero-human-review outbound path is opt-in auto_mode content weeks (LLM-judged, capped, revocable) |
| Cost control (checkCredits/spendCredits chokepoint, triple-capped autonomy loop, metered gateway) | DONE | 2 functions call the model outside the chokepoint; spendCredits never throws |
| Error handling (consistent envelope, layered auth, deliberate best-effort annotations) | DONE | **Zero fetch timeouts in all 56 functions** |
| Frontend (47 lazy routes, 3 error-boundary layers, clean route table) | DONE | Sourcemaps shipped in dist; ~0.8 MB uncompressed entry+vendor |

---

## 3. Broken right now — the defect ledger

Ranked. B1–B4 are feature-killing or deploy-path breaks; the rest are real but bounded.

| # | Defect | Where | Impact |
|---|---|---|---|
| B1 | `content_week` dropped from the standing-orders check constraint by a later migration (app_0089 recreated it without the kind app_0088_content_week added) | `app_0089_opportunities.sql:9-12` vs `app_0088_content_week.sql:14-17` | Content weeks are un-creatable; ~340 lines of producer/drain code dead; migration 0089 itself fails on a DB that already has content_week rows |
| B2 | `garvis-social-sync` (11th cron job, added in app_0087_social_metrics) dropped by the app_0088_consolidation_tick arm redefinition; also absent from `EXPECTED_JOBS` | `app_0088_consolidation_tick.sql` · `systemControl.ts:20-24` | Social metrics never auto-sync on a fresh arm; Master Switch shows ARMED with the job missing — invisible loss |
| B3 | `render-design` in neither deploy list | `package.json:12-13` | Brand-mode Instagram posts fail at invoke on a scripted deploy |
| B4 | `_apply_garvis_all.sql` (the documented manual DB path) ends at app_0085 — six migrations stale | `supabase/_apply_garvis_all.sql` | A DB built that way has no Client Book/orchestrator_plans tables; invoice list query hard-errors |
| B5 | `resolveWorld` fetches 2 rows to detect ambiguity, then unconditionally returns the first | `actionRegistry.ts:23-31` | Two worlds matching "%title%" → silent wrong-world execution, contradicting the file's own no-silent-guess comment |
| B6 | No worker drains `marketing_assets` with `status='scheduled'` | grep across functions: zero refs | "Schedule" on the Marketing page is a label that never fires |
| B7 | Extracted paperwork `fields` (labels + grounded hints) discarded on template save; no fields column | `esignRun.ts:33-36` · `app_0065_esign.sql` | Fill form shows bare token names; extraction value lost |
| B8 | Six world-isolation read leaks: paperwork templates, envelope history, signer search, Money page/invoice creation, MLS (world_id never set, one feed/operator), sender identity for money+esign | `esignRun.ts:20-25,52-61,95-101` · `moneyRun.ts:17-23` · `mls-sync` · `app_0023` vs `app_0085` | Client A's data visible in client B's studio; revenue merged across all ventures; everything sends under one identity |
| B9 | 40 of 94 verify suites orphaned — never wired to a script, never run by CI — including `rls.verify.ts`, `payloadHash.verify.ts`, `esign`, `money`, `standing`, `outreachBatch`, `adsWatch`, `mlsStats`, `studioSuite` | package.json vs disk | The tests guarding the RLS and tamper-evidence spine silently rot |
| B10 | `spend_credits`/`refresh_credits` granted to any authenticated user with arbitrary `p_user` and no `auth.uid()` check | `app_0017_credits.sql:73-75` | Cross-account credit drain/griefing can 402-pause the autonomy loop |
| B11 | CRON_SECRET must equal WORKER_SECRET (one Vault secret sent under two headers) — unenforced, undocumented; heartbeat stamped by only 4 of 11 jobs | `app_0088` arm body · `_shared/heartbeat.ts` callers | Mismatch → four daily jobs 401 forever, invisibly; ClockStatus stays "alive" off the pulse |
| B12 | `cluster-chat` unconditionally appends "Respond with exactly one decision JSON object" — polluting the orchestrator compile and contradicting Ask's plain-prose contract | `cluster-chat/index.ts:61` | Compile/synthesis quality noise at the shared chokepoint |
| B13 | Gauntlet dependency loss: when a step is dropped for a missing param, survivors' `after` refs to it are silently filtered — dependents run without their prerequisite | `orchestrator.ts:180` | A plan can execute out of its intended order |
| B14 | `/.env` (with real anon key from provisioning) is a project file and IS included in GitHub export (only `/.fableforge/` filtered) | `ProjectWorkspace.tsx:1054` | Leak vector; pattern will bite when a service key ever lands there |
| B15 | Zero fetch timeouts in all 56 edge functions | grep: no AbortSignal/Controller | One hung provider call stalls a whole cron tick |
| B16 | Migration numbering collisions (two app_0081/0082/0086/0087/0088 pairs) | `supabase/migrations/` | Alphabetical-order hazards — B1 is exactly this class of bug |
| B17 | Mind-event vocabulary drift: server writers insert types outside the client contract; no DB check constraint | `send-email:279` · `resend-inbound:186` vs `mind.ts:21-32` | The "typed spine" invariant only governs client writes |
| B18 | Minor ledger: cron drafters (followups/reactivate/inbox-draft) mint approvals without payload_hash (null-grandfathered); reactivate's replied-exclusion fetched then discarded; DocuSign webhook can regress status on out-of-order redelivery; merge commit not write-atomic; customer-portal returnUrl unvalidated; stale "9 jobs" copy in MasterSwitch/RUNBOOK; orphaned deployed surface (generate-app retired path, shot-worker no caller, recordDeployment stub); sourcemaps in dist | various | Real, bounded |

---

## 4. What still needs to be built — the structural roadmap

In dependency order (each unlocks the ones after):

1. **Server-side arc execution.** Arcs currently run only in an open browser tab, with no
   concurrency claim. Move `runArc` (or a mirror) into a worker tick: claimed, resumable,
   auto-resuming when the blocking approval lands. This is the single highest-leverage build —
   it turns "a plan you watch" into "a project that runs."
2. **The Situation model.** One assembled per-world state object (live/working/owed/changed —
   the pieces already exist in world_intelligence, liveness, momentum, engagements, plans,
   hunts) consulted by every compile, Commander turn, and the monitor. Today the compiler sees
   only the catalog and the sentence.
3. **One context assembler.** Commander, studio chat, garvis-brain, and producers each assemble
   different memory slices. One assembler, one situation, every surface.
4. **Delivery-pipeline hardening** (can run parallel to 1–3): `deno check` all 56 functions in
   CI; wire the 40 orphaned verify suites; gate deploy on CI; test migrations against a shadow
   DB; renumber colliding migrations; drift detection between armed jobs and EXPECTED_JOBS.
5. **Catalog expansion program.** 14 actions cover a fraction of what the UI can do. Systematic
   sweep: every clickable capability ships with an action + coverage case. (The two thin
   actions — build_app, template_document — graduate into real executors as part of this.)
6. **DocuSign back half.** File upload + text extraction → template with persisted fields →
   token mapping from client records (engagement, subscription, MLS listing) → trigger-staged
   envelopes (still approval-gated) → signed-PDF retrieval filed to the world.
7. **Deep world isolation.** Fix the six read leaks (B8), per-world sender identity for
   money/esign, per-world provider connections (MLS, DocuSign), world-scoped invoice numbering.
8. **Custom Rooms.** Mount deployed/preview apps as in-system world areas (the wardrobe room);
   then genesis can emit room-backed areas. Creation that extends the creator.
9. **Earned autonomy, generalized.** The content-week trust loop (clean-streak → auto_mode →
   instant revoke) becomes a per-action-class trust ledger with operator-set thresholds.
10. **Engine self-tuning.** Dry hunts mutate their own queries; zero-engagement campaigns
    propose strategy changes; repeatedly-unfilled holes trigger intake asks — all through the
    existing knowledge approval gate.
11. **Senses.** Rendered-DOM fetch for JS-heavy pages (the hunt already counts them as "thin");
    whole-inbox ingestion (IMAP/Gmail OAuth) beyond the forward-in alias; calendar.
12. **Nightly canary.** A cron that compiles a sandbox plan, runs a hunt against a fixture page,
    and round-trips a test envelope — proving live wiring, not just logic.
13. **Depth engine everywhere.** Critique/refine currently reaches 1 of ~8 producers; wire it to
    campaigns, research briefs, specs.
14. **Deliberately missing (decide, don't drift):** ad placement APIs, print-vendor mail,
    custom domains, client-payment webhook reconciliation, free-floating research, e2e over
    ProjectWorkspace/WorkWeb.

---

## 5. Master risk register (likelihood × blast radius, unattended single operator)

1. **Nothing between merge and prod checks the functions or migrations** — a type-broken worker
   deploys silently and the heartbeat stops until noticed (deploy ungated on CI, no deno check,
   no shadow DB).
2. **40 orphaned verify suites** — the written safety net for RLS/tamper-evidence/standing
   orders doesn't actually run.
3. **B1/B2 regressions** prove the migration-collision class is live, not theoretical.
4. **auto_mode content weeks** — opt-in, but an LLM-judged week can email up to 2,000 contacts;
   sender reputation is the operator's scarcest asset.
5. **Cross-user credit grants** (B10) — griefing vector that pauses the autonomy loop.
6. **No fetch timeouts** (B15) — hung provider = stalled tick, diagnosed only as "heartbeat
   stopped."
7. **Browser-resident execution** for builds and arcs — closed tab = stalled work (auto-resume
   mitigates builds; nothing mitigates arcs).
8. **Secret-equality coupling + partial heartbeat stamping** (B11) — four daily jobs can die
   invisibly.
9. **World-isolation leaks** (B8) — wrong-client exposure the moment a second client is onboarded.
10. **Untested AI decision/tool-execution engine** (brain, executeTool, all 51 *Run.ts) and zero
    e2e on the two biggest pages.

---

## 6. Bottom line

**Done:** the hard, dangerous parts — the approval spine, the honesty gates, the send/post/sign
rails, verified generation and merging, the memory loops, the clock. These are built and most are
verified.

**Broken:** ~20 concrete defects, four of which (content weeks, social-sync cron, render-design
deploy, stale manual DB script) kill features outright — one focused fix pass closes them.

**Missing:** the grail layer — a system that runs arcs server-side from a situation model,
extends itself with rooms and new actions, earns autonomy per action class, tunes its own
engines, perceives more than static HTML, and proves itself alive every night — plus the
delivery pipeline that would let all of that ship safely.
