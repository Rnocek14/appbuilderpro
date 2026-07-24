# 11 — Glossary: The Project's Private Vocabulary

*Part of the system-reconstruction series. This project has an unusually rich internal vocabulary.
A new team cannot read the code or the planning docs without this. Terms marked ⚙ exist in code;
📐 exist mainly/only in planning documents; 🧪 are experimental/spike-only. Many are both.*

---

## The two product halves

- **FableForge** ⚙ — the AI app builder half (Lovable-style). Package name `fableforge`. Projects,
  Monaco workspace, Sandpack preview, the 11-stage generation pipeline, deployments, billing,
  admin.
- **Garvis** ⚙ — the AI chief-of-staff half (name riffs on Jarvis), living under `/garvis/*`
  routes and `src/lib/garvis/`. Ventures, knowledge, missions, outreach, approvals, heartbeat.

## The OS-blueprint organs (the author's own architecture words)

- **The Spine** ⚙ — the approval system: `approvals` table (one queue for everything outbound) +
  `execution_runs` (immutable ledger of what actually happened). "The one interruption Garvis is
  allowed."
- **The Clock / Heartbeat** ⚙ — `standing_orders` + `system_heartbeat` tables + ~12 pg_cron jobs +
  worker edge functions (`garvis-pulse`, `garvis-worker`, `standing-worker`, …), armed by the SQL
  function `garvis_arm_heartbeat()`. Famously never invoked automatically — "the whole machine
  ships switched OFF."
- **The Line** 📐/⚙ — the one persistent conversation bar. Implemented today as
  `commander.ts`/`useCommander` on the Command page; the vision is a global bar on every screen.
- **The Field** 📐 — the envisioned home screen: your ventures as living orbs over the faint
  knowledge graph, with an approvals whisper. Mocked in `docs/mockups/garvis-inevitable.html`;
  data source (`situation.ts`) exists, screen does not.
- **The Noun / World / Venture** ⚙ — `knowledge_worlds` row: the top-level unit of "a thing you
  run" (business, side project, client engagement, or rabbit hole). Rendered as **orbs** in the
  Universe views.
- **The Memory / Subconscious** ⚙ — the layered memory: `mind_events` (append-only spine),
  `mind_beliefs`, `mind_decisions`, `mind_identity`, `garvis_knowledge` (approval-gated lessons),
  `documents`, `embeddings` (pgvector), `insights`.
- **Posture** 📐 — Think · Create · Execute · Observe: the four verbs a mission can be "in."
  Planning-doc concept (garvis-first-principles.md); not yet a code construct.
- **Vertical-as-Data / VerticalSpec** 📐 — the target primitive making a new venture *kind* a
  database row instead of code edits. Partially realized via Charters; `vertical_specs` table not
  yet built.

## Knowledge & exploration

- **Knowledge Universe** ⚙ — the whole clusters/worlds/artifacts graph plus its visualizations
  (`Universe.tsx`, `Universe3D.tsx`, galaxy scenes). Migrations app_0013, app_0018.
- **World** ⚙ — see The Noun. **Orb** = a world drawn in a universe scene, glowing its state.
- **Cluster / Area** ⚙ — `knowledge_clusters`: a topic/production area inside a world. A cluster
  with a **Charter** becomes a chartered capability (production area) "without moving it."
- **Charter** ⚙ — jsonb on a cluster (`archetype` + `flavor`) that upgrades a thought-cluster into
  a production area with tools, workshop copy, and studio behavior. The proof that "a studio is
  data, not code."
- **Artifact** ⚙ — `knowledge_artifacts`: any made thing (doc, link, post, data, simulation,
  image, …) living in a cluster.
- **Rabbit Hole** ⚙ — a curiosity-driven exploration world ("a mission whose objective is
  curiosity"). Entered via Explore/Command ("Take me down the rabbit hole on…"), powered by the
  `explorer-turn` edge function; visualized in `GalaxyView`. Has a doctrine: "name the gap → hold
  the guess" (`SceneStage.tsx`).
- **Explorer** ⚙ — the exploration engine/UI (`explorerAI.ts`, `explorer-turn`, Explore pages) that
  builds rabbit-hole worlds turn by turn.
- **Subconscious** 📐 — the all-worlds graph rendered faint behind the Field (vision term).
- **World Intelligence** ⚙ — `world_intelligence` table + `worldIntel.ts`: one living-state row per
  world (intel/reflection/momentum). Recomputed on visit (not yet on the clock).
- **Currents** ⚙ — `currents.ts`: ambient streams of what's moving in the system (see 05-ai-system).
- **Insights** ⚙ — "Garvis noticed…" connection rows (`insights` table), today only written on
  document upload.
- **Lab / Lab Bench** ⚙🧪 — visual simulation workbench (`LabBench.tsx`, `SimVisual.tsx`,
  `MechanismCanvas.tsx`, `lab.ts`): parameterized mechanism models with finite-difference
  sensitivity, saved as `simulation` artifacts.
- **Seed Einstein** 🧪 — `scripts/seed-einstein.ts`: builds a real demo exploration world (an
  Einstein rabbit hole) through the actual pipeline.

## Missions & work

- **Mission** ⚙ — `garvis_missions` (+ `garvis_tasks`): a bounded campaign/intention with stakes.
  In the first-principles vision, THE only noun. In code, currently "an overloaded run-log with
  two incompatible writers" (`useMissions.planMission` vs `workwebRun.runPlay`).
- **Arc** 📐 — a durable, resumable project (plans + waiting states + auto-resume). The
  holy-grail doc's gap #2; not yet a table.
- **Work Web / WorkWeb** ⚙ — the per-world web-of-work view (`WorkWeb.tsx`, `workweb.ts`,
  app_0024): the mission/areas graph for a venture. Vision says the term disappears from UI.
- **Standing Order** ⚙ — `standing_orders` row: a durable scheduled job/watcher (5 kinds) run by
  `standing-worker` on the heartbeat.
- **Run(s)** ⚙ — the `*Run.ts` pattern (`clientHuntRun`, `genesisRun`, `gardenerRun`, …): the
  execution wrapper for a subsystem's unattended work (see 05-ai-system.md).
- **Next Move** ⚙ — `nextMove.ts`: the engine that stages "the one thing to do next" per world.
- **Commander** ⚙ — `commander.ts` + Command page: one call → one typed decision router
  (reply | mission | rabbit hole | build | …), transcript in `command_messages`.
- **Orchestrator** ⚙ — the intent → reviewable plan → execution compiler (14 actions, 35 pinned
  intents, 49-check coverage contract). See docs/orchestrator.md and 05-ai-system.md.
- **Depth Engine** ⚙ — `depth.ts`: multi-pass plan deepening (research → draft → red-team →
  refine).
- **Gauntlet / Fuzz** ⚙ — `gauntletFuzz.verify.ts`: adversarial fuzz of the orchestrator's parsing.
- **Master Switch** ⚙ — the panel that arms/disarms the heartbeat (see Health/System Control).
- **Genesis** ⚙ — company creation from DNA ("company genesis"): `genesis.ts`, app_0028, the
  genesis blueprint doc. DNA → designed world → approval.
- **Gardener** ⚙ — `gardener.ts`: tends/prunes the knowledge garden (see 05-ai-system.md).
- **Farm** ⚙ — `farm.ts`, `farmDesigns.ts`: the design farm — pre-generating design variants (see
  05-ai-system.md).
- **Workshop** ⚙ — `workshops.ts`: the data-driven description of a chartered capability's focused
  workspace (name, kicker, outcome, steps) — "the gallery, focused workspace, command palette,
  and future agent planner can all describe the same capability without inventing parallel logic."

## Acquisition & agency (the money funnel)

- **Client Hunt** ⚙ — the daily unattended prospecting run: Google Places discovery → scrape →
  audit → demo site → pitch approval. `clientHuntRun.ts`, `clientHuntSchedule.ts` (rolls the
  country, caps itself), **Big Cities** (`bigCities.ts`) national sweep.
- **Prospect** ⚙ — a scraped/discovered business in the staged pipeline board (app_0032–0034,
  `src/components/prospects`, Prospects page): stages incl. Pitched/Replied.
- **Discovered Businesses** ⚙ — the raw daily discovery pool (`discovered_businesses`).
- **Preview / Demo Site** ⚙ — the generated demo website for a prospect (`src/lib/preview` engine:
  strategist → art director → generator → simulated owner → auditor chain), published via
  `publish-preview`, claimable via `claim-submit`.
- **Bespoke Site** ⚙ — the higher-end vision-grounded site generator (`bespokeSite.ts`, PR #73).
- **Claim** ⚙ — a prospect claiming their demo site (lead capture) → `claim-submit`.
- **Speed-to-lead** ⚙ — instant first-touch on a new lead (doc garvis-speed-to-lead.md; wired into
  outreach crons).
- **Opportunity Hunt** ⚙ — external opportunity discovery (search → fetch → honest extraction →
  deduped feed): `opportunityHunt.ts`, `opportunities` table. Distinct from
  `garvis_opportunities` (portfolio synergies between YOUR OWN ventures).
- **Client Engagement** ⚙ — `client_engagements`: a won client relationship with scope-derived
  intake checklist (`clientEngagement.ts`).
- **Connections (client)** ⚙ — the per-client account-hookup checklist (PR #82,
  `clients/connections.ts`) — hooking up a client's Google/Meta/etc. accounts.
- **Sending Domain** ⚙ — per-brand verified email domains for deliverability (PR #84,
  `sender-domain` function).
- **Automation (client-facing)** ⚙ — sellable automations for clients: appointment reminders,
  missed-call text-back (Twilio SMS, TCPA-gated), per-client config (PRs #63–#67); trigger
  engine = `automation/triggers.ts` + seed SQL.
- **Booking** ⚙ — online booking ("the foundation of the AI-receptionist pillar", PR #77–78):
  `booking` function, confirmations + day-before reminders.
- **AI Receptionist** 📐/⚙ — the pillar name for booking + voice-inbound + missed-call handling.
- **Speedrail / rails** 📐 — "the rails" = the real outbound integrations (Resend, Ayrshare,
  Netlify, Twilio, Stripe, DocuSign, GitHub). "Every 'make' reaches a rail" is a target.

## Studios, boards, media

- **Studio** ⚙ — a focused creative workspace over a chartered cluster. Concrete studios in code:
  Cluster Studio (the shell), **Ads Studio** (`adsStudio.ts`), **Copy Studio** (`copyStudio.ts`),
  **Email Studio** (`emailStudio.ts`), **Scene Studio** (Veo scroll-clips). Doctrine: "a studio is
  data, not code" (docs/garvis-studios-blueprint.md).
- **Creative Board / Board** ⚙ — canvas of generated creative variants with groups + archive
  (`creativeBoard.ts`, `brandBoard.ts`, `emailBoard.ts`, `board-copy` function; commits 66c55f5,
  689310b). "Boards" cover ads/email/branding.
- **Canvas** ⚙ — the Garvis canvas UI (`src/components/garvis/canvas`, `ArtifactSheet.tsx`) — where
  cluster artifacts render; the known dead-end "Change it with Garvis" panel lives here.
- **Video Pillar** ⚙/📐 — storyboard → `render-video` (Shotstack) real-but-manual; **Veo Scene
  Studio** (`generate-video`, PR #62) generates a curated library of photoreal scroll clips
  (`scroll_scenes`); `reel_jobs`/`reel_clips` (Sora/Runway/Luma reel engine) = dead schema, never
  coded.
- **Shot Worker** ⚙ — `shot-worker`: screenshot/render worker used by design/preview loops.
- **Design Farm / Design Directions** ⚙ — fan-out of committed design-token bundles with an
  anti-slop rubric (`farmDesigns.ts`, `render-design`).

## Memory & mind (fine-grained)

- **Mind** ⚙ — the event-sourced psyche: `mind_events` (immutable, 20+ writers), `mind_beliefs`
  (human-curated; machine distillation is a planned seam), `mind_decisions` (with manual outcome
  closing), `mind_identity`. `mind.ts`, Mind page.
- **Brain** ⚙ — `brain.ts`/`brainModel.ts`/`directBrain.ts` + `garvis-brain` function: the
  retrieval/answer layer over knowledge. (Mind/Brain/Memory are three overlapping rooms the
  author plans to collapse.)
- **Knowledge (garvis_knowledge)** ⚙ — the approval-gated learn store: lessons must pass the human
  gate before agents may use them.
- **Consolidation** ⚙ — `garvis-consolidate`: the weekly loop proposing lessons from events
  (through the approval gate).
- **Embeddings** ⚙ — one polymorphic pgvector space (`embeddings` table, `embed-worker`,
  `match_embeddings`); today only `document` + `artifact` types are actually written.
- **Situation** ⚙ — `situation.ts` `compileSituation()`: the assembled "state of everything"
  (ventures, arcs, blocked work, intake owed, standing orders, approvals, opportunities,
  invoices, clock status) — currently serialized into LLM prompts, not yet rendered as the home.
- **Scorecard** ⚙ — `garvis-scorecard`: periodic honest scoring of the machine's own numbers.
- **Canary** ⚙ — `garvis-canary`: liveness self-test function (holy-grail gap #9 wants a nightly
  full canary).

## Builder (FableForge) terms

- **Forge / generation pipeline** ⚙ — the 11-stage pipeline (interpret → blueprint → schema →
  file tree → frontend → backend → auth → styling → validate → fix → summarize), streamed via
  Realtime into the workspace ("forge progress").
- **Shell-contracts-then-parallel-pages** ⚙ — the generation architecture: contracts first, then
  pages generated in parallel, then a compile gate and agentic repair.
- **Safe Edit / Pending Edit** ⚙ — `safeedit.ts`, `pendingEdit.ts`: verified conversational edits
  (surgical str-replace patches with compile checking).
- **Branches** ⚙ — builder branch-per-feature with readiness-gated merges (`branches.ts`).
- **QA Check** ⚙ — `qaCheck.ts`: static QA gate on generated apps.
- **WebContainer** ⚙ — in-browser Node runtime used for real builds (`npm run build`) pre-deploy.
- **DIRECT mode** ⚙ — `VITE_AI_DIRECT=true`: browser calls the AI provider directly (dev-only);
  several intelligence features are DIRECT-only ("edge mirror coming").
- **AI Gateway** ⚙ — `ai-gateway` function + credits (app_0017): meters AI usage of client-shipped
  apps against credits at a 1.25× margin — "revenue infrastructure for apps you ship to clients."
- **Managed Cloud** ⚙ — `provision-supabase`, `deploy-backend`, `apply-migration`, `db-console`
  (app_0016): provisioning and operating real Supabase backends for generated apps.
- **Autopilot** ⚙ — the builder's autonomous multi-step build loop (`autopilot.ts`), DIRECT-only
  today.

## People & comms

- **Contacts** ⚙ — unified people store (app_0025 dedupe); the author notes "six unreconciled
  people tables" as debt.
- **Outreach** ⚙ — the email machine (app_0023): approval spine, tamper checks, atomic claims,
  suppression fail-closed, RFC-8058 unsubscribe, warmup, reply classification, follow-up +
  opened-3×-silent + reactivation crons.
- **Inbox Draft** ⚙ — `inbox-draft`: drafts replies to inbound mail with track-record feedback
  (`draft_verdicts` kept-vs-rewritten).
- **Voice** ⚙ — `voice-inbound` (Twilio voice webhook) + missed-call text-back
  (`missedCall.ts`, MissedCall page). No speech-to-Garvis interface exists yet (vision only).
- **Paperwork** ⚙ — sample→template document extraction (`paperworkExtract.ts`) + approval-gated
  DocuSign send (`docusign-send`/`docusign-webhook`, `esign.ts`).
- **MLS Sync** ⚙ — `mls-sync`: real-estate listing ingestion (the "mom's real estate" vertical).

## Meta / process vocabulary

- **Verify suite** ⚙ — the ~90 `verify:*` tsx scripts: pure-core self-tests of each subsystem, run
  in CI. The house testing style (no Jest; hand-rolled `check()` assertions).
- **Coverage contract** ⚙ — the 49-check suite pinning the orchestrator's 35 intents; the pattern
  "every new surface ships WITH its action."
- **Honesty holes** ⚙ — explicit refusal paths where the system says "I don't know / can't"
  rather than inventing (orchestrator concept).
- **Waves** — hardening batches (Wave 1 trust, Wave 2 board fluidity, Wave 3 coherence, Wave 4
  honesty; later "Machine hardening A/B/C", "wave-a-security" migration).
- **Glory Sprint / Level 10 / Legendary** 📐 — escalating quality-bar planning docs.
- **The Machine** 📐 — the author's name for the whole unattended value-delivering system.
- **Second operator** 📐 — what CI is to a solo founder: the thing that protects "future you from
  tonight's you."
- **Built-but-not-connected** 📐 — the "signature disease" diagnosis: capabilities built to a high
  standard but never wired to the thing that makes them matter.
- **Ghosts** 📐 — never-delete rule: "nothing the user ever made becomes unreachable."

## Terms from the surrounding conversation NOT found in this repository

- **Crew(s)** — no multi-agent "crew" construct exists in code (only literal roofing crews in
  scraped demo content). If "crews" was discussed, it never reached this repo.
- **Agents (as named personas/teams)** — there is an agent-run system (`agent-turn`,
  `agentRunControl`) and worker kinds, but no named multi-agent roster.
- **Deployments of Garvis itself as a product** — no multi-tenant packaging exists.

---

*See 05-ai-system.md for how these concepts execute, 04-database.md for the tables behind them,
and 09-future-vision.md for which are still only planned.*
