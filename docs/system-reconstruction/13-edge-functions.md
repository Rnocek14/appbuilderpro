# 13 — Supabase Edge Functions

> System-reconstruction chapter covering **every** edge function under `supabase/functions/` (67 function
> directories + `_shared`), their triggers, data flows, external services, AI prompts, implementation status,
> and the scheduled "heartbeat" architecture that drives the autonomous (Garvis) side of the product.
>
> Sources read: all `supabase/functions/*/index.ts`, all `supabase/functions/_shared/*.ts`,
> `package.json` deploy scripts, `.github/workflows/deploy-supabase.yml`, and the pg_cron arming
> migrations (`app_0087`, `app_0088`, `app_0096`). **No `supabase/config.toml` exists in this repo** —
> scheduling is done in-database via pg_cron (see §2), not via config-file cron.

---

## 1. Runtime & deployment model

- Runtime: Deno edge functions (`Deno.serve`), import map in `supabase/functions/deno.json`
  (`@supabase/supabase-js` via `npm:` specifier, `nodeModulesDir: "none"`, `unstable: ["sloppy-imports"]`).
- **Two deploy groups** (package.json):
  - `npm run functions:deploy` — 45 functions deployed **with JWT verification** (callable with a user JWT
    or the anon key): generate-app, chat-edit, garvis-brain, garvis-short-script, explorer-turn,
    discover-media, fetch-url, ingest-profile, claim-submit, automation-intake, publish-preview,
    client-checkout, connect-domain, discover-run, generate-video, shot-worker, embed-worker,
    ingest-document, send-email, send-sms, cluster-chat, ads-sync, render-video, render-design,
    board-copy, deploy-site, deploy-backend, job-worker, agent-turn, draft-plan, research, connections,
    create-checkout, customer-portal, oauth, github-export, provision-supabase, db-console,
    apply-migration, project-logs, docusign-send, mls-sync, social-publish, generate-image, system-control.
  - `npm run functions:deploy:webhooks` — 20 functions deployed **`--no-verify-jwt`** (externally reachable;
    each carries its own auth: worker/cron secret, provider signature, or capability token):
    resend-webhook, resend-inbound, outreach-followups, site-events, garvis-pulse, garvis-worker,
    ads-watch, outreach-reactivate, inbox-draft, garvis-scorecard, invoice-chase, standing-worker,
    social-sync, garvis-consolidate, garvis-canary, stripe-webhook, unsubscribe, ai-gateway,
    docusign-webhook, voice-inbound.
  - **Gap:** `booking` and `sender-domain` appear in **neither** npm deploy list (nor in the workflow's
    curated "hot"/"worker" lists) — they must be deployed manually per their header comments. `booking`
    is a public customer-facing API; if deployed with default JWT verification it is callable with the
    anon key, which is how the public booking page reaches it.
- CI/CD: `.github/workflows/deploy-supabase.yml` deploys a curated "hot path" set on every run
  (board-copy, generate-image, render-design, discover-media, fetch-url, ingest-profile, send-email,
  send-sms, social-publish, discover-run, generate-video, publish-preview, client-checkout,
  connect-domain + the no-verify-jwt worker set inbox-draft, standing-worker, resend-webhook,
  resend-inbound, social-sync, garvis-scorecard, voice-inbound), and in `mode=full` runs both npm deploy
  lists. It then syncs repo secrets into function secrets, optionally **arms the heartbeat** (§2), and
  verifies with OPTIONS probes + key-table existence checks (`standing_orders`, `discovered_businesses`,
  `prospect_audits`, `automation_triggers`, `client_subscriptions`, `preview_sites`).
  If no `WORKER_SECRET` repo secret exists, the workflow **self-provisions one** (`openssl rand -hex 24`)
  and sets it as both `WORKER_SECRET` and `CRON_SECRET` so both ends of the gate match atomically.

## 2. The heartbeat — scheduling architecture (no config.toml; pg_cron + vault)

Scheduling lives **in the database**: migration-defined function `public.garvis_arm_heartbeat(base_url,
secret)` (latest version in `supabase/migrations/app_0096_canary_tick.sql`) stores the functions base URL
and the shared secret in Supabase **Vault** (`ff_heartbeat_base`, `ff_heartbeat_secret`) and
`cron.schedule`s **12 pg_cron jobs** that `net.http_post` the edge functions with headers
`x-worker-secret` **and** `x-cron-secret` (same value under both names since app_0092, so a drifted
`CRON_SECRET` can no longer silently 401 jobs into pg_net):

| pg_cron job | Schedule (UTC) | Target function | Cadence |
|---|---|---|---|
| `garvis-worker-tick` | `*/5 * * * *` | `garvis-worker` | every 5 min — drain queued `agent_runs` |
| `garvis-standing-tick` | `*/15 * * * *` | `standing-worker` | every 15 min — execute due standing orders |
| `garvis-pulse-hourly` | `7 * * * *` | `garvis-pulse` | hourly — morning brief in each owner's 7–9am local window |
| `garvis-canary-nightly` | `30 8 * * *` | `garvis-canary` | nightly — live-wiring self-test |
| `garvis-ads-watch-daily` | `15 10 * * *` | `ads-watch` | daily — ad-spend anomaly watchdog |
| `garvis-inbox-draft-daily` | `45 12 * * *` | `inbox-draft` | daily — overnight reply drafts |
| `garvis-followups-daily` | `0 13 * * *` | `outreach-followups` | daily — follow-up cadence |
| `garvis-invoice-chase-daily` | `30 13 * * *` | `invoice-chase` | daily — invoice chase ladder |
| `garvis-social-sync` | `20 */6 * * *` | `social-sync` | every 6 h — social metrics read-back |
| `garvis-scorecard-weekly` | `0 22 * * 0` | `garvis-scorecard` | Sunday evening — EOS-style weekly scorecard |
| `garvis-consolidate-weekly` | `0 8 * * 1` | `garvis-consolidate` | Monday — memory→lessons consolidation |
| `garvis-reactivate-monthly` | `0 14 1 * *` | `outreach-reactivate` | monthly — dormant-contact reactivation |

Supporting pieces:

- **`_shared/cronGate.ts`** — one auth gate for clock-driven functions: accepts `x-cron-secret` ==
  `CRON_SECRET` **or** `x-worker-secret` == `WORKER_SECRET`, compared constant-time
  (`timingSafeEqual`). Several older cron functions (e.g. garvis-pulse) still check
  `x-worker-secret` directly.
- **`_shared/heartbeat.ts`** — `stampHeartbeat(admin, job)` upserts `system_heartbeat(job,
  last_tick_at)` on every real tick, fire-and-forget, so the UI can honestly show whether the clock is
  ticking ("the readiness audit's worst finding: an unarmed heartbeat kills every scheduled feature
  SILENTLY").
- **`system-control`** — operator panel backend: `status` reports which secrets are set (presence
  booleans only), cron jobs scheduled (`garvis_cron_status()`), and latest `system_heartbeat` stamps;
  `arm` calls `garvis_arm_heartbeat` from inside the platform.
- Arming paths: GitHub workflow "Arm heartbeat" step (management-API SQL call), or the in-app
  `system-control` `arm` action.
- The heartbeat functions are deployed `--no-verify-jwt` because pg_net posts carry no Supabase JWT —
  the shared secret *is* the auth.

## 3. Index — all functions

Trigger legend: **FE** = HTTP invoke from the frontend with user JWT (`supabase.functions.invoke`);
**PUB** = anon/public HTTP (anon key or capability token, no user session); **CRON** = pg_cron heartbeat
(x-worker-secret / x-cron-secret); **WH** = external provider webhook; **INT** = invoked by another edge
function (service-role / worker secret).

| Function | Trigger | Purpose | Status |
|---|---|---|---|
| ads-sync | FE + INT (ads-watch) | Read-only ad-platform metrics sync (Meta + Google Ads) into `ad_metrics` | Implemented (real APIs; operator-level tokens) |
| ads-watch | CRON daily | 2am ad watchdog: refresh via ads-sync, judge yesterday vs 7-day baseline, notify owner | Implemented |
| agent-turn | FE | Authenticated proxy for one Anthropic model call in the browser agentic build loop | Implemented |
| ai-gateway | PUB (per-app key) | Managed AI gateway for *generated* apps; meters cost against owner credits | Implemented |
| apply-migration | FE | Applies generated SQL migration to user's Supabase project via Management API | Implemented |
| automation-intake | PUB | Public demo form "how do you run your business" → matched automations + hot lead | Implemented |
| board-copy | FE | The one LLM call behind creative-board copywriting (honest [EDIT:] holes) | Implemented |
| booking | PUB | Public booking API: availability + book (DB exclusion constraint against double-booking) | Implemented; **not in any deploy list** |
| chat-edit | FE (SSE) | Conversational app editing; streams model output, applies file changes server-side | Implemented |
| claim-submit | PUB | "Claim this website" form on public previews → publish_request + owner webhook notify | Implemented |
| client-checkout | PUB | "Make it mine": pending client_subscriptions row + operator's Stripe Payment Link | Implemented |
| cluster-chat | FE | Cluster Studio chat decision seam (no state/tools; can only emit proposals) | Implemented |
| connect-domain | FE | Point a client's existing domain at their Netlify-hosted site (DNS records + status) | Implemented |
| connections | FE | Connections hub: list/connect/test/disconnect provider connections (tokens sealed) | Implemented |
| create-checkout | FE | Stripe Checkout session: Pro subscription or credit top-up | Implemented |
| customer-portal | FE | Stripe customer portal session | Implemented |
| db-console | FE | In-app DB viewer for the user's provisioned project (Management API + user OAuth token) | Implemented |
| deploy-backend | FE | Deploys generated edge functions + secrets to the user's Supabase project | Implemented |
| deploy-site | FE | Publishes built static site (dist/) to Netlify, returns live URL | Implemented |
| discover-media | FE | Server-side Perplexity + Serper proxy for Explorer, credit-metered | Implemented |
| discover-run | FE | Business discovery: Claude web_search scout (citation-grounded) or Google Places engine | Implemented |
| docusign-send | FE | The one e-signature send path (approval-gated, atomic double-send claim) + status poll | Implemented |
| docusign-webhook | WH (DocuSign Connect) | Envelope status receiver; HMAC verified, fails closed | Implemented |
| draft-plan | FE | Cold-start plan mode: propose pages/features/files before generating | Implemented |
| embed-worker | FE | Persist embeddings for subjects into `public.embeddings` (service-role write side) | Implemented |
| explorer-turn | FE | Metered chokepoint for all Explorer/Knowledge-Universe model calls | Implemented |
| fetch-url | FE + INT (standing-worker) | Hardened SSRF-safe page reader + asset harvester for chat/link context | Implemented |
| garvis-brain | FE | Stateless Garvis reasoning seam — decides next move for the client-side runtime | Implemented |
| garvis-canary | CRON nightly | Nightly live-wiring self-test incl. negative test that the send gate refuses | Implemented |
| garvis-consolidate | CRON weekly | Reads mind_events, proposes LESSONS into garvis_knowledge (approval-gated) | Implemented |
| garvis-pulse | CRON hourly | Morning brief 7–9am owner-local: leads/replies/approvals/reminders/stalled arcs/calendar | Implemented |
| garvis-scorecard | CRON weekly | Sunday scorecard: week-vs-week leading indicators pushed to owner webhook | Implemented |
| garvis-short-script | FE | Pure LLM short-form video *script* drafting (fidelity: 'script_only') | Implemented |
| garvis-worker | CRON 5-min + FE nudge | Unattended runner for queued agent_runs; self-chains while work remains | Implemented |
| generate-app | FE | Full server-side app generation pipeline (scaffold → blueprint → files → QA self-heal) | Implemented |
| generate-image | FE | OpenAI gpt-image-1 image generation into project-assets (+ cluster_files row) | Implemented |
| generate-video | FE | Veo 3.1 scene generation: start → poll → store → approve (`scroll_scenes`) | Implemented |
| github-export | FE | Export project source snapshot to a GitHub repo via Git Data API | Implemented |
| inbox-draft | CRON daily | Overnight reply drafts for positive replies, staged as pending approvals | Implemented |
| ingest-document | FE | Document intake: summarize, persist, embed, classify by cosine proximity (proposal-only) | Implemented |
| ingest-profile | PUB (ingest token) | Funnel front door: external scraper POSTs BusinessProfile → live preview + report URL | Implemented |
| invoice-chase | CRON daily | Chase ladder for unpaid invoices (upcoming→due→firm→final), approval-gated | Implemented |
| job-worker | FE + self-chain | Autopilot worker: claims a job, executes one phase step, checkpoints, re-invokes itself | Implemented |
| mls-sync | FE | RESO Web API (OData) MLS client: save/probe token, incremental sync into mls_listings | Implemented |
| oauth | FE | OAuth connect flow (PKCE + CSRF state) for provider integrations | Implemented |
| outreach-followups | CRON daily | Follow-up cadence: due bumps + "opened 3+ silent" pass → approvals only | Implemented |
| outreach-reactivate | CRON monthly | Reactivation sweep for 60–365-day dormant contacts → draft + pending approval | Implemented |
| project-logs | FE | Edge-function logs for a user's app via Management API analytics (SQL templates server-side) | Implemented |
| provision-supabase | FE | One-click per-app Supabase project provisioning (idempotent, resumable) | Implemented |
| publish-preview | FE + INT (stripe-webhook) | Go Live: host rendered preview HTML on Netlify; re-publish on paid upgrade | Implemented |
| render-design | FE | Server-side satori→SVG→resvg→PNG render of brand-card designs into project-assets | Implemented |
| render-video | FE | Shotstack render seam: edit JSON → mp4 (render + status modes; honest degradation) | Implemented |
| research | FE | Deep research: full-source analysis + Anthropic web_search cited comparison | Implemented |
| resend-inbound | WH (inbound email) | Records prospect replies, AI-classifies sentiment, stops sequences | Implemented |
| resend-webhook | WH (Resend/Svix) | Delivery-status events → message/campaign status + suppression list | Implemented |
| send-email | FE + INT (workers) | THE one email send path: approval-verified, all gates re-checked, Resend send, ledger | Implemented |
| send-sms | FE + INT (workers) | THE one SMS send path (Twilio), TCPA consent + kill switch + caps, fails closed | Implemented |
| sender-domain | FE | Per-brand sending domains via Resend (SPF/DKIM/DMARC records + verification) | Implemented; **not in any deploy list** |
| shot-worker | FE | Server-side screenshots (preview email-shot + prospect's current site) via ScreenshotOne-compatible API | Implemented |
| site-events | PUB (site channel token) + INT→send-email | Instrumentation ingest for generated sites (write-only capability token) | Implemented |
| social-publish | FE + INT (standing-worker) | THE social publish path: approval-spine + payload hash + Ayrshare | Implemented |
| social-sync | CRON 6h + FE | Read-back of per-post social analytics into social_post_metrics | Implemented |
| standing-worker | CRON 15-min + FE "Run now" | The clock's hands: executes standing orders (watch_url, digests, autopilot pipeline…) | Implemented (largest function, 2,375 lines) |
| stripe-webhook | WH (Stripe) | Signature-verified billing events; idempotent; re-fetch state; triggers re-publish | Implemented |
| system-control | FE (+ worker secret) | Master switch panel: secret presence, cron status, heartbeat stamps; arm heartbeat | Implemented |
| unsubscribe | PUB | RFC 8058 one-click opt-out; message-UUID capability; GET (human) + POST (provider) | Implemented |
| voice-inbound | WH (Twilio Voice) | Missed-call text-back: TwiML ring-through + dial-status callback → SMS | Implemented |

*(Per-function detail in §4–§9; `_shared` in §10; call graph §11; secrets §12; findings §13.)*

Cross-cutting conventions used by nearly every function:

- **Admin client** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) for privileged DB work; a second anon-key
  client with the forwarded `Authorization` header resolves the calling user (`authClient.auth.getUser()`).
- **"THE ONE SEND PATH" / approval spine** — nothing sends email/SMS, posts to social, e-signs, or deploys
  without an owned, **approved** `approvals` row (`kind` = `send_email` / `send_sms` / `publish_post` /
  `send_for_signature` / `deploy_site` / `deploy_backend`), re-verified server-side at execution time with a
  SHA-256 **payload hash** tamper check (`_shared/payloadHash.ts`) and an **atomic double-send claim** (CAS on
  `result->>..._claimed_at`). Cron drafters only *stage* pending approvals; **earned autonomy**
  (`autonomy_grants`, per-owner per-action-class, daily-capped, fail-closed via `_shared/autonomyGate.ts`)
  is the only way a draft auto-approves — and then still executes through the same send path.
- **Ledgers/spines**: `execution_runs` (immutable send/skip/fail audit), `mind_events` (the operator's
  realtime "waking moment" feed), `system_heartbeat` (cron liveness), `usage_events` + credit RPCs
  (`refresh_credits`/`spend_credits` via `_shared/credits.ts`; insufficient → HTTP 402).
- **Honest degradation** — a missing provider key returns `{available:false, setup:[...]}` (or skips work),
  never fake success. Placeholder holes (`[YOU FILL: …]`, `[EDIT: …]`) are an intentional honesty mechanism
  in drafts; send-email/send-sms refuse (422) to send anything still containing one.

---

## 4. App generation & editing (FableForge builder)

### 4.1 generate-app
- **Purpose**: the server-side full-app generation pipeline ("provider keys never reach the browser").
  11 stages: `interpret → blueprint → schema → file_tree → frontend → backend → auth_logic → styling →
  validate → fix → summarize`. Seeds the fixed Vite+TS scaffold + UI kit (`_shared/scaffold.ts`), generates a
  blueprint (design bundle + structured integrations), a Supabase migration, a per-app palette
  (`_shared/themePresets.ts`), app source via the `§FILE` streaming protocol, integration edge functions + a
  secret manifest, then **self-heals** against static QA (`_shared/qa.ts` `validateProject`).
- **Trigger**: FE JWT. Returns `{ generationId }` immediately; pipeline runs detached, progress polled from
  `project_generations`.
- **Inputs/outputs**: `{ projectId, prompt, planContext? }` → `{ generationId }` (402 on insufficient credits).
- **Tables**: `projects`, `project_generations`, `app_blueprints`, `project_files` (upsert on
  `project_id,path`), `ai_messages`, `error_logs`, `mind_events`, `audit_logs`, `profiles`; credit RPCs.
- **External/env**: AI provider via `_shared/ai.ts` (`AI_PROVIDER`/`AI_MODEL`/`AI_FREE_MODEL` + provider key).
- **AI**: `modelForPlan(plan)` (default `claude-sonnet-4-6`; free tier `claude-haiku-4-5-20251001`).
  Prompts from `_shared/prompts.ts`: `GENERATE_SYSTEM` ("*You are FableForge's code generation engine… STYLE
  WITH TOKENS, NEVER HARDCODED COLORS*"), `blueprintPrompt` ("*COMMIT to one complete visual identity… the
  safe clean-SaaS look is the CONVERGED AI aesthetic*"), `SCHEMA_SYSTEM` (one migration, RLS + four owner
  policies on every table), `GENERATE_FILES_STREAM` (§FILE protocol, 32k tokens), `EDIT_SYSTEM_STREAM`
  (QA repair pass).
- **Status**: fully implemented; no stubs (the `placeholder.supabase.co` string is part of the *generated
  child app's* template, not this function's behavior).
- **Calls**: none.

### 4.2 draft-plan
- **Purpose**: cold-start plan mode — proposes what a new app will be (summary, steps, fileHints, options,
  openQuestions) for approval **before** generating files; the approved plan feeds generate-app as `planContext`.
- **Trigger**: FE JWT. `{ prompt }` → `{ plan }` (no streaming).
- **Tables**: `profiles` + credit RPCs (`plan` kind) only.
- **AI**: `modelForPlan`, inline `GENERATE_PLAN_SYSTEM`: "*You are FableForge's planning assistant… Propose a
  short, concrete plan for what you'll build — do NOT write code. Be opinionated and specific.*"
- **Status**: fully implemented. **Calls**: none (data-flow only into generate-app).

### 4.3 chat-edit
- **Purpose**: conversational editing ("add a dashboard", "fix the error"). Streams the model over **SSE**
  so the UI renders work as it lands, then applies file changes server-side and records the explanation.
- **Trigger**: FE JWT. `{ projectId, message, previewError?, planFirst? }` → SSE `data:{"t":delta}` frames +
  terminal frame (`ask` / `discuss` / `plan` / `edit` with changed/deleted lists).
- **Tables**: `projects`, `project_files` (upsert/soft-delete; `/.fableforge/brain.md` + `assets.md` injected
  as context, not editable), `ai_messages` (last 8 as history), `project_generations`, `error_logs`,
  `profiles`; credit RPCs.
- **AI**: `modelForPlan`, `completeStream` 16k tokens, system = `EDIT_SYSTEM_STREAM` from `_shared/prompts.ts`
  ("*You are FableForge's editing assistant… you collaborate like a thoughtful pair programmer — confident
  changes when intent is clear, ask first when it genuinely is not*"; §ACTION/§FILE/§DELETE protocol).
  Context budgeted by `_shared/context.ts` (~160k chars); truncation guard `looksTruncated`.
- **Status**: fully implemented. **Calls**: none.

### 4.4 agent-turn
- **Purpose**: thin authenticated proxy for ONE Anthropic model call in the **client-side agentic build
  loop** — the tool loop (read_file/write_file/run_typecheck) runs in the browser/WebContainer; each model
  turn relays through here so the key stays server-side. Forwards messages + tools (including Anthropic's
  server-side `web_search`) and returns the **raw Anthropic response**.
- **Trigger**: FE JWT (POST only). `{ system?, messages, tools?, maxTokens?, fast? }` → raw
  `/v1/messages` JSON. `max_tokens` clamped 1024–16000; `fast:true` forces the cheap tier.
- **Tables**: `profiles` + credit RPCs (`agent` kind per turn).
- **External/env**: **Anthropic direct** (`api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`),
  `ANTHROPIC_API_KEY` (does not use the multi-provider seam). No system prompt of its own (caller-supplied —
  `AGENT_BUILD_SYSTEM` lives in `_shared/prompts.ts` and ships from the client).
- **Status**: fully implemented; Anthropic-only. **Calls**: none.

### 4.5 job-worker
- **Purpose**: the Autopilot build worker. Each invocation claims ONE `jobs` row and executes ONE phase step
  (`decompose → per-milestone build/validate/fix → report`), checkpointing to the job row after every step so
  runs survive crashes and edge time limits; **self-chains** (re-invokes itself, `MAX_CHAIN=25`) while work
  remains; a cron tick or an app ping keeps the queue draining.
- **Trigger**: FE JWT nudge, `x-worker-secret`, service-role bearer, or self-chain POST. RPC `claim_next_job`.
- **Tables**: `jobs`, `job_milestones`, `project_files`, `project_memory`, `agent_questions`, `projects`,
  `profiles`, `ai_messages`, `error_logs`; credit RPCs (`agent`).
- **AI**: `modelForPlan`; five system prompts: `DECOMPOSE_SYSTEM` ("*Decompose the brief into 2-6 concrete
  build milestones, each shippable and verifiable on its own*"), `BUILD_SYSTEM` ("*working unattended on one
  milestone… If something is ambiguous, make the reasonable choice and record it as a decision — do NOT
  stall*"), `VALIDATE_SYSTEM` (syntax/imports/loading-empty-error states/responsiveness), `FIX_SYSTEM`
  ("*Fix EXACTLY the listed problems with minimal targeted changes*"), `REPORT_SYSTEM` ("*the overnight build
  report a developer reads with coffee*").
- **Status**: fully implemented. **Calls**: **job-worker → job-worker** (self-chain via
  `${SUPABASE_URL}/functions/v1/job-worker`, `EdgeRuntime.waitUntil`).

## 5. Deployment & cloud plumbing (Lovable-Cloud parity)

### 5.1 publish-preview
- **Purpose**: "GO LIVE" — publish a `preview_sites` demo as a real hosted static site on **Netlify**. The
  operator's browser renders the finished single `index.html` (CSS DOM-inlined client-side); this uploads it,
  binds the Netlify site to the preview, records `live_url`, re-hosts scraped external images into own
  storage (SHA-1 dedup, SSRF-safe, ≤5MB each), and stashes the HTML for later re-publish.
- **Trigger**: dual — operator FE JWT (sends `html`) **or** stripe-webhook via `x-worker-secret` (sends no
  html; re-publishes the stashed copy → 422 if none). `{ previewSiteId, html?, customDomain? }` →
  `{ ok, siteId, url, state:'ready'|'building', customDomain }` (honest `building` if not live in the poll window).
- **Tables/storage**: `preview_sites` (never downgrades a SOLD status), `execution_runs`; bucket
  **project-assets** (re-hosted images + stashed HTML at `publishedHtmlPath`).
- **External/env**: Netlify API (`NETLIFY_AUTH_TOKEN`), `WORKER_SECRET`. No AI.
- **Status**: fully implemented. **Called by**: stripe-webhook.

### 5.2 deploy-site
- **Purpose**: one-click hosting of a generated app's built `dist/` bundle to Netlify. Build happens
  client-side (WebContainer); this only uploads (token stays server-side).
- **Trigger**: FE JWT + **approval spine**: `{ approval_id }` only — project/bundle/site/token all come from
  the approved `deploy_site` payload (request-supplied files/ids deliberately ignored). Payload-hash tamper
  check, per-approval idempotency (`{ok, replayed:true}`), expiring single-flight claim.
- **Tables**: `approvals`, `projects` (`netlify_site_id` binding), `deploy_bundles` (files as b64+sha1),
  `execution_runs`.
- **External/env**: Netlify deploy API (digest → upload required files → poll); `NETLIFY_AUTH_TOKEN` as
  fallback (prefers the user's own token from the approval payload). No AI.
- **Status**: fully implemented, hardened (audit note H3: foreign site-id overwrite guard). **Calls**: none.

### 5.3 deploy-backend
- **Purpose**: **the most privileged action in the system** — deploys a generated project's backend into the
  *user's own* Supabase project via the Management API: sets Function Secrets, deploys each generated edge
  function (multipart bundleless deploy), injects managed-AI secrets (`FABLEFORGE_AI_KEY` +
  `FABLEFORGE_AI_URL` pointing at this platform's **ai-gateway**), and when an `automation-runner` function
  ships, wires an every-minute **pg_cron tick in the child project** (pg_cron + pg_net + Vault SQL) hitting
  `https://{child-ref}.supabase.co/functions/v1/automation-runner`.
- **Trigger**: FE JWT + approval spine (`deploy_backend` approval; confused-deputy guard — target comes only
  from the approved payload). `{ approval_id }` → `{ ok, results[] }` (207 on partial).
- **Tables**: `approvals`, `projects` (incl. `ai_gateway_key` — generated here if absent), `execution_runs`,
  `provider_connections` (via `projectSupabaseToken`).
- **External/env**: Supabase Management API (`api.supabase.com/v1/projects/{ref}`: secrets, functions
  deploy, api-keys reveal, database/query). Tokens: `FF_PLATFORM_MANAGEMENT_TOKEN` (managed) / user's
  Supabase OAuth token / `SB_MANAGEMENT_TOKEN`. No AI.
- **Status**: fully implemented (trigger-pinned ref columns per migration app_0057). **Calls**: none directly,
  but *provisions* the generated-app → **ai-gateway** dependency.

### 5.4 provision-supabase
- **Purpose**: one-click "Set up database" (Lovable-style per-app provisioning): create (or reuse) a Supabase
  project in the user's org — or in **FableForge Cloud's platform org** for managed apps — fetch URL + anon
  key, write the app's `/.env`, apply the generated migration. Idempotent + resumable (polls ~50s; returns
  `{status:'provisioning'}` for the client to re-call).
- **Trigger**: FE JWT. `{ projectId, region? }` → `{ ok, status:'ready', ref, url, migrated, managed }` /
  `{ status:'provisioning' }` / 402 on managed-DB plan caps.
- **Tables**: `projects` (`supabase_project_ref`, `supabase_managed`), `profiles` (plan caps),
  `project_files` (`/.env`, `/supabase/migrations/0001_init.sql`), `provider_connections`.
- **External/env**: Supabase Management API (orgs, create project `nano`, health poll, api-keys,
  database/query). Env: `FF_PLATFORM_MANAGEMENT_TOKEN`, `FF_PLATFORM_ORG_ID`, `FF_PRO_MANAGED_LIMIT` (50),
  `FF_FREE_MANAGED_LIMIT` (2), `SB_MANAGEMENT_TOKEN`. No AI.
- **Status**: fully implemented. **Calls**: none (applies migration inline, does not invoke apply-migration).

### 5.5 apply-migration
- **Purpose**: applies a generated SQL migration to the user's Supabase project via the Management API —
  exists because the browser cannot call `api.supabase.com` (no CORS) and must never hold the PAT.
- **Trigger**: FE JWT; `{ projectId, sql }` → `{ ok, result }`. Project ref derived from the **owned row**,
  never the caller (deep-scan P0 fix). Ledgered in `execution_runs`.
- **Tables**: `projects`, `execution_runs`, `provider_connections`. **Env**: management tokens. No AI.
- **Status**: fully implemented. **Calls**: none.

### 5.6 db-console
- **Purpose**: in-app database viewer/editor for the user's provisioned project (Lovable Cloud parity):
  `tables` / `rows` / `query` (arbitrary SQL) plus `secrets_list/secret_set/secret_delete`, `auth_users`,
  `storage_buckets/objects`, `functions_list`, `backups_list`, `update/insert/delete` (identifier/literal
  escaping via `ident`/`lit`).
- **Trigger**: FE JWT, owner-guarded. **Tables (platform)**: `projects`, `provider_connections`; operates on
  the *child* DB via Management API `database/query`. No AI.
- **Status**: fully implemented. **Calls**: none.

### 5.7 project-logs
- **Purpose**: in-app edge-function logs for a user's app — proxies the Management API analytics (Logflare)
  endpoint with **server-side SQL templates** (client picks a KIND — `invocations`/`console`/`errors` —
  never sends SQL); 24h window cap; microsecond timestamps normalized.
- **Trigger**: FE JWT. `{ projectId, kind?, functionSlug?, sinceIso? }` → `{ rows, kind }`.
- **Tables**: `projects`, `provider_connections`. No AI. **Status**: fully implemented. **Calls**: none.

### 5.8 github-export
- **Purpose**: export a project's source snapshot to a real GitHub repo (create-or-update) via the Git Data
  API (blobs → tree → commit → ref move).
- **Trigger**: FE JWT, owner check. `{ projectId, repo, files[], githubToken? }` → `{ ok, url, owner, repo,
  branch, files }`. Token priority: connected GitHub OAuth (`freshProviderToken`) → request token →
  `GITHUB_TOKEN` env.
- **Tables**: `projects`, `provider_connections`. No AI. **Status**: fully implemented. **Calls**: none.

### 5.9 connect-domain
- **Purpose**: migrate a client's **existing domain** onto their hosted site by pointing DNS at Netlify (no
  transfer; web records only — **never MX**, so email is untouched). Sets custom domain, nudges SSL, returns
  the exact registrar records + live status via real `Deno.resolveDns` verification.
- **Trigger**: FE JWT; caller must own `preview_sites` row; site must already be live.
  `{ previewSiteId, domain, action:'connect'|'status' }` → `{ ok, records, dnsVerified, sslActive, … }`.
- **Tables**: `preview_sites` (`custom_domain`). **Env**: `NETLIFY_AUTH_TOKEN`. No AI.
- **Status**: fully implemented. **Calls**: none.

### 5.10 connections
- **Purpose**: connections-hub backend: `list` / `connect` / `test` / `disconnect` provider connections.
  Tokens live in `provider_connections` (service-role only) and are **never returned to the browser** (`list`
  returns provider/label/expiry only). Providers: supabase, github, netlify, vercel, docusign, ayrshare.
  `connect`/`test` live-probe the token (`_shared/connections.ts` `probeProvider`).
- **Trigger**: FE JWT. **Tables**: `provider_connections`. No AI. **Status**: fully implemented. **Calls**: none.

### 5.11 oauth
- **Purpose**: OAuth connect flow (PKCE + CSRF state): `start` → provider authorize URL; `exchange` → swap
  code (+ stored verifier) for tokens, store the connection. 15-minute state TTL. Providers configured in
  `_shared/oauth.ts`: **supabase** (PKCE, scope `all`), **github** (scope `repo`), **docusign** (basic token
  auth, scope `signature`, sandbox `account-d.docusign.com` by default).
- **Trigger**: FE JWT. **Tables**: `oauth_states`, `provider_connections`.
- **Env**: `SB_OAUTH_CLIENT_ID/_SECRET`, `GITHUB_OAUTH_CLIENT_ID/_SECRET`, `DOCUSIGN_OAUTH_CLIENT_ID/_SECRET`,
  `DOCUSIGN_AUTH_BASE`. No AI. **Status**: fully implemented. **Calls**: none.

*Sections 6–13 follow.*
