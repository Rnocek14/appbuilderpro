# 06 — Workflows: Every Major Loop, Traced End to End

*Part of the system-reconstruction series. Each workflow is traced UI → frontend → hooks →
backend → database → AI → artifacts → outputs, with the exact place it breaks (if it breaks)
marked **⛔ BREAK** or **⚠ WEAK**. State is as of commit `e7fdc54` (July 2026). Sources: direct
code reading, the author's own trace documents (`docs/full-system-scan.md` July 19–20 + addendum,
`docs/garvis-master-audit.md`, `docs/os-blueprint.md`), and the post-audit commit record
(PRs #62–#88). Where a break was documented in an audit and a later commit plausibly fixed it,
both facts are stated.*

**Reading key:** ✅ closes its loop end-to-end · ⚠ works with a manual/weak link · ⛔ breaks at a
named point · 🔌 works only when armed/keyed (the heartbeat + secrets gate — see §0).

---

## 0. The master gate every unattended workflow sits behind

Nearly every "runs while you sleep" workflow below depends on two switches:

1. **The heartbeat must be armed.** `garvis_arm_heartbeat()` (SQL) schedules ~11–12 pg_cron jobs
   that invoke worker edge functions (`garvis-pulse`, `garvis-worker`, `standing-worker`,
   `outreach-followups`, `outreach-reactivate`, `inbox-draft`, `invoice-chase`, `ads-watch`,
   `garvis-consolidate`, `garvis-scorecard`, `garvis-canary`, `social-sync`…). The author's
   repeated finding: **nothing arms it automatically** — "the whole machine ships switched OFF"
   (`os-blueprint.md` §1). A Master Switch panel + Health board exist to arm/inspect it
   (app_0087_system_control, app_0092_heartbeat_repair, `/garvis/health`, Go-Live checklist PR
   #69), but arming remains an operator action. A CI self-arm step exists and defaults off.
2. **Secrets must exist.** ~21 edge secrets (Resend, Serper, Places, Screenshot API, Ayrshare,
   Shotstack, Gemini/Veo, Twilio, Stripe, DocuSign, ads, embeddings, WORKER_SECRET/CRON_SECRET…)
   decide which rails are live. Every function fails closed without its key. The dual-secret trap
   (Vault secret must equal each function's `WORKER_SECRET` env, B11) was patched by
   app_0092's dual-header repair per the scan addendum.

Everything below assumes the gate is open; 🔌 marks the workflows that die silently when it isn't.

---

## 1. FableForge: describe an app → live preview ✅ (browser-bound ⚠)

```
NewProject page (prompt, template, optionally seeded from a rabbit hole)
  → startGeneration() → generate-app edge fn (ownership + monthly-limit check,
      inserts project_generations row, returns immediately)
  → pipeline runs (11 stages: interpret → blueprint → schema → file tree → frontend
      → backend → auth → styling → validate → fix → summarize), updating
      project_generations.stages
  → Workspace subscribes via Supabase Realtime → renders forge progress live
  → files upserted into project_files → DB trigger snapshots every change into
      project_file_versions (powers diff viewer + restore)
  → usage/cost/chat summary/audit recorded → Sandpack (fast) / WebContainer (full) preview
```

- The **high-quality path is client-orchestrated** (`aiClient.ts` `chunkedGenerate`:
  shell-contracts-then-parallel-pages, static QA, real `tsc` compile gate in WebContainer,
  agentic repair, zombie-detection + auto-resume regenerates missing pages).
- ⚠ **Refresh/tab-close risk**: orchestration lives in the tab; `job-worker` (checkpointed
  phases, leases, retries, budget caps) exists as the server-side background path for autopilot
  builds.
- ⚠ Audit-era finding: the server `generate-app` single-stream pipeline was called "a rotting
  fork" of the client pipeline; the scan lists a "generate-app retired path" as orphaned surface.
- ✅ Verification honesty: "verified" badge degrades honestly when WebContainer compile isn't
  available (post best-software-plan fixes).

## 2. FableForge: conversational edit ✅

```
Workspace chat → chat-edit edge fn (or DIRECT mode) → agentic tool loop
  (read / write / edit_file str-replace / grep / typecheck, prompt-cached)
  → pendingEdit: review-before-write diff cards → operator applies
  → safeedit verification, import redaction → project_files (+ version snapshot)
  → explanation + changed-file chips posted to chat
```
Guardrail: context guardrail blocks writes to files the model hasn't seen. Verified by
`verify:safeedit`, `verify:pendingedit`.

## 3. FableForge: branches → readiness-gated merge ✅

```
Branch create (copy-on-write overlay of project_files)
  → edits land on branch → merge requested
  → candidate assembled in memory → QA + tsc + agentic repair on the CANDIDATE
  → only a green candidate touches Main ("nothing lands broken")
```
⚠ Scan note: merge commit "not write-atomic" (B18-class, bounded).

## 4. Ship: publish, backend, domains ✅/⚠

```
Publish: WebContainer `npm run build` → dist file tree read from container FS
  → deploy-site edge fn (Netlify file-digest deploy, auth+owner) → deployments row → live URL
Backend: provision-supabase (create real Supabase project) → apply-migration (authz-pinned)
  → deploy-backend (edge fns + cron for the generated app) → db-console / project-logs
Export: github-export (blobs → tree → commit → ref)
Domains: connect-domain edge fn (custom domains for published sites; preview hosting app_0103)
```
- ⚠ Historical: master-audit found "approved deploy is recorded, not performed" (no deploy
  executor in `approveAndExecute`); the fix was Tier-2 roadmap; app_0100_execution_truth +
  "publish + render reliability" hardening (PR #80) came after — **verify executor wiring in
  05-ai-system.md**.
- Published prospect sites get scraped photos **re-hosted onto owned storage** so sold sites are
  durable (PR #70).

## 5. The revenue engine: scrape → demo → pitch → reply → close 🔌✅

The core loop of the agency vertical — the one the UI now leads with ("Core loop up front", PR
#74). Full chain:

```
(a) DISCOVER   clientHuntSchedule (rolls city lists incl. bigCities national sweep, caps itself)
               → standing order on the heartbeat → discover-run (Google Places)
               → discovered_businesses pool
(b) SCRAPE     fetch-url (SSRF-hardened safeFetch; PR #75 added bot-blocked-site reading,
               hidden-email decoding, real-photo finding) → scrapeProfile → audit
               (tech fingerprint, automation-opportunity signals — techFingerprint.ts,
               automation/detect.ts)
(c) BUILD      preview engine intelligence chain: strategist → art director → generator
               → simulated-owner critique → (refine) → auditor; Claude-designed by default
               + contrast gate + de-generic fallback (PR #71); bespoke vision-grounded
               sites render in full (PR #73)
(d) PUBLISH    publish-preview → hosted demo site (photos re-hosted, PR #70) + site-events
               tracking pixel → prospect board
(e) PITCH      one-click Build & send per lead (PR #72) → placeholder send-gate blocks
               templated text from reaching a real prospect (PR #79) → review-before-send:
               operator reads the pitch + compare view (PR #85/24e774e) → approval
               → send-email (THE one send path: approval hash re-check, kill switch,
               suppression fail-closed, CAN-SPAM, caps, warmup) → Resend
(f) SIGNALS    resend-webhook (delivery/opens/clicks/bounce→suppression) + site-events
               (demo visits) → post-send signals surfaced on the live prospect board (PR #86)
(g) FOLLOW-UP  outreach-followups cron (+ opened-3×-silent trigger, reactivation cron)
               → drafts mint approvals, never send alone
(h) REPLY      resend-inbound → reply stored + classified → Replied filter on the board;
               operator reads the answer in-app (PR #88) → inbox-draft proposes a reply
               (draft_verdicts kept-vs-rewritten feedback loop)
(i) CLAIM      prospect claims demo site → claim-submit → lead + owner notification webhook
(j) CLOSE      close-won → client_engagements (scope-derived intake checklist)
               → client subscription + invoice (clientTiers/clientSale)
```

Status: the author graded this pillar **A−** and the scan confirms it end-to-end. It is the most
complete long workflow in the system. 🔌 Every unattended stage (a, g) needs the heartbeat armed
+ Places/Serper/Resend/screenshot keys.

- ⚠ (historical) `discovered_businesses` had "no browse/qualify UI"; the Prospects staged board +
  detail drawer (PR #83) and live board (PR #86) closed most of this.
- ⚠ No-email businesses dead-end the pitch stage (scan note); SMS channel (PR #63) and phone
  rails only partially substitute.

## 6. Client operations: booking, automations, money 🔌✅ (newest era)

```
BOOKING     public booking page (per client) → booking edge fn → bookings table (app_0109)
            → confirmation on book + reminder a day before (PR #77–78)
            → "AI-receptionist pillar" foundation
MISSED CALL voice-inbound (Twilio voice webhook) → missed call detected → missed-call
            text-back automation → send-sms (TCPA-gated, Twilio; app_0106–0107, PR #63–66)
REMINDERS   automation triggers engine (registry + bounded matcher + window guard,
            once-only fire keys, claim-first, consent + suppression gates)
            → channel-aware runner (email or SMS) → standing-worker drains due customers
            → per-client automation config attributes automations to paying clients
            (app_0108, PR #67) → ROI stats shown at point of sale (PR #64)
MONEY (own) create-checkout / customer-portal / stripe-webhook (idempotent) → credits
            (atomic, RLS-pinned after app_0094) → ai-gateway meters client apps' AI usage
            at 1.25× margin
MONEY (clients) clientTiers → close-won → client subscription + invoice → invoice-chase
            cron (4-rung ladder, approval-gated, kill-switch aware) → client-checkout
            (Stripe refs app_0104); "money honesty" hardening PR #81
PAPERWORK   sample doc → paperworkExtract ({{token}} template, fields persisted after
            app_0093) → merge with visible [YOU FILL] holes → refuse-unsendable
            → docusign-send (approval + hash + claim + honesty re-check + OAuth refresh)
            → docusign-webhook (HMAC fail-closed) tracking
            → signed-PDF filing to the world (app_0099_rooms_esign_filing)
```
- ⛔ (as of scan) **DocuSign back half** — upload → auto-template → auto-populate from client
  records → trigger-send → signed-PDF filed: declared missing; app_0099 added esign filing;
  the auto-populate/trigger-send middle remains the gap.
- ⚠ Client-payment webhook reconciliation is deliberately manual ("decide, don't drift" list).

## 7. The Garvis turn: say a thing → it happens ✅ (fragmented front doors ⚠)

```
Command page → useCommander → commander.ts one call → one typed decision
  (reply | mission | rabbit hole | build | venture | …) → transcript in command_messages,
  routing logged to mind_events
Orchestrator (parallel front door): intent → compile (14 actions, parse gauntlet,
  topo ordering, WaitingError) → reviewable plan → orchestrator_plans (app_0091)
  → execution through the approval spine → execution_runs ledger
Arcs: plans persist; ARC WAKE LOOP (app_0095): structured blockers, atomic claims,
  worker wake sweep → an arc blocked on an approval RESUMES ITSELF when it lands
Situation: compileSituation() (situation.ts) — budgeted current-state digest (ventures,
  arcs, blocked, intake owed, standing orders, approvals, opportunities, invoices,
  clock status) consumed by BOTH the orchestrator compile and the Commander
  (post-addendum build)
```
- ⚠ **Five "tell me what to do" front doors** coexist (Command/Commander, Orchestrator, Ask,
  studio chat, cluster-chat) — the author's own diagnosis; the Line-unification is planned, not
  built.
- ⚠ Catalog reachability: the brain can reach ~14–21 actions out of hundreds of UI capabilities
  (holy-grail gap #1) — everything else is invisible to intention.
- ⚠ resolveWorld ambiguity bug (B5) was in the fix ledger; verify in code.

## 8. Knowledge: explore → remember → retrieve → get smarter ⚠ (capture ✅, compounding partial)

```
EXPLORE    Explore/Command → explorer-turn edge fn (credit-gated per turn) → clusters +
           artifacts built turn by turn → GalaxyView/universe scenes; discover-media
           enriches with images
INGEST     ingest-document → documents → embed-worker → embeddings (pgvector, polymorphic)
           ingest-profile → operator/company profile intake
RETRIEVE   garvis-brain / ask / studio chat → hybrid retrieval (vector + lexical,
           honest fallback) over artifacts + documents (+ captioned images)
LEARN      mind_events (immutable spine, 20+ writers) → garvis-consolidate weekly cron
           → PROPOSED lessons → human approval gate → garvis_knowledge → reaches agent
           runs AND builder edits
REFLECT    world_intelligence per world (intel/reflection/momentum) — recomputed on visit
```
- ⛔ **The five compounding seams** (os-blueprint §5) — the precise places "remembers more"
  fails to become "gets better": (1) `mind_events → mind_beliefs` machine-distillation not
  built (beliefs are hand-curated); (2) `mind_decisions` outcomes close only manually;
  (3) embeddings written for only 2 of 6 declared subject types (beliefs, decisions, clusters,
  worlds unsearchable by meaning); (4) `insights` has no periodic proximity scanner (only fires
  on upload); (5) `world_intelligence` recomputes on visit, not on the clock.
- ⚠ Three context assemblers (Commander / agent runs / builder) see different memory slices;
  partially unified (knowledge reaches all three; mind digest + situation don't).
- ⚠ Builder research (Anthropic web_search) evaporates into chat — never persisted to knowledge
  (planned fix: route through ingest-document).

## 9. Marketing production: studios, boards, campaigns ⚠ (the signature dead-end lives here)

```
STUDIOS    chartered cluster → Cluster Studio shell (chat, tools, artifacts, versions)
           → copy/email/ads studios (data-driven via Charter + workshops.ts)
BOARDS     creative/brand/email boards: concurrent generation, groups + archive,
           zoom/fit, multi-select → board-copy edge fn
CAMPAIGNS  AI campaign generator (3-stage, research-grounded, real verifier)
           + campaign composer (one form → postcard + 4 posts + email, [EDIT] holes)
CONTENT    content-week engine: producer → standing-order drain → auto_mode after
           3 clean approvals (the ONE earned-autonomy loop; revocable)
```
- ⛔ **The Canvas dead-end** (os-blueprint §1): the "Change it with Garvis" `ArtifactSheet` on
  the social canvas is architecturally unable to publish — its decision contract is only
  `reply | create_artifact | revise_artifact` (`clusterChat.ts`); the real publish loop
  (`SocialBoard → queueSocialPost → approval → Ayrshare`) is one room over with **no bridge**.
- ✅→ **Marketing "Publish" FIXED post-audit** (`useMarketing.ts:92–127`): social channels
  (x/linkedin) now queue a REAL `social_post` behind a pending approval on the same spine
  (posts via Ayrshare once approved); Schedule queues on the real social rail with a future
  fire time drained by the standing-worker. Email/`manual` channels keep a **deliberate**
  prefilled-composer handoff ("email needs a human-chosen audience") and honestly mark
  `published` only because the operator does that send themselves. The old B6 dead-end
  ("nothing ever drained marketing_assets — the label lied") is documented in the code comment
  itself.
- ✅ Social real path: SocialBoard → approval → social-publish (Ayrshare, 9 platforms, per-brand
  keys fail-closed) → social-sync metrics cron (restored after B2).

## 10. Media: images, video, scenes ⚠

```
IMAGES     generate-image → project assets / board creative; discover-media for scraped media;
           shot-worker + render-design (screenshot/design renders; deploy-list gap B3 fixed
           per addendum)
VIDEO      storyboard/videoScenes → garvis-short-script → render-video (Shotstack)
           — real but manual (grade C)
SCENES     Veo Scene Studio (PR #62): generate-video (Gemini/Veo) → curated photoreal
           scroll-clip library → scroll_scenes (app_0105) → consumed by bespoke sites'
           motion layer (PR #61/#73)
REELS      reel_jobs / reel_clips (Sora/Runway/Luma reel engine) — ⛔ DEAD SCHEMA,
           zero code references, engine never built
```

## 11. Ads: read-only by design ⚠ (deliberate)

```
oauth (Google/Meta) → connections + oauth_states → ads-sync (metrics pull, honest nulls)
  → ad_spends → ads-watch daily anomaly watchdog → alerts
Ad drafts gallery exists; ad PLACEMENT (campaign write) is deliberately absent
  ("decide, don't drift") — planned only after read-sync proves out.
```

## 12. Inbound world: email replies, leads, SMS, calls 🔌✅

```
resend-inbound (replies) + site-events (demo-site visits/leads) + claim-submit (claims)
  + voice-inbound (calls) + automation-intake (inbound automation requests, app_0102)
  → OpsInbox (/garvis/inbox): one cross-world stream of replies + leads
  → reply-from-app composes a real outreach_message → SAME send_email approval + executor
  → owner notification webhook (Discord/Slack/generic) on leads + positive replies
```
- ⚠ **Whole-inbox awareness missing**: only replies to its own sends + a forward-in alias; no
  IMAP/Gmail pull (holy-grail "senses" gap; calendar sense schema app_0098 arrived post-scan).

## 13. The self-proving loop: verification, canary, scorecard ✅/⚠

```
LOGIC   ~96 verify:* suites (pure cores) + Playwright e2e (4 specs) + deno check over all
        edge functions + migration-collision guard (verify:migrations) → CI on every push;
        deploys gated on tests (post-addendum)
LIVE    garvis-canary (app_0096 canary tick) — the nightly live self-test the holy grail
        demanded; garvis-scorecard cron — honest numbers about the machine itself
        → Health board (/garvis/health) OPTIONS-probes every function + secret presence
        → Master Switch shows armed jobs vs EXPECTED_JOBS (drift made visible)
```
- ⚠ e2e coverage explicitly thin over the two biggest pages (ProjectWorkspace, WorkWeb).
- ⚠ The AI decision layer (brain, executeTool, ~51 *Run.ts) has no verify coverage (scan risk
  #10).

## 13b. The two halves interlock: rabbit hole → build brief → app → room ✅

```
Explore (ClusterSpike / GalaxyView) → compileBuildBrief distills a rabbit hole into a
  structured brief → NewProject consumes it (lib/garvis/buildBridge) → FableForge builds it
  → built/preview app mounts BACK inside a Garvis world via RoomsPanel iframes
  (app_0099_rooms_esign_filing) — the "Custom Rooms / wardrobe room" of holy-grail gap #4,
  step one, is REAL
```

## 14. Genesis: idea → designed company ⚠

```
Genesis flow (app_0028): DNA prompt → research-grounded plan (depth engine: research →
draft → red-team → refine) → designed world (areas chartered, seed artifacts) → approval
→ world created → intake asks for missing ground truth
```
- ⚠ The genesis → running-business seam ("the campaign never shipped" class of monitoring) was
  the holy-grail arc gap; arc-wake (app_0095) addressed resumption; monitoring of stalled arcs
  is part of the same build — verify depth of wiring.

---

## 15. Break-point index (the honest list, deduplicated)

**Architecturally severed (code cannot complete the loop):**
1. Canvas social ArtifactSheet → publishing (no bridge to queueSocialPost; re-verified by grep —
   no `queueSocialPost`/`social_post` reference under `src/components/garvis/canvas`). —
   os-blueprint §1
2. reel_jobs/reel_clips reel engine — schema with no engine.
3. DocuSign back half (auto-template → auto-populate → trigger-send middle).
4. Mind beliefs machine-distillation; decision outcome observation (seams 1–2).
5. Embedding coverage 2/6 subject types (semantic recall can't span the graph).
6. insights proximity scanner absent; world_intelligence not on the clock (seams 4–5).
   *(Formerly on this list, now FIXED: marketing Publish/Schedule → real social rail
   (`useMarketing.ts`); deploy_site/deploy_backend approval executors are REAL
   (`execution.ts:174–307`, with deploy_bundles captured at authorization time).)*

**Posture/activation breaks (built, but off or invisible):**
8. Heartbeat never self-arms; CI self-arm defaults off. 🔌
9. ~21 secrets gate the rails; missing ones historically silent (Health board + go-live
   checklist now surface them).

**Fragmentation (works, but in pieces):**
10. Five intention front doors; three context assemblers; three money rooms; Mind/Brain/Memory
    trio; `apps` vs `knowledge_worlds` dual noun with no FK bridge.
11. Two mission writers with incompatible lifecycles (useMissions vs workwebRun).
12. Catalog reachability: intention can reach only the cataloged fraction of the UI's powers.

**Deliberately missing (author's explicit "decide, don't drift" list):**
13. Ad placement writes · print-vendor mail (postcards are print-it-yourself) · client-payment
    webhook reconciliation · free-floating research (no-world research) · whole-inbox IMAP ·
    custom domains for builder apps (prospect-site domains DO exist via connect-domain).

---

*Cross-references: 05-ai-system.md (the engines inside these traces), 13-edge-functions.md
(per-function detail), 04-database.md (the tables named here), 03-feature-inventory.md (status
grades per feature).*
