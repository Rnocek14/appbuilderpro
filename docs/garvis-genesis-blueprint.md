# Garvis Genesis — Substance Layer + New-Project Creation Blueprint

*The audit and implementation plan for the question that decides whether Garvis is an operating
system or a demo collection: can it take "let's build a full business system for my artist
brother," plus uploaded photos, and generate the world, work web, website, lead finder, outreach,
and content system for THAT business — without anyone hand-coding a template?*

*Grounded in a six-auditor code scan (work-web engine, app builder, asset intake, outreach,
video/social, substance layer). Every claim below cites the actual code.*

---

## 1. Executive Verdict

**Can Garvis do the artist-brother test case today? No — it fails at four specific steps.
But the honest surprise of the audit: the distance is far shorter than the question implies.**

The failures, precisely:

| Acceptance step | Today | Blocking seam |
|---|---|---|
| 2-4. Intent → draft world → approve → create | ✗ | `instantiateWeb(templateId)` resolves ONLY against the two hardcoded `WEB_TEMPLATES` (workweb.ts:218-222). Everything downstream of that one lookup accepts any well-formed `WebTemplate` object. |
| 5-6. Upload photos → Garvis sorts them | ✗ | `docExtract` throws on images (docExtract.ts:9-20); zero vision capability anywhere; no batch upload; no cluster-level filing. |
| 7-8. "Build the website" → app builder with his photos | ✗/△ | Motion-portfolio capability EXISTS (motion kit v2 ships in every generated app), and the asset-manifest mechanism EXISTS (`project_assets` + assets.md) — but there is no bridge from a Garvis world's files into a project, and the manifest isn't injected into the *initial* generation (only edits). |
| 9-10. "Find people who want murals" → lead finder | ✗ | The send/track/safety spine is fully vertical-agnostic, but nothing in-repo *finds* prospects (the scraper is external), nothing scores fit, and the pitch prompt hardcodes the web-agency offer. |
| 11-12. Email + Instagram drafts as artifacts | △ | Works mechanically — but with the wrong voice: generators fall back to `DEFAULT_LAKE_GENEVA_CONTEXT` (workwebRun.ts:357), so an art-business web would get Lake Geneva real-estate copy or empty starter docs. |
| 13. Nothing external without approval | ✓ mostly | send-email is hardened and gated. **Gap: workspace deploys (deploy-site/deploy-backend) bypass the approvals queue entirely**; publish_post has no executor (honest — nothing posts). |

**What makes this tractable:** the platform was accidentally built FOR genesis. A `WebTemplate`
is already pure JSON-serializable data. `validateTemplate` already exists (it's just never called
at runtime). `toolsFor` provably never strands any (archetype, flavor) combo. The clustering
engine already has a proven AI-emits-graph-JSON + tolerant-repair machine (`CLUSTER_SYSTEM` +
`normalizeGraph`). The mission planner already parses AI plans with unknown-kind dropping. The
approval spine, studio chat, brand kits, artifact versioning, and world intelligence are all
domain-agnostic and key off charters, not template identity. **Genesis is not a new subsystem —
it is a new SOURCE for structures the system already runs.**

The two real construction projects are: (a) **vision-based asset intake** (images are currently
rejected at the front door), and (b) **data-driven plays** (plays are TypeScript functions today,
so AI can generate a web's structure but not its campaign copy — and the single existing play's
Lake Geneva context leaks into every other world through the fallback path).

---

## 2. Codebase Reality

### Reusable as-is (the genesis chassis)

| Piece | Where | Why it matters |
|---|---|---|
| WebTemplate = pure data | workweb.ts:146-161 | An AI can emit one as JSON today. Fields: id, title, description, playIds, nodes{slug,title,summary,archetype,flavor,children}. |
| validateTemplate | workweb.ts:268-285 | Slug regex, uniqueness, parent-first, tools-nonempty, TOOL_IDS membership, play resolution — the runtime acceptance gate, currently only called from the verify suite. |
| Instantiation below the id lookup | workwebRun.ts:44-105, universe.ts:176-249 | templateToGraph → newUniverse → syncUniverse (upsert by world_id,slug) → persistCharters works for ANY well-formed template object. |
| toolsFor exhaustiveness | workweb.ts:107-140, verified | No (archetype, flavor) combo produces empty tools; unknown studio flavors fall back to gen-copy. |
| AI-emits-structure precedent | clustering.ts:623-689 (CLUSTER_SYSTEM + normalizeGraph), mission.ts:14-70 (planner + parsePlan) | Proven prompt→JSON→tolerant-repair→validate machines to copy, not invent. |
| deletableStaleClusters guard | universeMap.ts, universe.ts:225-232 | Generated webs are durable against explorer syncs. |
| Studio chat + brand kits + cluster files + artifact versions | studioChat.ts, app_0026 | Domain-agnostic per-cluster workspace an artist web inherits with zero new code. |
| Send spine | send-email + app_0023/0025 | Approval CAS, kill switch, caps/warmup, fail-closed suppression, CAN-SPAM, reply classification, contact dedupe — all vertical-agnostic. |
| Asset manifest mechanism | app_0020, useAssets.ts, prompts.ts:172-177 | project_assets + /.fableforge/assets.md rides into all four EDIT paths and is prompt-mandated as first-priority imagery. |
| Motion kit v2 | scaffold.ts:1798-1829 | SmoothScroll/Lenis, ScrollScenes, ScrollSequence, TextReveal ship in EVERY generated app with preview+export parity. A cinematic portfolio needs zero new platform code. |
| Deploy chain | deploy-site/deploy-backend/apply-migration | App-agnostic (Netlify + user Supabase + secrets). |
| match_embeddings + embeddings table | app_0021:69-135 | One polymorphic 1536-dim vector space (owner, subject_type, subject_id, chunk_ix); RPC takes any subject filter. embed-worker PERSIST mode is built and has zero callers — ready-made writer. |
| world_intelligence | app_0027 | An art world gets Living State + heartbeat + reflection for free once events are world-tagged. |
| Preview Engine spec core | previewSpec.ts | Provenance-aware (can_use_in_preview/can_publish), deterministic-floor renderer — a cheap instant-preview tier for any vertical. |
| garvis-short-script | edge fn | Already domain-generic (topic/audience/goal/platform/tone) — would script an artist reel today, text-only. |
| Marketing 3-stage pipeline | marketing.ts, marketingRun.ts | strategy+calendar → posts → email+landing, brief-generic, with deterministic verifyAsset gate. |

### Hardcoded (the exact walls)

1. **`WEB_TEMPLATES` = two compile-time constants** (workweb.ts:170-218); `instantiateWeb` takes a
   string id; template identity is never persisted (listWebs returns templateId: null).
2. **`PLAYS` = one play, and a Play is CODE** — steps carry `produce:(ctx)=>PlayArtifact[]`
   functions (plays.ts:41-50). AI cannot generate a play as JSON.
3. **`PlayContext` is real-estate-shaped** ({town, brokerage, season}) and
   `DEFAULT_LAKE_GENEVA_CONTEXT` is the fallback for every tool run and queued sequence
   (workwebRun.ts:357, 390) — **cross-web contamination**: gen-social in an art world emits Lake
   Geneva copy or an empty starter doc; queue-sequence falls back to the lakefront play.
4. **Images rejected at intake**: docExtract accepts .txt/.md/.docx only, throws otherwise; the
   Brain uploads one file at a time; `AIMessage.content` is typed string-only (_shared/ai.ts:7-10)
   so no edge function can see an image; embeddings are text-only.
5. **Three disconnected asset systems**: documents (brain) vs cluster_files (studios) vs
   project_assets (builds) share no IDs — the same photo needs three uploads to serve
   brain, studio, and website. (Mitigating fact: cluster_files and project_assets already share
   the same public bucket — bridging is a metadata copy, not a data migration.)
6. **Pitch offer hardcoded** to "web agency that builds the website first" (engine.ts:189-207);
   recipes are a closed 11-vertical list (no artist recipe); audit rubric is website-quality-only.
7. **No prospect finder in-repo** — business_profiles arrive only via the external scraper's POST
   (ingest-profile); discover-media/fetch-url are never wired into prospect storage.
8. **Retrieval feeds nothing**: match_embeddings' ONLY caller is ingest-document itself. Studio
   chat, reflection, commander, waking moment — none retrieve. No ranking function exists;
   salience is display-only; knowledge_worlds.mind is written by nothing; insights have no dedupe
   and a dead lifecycle; embed-worker is unmetered.
9. **Approval bypass**: deploys don't route through the approvals queue (only send_email does);
   approveAndExecute no-ops for every other kind without writing a ledger row.

---

## 3. Artist Brother Project Blueprint (the target output of genesis)

**World**: Artist Brother Art Business · **Objective**: Sell artwork, commissions, sculptures,
murals, and custom installations. · **Business context** (new, generic — replaces PlayContext):
`{business_name, principal: "the artist", craft: "sculpture, murals, custom pieces", offerings:
["originals","commissions","murals","installations"], audience: "designers, hotels, collectors,
municipalities", locale, links: {portfolio, instagram}, tone: "warm, confident, visual-first"}`

**The generated web** (every node speaks the existing 7-archetype vocabulary — nothing new):

```
Artist Brother Art Business
├── Brand & Identity            vault/brand      → BrandKitPanel + logo/headshot files
├── Artwork Library             vault/generic    → cluster_files: the photo corpus, captioned + labeled
├── Market & Buyers Intel       intel/market     → research, gen-angle (who buys murals; pricing comps)
├── Website & Portfolio         studio/landing   → gen-landing → app-builder handoff (motion portfolio)
├── Buyer Audience              audience/lists   → contacts CSV + find-leads (new tool)
│   └── Lead Finder             intel/generic    → prospect categories, queries, fit scores
├── Outreach                    launch/email     → queue-sequence (approval-gated) 
│   └── Follow-Up               loop/email       → curated sequence drafts
├── Social Content              studio/social    → gen-social (posts from captioned artwork)
├── Video & Reels               studio/video     → gen-video-script + short-script (reel scripts)
├── Pricing & Offers            intel/generic    → offer sheets, commission tiers
├── CRM & Commissions           loop/crm         → lead status, next touches
└── Results & Sales             ledger/generic   → rollup: sent, replies, inquiries, won
```

Charters: all archetype/flavor pairs above already exist in FLAVORS; the only additions genesis
wants are a `find-leads` tool for audience/intel and (later) a `gen-reel` tool. Play (data-driven,
generated): research brief → 3 positioning angles → 12 caption drafts → 3-touch designer email →
3-touch hotel email → portfolio outline → reel script. First next moves: "Upload his artwork
photos (Artwork Library)", "Save the brand kit", "Approve the draft web", "Run the opening play."
Missing-info questions genesis must ask: portfolio URL? price range? travel radius? existing
Instagram?

---

## 4. Project Genesis Architecture

**Principle: genesis generates DATA that existing validators accept — never new vocabulary.**
The AI may compose worlds only from the 7 archetypes, 10 flavors, and 14 TOOL_IDS that code
already executes. That single constraint is what prevents chaos.

### The flow (draft → review → approve → instantiate)

1. **Intent in** — one text box ("Describe the mission") + optional uploaded context. Runs
   through the cluster-chat seam (credit-metered, kind 'explore').
2. **GENESIS_SYSTEM prompt contract** (strict JSON, same discipline as REFLECT_SYSTEM):

```
in:  user intent + any known context
out: {
  "title": "...", "objective": "...",
  "businessContext": { business_name, craft, offerings[], audience, locale, links{}, tone },
  "template": { "nodes": [ { slug, title, summary, archetype, flavor, children[] } ] },
  "play":     { "steps": [ { targetSlug, artifact:{slug,kind,title}, draft, aiPrompt } ] },
  "intakeRequests": ["photos of finished pieces", "artist bio", ...],
  "questions": ["price range?", ...],
  "firstMoves": ["upload photos", "save brand kit", ...]
}
HARD RULES: archetype ∈ the 7; flavor ∈ the 10; 6–16 nodes; ≥1 vault, ≥1 intel, ≥1 ledger;
launch only if audience exists; every play step's draft must stand alone WITHOUT AI (the
zero-keys floor); never invent facts about the business — unknown → ask in questions.
```

3. **parseGenesis (pure, verified)** — tolerant JSON extraction, then the gauntlet:
   `validateTemplate` (existing) + genesis gates: node-count bounds, archetype-coverage rule,
   slug de-collision (suffix on conflict), flavor coercion warnings surfaced (not silent),
   play steps must target existing slugs, drafts non-empty. Anything failing is dropped with a
   visible note — same evidence discipline as parseReflection.
4. **Draft persisted** to a new `web_templates` table, status `draft`. **Nothing is created yet.**
5. **Review UI** — the draft web rendered as the same tree the WorkWeb page uses (charter dots,
   tool chips per node), plus objective, questions, intake requests. User edits titles/removes
   nodes/answers questions → approve.
6. **Instantiate** — `instantiateWeb` generalized to accept `WebTemplate | string`; the approved
   template writes through the EXISTING path (templateToGraph → syncUniverse → persistCharters,
   now error-checked); `web_templates.world_id` records the binding (fixing templateId:null
   forever); businessContext lands on the world; a mind_event records genesis.
7. **First moves** flow into the waking moment as structural moves ("A draft world awaits your
   review" / "Artwork Library is empty — upload his photos").

### Data-driven plays (the second half of genesis)

New `PlayData` shape: steps are `{targetSlug, artifact{slug,kind,title}, draft, aiPrompt}` —
static draft = the deterministic floor (works with zero AI keys, exactly like today's produce()),
aiPrompt = the enrich pass through the existing `enrich()` seam (workwebRun.ts:255-272).
`runPlayData` executes them with **the world's own businessContext** via a `{{token}}` merge
system. **The Lake Geneva fallback dies**: runTool and queue-sequence resolve context from the
world; a world with no context gets an honest "set the business context first" error, never
another world's copy.

### Quality: how genesis avoids messy generic webs

- The archetype-coverage rule forces real structure (knowing/holding/learning always present).
- validateTemplate + play-target validation reject structural garbage before the user sees it.
- The draft-review step means a human approves every generated structure — genesis PROPOSES,
  the user CHARTERS (same philosophy as approvals: plans free, commitments human).
- Verify tests: golden intents ("artist brother", "food truck", "SaaS launch", nonsense input)
  asserting node bounds, coverage, zero-AI-floor on every play step, no Lake Geneva strings.
- The clarifying-questions channel keeps thin intents from generating invented specifics.

---

## 5. Asset Intake Flow (photos become usable)

1. **Vision seam** — extend `_shared/ai.ts` AIMessage to content blocks (text | image_url/base64)
   for the Anthropic/OpenAI paths; metered like every call. This is ONE seam; every edge function
   inherits it.
2. **Image ingest** — ingest-document accepts image mimes: store in the documents bucket →
   **caption via vision** (subject, style, medium, colors, mood, suggested use: website/social/
   print) → summary=caption → **embed the caption** (text pipeline unchanged) → propose a home.
   Cold-start fix: when kNN finds nothing (new world), a zero-shot LLM proposal against the
   user's world list, and a "create new world from this batch" action.
3. **Batch upload + propose-sort-approve** — Brain accepts N files; a review table shows
   thumbnail, caption, proposed world AND cluster (new `documents.cluster_id`); approve-all
   files them. Approving into a cluster ALSO writes a `cluster_files` row (label, caption) so the
   studio sees it — the bridge between the brain and the studios.
4. **Files become visible to generation** — studio context gains file captions + public URLs
   (today it injects names only, clusterChat.ts:125), so "make a post about the bronze heron"
   actually references the photo.
5. **Derivatives (v1 honest floor)** — record width/height at upload; client-side downscale for a
   web variant; full thumbnail service deferred and stated as such.
6. **Privacy fix that must ship with this**: cluster_files currently land in the PUBLIC
   project-assets bucket — artwork photos are fine public, but lead CSVs are not. Route
   non-image cluster files to a private bucket.

## 6. App Builder Handoff

1. **`buildFromWorld(worldId)`** — compiles a **structured brief** from the world: businessContext
   + brand kit (maps ~1:1 onto the builder's design-direction tokens, NewProject.tsx:94-107) +
   the website-labeled photos (metadata-copied from cluster_files into project_assets — same
   bucket, zero data movement) + page plan from the Website cluster's artifacts. Lands the user in
   NewProject, pre-filled; the brief persists to the project Brain (existing compileBuildBrief
   pattern) so every future edit remembers the world.
2. **Inject assets.md into INITIAL generation** — today only edits see it; the fix is the same
   context-concat chat-edit already does (chat-edit/index.ts:110-113). His photos become real
   `<img>` URLs in the first build, not placeholders.
3. **Motion direction** — the brief names the design direction ("cinematic gallery: SmoothScroll,
   ScrollScenes image reveals, TextReveal statements"); the kits already ship in every app.
4. **Tracking** — creating the project writes an `app` artifact into the Website cluster
   (kind 'app', url → /project/:id), so the web's ledger and the System altitude see the site as
   state; reopening the editor is the existing project workspace.
5. **Leads back into Garvis** — a `lead-submit` edge function (claim-submit's pattern) that
   generated inquiry forms POST to: writes contacts + a mind_event + (optional) campaign, tagged
   world_id. The circle closes: website → lead → CRM cluster → waking moment.
6. **Deploy through approvals** — deploy-site gains the send-email pattern: approval row (kind
   deploy_site exists since app_0022) checked at the executor, ledger row written. Closes the
   audit's bypass finding.

## 7. Outreach / Scrape Flow (project-specific lead finder)

1. **Prospects = business_profiles + world scoping** — add world_id, fit_score, fit_reason,
   status to business_profiles (they already have photos, socials, provenance flags).
2. **`leadFinder.ts` (pure)** — genesis's prospect categories → search-query generation prompt
   (n queries per category) → parse/normalize results; fit-score rubric compiled from the world's
   businessContext ("does this business plausibly want murals/sculpture: wall space, renovation
   signals, design-forward brand, budget signals") with an evidence string per score — derived
   labels, never bare numbers.
3. **Impure loop** (all read-only, metered, capped): discover-media (Serper, arbitrary q) →
   fetch-url (SSRF-guarded text/images) → profile extraction → fit score → store prospect.
   **Scrape-at-scale is approval-gated**: a run over N=25 prospects becomes an approval
   (kind crm_action) before executing.
4. **Personalized pitch, parameterized** — generatePitch's offer comes from businessContext
   (portfolio link + suggested-piece match from captioned artwork embeddings — nearest artwork
   to the prospect's described space), not the hardcoded web-agency prompt. Send path unchanged:
   contacts upsert → queue-sequence → approvals → send-email (all the hardening applies).
5. **CRM** — campaign stages gain `won` setter + deal value; Results cluster rolls up inquiries →
   commissions → revenue.

## 8. Marketing Studio Flow

- **Email**: data-driven play sequences per segment (designers/hotels/galleries), through the
  existing loop/email tools and approval queue.
- **Social**: gen-social reads the world's businessContext + captioned artwork files → caption
  drafts as artifacts; the existing marketing 3-stage pipeline (strategy+calendar → posts →
  email+landing) runs unchanged with the new brief. Publishing stays composer-prefill honest
  until a posting API earns a publish_post executor.
- **Video**: garvis-short-script already scripts a domain-generic reel. Actual rendering is a
  port from traction-engine (per the studios blueprint: video_jobs model + provider adapter +
  the documented security fixes); the interim honest floor is script + shot-list artifacts. No
  fake "video generated" states.
- **Ads/landing**: gen-landing outline → Preview Engine (add one artist/portfolio recipe) for
  instant landing pages; full sites via the app builder.

## 9. Substance Improvements (implementation designs)

**A. Retrieval ranking** — new pure `retrieval.ts`:
`score = similarity × e^(−ageDays/45) × (0.5 + salience/2) × usageBoost(≤1.3)`, every factor from
a real column; returns items with a `whyRanked` evidence string. Impure `retrieveForContext(
worldId, query, k)`: embed-worker texts-mode → match_embeddings → rank → byte-budgeted block.
Consumers, in order: studio chat context (the blueprint promised exactly this and it's unbuilt),
reflection context, genesis (research grounding), waking-moment insight enrichment, build briefs.
Prerequisite: **start embedding artifacts** (embed-worker persist mode — built, zero callers) and
meter embed-worker.

**B. Insight near-duplicate suppression** — (1) structural: `dedupe_key` = hash of sorted ref
subject_ids + kind, UNIQUE(owner_id, dedupe_key); on conflict keep the stronger score, refresh
timestamp ("stronger evidence replaces weaker duplicate"). (2) semantic: add 'insight' to
embed-worker SUBJECT_TYPES; before insert, match_embeddings over existing insights ≥0.85 → merge
instead of insert. (3) lifecycle: surfaced/actioned set by the waking moment + filaments so the
dead states become real.

**C. Why-this-matters at ingest** — after summary/caption, one metered call:
`{whyItMatters, affects: worldId|null, decisionItCouldChange, questionItRaises}` with the
evidence gate (no evidence → dropped). Stored in documents.meta; question appended (capped 5) to
world_intelligence.open_questions; strong connections get REAL insight bodies (replacing the
template string at ingest-document:144-145). Feeds waking moment, heartbeat, filaments.

**D. World summaries** — write `knowledge_worlds.mind` (column exists since app_0018, written by
nothing) in refreshWorldIntelligence: compiled deterministic summary (objective, momentum
w/ evidence, top blockers, newest lesson, connected worlds via filaments). Consumed by commander
context, genesis, and the Universe body tooltips.

**E. Artifact summaries** — `summary text` on knowledge_artifacts; generated (metered, via
cluster-chat) when detail >1k chars, at write time + backfill; studio/reflection contexts use
summary-first instead of blind truncation. Artifacts stop being files and become "what it is,
why it exists, status, next action."

## 10. Data Model Additions (migration `app_0028_genesis.sql`)

```sql
web_templates(id, owner_id, title, description, objective, business_context jsonb,
              template jsonb, play jsonb, source text check (generated|builtin|edited),
              status text check (draft|approved|instantiated|archived),
              world_id uuid null, created_at, updated_at)          -- owner RLS
alter knowledge_worlds    add business_context jsonb;              -- the generic PlayContext
alter documents           add cluster_id uuid null references knowledge_clusters;
alter cluster_files       add caption text, label text;            -- vision output + user label
alter knowledge_artifacts add summary text;
alter insights            add dedupe_key text;  unique(owner_id, dedupe_key);
alter business_profiles   add world_id uuid, fit_score numeric, fit_reason text, status text;
-- embed-worker SUBJECT_TYPES += 'insight', 'file' (code change beside migration)
```

## 11. UI Changes

- **WorkWebs**: "Describe a new mission…" genesis box → draft-web review panel (tree + charter
  chips + questions + intake requests) → Approve & create.
- **Waking Moment**: genesis-draft move ("A draft world awaits review"); intake moves ("Artwork
  Library is empty — upload his photos"); why-this-matters lines on fresh ingests.
- **Brain**: batch drop-zone; propose-sort review table (thumb, caption, world+cluster, approve
  all); image support; search box (embed → match → ranked).
- **Cluster Studio**: photo grid with captions/labels; "use on website" label toggle; artifact
  summaries replacing raw truncation.
- **WorkWeb**: business-context editor (like BrandKitPanel) on the root; "Build the website"
  button on studio/landing clusters → buildFromWorld.
- **System Altitude**: app artifact renders as state on the Website planet (no new visuals).
- **Universe**: nothing new — genesis worlds simply appear as bodies; better filaments come from
  substance fixes. (Per the standing rule: no new visual layers.)
- **App Builder**: "Built from <world>" provenance chip; brief visible in project Brain.

## 12. Next Sprint — exact build order

**Sprint G1 — Genesis core** *(the unlock; everything else compounds on it)*
1. `app_0028_genesis.sql` (above).
2. `src/lib/garvis/genesis.ts` + `genesis.verify.ts` — GENESIS_SYSTEM, parseGenesis, quality
   gates, PlayData type + token merge, businessContext type. (~20 checks: golden intents, floor
   guarantees, no-Lake-Geneva assertion, coverage rules.)
3. `genesisRun.ts` — runGenesis via cluster-chat; draft→web_templates; instantiate generalized
   (`WebTemplate | string`), template binding persisted, persistCharters error-checked.
4. `runPlayData` executor + kill the DEFAULT_LAKE_GENEVA_CONTEXT fallback (honest error instead).
5. WorkWebs genesis UI + waking-moment draft move.
   **Acceptance: steps 1-4 + 11-12 of the test pass (drafts in the artist's own voice).**

**Sprint G2 — Photos** — vision seam in _shared/ai.ts; image ingest + caption + embed; batch
upload + propose-sort-approve; documents.cluster_id bridge → cluster_files; private bucket for
non-image files; why-this-matters at ingest (rides the same new call).
**Acceptance: steps 5-6 pass.**

**Sprint G3 — Website** — buildFromWorld bridge; assets.md into initial generation; app artifact
tracking; lead-submit fn; deploy-site through approvals.
**Acceptance: steps 7-8 pass; leads land in CRM; deploys gated.**

**Sprint G4 — Lead finder** — business_profiles world-scoping; leadFinder.ts + verify; capped,
approval-gated scan loop over discover-media/fetch-url; parameterized pitch with portfolio link +
artwork match; CRM won/deal-value.
**Acceptance: steps 9-10 pass.**

**Sprint G5 — Substance** — retrieval.ts + verify; embed artifacts (persist mode) + meter
embed-worker; insight dedupe (structural + semantic); world summaries (knowledge_worlds.mind);
artifact summaries. **Acceptance: studio chat cites retrieved sources; no duplicate filaments;
every world has a living summary.**

**Sprint G6 — Video port** (after G1-G5): traction-engine harvest per the studios blueprint
(video_jobs model, provider adapter, security fixes); publish_post executor only when a real
posting API lands.

---

## G1 — SHIPPED (with the round's two adopted refinements)

The owner's review reframed G1 correctly — *"teach Garvis how to design businesses, not replace
two hardcoded templates"* — and added two requirements, both now built in:

1. **World DNA precedes structure.** The pipeline is Intent → **DNA** (business synthesis:
   type, revenue model, ideal customers, value proposition, sales cycle, brand personality,
   core assets, growth channels, operational loop, success metrics, constraints) → web
   synthesis grounded in that DNA. The DNA persists on `web_templates.dna` and, after approval,
   on `knowledge_worlds.dna` — everything downstream derives from the same record.
2. **Every structure explains itself.** Each generated area carries a rationale ("why THIS
   business needs it"), every draft states at least one deliberate omission with its reason,
   and the parser flags any area that arrives unexplained — "(no reason given)" is rendered,
   never hidden.

Shipped surface: `app_0028_genesis.sql` (web_templates + world DNA columns, owner RLS);
`genesis.ts` (DNA_SYSTEM + GENESIS_SYSTEM strict-JSON contracts, parseDNA/parseGenesis with the
quality gauntlet — archetype vocabulary enforcement, coverage repair stated loudly, slug
de-collision, zero-AI-keys floor on every play step, 28-check verify incl. the Lake Geneva
contamination guard); `genesisRun.ts` (two-stage synthesis through the metered cluster-chat
seam; drafts only — `approveDraft` is the single instantiation path and stamps the world with
its DNA); `instantiateWeb` generalized to accept runtime templates THROUGH `validateTemplate`;
`persistCharters` now error-checked; **data-driven plays** (`runPlayData`, token-merged with
unknown tokens left visible) and the **fallback kill**: generators and queue-sequence resolve
THE WORLD's own context/play — a genesis world can never receive Lake Geneva copy; a world
without a sequence gets an honest refusal, not a borrowed one. UI: "Start from intent" on Work
Webs with the draft-review panel (DNA chips, per-area why-lines, omissions, questions, intake
requests, remove-node, approve/discard); waking moment gains `draft_waiting` (value 75 — only
humans and approvals outrank a designed world awaiting judgment).

Deferred within G1, honestly: draft editing beyond node removal (regenerate instead); genesis
research grounding via retrieval (lands with G5); intake requests as actionable upload moves
(lands with G2). **Next: G2 — photos.**

## G2 — SHIPPED (photos become understanding)

The intake pipeline the owner specified — upload → vision captions → style/theme detection →
cluster sorting → embeddings → use recommendations → why-this-matters → approval before filing —
is live end to end:

- **completeVision** in _shared/ai.ts: the ONE vision seam (Anthropic content blocks + OpenAI
  data-URI paths, same retry/pricing discipline), inherited by every edge function.
- **ingest-document accepts images**: the client downscales in-browser (max edge 1280, jpeg) and
  sends base64; the original lands untouched in the documents bucket. One metered call returns
  caption, subject, style, medium, colors, mood, themes, suggested_use (website/social/video/
  print), an HONEST quality note (hero-grade / usable / weak — and why), why-this-matters, and
  an open question. The caption becomes the image's text body: summarized-as-caption, embedded
  (caption + themes), and classified through the same kNN proposal as documents. The vision
  prompt's hard rule: describe only what is visible — never invent an artist, title, or price.
- **Why-this-matters for EVERY ingest** (text and image), folded into the existing metered call
  (no extra spend): why_matters + open_question land in documents.meta, and the question feeds
  world_intelligence.open_questions (capped 5) — fresh uploads sharpen tomorrow morning.
- **app_0029**: documents.cluster_id (filing gains area precision) + cluster_files.caption/label.
- **Batch propose-sort-approve** in the Brain: drop N files; images queue in a review table —
  thumbnail, caption, themes, quality note, why-it-matters, proposed world (suggested home
  pre-selected) and production area. Nothing files without approval. Approving into an area
  ALSO writes the cluster_files bridge row, caption + routing label riding along.
- **Studios can finally see**: the studio-chat context now carries file captions ("heron.jpg —
  A bronze heron mid-flight…"), so "write a post about the bronze heron" references the real
  photo instead of a bare filename.

Deferred, stated: image-pixel embeddings (captions embed today — style similarity via CLIP is a
later substance item); derivative generation (width/height + thumbnails); PDF text extraction;
the private bucket for non-image cluster files. **Next: G3 — the website bridge.**

## G3 — SHIPPED (the website bridge: real artwork into the first build)

"Build a motion-transition portfolio website from these photos" now works end to end:

- **compileWebsiteBrief** (pure, 12-check verify): ONE brief from everything the world knows —
  DNA (customers/personality/sales cycle shape the design), brand kit (palette/fonts/voice/
  compliance), the MOTION DIRECTION naming the real kits (SmoothScroll, ScrollScenes reveals,
  TextReveal), pages (gallery/story/commissions/contact), the LEAD FORM contract (stores
  inquiries, never sends — outbound stays behind the approval queue), and THE ARTWORK: every
  uploaded photo's public URL with its vision caption as alt text, hero candidates from the
  website-labeled photos, and the explicit rule "use ONLY these images; no stock, no
  placeholders." Unknown facts are omitted, never invented; a photo-less world gets marked
  image slots, still no stock.
- **buildFromWorld → the app builder**: the brief rides the proven constellation handoff into
  the FIRST generation (prompt + planContext), so the initial build — not just edits — uses the
  real artwork. The "Build the website" button lives on studio/landing areas in the web.
- **bindProjectToWorld** after creation: photos metadata-copied into project_assets (source
  'world' — same public bucket, zero data movement), the assets.md manifest written so every
  future edit keeps them first-priority, projects.world_id stamped (app_0030), an 'app'
  artifact recorded in the originating cluster (the world tracks its own website as state), and
  a mind event on the record.
- **Approvals honesty for non-email kinds**: approving a deploy_site/publish_post now writes an
  execution_runs ledger row stating plainly "decision recorded — no server executor for this
  kind yet" (deploys need the built files, which exist only in the project workspace). The
  approved-but-not-executed state is visible, never silent; full deploy-through-approval
  enforcement lands when the workspace deploy path checks the approved row.

Deferred, stated: workspace deploy-button enforcement; the lead-submit → Garvis-CRM edge
function (generated forms store in the app's own backend today); generic asset-manifest
injection into initial generation for NON-world projects. **Next: G4 — the lead finder.**

## The revised roadmap (adopted) — from builder to operator

The owner's post-G3 review names the last major leap: the pipeline is solved (Intent → DNA →
Genesis → Web → Photos → Website), but an OPERATING SYSTEM never ends at build. The loop is
UNDERSTAND → BUILD → OPERATE → OBSERVE → LEARN → IMPROVE → REBUILD → UNDERSTAND. A world should
behave like a company: wake, learn, adapt, recommend. Adopted, with one standing constraint:

**The operating loop is only as honest as its instruments.** "The hero isn't getting clicks"
requires click rows; "carousel #3 performs best" requires post metrics. Garvis already has the
LEARN half (evidence-gated reflection, implications, heartbeat, momentum); the OBSERVE half for
websites and content does not exist yet. G5 therefore BEGINS with instrumentation — site events
from generated apps (lead-form submits, section views), campaign metrics by segment — and no
adaptive recommendation ships ahead of the rows it stands on.

Revised order:
- **G4 — Market Intelligence** (broader than Lead Finder): target customers, competitors,
  pricing, trends, buying signals, content opportunities, SEO/search demand, partnerships —
  compiled from the DNA into research runs over the existing rails (discover-media, fetch-url,
  business_profiles), landing as evidenced intel artifacts + world-scoped prospects with fit
  scores. Research closes the loop: Explore ↔ Market Intel ↔ World Intelligence ↔ Lead Finder
  ↔ website changes ↔ campaigns ↔ the morning briefing.
- **G5 — Adaptive Operation**: instrumentation first (site events, per-segment campaign
  metrics), then the improvement loop — "homepage gets visits but few inquiries → test another
  hero → generate v2 → approve → deploy"; every campaign teaches the next; reflection consumes
  the new signals. The world evolves; nothing external moves without approval.
- **G6 — Retrieval + knowledge quality** (the former G5 substance items).
- **G7 — Video Studio** (traction-engine port).

**Shipped with this adoption — the World Intelligence Dashboard** (the "biggest missing
object"): an Intelligence view on every web — State now (momentum + blockers/risks with
evidence), What we learned (reflection lessons + implications, evidence attached, honestly
empty until a reflection has run), What Garvis recommends + what's still unknown. Every line is
a persisted row; the working/failing-by-the-numbers panel states plainly that it waits for G5
instrumentation rather than guessing.

## G4 v1 — SHIPPED (Market Intelligence: reasoning before searching)

"Who is likely to benefit from this business?" is answered the honest way:
- **The research plan derives DETERMINISTICALLY from the World DNA** — one scan segment per
  ideal customer, queries woven from customers × offerings × locale. Same DNA, same plan; no
  model call, nothing invented. A world without DNA gets an empty plan and the panel says why.
- **Scans are read-only and capped** (2 queries, 8 stored prospects per scan) through the
  existing metered rails: discover-media/Serper finds; prospects land as rows (app_0032, owner
  RLS, unique per world+url so re-scans never duplicate).
- **Fit is an evidence-labeled verdict, never a score**: one batched cluster-chat judgment per
  scan returns strong/possible/weak with a reason grounded ONLY in the search snippet + the DNA;
  a labeled fit without a reason is dropped by the parser; unjudged prospects stay visibly
  "unknown". (marketIntel.ts, 9-check verify.)
- **The finder lives in every audience area**: segment scan buttons, the prospect list with fit
  chips + reasons, qualify/drop triage. Contacting anyone still requires moving them into
  contacts and through the approval spine — stated in the panel itself.
Deferred to G4 v2: fetch-url page-deep profiling, portfolio-matched pitch angles, trend
questions feeding world_intelligence, scan runs >25 prospects behind an approval.

## Vertical intelligence — SHIPPED (the system knows the INDUSTRY, not just the craft)

The expertise packs closed the blank-world problem functionally; this layer closes it
DOMAIN-wise. "Build a real estate plan for my mom" and "a finance research world" must not
receive the same generic marketing knowledge — they don't anymore:
- **Deterministic industry detection** (verticals.ts, 24-check verify): the World DNA's own
  words (businessType, value proposition, ideal customers, name/craft/offerings) map to one of
  14 verticals — real estate, finance, creative, food, e-commerce, professional services,
  health, home services, education, tech/SaaS, events, nonprofit, retail, generic. Keyword-
  scored, no model call: same world, same vertical, every time. No match → 'generic', stated
  honestly (the generic brief is a checklist of open questions, not a fake industry).
- **Researched domain packs compose over the functional base**: every seeded area gets
  base craft + industry overlay. Real estate arrives with the CMA method (comps/adjustments/
  absorption), geographic farming math, and the Fair Housing checklist (verified against HUD's
  digital-platform guidance: targeting ad DISTRIBUTION by protected class is illegal). Finance
  arrives with the due-diligence ladder, thesis-memo structure, macro dashboard, and the SEC
  Marketing Rule flags (testimonial disclosures at dissemination, gross-with-net performance —
  per the Dec-2025 exam risk alert). Food gets menu engineering + the review/regulars loop;
  e-commerce gets the flow stack + product-page anatomy + FTC review rules; health gets HIPAA
  marketing rules; SaaS gets positioning teardowns + the activation loop; nonprofits get grant
  research (990 mining) + donor retention — and so on, each with domain KPIs in the ledger.
- **Every studio flavor now has a dedicated pack**: brand (messaging house + identity
  checklist), market (the cited market-update format), crm (call/VM/DM scripts + objection
  grid), lists (consent-ranked list building + hygiene) joined social/mail/email/video/landing.
  Nothing falls back to a vague stub.
- **Same honesty spine**: overlays are labeled frameworks; every number defers to MLS/Fed/BLS/
  POS/scans/records; compliance content names the rule, not a vibe. Slugs never collide with
  base packs (verified), so upserts stay idempotent.

## Expertise packs — SHIPPED (the blank-world problem, closed)

The test: "build a real estate marketing plan for my mom" must arrive WITH the plans — a social
area with a real 30-day plan, a direct-mail area with a campaign plan and postcard concepts, a
market-comparison area with the comparison framework — not empty rooms the user has to fill by
searching. Now it does:
- **Domain expertise is data** (expertise.ts, 8-check verify): every archetype × flavor resolves
  to a non-empty expert pack — 30-day social rhythm + post archetypes, direct-mail 40/40/20 plan
  + 3 postcard concepts, cold/nurture/post-inquiry email cadences, video formats, landing-page
  structure, market comparison matrix + research checklist, audience segmentation worksheet,
  pipeline stages, KPI tree, launch checklist, vault checklist. Deterministic — zero AI keys
  needed; verified exhaustively (every combination, 300+ chars of real structure each).
- **Worlds are born full**: instantiateWeb seeds every chartered area with its pack (seedWorld,
  fail-soft, idempotent upsert). Genesis worlds seed in their OWN voice (approveDraft passes the
  business context through); builtin templates seed with a minimal voice — the title fills
  {{business_name}} and every unknown token stays visible, marking exactly what Garvis doesn't
  know yet.
- **Generators stopped stubbing**: a generator tool with no matching play step now writes the
  area's expert playbook instead of a "starting point" sentence.
- **Honesty is in the packs themselves**: every seed is labeled a framework, and wherever a
  number belongs the text says to fill it from a Market Intelligence scan or the user's records
  — Garvis never invents figures. The frameworks are expert structure; the DATA still comes from
  scans, uploads, and results rows.

## Final principle, restated as an invariant

Genesis generates **data that existing validators accept** — new worlds speak the same seven
archetypes, run the same tools, queue into the same one approval spine, and light the same sky.
Intent → World → Work Web → Studios → Assets → App/Marketing/Outreach → Approval → Execution →
Learning, with no step that only works for templates we hand-imagined. That is the operating
system.
