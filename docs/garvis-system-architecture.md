# Garvis System Architecture — Full Ecosystem Audit & Consolidation Plan

*Scope: deep scan of all nine repos (appbuilderpro, mind-weave-recover, swift-prep-pros,
idea-digester-spark, launch-buddy-bot, credit-optimizer, theory-thread, traction-engine,
path-to-success-tracker) — every migration, edge function, and major frontend surface was read.*

---

## 1. Executive Summary

**What Garvis is becoming.** A personal AI operating system with one intelligence core
(memory, knowledge graph, agent runtime, approval-gated execution) and multiple work surfaces
(explore, build, market, outreach, video). The good news: **this system already exists in
embryo, and it lives in exactly one place — this repo (FableForge).** Garvis is not spread
across your nine repos. Eight of the nine repos contain zero Garvis code. What they contain
instead is (a) four real standalone products and (b) three harvestable engines that map
one-to-one onto the missing Garvis modules.

**Whether the current systems support the vision.** Yes — better than the vision prompt
assumed. Already built here:

- **Agent chassis**: `agent_runs` queue with leases, checkpoints, budget caps; mode-gated
  observe→plan→act tool system (`src/lib/garvis/tools.ts`, `runtime.ts`); an unattended
  server-side runner (`garvis-worker`) on a pg_cron tick — laptop-closed autonomy.
- **Missions & workers**: `garvis_missions`/`garvis_tasks`, a worker pool (research,
  analytics, marketing, bug, builder) — `src/lib/garvis/{mission,workers}.ts`.
- **The owned mind**: append-only `mind_events` → `mind_beliefs`/`mind_decisions`
  ("the reasoner is rented; the record is owned").
- **Knowledge Universe**: `knowledge_worlds` / `knowledge_clusters` / `knowledge_cluster_edges`
  / `knowledge_artifacts` + the Explorer surfaces (`explorer-turn`, `discover-media`, spike pages).
- **App builder**: the 11-stage pipeline, Sandpack/WebContainer preview, chat edits,
  Supabase provisioning + Management-API console, Netlify deploy, GitHub export, credits/Stripe.
- **Outreach preview engine**: `ingest-profile` (scraper front door) → SiteSpec →
  owner-simulation critique → audit → pitch → public `/preview-site/:slug` → `claim-submit`
  leads → `shot-worker` before/after screenshots → `preview_events` engagement.
- **Approval discipline**: every consequential Garvis write (knowledge, goals, capabilities)
  already lands as a proposal awaiting human approval.

**The five real gaps** (in priority order):

1. **No email sending anywhere in Garvis.** Pitches are drafted and copied to a clipboard;
   marketing "publish" opens `mailto:`. The entire outreach/email/CRM loop stops at the draft.
2. **No persistent embeddings / file intake.** Embeddings are client-side and in-memory
   (`src/lib/garvis/embeddings.ts`); no pgvector, no `documents` table, no upload→classify→
   connect pipeline. The "living brain" can't ingest.
3. **No unified approval/execution ledger.** Approvals exist per-feature (knowledge proposals,
   publish_requests) but there is no single "Garvis prepared this — approve?" queue spanning
   email/publish/deploy/spend, and no cross-module execution log.
4. **Security debts you already flagged in `docs/legendary-roadmap.md`**: the
   `apply-migration` confused-deputy gap (8b), secrets not in Vault (8a), client DIRECT-mode
   key exposure, broad `garvis-worker` nudge auth.
5. **The Garvis→build bridge** (roadmap 10c): missions produce markdown, not queued build steps.

**Biggest risks.**
- *Spread*: nine repos, ~1.1M lines of TS, one person. Four of the repos are full products
  that each individually could consume all your time. The vision fails by dilution, not by
  any single technical gap.
- *Security*: traction-engine's RLS is effectively world-writable with its anon key
  (~99 permissive write policies, browser-exposed `VITE_PIPELINE_KEY`, any-authenticated-user
  kill switch); theory-thread has unauthenticated cost-incurring webhooks; two repos
  (credit-optimizer + path-to-success-tracker) point at the *same production database*.
- *Compliance*: automated cold email is a legal surface (CAN-SPAM/CASL). swift-prep-pros
  already designed the right guardrails (suppression, warmup, caps, kill switch) — they must
  come along with any send path.

**Biggest opportunities.**
- swift-prep-pros (discovery/enrichment/sequences/Resend/suppression — but no website
  generation) and this repo's preview engine (website generation/audit/pitch/claim — but no
  sending) are **two halves of the exact outreach business in the vision**. Joining them is
  weeks, not months.
- traction-engine's ffmpeg-service + smart provider router (Sora/Runway/Luma/ElevenLabs)
  is a professional-grade video engine that can be mounted as a Garvis service without
  adopting its product surface.
- theory-thread has the exact knowledge-layer patterns Garvis needs (pgvector + HNSW,
  human-reviewed canonicalization/merges, provenance `*_runs` tables, falsification loops).
- idea-digester-spark (Lake Geneva Brief) is a running, revenue-railed distribution asset
  in **exactly your mom's market** — audience, market-report data, and real-estate CTAs already live.

**Best path forward, in one sentence:** treat FableForge as the Garvis platform; make the
brain persistent (pgvector + file intake), give Garvis hands (one approval queue + one send
path), port the outreach schema from swift-prep-pros, mount video as a service, register the
real products as connected "apps" — and stop feature work everywhere else while you do it.

---

## 2. Current System Inventory

| Repo | What it actually is | Status | Quality | Verdict |
|---|---|---|---|---|
| **appbuilderpro** ("FableForge") | AI app builder + **Garvis control plane** + outreach preview engine | Active (through today), 65 commits, ~40k LOC | Strongest architecture of the nine: RLS everywhere, `.verify.ts` unit harnesses, budget/lease/approval discipline | **KEEP — this is the Garvis platform** |
| **swift-prep-pros** ("CMP Contractor Intelligence Engine") | B2B scraper→outreach machine: Google Places discovery → Firecrawl enrichment → scoring → LLM drafts → Resend sequences, suppression, warmup, kill switch | Plumbed end-to-end, **0 emails ever sent**; 1,028 accounts discovered | Cleanest schema of the nine; permissive RLS (`USING (true)` for authenticated); single-tenant hardcoded to CMP | **MERGE the model into Garvis** (keep repo running as the CMP instance meanwhile) |
| **traction-engine** | Multi-vertical short-form **video factory**: script → storyboard → ElevenLabs VO → Sora/Runway/Luma via smart router → Fly.io FFmpeg assembly; plus a dropship-product research layer | Idle ~6 weeks; pipeline fully wired in code; publishing (TikTok/Shopify) aspirational | ffmpeg-service is professional; **RLS is world-writable**, kill switch togglable by any user, `VITE_PIPELINE_KEY` in the browser bundle | **HARVEST** (ffmpeg-service + provider router + `_shared` prompt/timing/moderation libs); **FREEZE** the product surface |
| **theory-thread** ("TheoryForge") | Research-gap discovery engine: PubMed/arXiv ingest → fragment-grounded mechanism extraction → pgvector canonicalization with human-reviewed merges → OpenAlex prior-art falsification | Active through mid-June; generator works; the differentiating "bridges" graph unbuilt; no tests | Honest, provenance-disciplined; 4 unauthenticated cost-incurring webhooks; embedding-dimension sprawl (384/768/1536, mostly unpopulated) | **FREEZE as product; HARVEST the knowledge-layer patterns** into the Garvis brain |
| **idea-digester-spark** ("Lake Geneva Brief") | Hyperlocal news/newsletter platform: ~95 edge functions, Firecrawl/n8n ingestion, AI content gen, autopilot newsletter, Stripe sponsors, jobs board, ~25 SEO guides, **real-estate market report + CTAs** | Production-grade, revenue-enabled, active | Sprawling but coherent; excellent ops docs | **KEEP as a separate product** — and use it as the distribution/data asset for Mom's real estate |
| **launch-buddy-bot** ("Footprint Finder") | Consumer privacy/data-removal SaaS (DeleteMe competitor): email-header scanning, DSAR contact discovery (golden10/25 regression gates, SRE runbook), broker scans, Stripe | Large; discovery engine ops-mature; headline flows (deletion-email delivery, extension, broker worker) prototype/non-functional | Best ops discipline of the nine; doc/reality mismatches; `.env` committed | **KEEP SEPARATE; FREEZE unless you commit to it as a business.** Steal its patterns (golden suites, quarantine, budget governors) |
| **credit-optimizer** | Degree-planning / credit-transfer optimizer + career skill tree + "Maya" mentor; 307 tables, 138 edge functions | Active until mid-June; enormous surface, thin in places (78 TODO/placeholder markers; unresolved tree-layout bugs) | Huge; newest policy/articulation subsystem least proven | **KEEP as separate product** (canonical copy); pause expansion |
| **path-to-success-tracker** | An **older snapshot of the same Lovable project** as credit-optimizer — same project UUID, same production Supabase; 0 unique tables, 0 unique functions | Dormant since Oct 2025 | Redundant; dangerous (two codebases can mutate one prod DB) | **KILL/ARCHIVE** after a 10-minute check of its few unique frontend demo pages |
| **mind-weave-recover** | Post-stroke aphasia speech-therapy clinical platform ("Maya" coach, Azure speech scoring, MFA/GOP Python worker on Fly, 157 migrations, 241 RLS policies, 82 test files, ~330 real profiles) | Idle a month but production-grade | The most rigorously tested repo you own; handles PHI | **KEEP FULLY SEPARATE — never merge.** Clinical data does not belong inside a personal OS |

**Notes on identity confusion the audit cleared up:**
- "Garvis" exists **only** in appbuilderpro. Repo names are misleading: launch-buddy-bot is a
  privacy SaaS, mind-weave-recover is a stroke-therapy clinic, idea-digester-spark is a
  newspaper, swift-prep-pros is a sales machine.
- **No repo named "Stoke" is in scope.** If "Stoke" = the stroke-recovery app
  (mind-weave-recover), the neuroscience-documents scenario maps to its onboarding/reward/
  habit-loop mechanics — and theory-thread already ingests exactly that literature (stroke
  recovery, aphasia, neuroplasticity). If Stoke is a different repo, it needs to be added to
  the session/Garvis scope explicitly.
- Duplicated patterns across repos: all nine are Lovable-origin + Supabase; Firecrawl in 4;
  Resend in 3; committed `.env` files with anon keys in ~all; "Maya" is the AI persona in two
  unrelated products; OpenAI+Lovable-gateway dual-provider in most (only FableForge speaks
  Anthropic).

### Where the architecture is strong / fragile / missing

**Strong:** FableForge's agent discipline (single-source-of-truth tool gates re-applied every
step, budget caps, approval-gated writes, append-only mind); its migration hygiene; the
preview-engine fail-soft chain; launch-buddy-bot's regression/ops practice; mind-weave's test
culture; theory-thread's provenance stamping.

**Fragile:** traction-engine RLS + auth (must not be exposed as-is); theory-thread's open
webhooks; FableForge's DIRECT mode (`VITE_AI_*` keys in a browser build) and the
byte-alignment convention duplicating prompts/executors across `garvis-brain` /
`garvis-worker` / `directBrain`; ptst+credit-optimizer sharing one prod DB; hardcoded
`Rnocek14` GitHub user; real project refs committed in `.claude/settings.local.json`.

**Missing:** sending (email/social), persistent embeddings, file/doc intake, unified
approvals + execution log, connector registry beyond OAuth scaffolding, the Garvis→build
bridge, one-click client publish (function exists; client trigger stubbed at
`ProjectWorkspace.tsx:759`).

---

## 3. Unified Architecture Proposal

### Topology: hub-and-spoke, not monorepo

**Decision: do NOT build a monorepo.** Merge *capabilities* into the Garvis platform; keep
*products* as spokes Garvis understands and can act on. Rationale: four spokes are real
products with their own users/PHI/revenue and (in mind-weave's case) regulatory gravity;
merging their code would import their liabilities into your personal OS while adding nothing
to the intelligence core. Garvis's existing model — the `apps` table, GitHub-based repo
understanding, `garvis_app_profiles`, `app_liveness` — is already the correct connective tissue.

```
                            ┌────────────────────────────────────────────┐
                            │   GARVIS PLATFORM (this repo, one Supabase) │
                            │                                            │
   Surfaces (one SPA):      │  Intelligence core                         │
   • Command (talk)         │   • mind_events / beliefs / decisions      │
   • Universe (brain/graph) │   • knowledge worlds/clusters/artifacts    │
   • Work (missions,        │   • documents + embeddings (pgvector) NEW  │
     approvals, runs)       │   • goals / constraints / capabilities     │
   • Workshop (builder)     │                                            │
                            │  Agent runtime                             │
                            │   • agent_runs (lease/checkpoint/budget)   │
                            │   • garvis-worker (unattended, pg_cron)    │
                            │   • missions → tasks → worker pool         │
                            │                                            │
                            │  Execution layer                NEW/EXTEND │
                            │   • approvals (ONE queue)                  │
                            │   • execution_runs (ONE ledger)            │
                            │   • connectors (Resend, GitHub, Netlify,   │
                            │     Supabase Mgmt, Stripe, Google, …)      │
                            │                                            │
                            │  Modules                                   │
                            │   • App Builder (built)                    │
                            │   • Outreach/CRM (port from swift-prep)    │
                            │   • Marketing (built: campaigns/assets)    │
                            │   • Explorer (built: explorer-turn/media)  │
                            └──────┬──────────────┬──────────────┬───────┘
                                   │              │              │
              services (called by Garvis)         │        spokes (registered as `apps`)
        ┌──────────────────────┐  ┌───────────────┴───────┐  ┌───────────────────────────┐
        │ video-worker          │  │ scraper feeds         │  │ mind-weave-recover (PHI!) │
        │ = traction-engine's   │  │ = swift-prep discovery│  │ credit-optimizer          │
        │ ffmpeg-service +      │  │   (Google Places +    │  │ idea-digester-spark       │
        │ provider router       │  │   Firecrawl) → POST   │  │ launch-buddy-bot          │
        │ (Sora/Runway/Luma/11L)│  │   /ingest-profile     │  │ theory-thread (frozen)    │
        └──────────────────────┘  └───────────────────────┘  └───────────────────────────┘
```

### Answers to the organization questions

- **Core platform:** FableForge/this repo. It keeps its single Supabase project as the Garvis DB.
- **Modules inside Garvis:** Explorer, Brain/Universe, App Builder, Marketing, Outreach/CRM,
  Email, Execution/Approvals, Opportunities. All share the one data model (§4).
- **Separate apps:** the four real products + frozen theory-thread. Each is a row in `apps`,
  profiled by `garvis_app_profiles`, pinged by `app_liveness`, understood via GitHub.
- **Scraper into Garvis?** The *pipeline model* yes (tables + sequence logic); the *discovery
  workers* can stay wherever they run cheapest — they talk to Garvis only through
  `ingest-profile` with an `ffi_` token. That API already exists and is the right seam.
- **Marketing video engine imported?** As a **service**, not a merge: deploy ffmpeg-service
  as-is (it's self-contained), lift `queue-video-smart`, the provider queue/poll functions,
  and the `_shared` timing/moderation/cinematic libs into Garvis functions namespaced
  `video-*`. Leave the verticals/dropship product behind.
- **One monorepo?** No (above). **Modular services?** Only two: video-worker (Fly.io) and
  whatever scraper runners you operate. Everything else is Garvis edge functions.
- **Cleanest architecture:** one Postgres (Garvis) as the spine; edge functions as the only
  secret-holding execution tier; spokes integrated by API + GitHub, never by shared tables.

### Connector system

Extend the existing `provider_connections`/`oauth` scaffolding into a first-class registry:
one row per (provider, account) with scopes, health, last-used; server-side tokens only (RLS:
no client policies — already the pattern). Launch set: GitHub (exists), Supabase Mgmt
(exists), Netlify (exists), Stripe (exists), **Resend (new)**, Google Places (new, for
discovery), Gmail/Drive/Calendar (later, OAuth via existing PKCE flow). Every connector call
is written to `execution_runs`.

### Workflow engine

Don't build a new one — you have two halves already: `agent_runs` (single-step-agent loop,
budget/lease/checkpoint) and `garvis_missions`/`garvis_tasks` (decomposition). Add the
missing third piece: **durable plans** (roadmap 10a) — a mission's tasks become rows the
worker walks with per-task status, where "done = verified" (10b), and side-effectful tasks
block on an `approvals` row (§4). Failures: keep the lease/retry semantics; add
`execution_runs.attempt` + exponential backoff columns.

---

## 4. Data Model

Already right (keep as-is): `apps`, `projects`, `app_blueprints`, `project_files(+versions)`,
`agent_runs`, `garvis_knowledge/goals/constraints/capabilities`, `garvis_app_profiles`,
`app_liveness`, `garvis_missions/tasks`, `garvis_opportunities`, `marketing_campaigns/assets`,
`knowledge_worlds/clusters/cluster_edges/artifacts`, `mind_events/beliefs/decisions/identity`,
`business_profiles`, `preview_sites`, `publish_requests`, `preview_events`, `ingest_tokens`,
`provider_connections`, `oauth_states`, credits/Stripe tables.

New tables (all owner-scoped RLS, additive migrations `app_0021+`):

```sql
-- BRAIN
documents        (id, owner_id, world_id?, source_kind ingest|upload|repo|email|url,
                  storage_path, mime, title, summary, extracted_text, meta jsonb,
                  status uploaded|extracted|classified|linked, created_at)
embeddings       (id, owner_id, subject_type document|artifact|cluster|knowledge|business|app,
                  subject_id, chunk_ix, content, embedding vector(1536), model, created_at)
                  -- ONE dimension. HNSW cosine index. Learn from theory-thread's sprawl: 1536 only.
memory_events    -- exists as mind_events; do not duplicate
insights         (id, owner_id, kind noticed|connection|drift|opportunity, body, refs jsonb,
                  status new|surfaced|dismissed|actioned)   -- "Garvis noticed…"

-- OUTREACH / CRM (generalized from swift-prep-pros; its schema is the template)
businesses       -- generalize business_profiles: + place_id, website_normalized (dedupe),
                  score, segment, status enum(discovered→enriched→previewed→contacted→replied→won/lost)
contacts         (business_id, name, role, email, email_status, confidence, is_primary)
outreach_campaigns (id, owner_id, kind cold_site_pitch|newsletter|re_nurture, business_id?,
                  world_id?, sequence_state)
outreach_messages (campaign_id, contact_id, sequence_step 0|1|2, subject, body,
                  preview_site_id?, scheduled_for, provider_message_id, status
                  draft|approved|scheduled|sent|bounced|replied, approval_id)
replies          (message_id, raw, classification positive|negative|neutral|auto, at)
suppression      (email/domain, reason bounce|complaint|unsub|manual, at)  -- non-negotiable
-- preview_sites already = "generated_sites"; add business_id FK if missing

-- EXECUTION
approvals        (id, owner_id, kind send_email|publish_post|deploy_site|deploy_backend|
                  spend|apply_migration|crm_action, payload jsonb, preview text,
                  requested_by mission|run|user, status pending|approved|rejected|expired,
                  decided_at, decided_via)
execution_runs   (id, owner_id, approval_id?, connector, action, request jsonb,
                  response jsonb, status ok|failed|retrying, attempt, error, at)

-- VIDEO (lifted, trimmed from traction-engine)
videos           (id, owner_id, campaign_id?, artifact_id?, script, storyboard jsonb,
                  voiceover_url, status)
video_jobs       (video_id, scene_ix, provider sora|runway|luma, request_id, output_url,
                  routed_provider, routing_confidence, cost_cents, status)

-- FILES: project_assets exists; `documents` above covers knowledge files. Don't add a third.
```

**The invariant that keeps it one brain, not silos:** every module writes two things into the
core on every meaningful event — a `mind_events` row (what happened) and, where relevant, an
`embeddings` row (what it means). A scraped business, an uploaded PDF, a built app, a sent
email, and a rabbit-hole artifact all become the same kind of memory. Classification
("where does this belong?") = embed → cosine-match against worlds/clusters/apps → LLM
adjudication with the match set → propose placement (approval-gated at first, auto later),
exactly the theory-thread canonicalization pattern (`mechanism-canonicalize.server.ts`) with
its human-reviewed merge queue.

**pgvector:** yes, needed now. One migration: `create extension vector`, the `embeddings`
table, HNSW cosine index, and a `match_embeddings(owner, query_vec, k, filter)` RPC. Replace
the in-memory path in `src/lib/garvis/embeddings.ts` with an `embed-worker` edge function
(server-side key, batch, write-through).

---

## 5. UX Model — the Tony Stark surface

Four surfaces, one command line, zero dashboard sprawl. Most of this is re-arrangement, not
new construction: `Command.tsx`, the Universe spike pages, Missions/Opportunities, and
ProjectWorkspace already exist. The forge/ember design system (near-black `#0C0E13`, ember
`#FF8A3D`, the smolder/ashRise "breathing coal") is already cinematic — keep it as the Garvis
identity.

```
┌──────────────────────────────────────────────────────────────────┐
│                     "What are we doing today?"                    │
│   ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ⏎  🎙            │
│                                                                  │
│   (dim, alive, behind everything: the Universe graph)            │
│                                                                  │
│   Garvis surfaces, max 3 at once:                                │
│   ● 2 approvals waiting — 14 outreach emails, 1 deploy           │
│   ● "Lakefront inventory dropped 18% — good week for the         │
│      seller campaign" (from Lake Geneva Brief data)              │
│   ● Mission 'CMP outreach batch 3' finished — 2 replies          │
└──────────────────────────────────────────────────────────────────┘
   Command          Universe          Work            Workshop
   (this screen)    (graph: worlds,   (missions, runs, (builder:
   talk → Garvis    clusters, docs,   THE approval     projects, apps,
   routes to a      apps, campaigns;  queue, execution repos, deploys)
   module or        click-through to  log)
   mission)         any object)
```

Rules: navigation is **conversation-first** — typing "work on mom's leads" opens the Mom
world in context, it doesn't make the user find a menu. Every module renders as a *card stack
inside these four surfaces*, never as a new sidebar. The approval queue is the single place
consequences happen, so it is one tap from everywhere. Explorer/rabbit-holing is the Command
surface with the Universe visible; artifacts fall out of the conversation into the graph
without a save button.

---

## 6. Workflow Maps

**A. Build an app** *(mostly built)*
idea (Command) → `draft-plan` blueprint → `generate-app` 11-stage pipeline → preview
(Sandpack/WebContainer) → chat edits (`chat-edit`) → backend deploy (`deploy-backend` /
`provision-supabase`) → **publish (`deploy-site` — wire the stubbed client trigger,
`ProjectWorkspace.tsx:759`)** → `deployments` row + `apps` registration → `mind_events` +
app profile → improvement loop via autopilot with durable plan (roadmap 10a-c).
*Gap to close: client publish trigger; Garvis→autopilot bridge.*

**B. Scrape business → send website** *(the money loop; join of two existing halves)*
discovery worker (Google Places query from `discovery_queries`) → enrich (Firecrawl
contact/brand scrape) → score → POST `/ingest-profile` (exists) → SiteSpec → critique →
refine → audit + before/after screenshots (`shot-worker`, exists) → pitch email drafted
into `outreach_messages` (**new**) → **approvals queue** → send via Resend connector
(**new**) → webhooks: delivery/bounce → `suppression`; reply → `replies` + classification →
positive reply → mission "close this lead" → claim (`claim-submit`, exists) → won → publish
site (`deploy-site`).
*Compliance gates (non-negotiable, all already designed in swift-prep-pros): per-day cap +
warmup ramp in settings; global kill switch; suppression checked at send time; physical
address + functioning unsubscribe in every template; separate sending domain; approval
required per batch until reply-rate data justifies auto-send.*

**C. Mom real estate campaign**
"Get Lake Geneva lakefront sellers" (Command) → Mom world already holds brand/@properties
assets (`documents` + `project_assets`), past campaigns, market data (pull
`real_estate_metrics` + market-report content from Lake Geneva Brief via connector or CSV) →
mission planner decomposes: research (worker exists) → angles/strategy
(`marketing_campaigns`, exists) → assets: postcard copy, landing page (**builder generates
it** — it's just a project), email sequence (`outreach_messages`), social posts
(`marketing_assets`), 30-sec market video (video-worker) → everything lands in the
**approval queue** → approved items execute (Resend send; landing page deploy; postcard PDF
for print; social via composer first, API later) → results tracked (`preview_events`-style
engagement + reply tracking) → follow-up tasks in the CRM lifecycle.
*Manual vs automated at first: generation fully automated; sending email = approval-gated;
social/direct-mail = Garvis prepares, human executes; CRM follow-ups = auto-created tasks.*

**D. Rabbit-hole exploration** *(mostly built)*
curiosity (Command/Explorer) → `explorer-turn` + `research` (Anthropic web search) +
`discover-media` (Perplexity/Serper images/videos) → thoughts become `knowledge_artifacts`
in clusters; edges auto-proposed via embeddings similarity → "Garvis noticed…" `insights`
when a new artifact lands near an old cluster (**new, cheap once pgvector exists**) →
artifact → "make this a project" → blueprint → Workflow A.

**E. App improvement**
repo connected (GitHub, exists) → `get_repo_state` + app profile → uploaded research
(`documents`) auto-linked to the app by embedding proximity → mission: builder worker
produces an implementation plan citing files (exists) → **bridge: plan tasks enqueue real
autopilot edit steps against the imported project (roadmap 10c)** → verify green
(`tsc`/QA = done, 10b) → GitHub export/PR (`github-export`, exists) → deploy → outcome
recorded to `mind_events`.

---

## 7. Integration Plan (exact seams)

1. **swift-prep-pros → Garvis:** port the table shapes (§4) as migration `app_0022`; port
   `outreach.functions.ts` + `followups.server.ts` + the Resend webhook handlers
   (Svix-verified) from TanStack server routes into Deno edge functions `send-email`,
   `outreach-followups` (cron), `resend-webhook`, `resend-inbound`. Keep the CMP instance
   running unchanged until its next campaign, then point its discovery output at
   `/ingest-profile` and retire its send path.
2. **traction-engine → Garvis:** redeploy `ffmpeg-service` under a Garvis-owned Fly app
   (it's self-contained; keep its SSRF allowlist, point `ALLOWED_HOSTNAMES` at the Garvis
   Supabase). Copy `queue-video-smart`, provider queue/poll pairs, and `_shared/{timing-helpers,
   moderation-ladder,cinematic-prompts,provider-health,cost-guard}.ts` into
   `supabase/functions/video-*`. Wire `garvis-short-script` (exists) → storyboard → video-worker.
   Do **not** copy its RLS or expose its patterns.
3. **theory-thread → Garvis:** copy the canonicalization approach (embed → union-find cluster
   → merge proposals → human review → merge events) for knowledge dedup; copy the provenance
   habit (a `*_runs` row for every pipeline execution — that's `execution_runs`). Freeze the app.
4. **Lake Geneva Brief ↔ Garvis:** register as an app; add a tiny authenticated JSON export
   (or reuse its Supabase anon read where RLS-safe) for `real_estate_metrics` + market-report
   summaries into Mom's world; its newsletter/sponsor rails are the distribution channel for
   Mom campaigns.
5. **Repos/GitHub:** already integrated read-only; add per-app "linked documents" via
   embeddings so uploaded research surfaces inside app profiles (Workflow E).
6. **File intake:** `documents` bucket + `ingest-document` edge function (extract via
   mammoth/pdf text → summarize → embed → classify → propose world/cluster placement +
   edges) + drag-drop on the Universe surface.
7. **Email everywhere:** exactly one send path (`send-email` edge fn: approval check →
   suppression check → Resend → `execution_runs` + `mind_events`). Marketing publish,
   outreach, and Mom campaigns all call it. Nothing else may send.

---

## 8. Build Roadmap

*(Phases 1–2 are sequential; 3–5 can interleave; each ends green on `tsc`/`vite build`/
`deno check` + its `.verify.ts` suite, per house style.)*

**Phase 1 — Consolidation & security (1 week)**
Fix `apply-migration` authz (mirror `deploy-backend`'s owner check); kill ptst (archive);
strip real refs from committed config; add CI guard that fails a build containing `VITE_AI_*`;
decide freeze list (below) and stop feature work on frozen repos.
*Accept: deno check green; a non-owner calling apply-migration gets 403; ptst archived.*

**Phase 2 — Persistent brain (1–2 weeks)**
`app_0021` pgvector + `embeddings` + `match_embeddings` RPC; `embed-worker`; `documents` +
`ingest-document`; rewire `src/lib/garvis/embeddings.ts` server-side; Universe upload +
"belongs here?" placement proposals; `insights` ("Garvis noticed…").
*Accept: upload a PDF → summarized, embedded, placed in a world with an approval prompt;
similar-artifact suggestions survive a reload (no longer in-memory).*

**Phase 3 — Execution spine (1 week)**
`approvals` + `execution_runs` (`app_0022`); Approval queue UI on the Work surface; route the
three existing side-effect paths (deploy-site, deploy-backend, marketing publish) through it.
*Accept: nothing outward-facing executes without an approvals row; every connector call logged.*

**Phase 4 — Outreach engine (2 weeks)**
Port swift-prep schema + Resend send/webhooks (`app_0023`); join to preview engine
(`preview_site_id` on messages); sequences cron; suppression enforced in `send-email`;
compliance settings (caps, warmup, kill switch, address/unsub template lint).
*Accept: scraped profile → preview site → drafted pitch → approve → real delivery to a test
domain → bounce lands in suppression → reply lands classified in the CRM.*

**Phase 5 — Mom real estate (1 week, first end-to-end user)**
Seed the world (brand assets, market docs, audiences); campaign template pack (listing,
lakefront-seller, newsletter); landing page via builder; Lake Geneva Brief data feed.
*Accept: "create a lakefront seller campaign" yields strategy + postcard + landing page +
email sequence + social posts in the approval queue in one mission run.*

**Phase 6 — Execution engine hardening (1 week)**
Durable mission plans (10a), done=verified (10b), retry/backoff on `execution_runs`,
notification digests (existing `_shared/notify.ts` webhook).

**Phase 7 — Video (1–2 weeks)**
Mount ffmpeg-service + `video-*` functions; script→storyboard→VO→scenes→assembly as a mission
task type; videos become artifacts reusable in campaigns/emails.

**Phase 8 — Proactive Garvis (1 week)**
Extend the `garvis-worker` tick: overnight digest missions (portfolio liveness, outreach
stats, insight scan over new embeddings, opportunity refresh) surfacing max-3 cards on Command.

**Phase 9 — Productization (later)**
Multi-tenant the outreach engine or the builder (hybrid-db.md S1 shared tier is the design);
un-hardcode `Rnocek14`; Vault secrets (8a) before any external user touches it.

---

## 9. Keep / Kill / Merge / Freeze (brutal version)

- **KEEP & INVEST:** appbuilderpro (the platform — all new work happens here).
- **KEEP RUNNING, SEPARATE:** idea-digester-spark (revenue + Mom-market asset);
  mind-weave-recover (real clinical product; never merge; give it its own focused time or
  find it a steward); credit-optimizer (canonical; pause expansion until Garvis phases 1–5 ship).
- **MERGE (capability, not repo):** swift-prep-pros → Garvis outreach module (repo stays
  alive as the CMP tenant until parity, then becomes a thin scraper feeding `/ingest-profile`).
- **HARVEST THEN FREEZE:** traction-engine (take ffmpeg-service + router + shared libs;
  freeze the dropship/verticals product; do not expose it publicly with current RLS);
  theory-thread (take pgvector/canonicalization/provenance patterns; freeze).
- **FREEZE (decide later):** launch-buddy-bot — it's a genuinely good product with real ops
  maturity, but it's a whole company. Freeze until Garvis is stable; revisit as a business
  decision, not a coding one.
- **KILL:** path-to-success-tracker (archive the repo after skimming its unique demo pages;
  it shares credit-optimizer's production DB, so this is repo hygiene, zero data risk —
  just confirm no Vercel/Netlify deployment still points at it).
- **REBUILD:** nothing. Every needed capability already has a best-of-breed implementation
  somewhere in the nine repos.

---

## 10. Next Sprint (2 weeks, in order)

1. **`apply-migration` authz** — `supabase/functions/apply-migration/index.ts`: add
   `auth.getUser()` + `owns_project` exactly as `deploy-backend` does. Test: non-owner → 403.
2. **Archive ptst** — GitHub: archive `path-to-success-tracker` after checking
   `SkillTreeBuilder.tsx`/`Timeline.tsx`/`Gamification.tsx` for anything wanted; confirm no
   live deployment targets it.
3. **Migration `app_0021_brain_vector.sql`** — `create extension vector`; `embeddings`
   (1536, HNSW cosine); `documents`; `insights`; `match_embeddings` RPC; owner-scoped RLS.
4. **`embed-worker` + `ingest-document` edge functions** — server-side embedding write-through;
   extract/summarize/classify/propose-placement. `deno check` + a `.verify.ts` for the pure
   classification logic.
5. **Rewire `src/lib/garvis/embeddings.ts`** to the RPC (keep lexical fallback).
6. **Universe upload UI** — drag-drop on the spike/Universe surface → document card →
   placement approval.
7. **Migration `app_0022_execution.sql`** — `approvals` + `execution_runs`; ApprovalQueue
   component on Work; route deploy-site/deploy-backend/marketing-publish through it.
8. **Migration `app_0023_outreach.sql`** + `send-email`/`resend-webhook`/`resend-inbound`/
   `outreach-followups` functions ported from swift-prep-pros; suppression enforced in-path;
   Resend domain verified for a dedicated sending domain (not your main one).
9. **Join pitch→message** — PreviewEngine "Send pitch" creates an `outreach_messages` draft
   (with preview link + screenshots) instead of clipboard copy.
10. **End-to-end smoke** — one real scraped business through Workflow B to a test inbox;
    one Mom-world seed + campaign generation through the approval queue.

*Acceptance for the sprint: Garvis can ingest a document into a persistent brain, and can
send one approved, compliant, logged email carrying a generated preview site. That's the
spine of everything else.*

---

## 10a. Sprint 1 — SHIPPED on this branch

The next sprint above (§10) is implemented on `claude/garvis-system-architecture-d4cfog`. What landed:

- **Security (item 1):** `apply-migration` authz was already closed in a prior commit (owner check
  present); verified and noted in `docs/legendary-roadmap.md` (8b marked done).
- **Persistent brain (items 2–5):** migration `app_0021_brain_vector.sql` (pgvector `embeddings`
  vector(1536) + HNSW cosine, `documents`, `insights`, `match_embeddings()` RPC, private `documents`
  storage bucket, owner-scoped RLS). Edge functions `embed-worker` (persist + vectors modes, server-side
  key) and `ingest-document` (summarize → embed → classify → propose a home + "Garvis noticed…"
  insights). Client `src/lib/garvis/embeddings.ts` rewired to call `embed-worker` (key never ships in
  the bundle; DIRECT-mode dev fallback preserved). New surface `src/pages/Brain.tsx` (`/garvis/brain`):
  drag-drop intake, proposal card, insights feed, file-into-world.
- **Execution spine (item 7):** migration `app_0022_execution.sql` (`approvals` = the one queue,
  `execution_runs` = the one ledger). Client `src/lib/garvis/execution.ts` + `src/pages/Approvals.tsx`
  (`/garvis/approvals`). Every outward action routes through an approval; every connector call is logged.
- **Outreach engine (items 8–9):** migration `app_0023_outreach.sql` (outreach_settings with the
  kill switch/cap/warmup/CAN-SPAM gates, contacts, outreach_campaigns, outreach_messages, replies,
  suppression — all owner-scoped, ported/generalized from swift-prep-pros). Edge functions `send-email`
  (THE one send path: approval + suppression + cap + warmup gates → Resend → ledger + mind_event),
  `resend-webhook` (Svix-verified delivery/bounce → suppression), `resend-inbound` (reply → classify →
  stop sequence), `outreach-followups` (cron → drafts → approval, never auto-sends). PreviewEngine's
  pitch is now **"Queue send"** → drafted message + approval (was copy-to-clipboard),
  via `src/lib/garvis/outreach.ts`.

Verified: `tsc --noEmit` clean, `vite build` green, verify suites pass. Not runnable here (no live
Supabase/Resend/embeddings keys): apply the three migrations, deploy the six functions
(`npm run functions:deploy` + `npm run functions:deploy:webhooks`), and set `RESEND_API_KEY` /
`EMBEDDINGS_API_KEY` (or `OPENAI_API_KEY`) / `RESEND_WEBHOOK_SECRET` / `INBOUND_SECRET` / `CRON_SECRET`
as edge secrets to light it up.

## 10b. Phase 5 — Work Webs (SHIPPED on this branch)

The insight that generalizes the whole system: **a mission is not a checklist — it is a living work
web.** A mission is a TERRITORY (a knowledge world). The territory decomposes into PRODUCTION AREAS
(clusters). Each production area is three things at once — a *thought* (it lives in the knowledge
graph), a *workspace* (it has tools), and a *ledger* (its outputs and results accumulate on it).
Diving into "Direct Mail" is not opening a note; it's entering a production area that knows it can
generate a postcard, upload a mailing list, draft a follow-up sequence, and queue a send for approval.

**This is domain-agnostic by construction.** It is not a real-estate feature — real estate is the
first *template*. Seven ARCHETYPES form the deep structure and cover every domain:

| Archetype | What it is for | Example tools |
|---|---|---|
| **Intel** | Knowing — research, strategy, angles | Research this, Synthesize angle, Import docs |
| **Audience** | Who — lists, segments, targets | Upload list (CSV), View contacts |
| **Studio** | Making — copy, creative, scripts, pages | Generate postcard / social / video script / landing / email seq |
| **Launch** | Acting — send, print, publish, deploy | Queue send… (→ Approvals), Open approvals |
| **Loop** | Following up — sequences, CRM, automation | Generate follow-up sequence, Queue to contact |
| **Ledger** | Learning — sent, responses, results, ROI | View results (rolled up from the execution ledger) |
| **Vault** | Holding — brand, assets, source documents | Add to vault (→ Brain) |

Flavors (`direct_mail`, `email`, `social`, `video`, `landing`, `market`, `brand`, `crm`, `lists`)
specialize only *which* concrete tools a Studio/Launch/Loop area shows. **Adding a domain = adding a
template + maybe a flavor row — never a new subsystem.** The App Launch template ships alongside Mom
Real Estate to prove it: the same seven archetypes run a software launch.

**What landed (all verified — `verify:workweb` 33/33, `tsc` clean, `vite build` green):**

- **Model** (`app_0024_work_web.sql`): one `charter` jsonb column on `knowledge_clusters`
  (`{archetype, flavor, status, refs[]}`) — a plain thought and an execution area are the same row,
  so an idea *becomes* a production area without moving. Plus `world_id` bindings on `garvis_missions`
  (a mission is a campaign *through* a territory; the territory persists across missions) and
  `outreach_campaigns` (outreach rolls up to its web's Ledger).
- **Pure core** (`src/lib/garvis/workweb.ts` + `plays.ts`, both `.verify.ts`-guarded): archetypes,
  the `(archetype, flavor) → tools` registry (single source of truth), web TEMPLATES, and PLAYS.
  A play is a deterministic campaign (works with **zero AI keys** — house fail-soft pattern) that AI
  *enriches* when a key exists. The first play, **Lakefront Seller**, is real work:
  research → angle → postcard (2 variants) → 3-touch email sequence → landing outline → 3 social
  posts → 30-second video script — each artifact landing in its correct cluster.
- **Impure runner** (`workwebRun.ts`): `instantiateWeb` (template → world + chartered cluster tree
  via the existing universe sync), `runPlay` (deterministic + AI-enrich, artifacts upserted by slug,
  mission bound to the world), `runTool` (per-area tools; generators write artifacts, `queue-sequence`
  enqueues an **approval**, `upload-list` parses CSV → contacts).
- **UI** (`/garvis/webs`): the gallery + the living web view — production areas as a connected tree
  with live status dots, and a chartered workspace panel (tools row, artifacts, results, approval
  links). Forge/ember design system; "Run the play" fills the whole territory at once.

**Acceptance test (met):** "Create a Lake Geneva lakefront seller campaign" → create the Mom Real
Estate web → Run the play → research + angle + postcard + email sequence + landing + social + video
land in their areas → Queue send from the Direct Mail follow-up area → the email waits in the
**Approval queue** → approving it runs `send-email` → the send hits the **execution ledger**. The
full arc — *research → angle → assets → approval queue → execution log* — runs end to end, and the
same machine runs an app launch or any future territory.

## 11. Constraint compliance notes

Approval-before-send/post/deploy/charge → `approvals` is the single enforcement point.
External actions logged → `execution_runs`. API keys server-side → already the edge-function
pattern; close DIRECT-mode and Vault gaps (roadmap 8a). Modular growth → hub-and-spoke.
Shared living brain → the two-write invariant (`mind_events` + `embeddings`) across every
module. Builder improves Garvis → roadmap 10c bridge; Garvis's own repo is already an `apps`
row away from being managed by itself.
