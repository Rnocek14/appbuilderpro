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

## 6. Garvis core & heartbeat workers

### 6.1 garvis-brain
- **Purpose**: the Garvis "reasoning seam" — one **stateless** decision step inside the client runtime's
  execution loop (`src/lib/garvis/runtime.ts`). No state, no tool execution, no DB beyond auth+credits: given
  `mode` (`observe`/`plan`/`act`), `task`, `history`, and the already mode-gated tool list, it returns the
  single next move.
- **Trigger**: FE JWT. Input `{ mode, task, history, tools, context }` → one of `{kind:'tools',calls[]}` /
  `{kind:'finish',output,recommendation}` / `{kind:'await_approval',question,options}` + `costUsd`.
  Unparseable model output fails soft to a `finish` with the raw text.
- **Tables**: `profiles` (plan) + credit RPCs (`garvis` kind).
- **AI**: `modelForPlan`, 1500 tokens. SYSTEM prompt (product intent, verbatim): "*You are Garvis — the
  reasoning core of a personal AI operating system that manages a solo founder's PRODUCTS (apps + their
  metrics) AND their BUSINESS WORLDS… You are not a chatbot; you are one decision step inside an execution
  loop. The loop owns control flow, safety, and budget… THE GATE IS ABSOLUTE: you may ONLY call tools present
  in the AVAILABLE TOOLS list… Never invent apps, revenue, or metrics.*"
- **Status**: fully implemented (thin by design). **Calls**: none.

### 6.2 garvis-worker
- **Purpose**: the **unattended** server-side Garvis runner — the counterpart of the client chassis, so queued
  `agent_runs` execute with every laptop closed. Claims runnable runs across all owners (cron) or one exact
  owner-scoped run (signed-in nudge); steps the same observe/plan/act loop with mode-gated tools re-applied
  each step, per-step checkpoints, per-owner credit metering, hard budget cap (default $0.50), transient-error
  retry with exponential backoff (`MAX_RETRIES=3`), `MAX_STEPS=12`, 2 runs per invocation.
- **Trigger**: CRON every 5 min (`garvis-worker-tick`) / worker-secret POST / FE JWT nudge (`{run_id}`).
  `--no-verify-jwt`; auth via `cronAuthorized` or user JWT (owner-scoped claim RPC).
- **Tables**: RPCs `claim_next_agent_run_service` / `claim_agent_run` / `claim_next_agent_run`; `agent_runs`
  (status/phase/checkpoint/spend/lease/retry), `mind_events`, `profiles`; tool executor touches `apps`,
  `app_metrics`, `garvis_app_profiles`, `garvis_knowledge`, `garvis_goals`, `garvis_capabilities`.
  Heartbeat stamp `garvis-worker-tick` on real cron ticks.
- **AI**: `modelForPlan`, 1500 tokens; SYSTEM prompt **byte-aligned with garvis-brain** (brain = foreground,
  worker = background). Server tool registry: `list_apps, get_app, query_metrics, recent_runs,
  get_repo_state` (public GitHub API), `get_app_profile, recall_knowledge, log_decision, record_outcome,
  generate_short_script` (inline compressed scriptwriter prompt), `list_goals, list_capabilities,
  propose_goal, register_capability, propose_recommendation, update_app, enqueue_run`. All proposals insert
  `status:'proposed'` (human approval).
- **Status**: fully implemented. **Calls**: **garvis-worker → garvis-worker** (self-chain while queue
  non-empty); external: `api.github.com`.

### 6.3 standing-worker — "THE CLOCK'S HANDS" (2,375 lines; the system's largest function)
- **Purpose**: executes due `standing_orders` on the 15-minute heartbeat and on demand ("Run now"), **and**
  runs the outward-execution drains that turn *approved* records into real sends/posts. Honesty rule: orders
  only READ and RECORD; anything outward goes through approvals.
- **Trigger**: CRON `*/15` (`garvis-standing-tick`) / worker-secret or service-role POST (all owners) / FE
  JWT (own orders only). On-demand bodies: `{order_id}` (force-run one), `{pitch_lead_id, review?}`
  (foreground build-&-send for one prospect). Output `{ ok, ran, changed, failed }`.
- **Order kinds** (dispatch on `standing_orders.kind`):
  - `watch_url` — SSRF-safe fetch + verified `_shared/standingCore.ts` `decideWatch` (a failed fetch is
    UNREACHABLE never "no change"; first sight is a baseline never a fake "change"; markup noise ignored);
    real change → deduped `mind_events` + webhook, new `last_hash`/`last_text` baseline.
  - `opportunity_hunt` — scheduled Serper sweeps → SSRF-safe page fetches (Serper rendered-scrape fallback) →
    ONE batched model extraction bound to a fetched-URL allowlist → dedupe-insert `opportunities`;
    self-tuning query-variant rotation after repeated dry runs.
  - `client_hunt` — self-contained daily prospecting: Google Places discovery into `discovered_businesses`
    (market-exhaustion tracking in `discovery_queries`), then up to `demoQuota` demo builds
    (scrape via fetch-url → AI intelligence chain → `preview_sites`) and a PENDING cold-pitch approval
    (no-website prospects first).
  - `idea_stream` — N grounded ideas appended as tiles to a world's Idea Board
    (`knowledge_clusters.working_state.boards.idea`); existing titles are a do-not-repeat list.
  - `content_week` — draft N social posts + 1 email grounded only in the business's facts, judge each with
    the shared editor rubric (**fail-closed**), persist `content_weeks`, stage ONE `content_week` approval
    hash-bound to the exact pieces+scores.
  - `cadence_digest` — deterministic weekly "what actually happened" digest per world (row counts, no model
    call; a quiet week honestly says quiet).
- **Worker-tick drains/sweeps** (before the order loop, worker auth only): timed `reminders` firing;
  booking reminders (day-before, via transactional `bookingNotify`); **arc wake sweep** (flip
  `orchestrator_plans` `waiting`→`ready` when machine-checkable blockers clear, app_0095); **arc advance**
  (execute purely mechanical arc steps server-side — SERVER_ACTIONS registry: `hunt_opportunities,
  watch_page, cadence_digest, start_idea_stream, start_client_hunt, start_content_week, record_thesis,
  add_reminder, add_contact, create_invoice, mount_room, check_master_switch` — stopping at the first
  creative step); **bulk send drain** (approved `outreach_batches` a slice per tick through **send-email**,
  per-recipient gates re-checked, claim-first + stale-claim sweep); **social post drain** (approved
  `social_posts` through **social-publish**); **client automation triggers** (`automation_triggers` →
  `trigger_fires` ledger → PENDING send_email/send_sms approvals; consent-gated `warm_transactional`);
  **content-week drain** (double hash check, social pieces → `social_posts` + pre-authorized `publish_post`
  approvals, email piece → `outreach_batches`).
- **Tables** (exhaustive): `standing_orders, mind_events, profiles, reminders, appointments, booking_pages,
  outreach_settings, orchestrator_plans, knowledge_worlds, knowledge_clusters, knowledge_artifacts,
  outreach_batches, outreach_messages, outreach_campaigns, approvals, social_posts, automation_triggers,
  customer_lists, customers, trigger_fires, contacts, client_subscriptions, content_weeks, brand_kits,
  opportunities, discovery_queries, discovered_businesses, business_profiles, preview_sites, invoices,
  world_rooms, garvis_knowledge` + storage bucket `project-assets` + heartbeat stamp `standing-worker`.
- **External/env**: Google Places (`GOOGLE_PLACES_API_KEY`), Serper (`SERPER_API_KEY`), OpenAI images
  `gpt-image-1` (`OPENAI_API_KEY`; concept art labeled `ai_generated, can_publish:false`), ScreenshotOne
  (`SCREENSHOT_API_KEY`/`SCREENSHOT_API_URL`), Resend/Twilio via bookingNotify, `APP_ORIGIN`,
  `AI_PREMIUM_MODEL`, `BESPOKE_DEMOS`, `WORKER_SECRET`. Budgets: ≤20 orders/tick, per-path time budgets
  (55–100s).
- **AI prompts** (the intelligence chain encodes the product):
  - hunt extraction `EXTRACT_SYSTEM`: "*You extract real, currently-open OPPORTUNITIES… source_url must be
    one of the given PAGE urls, verbatim. Never construct or guess a deeper link.*"
  - idea_stream: "*HONESTY IS ABSOLUTE… If the idea would fit any business, it is wrong.*"
  - content_week writer/judge from `_shared/copyJudge.ts` (see §10.14) + one-shot revision prompt.
  - demo build chain (strategist → art director → simulated owner → refine): `STRATEGY_SYSTEM` ("*senior
    marketing strategist at an elite local-business agency… never invent facts, awards, or claims*"),
    `SPEC_SYSTEM` ("*art director and conversion copywriter… produce a WEBSITE SPEC as JSON… You never write
    HTML/CSS/code… Never invent reviews, ratings, years in business*"), `CRITIQUE_SYSTEM` ("*You ARE the
    owner of this business — busy, skeptical… Would you pay $299 to publish it?*"), `BESPOKE_SYSTEM`
    ("*senior web designer at a boutique studio… a single, bespoke, conversion-focused landing page… NOT a
    template*", output gated by `bespokeHonest` which discards HTML asserting ungrounded claims).
- **Status**: fully implemented; every missing key degrades to an explicit `last_result` line, and a failed
  chain falls back to the deterministic template spec with a `build_log` explaining why.
- **Calls**: **standing-worker → send-email**, **→ social-publish**, **→ fetch-url** (all with
  `x-worker-secret` + service-role bearer).

### 6.4 garvis-pulse
- **Purpose**: THE MORNING BRIEF — hourly cron; for each owner with a notification webhook, if it's 7–9am in
  **their** timezone and they weren't briefed today and something real happened, push a digest: new leads,
  instantly-answered leads, replies, pending approvals, due reminders, arcs parked `waiting` >1 day, and
  today's calendar events read from the operator's own ICS feed (`_shared/icsCore.ts`). "A quiet night sends
  NOTHING… This function never acts outward — it only tells the OWNER what's waiting."
- **Trigger**: CRON hourly (:07). `--no-verify-jwt`; raw `x-worker-secret` check (not cronGate).
- **Tables**: `profiles` (webhook_url, last_pulse_at, calendar_ics_url), `outreach_settings` (timezone),
  `leads`, `replies`, `approvals`, `reminders`, `orchestrator_plans`; writes `profiles.last_pulse_at`,
  `mind_events` (source `pulse`); heartbeat `garvis-pulse`.
- **External/env**: `notifyText` webhook (Discord/Slack aware), `safeFetch` of the ICS URL; `WORKER_SECRET`.
  No AI. **Status**: fully implemented. **Calls**: none.

### 6.5 garvis-scorecard
- **Purpose**: THE SUNDAY SCORECARD — EOS-style weekly review over two fixed 7-day windows (this week vs
  last): revenue collected, overdue invoices, leads, instant touches, site visits, replies, emails sent, new
  contacts, ad spend, pending approvals; per-business breakdown when ≥2 worlds had activity. Arrows on real
  arithmetic only; an empty fortnight sends nothing.
- **Trigger**: CRON weekly (Sun 22:00 UTC). `--no-verify-jwt`; `cronAuthorized`.
- **Tables**: `profiles, leads, site_events, replies, outreach_messages, contacts, approvals, invoices,
  ad_metrics, knowledge_worlds`; writes `mind_events` (source `scorecard`); heartbeat
  `garvis-scorecard-weekly`. `notifyText` webhook. No AI.
- **Status**: fully implemented. **Calls**: none.

### 6.6 garvis-consolidate
- **Purpose**: THE CONSOLIDATION LOOP — "the missing edge that turns memory into judgment." Weekly, per
  owner: reads recent `mind_events` (≥15 required, ≤120 used), asks the model for ≤3 candidate **LESSONS
  grounded only in what actually happened** (each must cite 2+ verbatim event subjects), files them as
  **PROPOSED** `garvis_knowledge` (human approval gate); approved lessons already flow into agent runs and
  builder edits via the knowledge digest.
- **Trigger**: CRON weekly (Mon 08:00). `--no-verify-jwt`; raw `x-worker-secret` check.
- **Tables**: `mind_events` (read + consolidation marker), `garvis_knowledge` (dedupe vs existing titles;
  insert `status:'proposed'`, source `consolidation`); heartbeat `garvis-consolidate`.
- **AI**: `complete()` default model, 1200 tokens. SYSTEM: "*You distill a personal operating system's event
  log into durable LESSONS for its one operator… every lesson MUST cite 2+ verbatim event subjects as
  evidence. Never invent numbers, causes, or events. If nothing actually recurs or teaches anything, return
  [].*"
- **Status**: fully implemented. **Calls**: none.

### 6.7 garvis-canary
- **Purpose**: THE NIGHTLY CANARY — proves the **deployed** system's live wiring on the clock (vs. the 96 CI
  verify suites that test logic): (1) catalog + `parsePlan` gauntlet behave in-runtime; (2) outbound
  networking via `safeFetch` → example.com; (3) DB round-trip (insert/select/delete on `mind_events`);
  (4) **the send gate REFUSES** a fabricated approval id ("a 2xx here would be the worst possible news");
  (5) heartbeat stamps fresh (>26h = stale). Silent when green; failures → one `mind_events` line per owner +
  webhook nudge.
- **Trigger**: CRON nightly (08:30). `--no-verify-jwt`; `cronAuthorized`.
- **Tables**: `profiles`, `mind_events`, `system_heartbeat` (read + stamp `garvis-canary`). No AI.
- **Status**: fully implemented. **Calls**: **garvis-canary → send-email** (negative probe, expects non-2xx).

### 6.8 garvis-short-script
- **Purpose**: pure-LLM Garvis capability: draft a short-form video **script** (text only, marked
  `fidelity:'script_only'`, `required_approval:true`) — explicitly does NOT render/publish; "when real
  rendering/assets/social accounts are involved, THAT capability will live in Traction Engine."
- **Trigger**: FE JWT. `{ topic, audience?, goal?, source_material?, tone?, platform?, length? }` →
  `{ hook, script, caption, cta, visual_beats[], confidence, fidelity, required_approval, costUsd }`.
- **Tables**: `profiles` + credit RPCs (`short_script`).
- **AI**: `modelForPlan`, 1800 tokens. SYSTEM: "*You are a senior short-form video scriptwriter. You produce
  a SCRIPT ONLY — you do NOT render video, generate audio, or publish anything, and you must never imply that
  you did… earns attention in the first 2 seconds.*"
- **Status**: fully implemented (deliberately scoped). **Calls**: none.

### 6.9 system-control
- **Purpose**: THE MASTER SWITCH PANEL — "is the brain actually on?" `status` → which edge secrets are SET
  (presence booleans only, values never leave the server), which garvis cron jobs are scheduled (RPC
  `garvis_cron_status()`), latest `system_heartbeat` stamps. `arm` → RPC
  `garvis_arm_heartbeat(functions_base, worker_secret)`. `probe_places` → live Google Places key check.
  Its SECRETS presence map is the authoritative integration inventory (see §12).
- **Trigger**: FE JWT (single-operator platform: any authed user is the operator).
- **Tables/RPCs**: `garvis_arm_heartbeat`, `garvis_cron_status`, `system_heartbeat`. No AI.
- **Status**: fully implemented. **Calls**: none.

### 6.10 cluster-chat
- **Purpose**: the Cluster Studio chat's reasoning seam (docs/garvis-studios-blueprint.md §11) — mirrors
  garvis-brain: **no state, no tool execution; it only DECIDES**. Client compiles studio context, sends it
  with the message, and executes the returned decision through owner-scoped paths. "Structural safety: the
  only outward-facing verb this can emit is a PROPOSAL into the approval queue — it cannot send."
- **Trigger**: FE JWT. `{ system, context?, history?, message, format?:'decision'|'raw' }` →
  `{ text, costUsd }` (client parses via `parseStudioDecision`). Caps: system/context 12k chars, message 4k.
- **Tables**: `profiles` + credit RPCs (`explore`). **AI**: `modelForPlan`, 2500 tokens; system prompt
  supplied by the client (`STUDIO_SYSTEM` lives client-side with the pure core).
- **Status**: fully implemented. **Calls**: none.

### 6.11 explorer-turn
- **Purpose**: the metered chokepoint for **every** Explorer / Knowledge-Universe model call (overview,
  currents, think-out-loud, mind, bridge, investigate) — replaces the old browser-direct user-pasted-key
  pattern; meters each turn as the `explore` credit kind.
- **Trigger**: FE JWT. `{ messages, maxTokens?≤4000, stream?, fast? }` → `{ text, inputTokens, outputTokens,
  costUsd }` or SSE stream. No built-in system prompt (caller supplies).
- **Tables**: `profiles` + credit RPCs. **AI**: `modelForPlan` (`fast` → free tier).
- **Status**: fully implemented. **Calls**: none.

## 7. Outreach, comms & CRM

### 7.1 send-email — THE ONE SEND PATH
- **Purpose**: the sole email egress. Takes an approved `approvals` row (`kind='send_email'`) whose payload
  references an `outreach_messages` row, **re-checks every safety gate at send time**, sends via Resend,
  writes `execution_runs` + `mind_events`. "Sending outside an approval is impossible."
- **Trigger**: dual-caller, JWT-verified deploy: owner FE JWT, or worker `x-worker-secret` allowed **only**
  for approvals stamped `requested_by='garvis-auto'` (owner derived from the approval row). Payload-hash
  tamper check (null hash grandfathered).
- **Gates**: atomic double-send claim (CAS on `result->>send_claimed_at`); **placeholder gate** (422 on
  literal `[YOU FILL]`/`[EDIT]`); suppression list (fail-closed — blocks on lookup error); per-brand sender
  identity (`world_sender_identities`); warmup ramp + timezone-aware daily cap (`outreach_settings`);
  CAN-SPAM footer; RFC 8058 one-click `List-Unsubscribe` headers pointing at **unsubscribe**.
- **I/O**: `{ approval_id }` → `{ ok, resend_id, sent_at }` / 422 gate block / 502 provider error.
- **Tables**: reads `approvals, outreach_messages, outreach_settings, outreach_batches, contacts,
  world_sender_identities, suppression, outreach_campaigns`; writes `approvals, outreach_messages,
  execution_runs, preview_sites` (preview→emailed), `outreach_campaigns`, `mind_events`.
- **External/env**: Resend (`api.resend.com/emails`); `RESEND_API_KEY`, `WORKER_SECRET`. No AI.
- **Status**: fully implemented. **Called by**: standing-worker, site-events, autonomyGate (all four cron
  drafters), garvis-canary (negative probe).

### 7.2 send-sms — the SMS twin
- **Purpose/trigger**: same approval spine (`kind='send_sms'`, channel `sms`), dual-caller; sends via Twilio.
- **Gates**: SMS kill switch (`outreach_settings.sms_enabled`, **off by default**), valid E.164, non-empty
  body, placeholder gate, **TCPA consent fails CLOSED**, not-unsubscribed, SMS daily cap; per-client FROM
  routing (`resolveSmsFrom`).
- **Tables**: `approvals, outreach_messages, outreach_settings, contacts, execution_runs`.
- **External/env**: Twilio Messages API; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
  `WORKER_SECRET`. No AI. **Status**: fully implemented. **Called by**: standing-worker (automation triggers
  stage approvals executed through it).

### 7.3 sender-domain
- **Purpose**: per-brand sending domains via Resend — register a client domain, return exact SPF/DKIM/DMARC
  records, trigger verification, report status; makes a from-address deliverable (sends nothing itself).
- **Trigger**: FE JWT, owner-checked rows. Actions `connect`/`refresh`/`verify`/`remove`.
- **Tables**: `sender_domains`. **External/env**: Resend `/domains` API, `RESEND_API_KEY`. No AI.
- **Status**: fully implemented — but **absent from both npm deploy lists** (manual deploy per header).

### 7.4 unsubscribe
- **Purpose**: working RFC 8058 one-click opt-out. `?m=<outreach_messages.id>` — an unguessable per-send
  UUID — **is the capability**; the endpoint can only suppress that message's actual recipient (no
  third-party griefing surface despite running unauthenticated). POST (mailbox provider) → suppress + 200;
  GET (human click) → suppress + small confirmation page. Never leaks id validity.
- **Trigger**: PUB (`--no-verify-jwt`).
- **Tables**: `outreach_messages` (read), `suppression`, `contacts`, `outreach_campaigns`, `execution_runs`,
  `mind_events`. No AI. **Status**: fully implemented. **Referenced by**: send-email (List-Unsubscribe URL).

### 7.5 resend-webhook
- **Purpose**: Resend delivery-status webhook (**Svix-signed**: HMAC-SHA256 of `id.ts.body`, ±300s replay
  window, constant-time compare). Correlates by `provider_message_id`; advances message/campaign status,
  records delivered/opened/clicked engagement, adds bounces/complaints to the suppression list and marks the
  contact "so a bad address can never be emailed again."
- **Trigger**: WH (`--no-verify-jwt`). Event map: `email.sent/delivered/opened/clicked/bounced/complained/
  delivery_delayed/failed`.
- **Tables**: `outreach_messages, outreach_events, outreach_campaigns, suppression, contacts,
  execution_runs`. **Env**: `RESEND_WEBHOOK_SECRET`. No AI. **Status**: fully implemented. **Calls**: none.

### 7.6 resend-inbound
- **Purpose**: inbound reply handler — records the reply, **AI-classifies sentiment**
  (positive/negative/neutral), stops the sequence, flips the campaign to replied/won/lost; also a
  forward-in mailbox (mail to an owner's `in-xxxxxx@` alias lands in `inbound_mail`). Correlates by
  in-reply-to/references headers or from-address.
- **Trigger**: WH (`--no-verify-jwt`); auth = `x-inbound-secret` header == `INBOUND_SECRET`
  (constant-time).
- **Tables**: `outreach_messages, profiles, inbound_mail, mind_events, replies, outreach_events,
  suppression, contacts, execution_runs, outreach_campaigns`.
- **AI**: `gpt-4o-mini` (OpenAI) or `google/gemini-2.5-flash` (via the Lovable AI gateway,
  `LOVABLE_API_KEY`), temperature 0, max_tokens 4. Prompt: "*Classify the reply to a cold outreach email as
  exactly one word: positive, negative, or neutral…*" Falls back to a regex heuristic with no key.
- **Status**: fully implemented (graceful degradation). **Calls**: none.

### 7.7 inbox-draft
- **Purpose**: OVERNIGHT REPLY DRAFTS — "the 'drafted-but-never-sent' pattern (the one form of email
  autonomy the market actually adopted)." Nightly, for every positive reply not yet answered (14-day
  window, ≤25): draft the response and stage it as a PENDING approval; auto-send only under an
  `inbox_reply` autonomy grant. Drafts answer **only from the thread**; unknowns become `[YOU FILL: …]`
  holes.
- **Trigger**: CRON daily (12:45). `--no-verify-jwt`; `cronAuthorized`; heartbeat `garvis-inbox-draft-daily`.
- **Tables**: `replies, outreach_messages, contacts, outreach_settings, draft_verdicts, profiles`;
  writes `outreach_messages` (draft), `approvals`.
- **AI**: `modelForPlan`, 700 tokens: "*You draft a reply to a warm prospect who wrote back. Warm, direct,
  under 120 words… For anything you cannot know (prices, dates, availability, specifics), insert a visible
  placeholder like [YOU FILL: your price] instead of inventing.*" Injects a measured track-record block
  (from `draft_verdicts`) plus a real approved email as a voice rail.
- **Status**: fully implemented; no key → `{available:false}`. **Calls**: → **send-email** via
  `executeSendNow` when autonomy granted.

### 7.8 outreach-followups
- **Purpose**: the follow-up cadence cron, two passes: (A) campaigns sent and due (default 3 business days,
  max 2 bumps) → short follow-up draft → approval; (B) app_0081 high-signal pass: "opened 3+ times but
  silent" → engagement bump. Cold outreach only; any reply/unsub/bounce stops the sequence; never sends on
  its own (auto only under `followup` autonomy).
- **Trigger**: CRON daily (13:00). `--no-verify-jwt`; `cronAuthorized`; heartbeat `garvis-followups-daily`.
- **Tables**: `outreach_campaigns, replies, outreach_messages, contacts`; writes drafts + `approvals`.
- **AI**: direct fetch (not the ai.ts seam): `gpt-4o-mini` or `google/gemini-2.5-flash`, JSON mode, temp 0.4.
  Cadence prompt: "*Under 50 words. Plain text. No 'just following up'/'checking in'. One question.*"
  Engaged-bump prompt: "*…the recipient has read several times without replying — they are interested but
  stuck. Under 45 words… NEVER mention opens, reads, or tracking in any form.*"
- **Status**: fully implemented. **Calls**: → **send-email** via `executeSendNow` when autonomy granted.

### 7.9 outreach-reactivate
- **Purpose**: THE REACTIVATION SWEEP — monthly; contacts once in a real conversation (≥1 sent message) that
  went quiet 60–365 days ago get a short, human check-in staged as DRAFT + PENDING approval (hard cap
  10/owner/sweep). **Deterministic templates — no AI invention.** Suppression check fails closed.
- **Trigger**: CRON monthly (1st, 14:00). `--no-verify-jwt`; `cronAuthorized`; heartbeat
  `garvis-reactivate-monthly`.
- **Tables**: `outreach_settings, outreach_messages, replies, outreach_campaigns` (kind `re_nurture`),
  `contacts, suppression, approvals, mind_events`. No AI.
- **Status**: fully implemented. **Calls**: → **send-email** via `executeSendNow` when autonomy granted.

### 7.10 invoice-chase
- **Purpose**: THE CHASER — "the heartbeat asks about money so the owner doesn't have to (60% of owners
  avoid confronting late payers; the median SMB sits on $17.5K unpaid)." Daily: every sent, unpaid, dated
  invoice on a 4-stage ladder (upcoming→due→firm→final, mirroring `src/lib/garvis/money.ts`); each rung
  fires ONCE as a PENDING approval. Deterministic, polite copy — "never fake collections."
- **Trigger**: CRON daily (13:30). `--no-verify-jwt`; `cronAuthorized`; heartbeat `garvis-invoice-chase-daily`.
- **Tables**: `invoices` (`last_chase_stage`), `outreach_settings, world_sender_identities,
  outreach_campaigns` (kind `invoice_chase`), `outreach_messages, approvals`. No AI.
- **Status**: fully implemented. **Calls**: → **send-email** via `executeSendNow` when autonomy granted.

### 7.11 voice-inbound
- **Purpose**: MISSED-CALL TEXT-BACK — the Twilio Voice webhook, two stages: `inbound` returns TwiML ringing
  the business's real line with a dial-action callback to itself; `status` texts the caller back within
  seconds on a missed call (no-answer/busy/failed/canceled) and logs either way. The `missed_call_configs`
  row IS the pre-authorization (fixed transactional template); honors prior STOP; idempotent on `call_sid`.
- **Trigger**: WH (Twilio, `--no-verify-jwt`); **X-Twilio-Signature** HMAC-SHA1 validation, fail-closed.
  Always answers with TwiML XML (never crashes a live call).
- **Tables**: `missed_call_configs, contacts, missed_call_events`.
- **External/env**: Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `VOICE_WEBHOOK_URL`). No AI.
- **Status**: fully implemented. **Calls**: Twilio directly (transactional; deliberately not via send-sms).

### 7.12 booking
- **Purpose**: PUBLIC booking API — the public page never touches the DB; this uses the service role keyed
  by an enabled `booking_pages.slug` and only exposes that page's services + open slots.
  `availability` → services/slots; `book` → race-proof confirmed appointment (**DB gist exclusion
  constraint** catches double-booking, code `23P01`), customer confirmation via transactional
  Resend/Twilio (`_shared/bookingNotify.ts`), operator webhook alert.
- **Trigger**: PUB (anon key; slug is the capability). **Not in any deploy list** (manual deploy).
- **Tables**: `booking_pages, booking_services, appointments, mind_events, profiles`. No AI.
- **Status**: fully implemented. **Calls**: none (transactional notices bypass the outreach gates by design —
  "the customer just booked and gave contact details for exactly this").

### 7.13 site-events
- **Purpose**: G5 INSTRUMENTATION INGEST — the endpoint **generated websites** report to (visit / lead /
  click / qr). Security model: the site **channel token** (unguessable UUID embedded in the built site) is
  write-only and maps server-side to `(owner_id, world_id)`; revoked tokens 403; size caps; one event per
  request. A valid lead creates-or-links a contact (never modifies an existing one — "suppression sacred"),
  drops a `mind_events`, and can fire the **instant first touch** standing rule: a deterministic templated
  first-touch email staged as a `garvis-auto` approval (`decided_via='standing_rule'`) and sent immediately
  through send-email — "no AI invention at 11pm."
- **Trigger**: PUB (visitors' browsers; `--no-verify-jwt`). Rate limits: 60 events + 10 leads /min/channel.
- **Tables**: `site_channels, site_events, contacts, leads, mind_events, profiles, outreach_settings,
  outreach_messages, outreach_campaigns` (kind `auto_first_touch`), `approvals`.
- **Status**: fully implemented. **Calls**: **site-events → send-email** (`x-worker-secret`).

### 7.14 automation-intake
- **Purpose**: THE CUSTOM-AUTOMATION INTAKE — public demo form: a prospect describes how they run their
  business; a **deterministic** engine (`intakeAutomations` — "deliverable-only, gaps not promises") detects
  which real automations fit, lands the hottest inbound lead as an `opportunities` row
  (kind `inbound_automation_request`), notifies the operator in-app + webhook. Owner resolved server-side
  from `preview_sites.user_id`. Prospect sees only deliverable proposals `{title, pitch, monthlyPrice}` —
  never gaps.
- **Trigger**: PUB (anon; burst cap 5/preview/min). **Tables**: `preview_sites, opportunities, profiles,
  mind_events`. `APP_ORIGIN`. No AI. **Status**: fully implemented. **Calls**: none.

### 7.15 claim-submit
- **Purpose**: THE CLAIM BELL — the public preview's "Claim this website" form (anon; business owners aren't
  logged in). Inserts `publish_requests` server-side AND immediately rings the agency owner's webhook —
  "a raised hand is the conversion event and must never land silently."
- **Trigger**: PUB (anon; burst cap 5/preview/min). **Tables**: `preview_sites, publish_requests, profiles`.
  No AI. **Status**: fully implemented. **Calls**: none.

## 8. Prospecting, media & knowledge

### 8.1 discover-run
- **Purpose**: "SCRAPE EVERYTHING → a growing pool of real businesses." Two engines over one
  (business-type × metro) grid: `source:'claude'` (default) — **Claude runs the scraping** with the
  `web_search` tool, finding real local businesses AND judging each site (bad/missing/decent) in one pass,
  persisting a business **only** if tied to a real citation URL Anthropic returned (`groundScoutLeads`);
  `source:'places'` — the Google Places structured firehose (3 pages/combo). Seeds the whole grid
  (`discovery_queries`) on first run; tracks exhaustion.
- **Trigger**: FE JWT (operator). `{ batch?, source? }` → `{ ok, source, combosRun, newLeads, dupes,
  apiError, poolTotal, noWebsite, freshCombosLeft }`.
- **Tables**: `discovery_queries`, `discovered_businesses` (deduped).
- **External/env**: Anthropic web search (`ANTHROPIC_API_KEY`) and/or Google Places
  (`GOOGLE_PLACES_API_KEY`).
- **AI**: `SCOUT_MODEL = 'claude-sonnet-4-6'` + `web_search` (maxUses 6). `SCOUT_SYSTEM` (from
  `claudeScout.ts`): "*You are a local-business prospector for a web-design agency… NEVER invent a business,
  a phone number, or a website. If you are unsure a business is real, leave it out.*"
- **Status**: fully implemented (both engines real). **Calls**: none.

### 8.2 discover-media
- **Purpose**: server-side media/answer discovery proxy for Explorer/spike mode — holds the Perplexity,
  Serper, and Places keys server-side (never in the browser bundle), meters each call, returns the
  provider's raw JSON (client keeps its parsing/scoring).
- **Trigger**: FE JWT; credit kind `discover`. `{ provider:'perplexity'|'serper'|'places', topic?/path?/q? }`
  → `{ available, data }`.
- **External/env**: Perplexity `sonar` ($0.006/call) — prompt: "*Explain the topic to a curious mind: a
  vivid, specific, genuinely interesting 3-5 sentence understanding — the version a brilliant friend would
  tell you*"; Serper ($0.002); Google Places New ($0.003). `PERPLEXITY_API_KEY`, `SERPER_API_KEY`,
  `GOOGLE_PLACES_API_KEY`.
- **Status**: fully implemented (per-provider honest degrade). **Calls**: none.

### 8.3 ingest-profile
- **Purpose**: THE FUNNEL'S FRONT DOOR — the external scraper/lead engine POSTs `BusinessProfile` JSON with
  an **ingest token** (Settings → API tokens; no browser session) and gets back a live public preview URL +
  report URL. v1 generates the deterministic recipe-based spec (`assembleFallbackSpec` — instant, free,
  always valid, `spec_source:'fallback'`); the AI intelligence chain runs later on the admin's Regenerate
  (a deliberate deferral, honestly labeled — not a stub). Slug carries a random nonce so pitches aren't
  enumerable.
- **Trigger**: PUB server-to-server; auth = `x-ingest-token` against `ingest_tokens` (revocable,
  `last_used_at` stamped).
- **Tables**: `ingest_tokens, business_profiles, preview_sites`. **Env**: `APP_ORIGIN`. No AI in v1.
- **Status**: fully implemented for scope. **Calls**: none.

### 8.4 fetch-url
- **Purpose**: the **one hardened fetch path** — reads a page server-side for chat context (title,
  description, readable text + shallow same-host crawl of service/about/gallery pages) and serves as the
  asset-harvest endpoint. Modes: `text` (default; also emits a site-audit `checks` object —
  viewport/form/email/https — and the **tech fingerprint**, §10.16), `images` (extract content image URLs
  incl. lazy-load), `save` (download one image into the user's storage + `project_assets` manifest),
  `contact` (mine publicly listed emails, incl. Cloudflare email-protection decode and `[at]/[dot]`
  de-obfuscation). Real-browser User-Agent (small-business sites 403 bots). Caps: 12k text, 1.5MB body,
  60 images, 8MB/image.
- **Trigger**: FE JWT; **plus** worker path (`x-worker-secret`) for read-only modes used by
  standing-worker's client_hunt (`save` still requires a real user). All fetching via `safeFetch` (§10.15).
- **Tables/storage**: `projects`, `project_assets`; bucket `project-assets`. No AI.
- **Status**: fully implemented. **Called by**: standing-worker.

### 8.5 shot-worker
- **Purpose**: server-side screenshots — the before/after piece of the outreach loop: (a) the email-shot
  view of a preview site, (b) the business's current site; PNGs stored in `project-assets`, public URLs
  returned.
- **Trigger**: FE JWT; credit kind `screenshot` ($0.03); 10MB cap; SSRF-validated targets (`urlAllowed`).
- **External/env**: ScreenshotOne-compatible HTTP API (`SCREENSHOT_API_KEY`, `SCREENSHOT_API_URL`,
  `APP_ORIGIN` for slug shots). Returns 501 with a clear message when unconfigured (config-gated, not
  stubbed). No AI.
- **Status**: fully implemented. **Calls**: none (standing-worker reimplements capture inline rather than
  calling this).

### 8.6 ingest-document
- **Purpose**: the document intake pipeline for the "second brain" (app_0021): (1) summarize + extract
  concepts (or **vision-catalog** an image), (2) persist the document, (3) embed it (head chunk +
  overlapping windows, ≤11 chunks), (4) classify by cosine proximity to everything already in the brain
  (RPC `match_embeddings`) and **propose** a home world + "Garvis noticed…" connections
  (`meta.suggested_world_id`) — "Nothing is auto-filed, matching the vision's approval-first stance."
- **Trigger**: FE JWT; enrichment credit-gated (`discover`), best-effort (out of credits keeps the raw doc).
- **Tables**: `documents` (status uploaded→extracted→classified), `knowledge_worlds`, `knowledge_clusters`,
  `embeddings`, `insights`, `world_intelligence`.
- **AI**: `modelForPlan`; `SUMMARY_SYSTEM`: "*You classify a document for a personal AI 'second brain'…
  Never invent facts not in the text*"; `VISION_SYSTEM`: "*cataloguing an image for a business's living
  asset library… Describe ONLY what is visible. Never invent an artist, title, price, or location.*"
  Embeddings via `_shared/embeddings.ts` (`text-embedding-3-small`).
- **Status**: fully implemented. **Calls**: none (shares embed-worker's helper module, not an HTTP call).

### 8.7 embed-worker
- **Purpose**: write-side of the persistent brain — embeds text for subjects
  (`document|artifact|cluster|knowledge|business|app`) and persists vectors to `public.embeddings`
  (service-write only per app_0021 RLS), or returns vectors without persisting.
- **Trigger**: FE JWT. `{ subjects[] ≤128 }` → `{ embedded, skipped }`; `{ texts[] ≤256 }` → `{ vectors }`.
  Degrades to `{embedded:0}`/`{vectors:null}` when unconfigured — never a hard error.
- **External/env**: OpenAI-compatible embeddings endpoint; `EMBEDDINGS_API_KEY` (falls back
  `OPENAI_API_KEY`), `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL` (default `text-embedding-3-small`,
  1536-dim to match the pgvector column).
- **Status**: fully implemented. **Calls**: none.

### 8.8 board-copy
- **Purpose**: "the one LLM call behind every creative board's words" — replaces the era when "the boards'
  prompt boxes were placebos: generate() returned canned templates and a 'rendition' was a regex." Turns a
  typed idea or a rendition instruction into real copy under absolute honesty rules (facts only from
  `materials`; unknowns stay visible `[EDIT: …]` holes; merge fields preserved), then runs an
  **editor-in-the-loop**: a judge scores 1–10, score <8 triggers one revision (judge fail-open), the better
  draft ships with `quality:{score,notes}`.
- **Trigger**: FE JWT; credit kind `board_copy`. Channels: postcard/social/email/idea
  (`_shared/copyJudge.ts` FIELDS contracts). No provider key → `{available:false}` (client falls back to
  deterministic templates).
- **AI**: `modelForPlan`; writer = `honestySystemPrompt(channel)`, judge = `judgeSystemPrompt(channel)`
  (quotes in §10.14).
- **Status**: fully implemented. **Calls**: none.

### 8.9 render-design
- **Purpose**: "DESIGNS BECOME REAL PIXELS" — renders the no-photo **brand card** server-side
  (satori → SVG → resvg-wasm → PNG), stores it in `project-assets`, returns a URL the publisher can attach.
  "A rendered brand design is the business's OWN graphic — not AI imagery — so it carries no AI disclosure."
- **Trigger**: FE JWT; credit kind `design_render` (flat $0.002, `provider:'satori'`). Sizes from
  `DESIGN_SIZES` (IG square/portrait, FB/LinkedIn/X landscape).
- **Tables/storage**: `knowledge_clusters` (ownership), `cluster_files` (vault row); bucket
  `project-assets`. Fetches WASM + Inter fonts from unpkg (cached per instance). **No LLM.**
- **Status**: fully implemented. **Calls**: none.

### 8.10 generate-image
- **Purpose**: the image-generation seam — prompt → real image via OpenAI **`gpt-image-1`**
  (quality medium), stored in `project-assets`; with a `clusterId`, records a `cluster_files` image row so it
  flows into postcards/social like an uploaded photo. The AI-vs-real-property honesty rule is enforced
  upstream (`src/lib/garvis/imagegen.ts`).
- **Trigger**: FE JWT; credit kind `image` ($0.04–0.07 by size). No `OPENAI_API_KEY` →
  `{available:false, setup:[...]}`; provider content-policy refusals surfaced honestly.
- **Status**: fully implemented. **Calls**: none.

### 8.11 generate-video
- **Purpose**: **Veo 3.1** scene generation — builds the curated per-trade library of photoreal scroll
  clips. Long-running: `start` → `poll` → (download + store ≤200MB into `project-assets` at
  `{owner}/scenes/{id}.mp4`) → `approve`; also `list`. DB row `scroll_scenes`; cost recorded at poll
  completion (`VEO_COST_PER_SEC`, default $0.75 × 8s).
- **Trigger**: FE JWT (operator).
- **External/env**: Google Gemini API `:predictLongRunning` + operation poll (`GEMINI_API_KEY`,
  `GEMINI_BASE`); models `veo-3.1-generate-preview` / `veo-3.1-fast-generate-preview` (`VEO_MODEL`,
  `VEO_MODEL_FAST`); scene prompts from `src/lib/garvis/videoScenes.ts` `SCENE_PROMPTS`.
- **Status**: fully implemented. **Calls**: none.

### 8.12 render-video
- **Purpose**: the video render seam — storyboard edit JSON → real mp4 via **Shotstack** (JSON timeline →
  mp4, no local render infra). `render` → provider render id (credit kind `render`, $0.25); `status` → poll
  (free). Browser preview works with none of this configured.
- **Trigger**: FE JWT. **External/env**: `api.shotstack.io/edit/{SHOTSTACK_ENV}` (`stage` sandbox default |
  `v1` production); `SHOTSTACK_API_KEY`. No AI (render provider).
- **Status**: fully implemented. Note: the credits ledger names "Sora/Runway/Luma" for `video_clip` and
  ElevenLabs for `voiceover`, but **no function implements those providers** — anticipated, not built.
- **Calls**: none.

### 8.13 research
- **Purpose**: deep research — analyzes the project's full source (digest capped 140k chars), then
  researches market/competition with **live Anthropic web search**, returning a grounded, cited comparison
  (+ Sources list); persists the exchange to `ai_messages`.
- **Trigger**: FE JWT + project ownership; requires `AI_PROVIDER=anthropic` (400 otherwise); credit kind
  `research`.
- **AI**: `completeWithWebSearch` (8000 tokens, maxUses 10), `modelForPlan`. `RESEARCH_SYSTEM`: "*You are
  FableForge's senior product and market analyst… Ground every app claim in the actual code; ground every
  market claim in a cited source. Never invent competitors, features, prices, or numbers, and never present
  a guess as a measurement.*"
- **Status**: fully implemented. **Calls**: none.

## 9. Billing, e-sign, social, ads, MLS & the managed AI gateway

### 9.1 stripe-webhook
- **Purpose**: Stripe receiver for BOTH the operator's own FableForge subscription/credit purchases AND
  **client sales** (a prospect paying the operator for a website via a Payment Link): `handleClientSale`
  activates the `client_subscriptions` row on payment and **auto-publishes the sold demo** when stashed HTML
  exists; `handleClientSubscriptionChange` handles client churn (with a "no resurrection" guard against
  out-of-order events); `alertClientPaymentFailed` notifies the operator. Operator-side: `grant_credits`
  RPC on top-ups, `syncSubscription` on subscription events ("webhooks are triggers only — state re-fetched").
- **Trigger**: WH (Stripe, `--no-verify-jwt`). Raw body before parsing; `constructEventAsync` with
  `createSubtleCryptoProvider` (sync version fails in edge runtime); **event-id idempotency** via
  `stripe_events` insert (23505 → already processed; marker deleted on failure so Stripe retries).
  Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
- **Tables/storage**: `client_subscriptions, preview_sites, mind_events, profiles, stripe_events,
  usage_events, stripe_subscriptions` (via `syncSubscription`); bucket `project-assets`
  (`{owner}/published/{previewId}.html` stash detection).
- **External/env**: Stripe (npm:stripe@18); `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `WORKER_SECRET`.
  No AI.
- **Status**: fully implemented. **Calls**: **stripe-webhook → publish-preview** (`x-worker-secret`).

### 9.2 create-checkout
- **Purpose**: starts a Stripe Checkout session for the operator: `subscription` (Pro) or one-time
  `credits` top-up; open-redirect guard on `returnUrl` (same-origin only).
- **Trigger**: FE JWT. **Tables**: `profiles` (via `ensureCustomer`). **Env**: `STRIPE_SECRET_KEY`,
  `STRIPE_PRO_PRICE_ID`, `STRIPE_CREDITS_PRICE_ID`, `STRIPE_CREDITS_AMOUNT` (default 1000). No AI.
- **Status**: fully implemented. **Calls**: none.

### 9.3 client-checkout
- **Purpose**: "MAKE IT MINE" — public: a prospect on their demo picks a tier; creates a PENDING
  `client_subscriptions` row and returns the **operator's Stripe Payment Link** with the sale id as
  `client_reference_id` (so stripe-webhook can find the row) + email prefilled. Nothing charges here.
  Honest 503 + operator notify when no payment link is configured (no dead buttons).
- **Trigger**: PUB (anon; burst cap 5 pending sales/preview/min). **Tables**: `preview_sites,
  agency_billing_settings, client_subscriptions, mind_events`. No AI/Stripe SDK.
- **Status**: fully implemented. **Calls**: none.

### 9.4 customer-portal
- **Purpose**: opens the Stripe customer portal (manage/cancel, payment method, invoices); requires a portal
  configuration saved in the Stripe Dashboard. Same-origin `returnUrl` guard.
- **Trigger**: FE JWT. **Tables**: `profiles`. **Env**: `STRIPE_SECRET_KEY`. **Status**: fully implemented.

### 9.5 docusign-send
- **Purpose**: THE ONE E-SIGNATURE SEND PATH — clones send-email's approval spine (`send_for_signature`
  approval, payload-hash check, atomic double-send claim — "an envelope POST is not idempotent; a retry
  without the claim would email the signer twice"). Also `action:'status'`: owner-scoped poll updating the
  envelope from DocuSign — "the honest fallback when the webhook isn't configured." Environment is CONFIG:
  `DOCUSIGN_AUTH_BASE` defaults to the developer sandbox (signatures there not legally binding).
- **Trigger**: FE JWT only (**no worker path** — "a human approves every envelope"). Server re-runs
  `decideSendable` (`_shared/esignCore.ts`) before sending.
- **Tables**: `esign_envelopes, approvals, execution_runs, outreach_settings, mind_events,
  provider_connections`.
- **External/env**: DocuSign REST v2.1 (account/base_uri from `/oauth/userinfo`; token refresh via
  `DOCUSIGN_OAUTH_CLIENT_ID/_SECRET`); registers the Connect `eventNotification` (HMAC) only when
  `DOCUSIGN_WEBHOOK_SECRET` is set. No AI.
- **Status**: fully implemented. **Calls**: registers **docusign-webhook** as the callback URL.

### 9.6 docusign-webhook
- **Purpose**: DocuSign Connect receiver — envelope status updates; on completion downloads the combined
  signed PDF (with the owner's own token) and files it to storage. "The lakegen source accepted unsigned
  payloads — anyone could forge a 'completed' status; this never does."
- **Trigger**: WH (`--no-verify-jwt`); **fails closed**: no configured secret → 401 for everything;
  HMAC-SHA256 (`x-docusign-signature-1`) constant-time verified. Monotonic status RANK guard (stale events
  can't drag a terminal envelope backward); unknown provider states map to null — "never guessed."
- **Tables/storage**: `esign_envelopes` (`signed_pdf_path`), `mind_events`; bucket `project-assets`
  (`{owner}/esign/{envelopeId}.pdf`). **Env**: `DOCUSIGN_WEBHOOK_SECRET`, `DOCUSIGN_AUTH_BASE`. No AI.
- **Status**: fully implemented. **Calls**: none.

### 9.7 mls-sync
- **Purpose**: THE MLS DATA RAIL — a **RESO Web API (OData)** client "rebuilt in house style from the
  lakegen harvest (its client was real; nothing ever called it)." Actions (owner JWT; feed token SEALED
  server-side): `save` (probe with one `$top=1` query, store in `provider_connections` as `mls_reso`),
  `sync` (pull listings changed since the newest `ModificationTimestamp` held — `$filter` paging, 200/page,
  ≤5 pages/call with an honest "run again" flag), `status` (connection + row counts, no secrets).
- **Trigger**: FE JWT; world-scoped syncs verify `knowledge_worlds` ownership.
- **Tables**: `provider_connections, mls_listings` (upsert `owner_id,listing_key`), `knowledge_worlds,
  mind_events`. Feed fetched via `safeFetch` (SSRF-guarded). Per-user credentials — no global secrets.
  No AI.
- **Status**: fully implemented — **real** OData calls (not simulated); RESO standard field names, status
  text stored as-is ("never normalized guesses"). **Calls**: none.

### 9.8 social-publish
- **Purpose**: THE SOCIAL PUBLISH PATH — approval spine (`publish_post`, payload-hash bound, atomic
  double-post claim); posts through **Ayrshare** to whatever accounts are linked on the sealed key;
  per-world/brand Ayrshare Profile-Key resolution (fail-closed once multiple destinations exist);
  server-side re-run of the `checkDraft` refusal gate (§10.19); schedule grace — a `scheduleAt` ≤1h past
  posts now, staler is refused.
- **Trigger**: dual-caller (owner FE JWT / standing-worker `x-worker-secret`).
- **Tables**: `approvals, social_posts, execution_runs, world_social_profiles, mind_events,
  provider_connections` (ayrshare).
- **External/env**: Ayrshare `app.ayrshare.com/api/post` (30s timeout); `WORKER_SECRET`. No AI.
- **Status**: fully implemented (real provider call, real per-platform failure mapping). **Called by**:
  standing-worker.

### 9.9 social-sync
- **Purpose**: THE READ-BACK — "Garvis posted to social and never looked at the results; this closes that
  loop." Pulls per-post analytics from Ayrshare into `social_post_metrics` (every metric nullable —
  absent = NULL, never fake 0; raw provider object kept verbatim); reconciles `scheduled` posts the provider
  has since posted (only on evidence). Honest plan-gate degrade (Ayrshare 402/403 → `available:false`,
  stamps `last_synced_at` to stop hammering).
- **Trigger**: CRON every 6h (`--no-verify-jwt`, `x-worker-secret` fan-out across owners with an Ayrshare
  key) **or** owner FE JWT (`{owner_id?}`). ≤20 posts/owner, 6h staleness, 30d window; heartbeat stamped.
- **Tables**: `social_posts, social_post_metrics` (upsert `post_id,platform`), `world_social_profiles,
  provider_connections, system_heartbeat`. No AI.
- **Status**: fully implemented. **Calls**: none.

### 9.10 ads-sync
- **Purpose**: the ad-platform sync seam — **READ-ONLY by design** ("reporting access first; the review bar
  for read is far lower than write, and Garvis never mutates campaigns from here"). `status` → which
  providers are server-configured; `sync` → last-30-days daily campaign metrics into `ad_metrics`
  (idempotent upserts). Tokens are operator-level edge secrets; per-user non-secret config (ad account /
  customer id) lives in `connections`.
- **Trigger**: dual-caller: owner FE JWT (credit kind `ads_sync`, $0.02) or the watchdog via
  `x-worker-secret` + `owner_id`.
- **Tables**: `connections` (config/status/last_error/last_synced_at), `ad_metrics` (upsert
  `owner_id,provider,date,campaign_name`).
- **External/env**: **Meta** Graph `v21.0/{act_id}/insights` (`META_ADS_ACCESS_TOKEN` — a System User
  token); **Google Ads** GAQL `searchStream` v21 with real OAuth refresh (`GOOGLE_ADS_DEVELOPER_TOKEN`,
  `GOOGLE_ADS_CLIENT_ID/_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` for MCC).
  No AI.
- **Status**: fully implemented — **real** Meta + Google Ads calls (cost_micros ÷1e6); missing env →
  `{available:false}` with exact setup steps. **Called by**: ads-watch.

### 9.11 ads-watch
- **Purpose**: THE 2AM AD WATCHDOG — daily: per owner with a connected ad account, (1) refresh metrics
  through ads-sync (the one sync path — metering intact), (2) judge YESTERDAY against a 7-day baseline with
  the verified core (`_shared/adsWatchCore.ts`, §10.20 — MIN-sample gated, today never judged, a missing
  report never treated as zero), (3) push real findings to the owner webhook + `mind_events`.
  **Detection only — never mutates a campaign.** Anomaly dedupe within 3 days; ≤5 alerts/owner; quiet
  accounts stay quiet.
- **Trigger**: CRON daily (10:15, `--no-verify-jwt`, `cronAuthorized`); heartbeat `garvis-ads-watch-daily`.
- **Tables**: `connections, ad_metrics, mind_events, profiles`. No AI (deterministic detection).
- **Status**: fully implemented. **Calls**: **ads-watch → ads-sync** (`x-worker-secret`).

### 9.12 ai-gateway
- **Purpose**: **FableForge AI** — the managed AI gateway for *generated* apps. A generated app's edge
  functions call this with a per-app key (`FABLEFORGE_AI_KEY`, issued at backend deploy); the completion
  runs on the OPERATOR's provider key and the real cost × margin is metered against the app owner's credit
  balance — "No app-owner API keys, no setup."
- **Trigger**: PUB (`--no-verify-jwt` — external apps have no FableForge JWT); auth = per-app gateway key
  (Bearer or `x-fableforge-key`, ≥24 chars) looked up against `projects.ai_gateway_key`.
- **I/O**: `{ messages ≤24×8k chars, system?, maxTokens?≤4096, quality?:'fast'|'best' }` →
  `{ text, usage }`; 402 `out_of_credits`.
- **Tables**: `projects`; credit RPCs. **Env**: `FF_AI_GATEWAY_MARGIN` (default 1.25) + ai.ts provider keys.
- **AI**: owner-plan model via `modelForPlan` (`fast` forces cheap tier); no system prompt of its own.
- **Status**: fully implemented. **Called by**: generated apps deployed by deploy-backend.

## 10. `_shared` — the shared substrate (30 files)

A recurring **canonical-copy pattern**: `scaffold.ts`, `prompts.ts`, and `previewSpec.ts` are the source of
truth that the browser client re-exports (`src/lib/scaffold.ts`, `src/lib/prompts.ts`,
`src/lib/preview/spec.ts` do `export *` from them), so build/edit/preview logic is byte-identical in both
runtimes; they deliberately avoid Deno/browser-only APIs. Similarly, several pure "cores"
(`adsWatchCore`, `standingCore`, `batchCore`, `socialCore`, `esignCore`, `copyJudge`, `techFingerprint`)
follow "ONE implementation, verified by a `*.verify.ts` script, executed in the edge worker, re-exported to
the client."

### 10.1 ai.ts — the provider-agnostic AI client (363 lines)
- Providers: `anthropic | openai | openrouter | local` (`AI_PROVIDER`, default anthropic; `local` = any
  OpenAI-compatible endpoint, default `http://localhost:11434/v1` via `LOCAL_AI_BASE_URL`).
- Default model `claude-sonnet-4-6` (`AI_MODEL`). `modelForPlan(plan)`: `pro`/`starter` → configured model;
  free tier → cheapest capable per provider (`claude-haiku-4-5-20251001` / `gpt-4o-mini` /
  `anthropic/claude-3.5-haiku`), overridable via `AI_FREE_MODEL`.
- `PRICING` ($/1M in→out) enumerates the recognized model universe: `claude-fable-5` (10/50),
  `claude-opus-4-8` (5/25), `claude-sonnet-4-6` (3/15), `claude-haiku-4-5-20251001` (0.8/4), `gpt-4o`
  (2.5/10), `gpt-4o-mini` (0.15/0.6).
- API surface: `complete`, `completeStream` (SSE), `completeVision` (Anthropic content blocks / OpenAI
  image_url), `completeWithWebSearch` (Anthropic-only, tool `web_search_20250305`, citations returned),
  `parseJson`, `estimateCost`, `corsHeaders`. Anthropic endpoint `api.anthropic.com/v1/messages`
  (`anthropic-version: 2023-06-01`).
- Discipline: `withRetry` (3 attempts, exponential backoff, no retry on 400/401) and a **hard 300s
  wall-clock timeout on every provider fetch** — comment cites "scan B15: zero fetch timeouts across the
  fleet meant one hung provider stalled a whole cron tick." Retry is same-provider (no cross-provider
  failover).
- Imported by ~35 functions (all reasoning functions use `complete*`; many others import only `corsHeaders`).

### 10.2 credits.ts — the one credit chokepoint
- `checkCredits(admin, user, kind)` (RPC `refresh_credits`, pre-call estimate; `InsufficientCreditsError` →
  402) and `spendCredits(...)` (RPC `spend_credits`, logs `usage_events` with real cost);
  `getUserPlan` reads `profiles.plan`. Kind estimates include `garvis`, `agent`, `explore`, `plan`,
  `short_script`, `discover:8`, `board_copy`, `image:10`, `screenshot`, `render:25`, `research:20`,
  `ads_sync:2`, `app_ai:2`, `video_clip:200` ("Sora/Runway/Luma" — anticipated, unimplemented),
  `voiceover` ("one ElevenLabs narration" — anticipated, unimplemented).

### 10.3 cronGate.ts — clock auth
- `cronAuthorized(req)`: `x-cron-secret == CRON_SECRET` OR `x-worker-secret == WORKER_SECRET`,
  constant-time (`timingSafeEqual` exported). Note: garvis-pulse and garvis-consolidate still do a raw
  `x-worker-secret` check instead of this gate (drift noted in §13).

### 10.4 heartbeat.ts — liveness stamps
- `stampHeartbeat(admin, job)` upserts `system_heartbeat(job, last_tick_at)`; fire-and-forget by contract —
  "an unarmed heartbeat kills every scheduled feature SILENTLY."

### 10.5 autonomyGate.ts — earned autonomy
- `autonomyAllowed(admin, ownerId, actionClass)`: reads `autonomy_grants` (`mode`, `daily_cap`,
  `action_class`); counts today's auto-approved `approvals` for the class; true only when `mode='auto'`
  and under cap; fail-closed. `executeSendNow(approvalId)` POSTs
  `${SUPABASE_URL}/functions/v1/send-email` with `x-worker-secret` — the one way a drafter's auto-approved
  send actually goes out.

### 10.6 payloadHash.ts — approval tamper evidence
- `stableStringify` (key-sorted recursive JSON) + `hashPayload` (SHA-256 hex, `crypto.subtle`) +
  `payloadMatches(payload, storedHash)` — null/empty stored hash returns true (grandfathered), so hashing
  only ever ADDS refusal. Shared by enqueue (client) and every executor (send-email, send-sms,
  social-publish, docusign-send, deploy-site, deploy-backend, standing-worker drains).

### 10.7 notify.ts — operator webhook push
- `notifyText(url, text)` / `notify(url, JobEvent)`; auto-formats for Discord (`{content}`, 1900-char cap)
  and Slack (`{text}`), generic JSON otherwise; **always via `safeFetch`** (the one user-controlled-URL
  path); fail-soft.

### 10.8 bookingNotify.ts — transactional booking notices
- `sendBookingNotice(...)` sends confirmations/reminders **directly** via Resend + Twilio, deliberately
  bypassing outreach suppression/consent/kill-switch gates ("the customer just booked and gave contact
  details for exactly this"). Reads `outreach_settings` for the from-identity. Env: `RESEND_API_KEY`,
  `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`.

### 10.9 icsCore.ts — the calendar sense
- Pure ICS reader for the morning brief: `parseIcsEvents` (all-day + UTC forms; floating times treated as
  UTC; **recurring events NOT expanded — stated v1 limitation**), `calendarLine`. Consumer: garvis-pulse.

### 10.10 standingCore.ts — standing-order math (252 lines)
- "The missing capability the classification stress test ranked #1: nothing in Garvis had a sense of time."
  Pure (no clock — caller supplies `now`): `OrderKind` = `watch_url | cadence_digest | client_hunt |
  idea_stream | content_week | opportunity_hunt`; `nextRunAfter`, `isDue`, `normalizeContent`,
  `contentHash`, `changeExcerpt`, `decideWatch` (UNREACHABLE ≠ "no change"; first sight = baseline; markup
  noise ignored; excerpt of what changed carried), `watchArtifact`, `orderStatusLine`,
  `parseContentWeekConfig`, `weekSlots`, `contentWeekLine`. Verified by `src/lib/garvis/standing.verify.ts`.

### 10.11 batchCore.ts — bulk-send batch core (142 lines)
- "A batch is ONE human approval over a SNAPSHOTTED recipient list; the clock drains it by pushing every
  recipient through THE ONE SEND PATH." Pure compose/track (never sends): `composeBatchRecipients`
  (pre-excludes certainly-blocked contacts with named reasons — the owner approves the honest reachable
  count; dedupes by address), `TEMPLATE_TOKENS`/`unknownTokens` (unresolvable merge tokens are a compose-time
  refusal), `mergeTemplate`, `batchProgress`, `pickNextPending`, `staleSendingIndices` (crash-claim sweep),
  `computeBatchStats`, `batchStatsLine`. The `sending` state is a **persisted claim written before the
  irreversible send call** so a worker crash never double-sends. Verified by `outreachBatch.verify.ts`.

### 10.12 scaffold.ts — deterministic project scaffold (1,881 lines)
- Injects a fixed, deployable **Vite + React 18 + TS** skeleton so the model only authors app code:
  `BASE` (package.json, vite.config, tsconfig, index.html, main.tsx — model never writes these; always
  authoritative), default token stylesheet, and `KIT` — a bespoke accessible UI library
  (Button/Input/Select/Card/Badge/Spinner/Modal/EmptyState/ThemeToggle/Tabs/Dropdown/Popover/Tooltip/
  Combobox/Alert/FormField/Pagination/Table/Reveal/Motion/SmoothScroll/ScrollSequence/ScrollScenes/
  ErrorBoundary + theme/scroll/interaction hooks). Deps pinned: react-router 6, lucide, recharts,
  supabase-js, date-fns, clsx + the advanced-motion kit (framer-motion, gsap, lenis, three,
  react-three-fiber/drei). Tailwind via CDN with shadcn-style semantic tokens on CSS variables; HashRouter;
  pre-paint theme script; ErrorBoundary posts `{__ff:true, type:'error'}` to the parent frame so the
  platform's auto-fix can engage. Exports `withScaffold`, `SCAFFOLD_FILES`, `SCAFFOLD_PATHS`,
  `THEME_FOUNDATION`. Used by generate-app; re-exported to the client.

### 10.13 prompts.ts — the canonical prompt module (1,536 lines)
The single source of truth for build/edit/advisory prompts (client re-exports it). Composed from private
building blocks that carry the product's design philosophy:
- `DESIGN_GUIDE`: "*make it look professionally designed (Linear/Stripe/Vercel-tier), never
  'AI-generated'… the indigo/purple-gradient-everywhere look is the #1 'AI slop' signature.*"
- `FEATURE_COMPLETENESS`: "*never half a feature, never a stub… A nav item that goes nowhere, or a route
  with no link, is a BUG.*"
- `INTEGRATIONS_GUIDE`: capabilities that can't run in the browser go in a Supabase edge function; every
  integration call routes through one `invokeFunction` helper returning a realistic MOCK in preview, with
  **MOCK HONESTY** rules: "*A mock must be IMPOSSIBLE to mistake for real output… Fake success is the worst
  bug an app can have.*"
- `AUTOMATION_GUIDE`: generated apps get exactly ONE runner (`/supabase/functions/automation-runner`) and
  "FableForge automatically wires a pg_cron tick to it every minute at deploy" (the deploy-backend seam).
- `COMPLIANCE_GUIDE` (privacy/terms with visible `[placeholder]` facts), `PLATFORM_GUIDE`, `VOICE_GUIDE`
  ("*Never open with flattery or agreement theater ('Great idea!', 'You're absolutely right!')*").
Exported systems: `DIRECTIONS_SYSTEM` (8 named design archetypes: Editorial Broadsheet, Luxury Boutique,
Neobrutalist Playground, Midnight Pro Tool, Organic Calm, Enterprise Clarity, Playful Pop, Swiss Archive),
`GENERATE_SYSTEM`, `GENERATE_FILES_STREAM`, `AGENT_BUILD_SYSTEM` ("*think, act with a tool, observe the
real result, and continue until the task is DONE and VERIFIED*"), `EDIT_SYSTEM` / `EDIT_SYSTEM_STREAM`,
`PREFERENCE_DISTILL_SYSTEM`, `GENERATE_PLAN_SYSTEM`, `RESEARCH_SYSTEM`, `PROJECT_MAP_SYSTEM`
("*a MAP of the project as it ACTUALLY is — not aspirational*"), `ROADMAP_SYSTEM`, `IDEATION_SYSTEM`,
`AUTOPILOT_DECIDE_SYSTEM` ("*Autonomous building is ONLY for small, reversible, scoped changes*"),
`DOC_ANALYZE_SYSTEM`, `SCHEMA_SYSTEM`, `MISSING_FILE_SYSTEM` — plus the builder functions
(`blueprintPrompt`, `filesPromptStream`, `filesPromptChunk`, `schemaPrompt`, `editPrompt`,
`missingFilePrompt`, …). Model ids inside the integration catalog are guidance for *generated* apps
(`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-8`, "gpt-5.2 tier", `gpt-4o-mini` —
"NEVER reference retired models"), with the default server-side AI being "FableForge AI" via
`FABLEFORGE_AI_URL`/`FABLEFORGE_AI_KEY` (= ai-gateway).

### 10.14 copyJudge.ts — the shared editor's rubric
- Pure prompt/parse helpers so every writer obeys one honesty contract: `FIELDS` (per-channel JSON
  contracts), `CRAFT` (per-channel craft rules), `honestySystemPrompt(channel)` — "*HONESTY IS ABSOLUTE:
  Use ONLY facts present in the materials JSON. NEVER invent an address, price, name, statistic, market
  claim, testimonial, or availability. If the idea needs a fact you do not have, put a visible hole in its
  place, formatted exactly like: [EDIT: what goes here]*" — `judgeSystemPrompt(channel)` — "*You are a
  ruthless marketing editor… HONESTY (hard fail → score <= 3): any fact, stat, market/scarcity claim, or
  testimonial NOT present in MATERIALS… Score 9-10 = a working professional would post this as-is*" —
  `judgeUserPrompt`, `parseJudgeVerdict`. Consumers: board-copy (judge fail-open) and standing-worker's
  content_week (fail-closed).

### 10.15 safeFetch.ts — hardened outbound fetch (SSRF defense)
- The one fetch path for user-supplied URLs. The audit finding it fixes: "*the old guard checked only the
  INITIAL hostname string and then followed redirects blindly — so a public page could 302 to cloud metadata
  (169.254.169.254) or an internal service.*" Layered, fail-closed: (1) scheme + literal-host blocklist
  (localhost/.local/.internal/.lan/metadata.google.internal); (2) IP-literal validation rejecting all
  private/link-local/CGNAT/reserved v4+v6 ranges, IPv4-mapped v6, and decimal/hex single-number IP forms;
  (3) DNS resolution requiring **every** A/AAAA record to be public (rebinding defense; nothing resolved →
  fail closed); (4) manual redirect following (cap 5) re-running all checks **on every hop**. Exports
  `isPublicIp, urlStaticOk, urlAllowed, safeFetch`. Users: fetch-url, shot-worker, garvis-canary,
  garvis-pulse, publish-preview, mls-sync, standing-worker, notify.

### 10.16 techFingerprint.ts (+ techFingerprint.verify.ts)
- Pure, dependency-free fingerprinter reading **the tech a business runs from its own HTML** — "the single
  best qualifier for both a rebuild and an automation pitch." Detects: `builder` + `diyBuilder` flag
  (wix/squarespace/godaddy/weebly = DIY; webflow/shopify/wordpress = real platforms, not DIY) via CDN/markup
  signatures; `booking` widget (calendly, acuity, jobber, housecall, square, setmore, mindbody, opentable,
  resy, booksy); `analytics` (ga, gtm, meta_pixel); `chat` (intercom, drift, tawk, podium, tidio, crisp);
  `ecommerce` (shopify, woocommerce, bigcommerce, squarespace_commerce). Honesty principle: "*every field
  traces to a real signature really present in the markup. A signature we don't find is null / [] (unknown),
  never a guess.*" `techFingerprint.verify.ts` is a dependency-free assertion script (run via
  `npm run verify:techfingerprint`) proving: Wix+Calendly+pixel detection, WordPress-not-DIY, Shopify
  ecommerce, no over-claiming on a hand-built page, all-null honesty on empty input, and byte-identical
  determinism. Consumer: fetch-url (fingerprints the raw bytes before stripping to text).

### 10.17 previewSpec.ts — the Business Website Preview Engine core (1,125 lines)
- The pure core of the scraper → builder pipeline ("*500 sites/day consistent, cheap, and impossible to
  break*"). Defines `BusinessProfile` (the scraper handoff contract, with per-photo/review provenance +
  usage flags), and `SiteSpec` v1 — a website described ONLY through a fixed registry: 15 `SECTION_TYPES`,
  7 hand-built scroll-scrubbed trade `SCENE_KINDS`, 6 `FLAIR_DEVICES`, 3 `MOTION_TIERS`, a vetted
  `FONT_LIBRARY`, and 12 industry `RECIPES` (contractor, restaurant, salon/spa, auto, dental/medical,
  funeral/care, legal, real estate, fitness, retail, pet care, photography). "The AI chooses content and
  parameters but never writes markup — quality guaranteed by construction" (the `html?` escape hatch is set
  only by the honesty-gated bespoke path). Key exports: `parseBusinessProfile`, `pickRecipe`,
  `restraintFor`/`applyRestraint` (a "dignified" guard forcing calm design for grief-adjacent industries,
  enforced in normalizer AND fallback so a model choice can never override it), `seededVariant`
  (name-hashed anti-sameness rotation), `ensureReadableTheme` (WCAG contrast net), `normalizeSpec` (the
  safety net between model output and renderer — re-injects photos/reviews/phone/hours from the trusted
  profile, never trusting the model to honor usage flags), `assembleFallbackSpec` (a complete decent site
  with ZERO model calls — the free/instant tier and the floor the normalizer patches holes with),
  `previewSlug`. Consumers: ingest-profile, standing-worker, and the client preview stack.

### 10.18 designSpec.ts + themePresets.ts + qa.ts + streamparse.ts + context.ts
- **designSpec.ts**: pure satori node-tree builders for render-design (`brandCardDesign`, `DESIGN_SIZES`,
  `mixHex` — a satori-safe `color-mix()` stand-in). Note: despite the name, the `DesignSpec` *type* lives in
  themePresets.ts.
- **themePresets.ts**: 8 curated theme presets + the full `DesignSpec` identity contract
  (`parseDesignSpec`, `buildIndexCssForDesign` — accent hue/sat, heading/body fonts with a
  single-weight-font guard, mode light/paper/tinted/dark, radius/borders/shadows) + `PERSONALITY_CSS`
  signature devices. A theme is just CSS-variable values — applying one recolors a generated app with no
  model call. Used by generate-app.
- **qa.ts**: static self-QA over generated files — unresolved imports, Node built-ins, disallowed packages,
  cross-file missing-export detection, dead navigation (`<Link>` with no `<Route>`), in-page anchors that
  break HashRouter, missing catch-all route, brace-balance truncation, and an **RLS lint** (create table
  without RLS = error; RLS without policy = warning). Exports `validateProject`, `looksTruncated`,
  `missingLocalModules`, `issuesToFixRequest`. Used by generate-app + chat-edit.
- **streamparse.ts**: one-shot parser for the `§`-protocol (`parseProtocol` — §ACTION/§EXPLANATION/§FILE/
  §DELETE/§QUESTION/…; infers `edit` when §FILE appears without §ACTION). Used by generate-app.
- **context.ts**: context-budget file selection (`selectContext`/`contextPayload`, ~160k-char budget,
  always-include set + relevance scoring, error-file boost). Used by chat-edit + job-worker.

### 10.19 stripe.ts, oauth.ts, connections.ts, socialCore.ts, esignCore.ts, adsWatchCore.ts, embeddings.ts
- **stripe.ts**: `stripeClient()` (apiVersion `2026-03-25.dahlia`, fetch HTTP client), `PRO_PRICE_ID()`,
  `ensureCustomer()` (persists `profiles.stripe_customer_id`), `syncSubscription()` — the ONE canonical
  sync: re-fetch subscriptions, compute tier (`pro` if active/trialing else `free`), upsert
  `stripe_subscriptions` + `profiles.plan`.
- **oauth.ts**: `OAUTH_PROVIDERS` (supabase w/ PKCE, github, docusign-sandbox-by-default), `makePkce`
  (S256), `randomState`, `exchangeCode`, `refreshToken`, `freshProviderToken` (auto-refresh near expiry),
  `projectSupabaseToken` (platform token for managed apps, else user OAuth token, else
  `SB_MANAGEMENT_TOKEN`).
- **connections.ts**: `getConnection`/`upsertConnection` on `provider_connections`; `probeProvider` makes
  real validation calls (GitHub /user, Netlify /user, Supabase /organizations, DocuSign /oauth/userinfo,
  Ayrshare /api/user).
- **socialCore.ts**: platform registry (9 platforms), per-platform length limits, `MEDIA_REQUIRED` set,
  `checkDraft` refusal gate (no platform / unsupported / text-only where media required / stale schedule),
  `providerPayload` (Ayrshare body), `mapProviderResult` (unknown shape → `failed`, never false `posted`).
- **esignCore.ts**: pure e-sign core — merge NEVER invents a value (unresolved `{{token}}` →
  `[needs your input: token]` + listed gap); `decideSendable` refuses docs with holes/no signers/invalid
  emails; `chunkedBase64`; `docHtml` (white-rendered anchor strings `/sig1/`, `/date1/` for tab placement);
  `envelopeRequest` (includeHMAC); status maps return null for unknown states.
- **adsWatchCore.ts**: pure anomaly detector — yesterday vs prior-7-day baseline per campaign; MIN-sample
  gates (≥4 baseline days, impression/click floors); kinds `spend_spike` (≥2.5× and ≥$10),
  `spend_stopped` ($0 with a real row after ≥$5/day), `ctr_collapse` (<40% of baseline), `cpc_spike`
  (≥2× and ≥$0.50); today never judged; every finding carries its arithmetic in `evidence`.
- **embeddings.ts**: OpenAI-compatible embeddings — `text-embedding-3-small`, 1536-dim (must match the
  pgvector column); `embedTexts` returns **null** on unconfigured/failure (callers degrade to lexical,
  never break); `toVectorLiteral`, `cosine`.

## 11. Cross-function call graph

Runtime HTTP edges (all internal calls carry `x-worker-secret` + a service-role bearer to clear the JWT
gateway):

```
pg_cron (garvis_arm_heartbeat, 12 jobs)
 ├─► garvis-worker ──────► garvis-worker            (self-chain while agent_runs remain)
 │                └──────► api.github.com           (get_repo_state tool)
 ├─► standing-worker ────► send-email               (bulk-send drain, automation triggers, hunt pitches)
 │                 ├─────► social-publish           (social drain + content-week pieces)
 │                 └─────► fetch-url                (client_hunt site scraping)
 ├─► ads-watch ──────────► ads-sync                 (per-owner metric refresh)
 ├─► garvis-canary ──────► send-email               (negative probe — MUST be refused)
 ├─► inbox-draft ────────► send-email               (only via executeSendNow under autonomy grant)
 ├─► outreach-followups ─► send-email               (same)
 ├─► outreach-reactivate ► send-email               (same)
 ├─► invoice-chase ──────► send-email               (same)
 ├─► garvis-pulse / garvis-scorecard / garvis-consolidate / social-sync   (leaf jobs)
site-events ─────────────► send-email               (instant first-touch standing rule)
stripe-webhook ──────────► publish-preview          (auto-publish a sold demo)
job-worker ──────────────► job-worker               (self-chain, EdgeRuntime.waitUntil)
generated apps (external) ► ai-gateway              (per-app FABLEFORGE_AI_KEY, provisioned by deploy-backend)
send-email ─(URL embed)──► unsubscribe              (RFC 8058 List-Unsubscribe)
docusign-send ─(registers)► docusign-webhook        (DocuSign Connect callback URL)
voice-inbound ─(callback)─► voice-inbound           (Twilio dial-action status stage)
deploy-backend ─(deploys)─► child project's automation-runner + child pg_cron tick
```

Everything else is a leaf: it talks only to its external provider and the database. The **fan-in hub is
send-email** (7 internal callers), which is exactly the intended architecture: one send path, many drafters.
Data-flow (not HTTP) couplings: draft-plan → generate-app (`planContext`); standing-worker enqueues
`outreach_batches`/`social_posts`/`content_weeks`/`approvals` that its own later ticks drain;
ingest-document shares embed-worker's embeddings module in-process.

Frontend invocation (from `supabase.functions.invoke` usage in `src/`): heaviest callers are fetch-url (8
call sites), cluster-chat (7), discover-media (5), ingest-document (4); the UI also manually pokes
standing-worker, garvis-worker, job-worker, social-sync, social-publish and ads-sync ("Run now" buttons on
the worker panels).

## 12. Env var / secret inventory

| Secret | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | all 67 | admin client + internal function URLs |
| `SUPABASE_ANON_KEY` | ~44 fns | JWT-resolving auth client |
| `WORKER_SECRET` | all cron/worker fns, send paths, cronGate, autonomyGate | the heartbeat/internal-call shared secret (`x-worker-secret`) |
| `CRON_SECRET` | cronGate | alternate cron header (`x-cron-secret`); arm flow sets it equal to WORKER_SECRET |
| `AI_PROVIDER` / `AI_MODEL` / `AI_FREE_MODEL` | _shared/ai | provider seam + plan-tier model split |
| `AI_PREMIUM_MODEL` | standing-worker | premium model override for the demo intelligence chain |
| `ANTHROPIC_API_KEY` | _shared/ai, agent-turn, discover-run | Claude completions + web_search |
| `OPENAI_API_KEY` | _shared/ai, _shared/embeddings, generate-image, standing-worker, outreach-followups, resend-inbound | GPT completions, gpt-image-1, embeddings fallback, classifiers |
| `OPENROUTER_API_KEY` / `LOCAL_AI_BASE_URL` | _shared/ai | alternate providers |
| `LOVABLE_API_KEY` | outreach-followups, resend-inbound | Lovable AI gateway (`google/gemini-2.5-flash`) fallback classifier/drafter |
| `EMBEDDINGS_API_KEY` / `EMBEDDINGS_BASE_URL` / `EMBEDDINGS_MODEL` / `OPENAI_BASE_URL` | _shared/embeddings | embeddings endpoint (default `text-embedding-3-small`) |
| `GEMINI_API_KEY` / `GEMINI_BASE` / `VEO_MODEL` / `VEO_MODEL_FAST` / `VEO_COST_PER_SEC` | generate-video | Google Veo 3.1 scene generation |
| `PERPLEXITY_API_KEY` | discover-media | Perplexity `sonar` |
| `SERPER_API_KEY` | discover-media, standing-worker | Serper search + rendered scrape |
| `GOOGLE_PLACES_API_KEY` | discover-run, discover-media, standing-worker, system-control | Places searchText discovery |
| `RESEND_API_KEY` | send-email, sender-domain, _shared/bookingNotify, _shared/prompts | email sending + domain registration |
| `RESEND_WEBHOOK_SECRET` | resend-webhook | Svix signature verification |
| `INBOUND_SECRET` | resend-inbound | inbound-mail shared secret |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | send-sms, voice-inbound, _shared/bookingNotify | SMS + voice webhook validation |
| `VOICE_WEBHOOK_URL` | voice-inbound | canonical URL for Twilio signature recomputation |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRO_PRICE_ID` / `STRIPE_CREDITS_PRICE_ID` / `STRIPE_CREDITS_AMOUNT` | create-checkout, customer-portal, stripe-webhook, _shared/stripe | operator billing |
| `NETLIFY_AUTH_TOKEN` | deploy-site, publish-preview, connect-domain | hosting + custom domains |
| `GITHUB_TOKEN` | github-export | fallback export token |
| `SB_MANAGEMENT_TOKEN` | provision-supabase, _shared/oauth | Supabase Management API PAT fallback |
| `SB_OAUTH_CLIENT_ID/_SECRET`, `GITHUB_OAUTH_CLIENT_ID/_SECRET`, `DOCUSIGN_OAUTH_CLIENT_ID/_SECRET` | oauth, _shared/oauth | provider OAuth apps |
| `DOCUSIGN_AUTH_BASE` / `DOCUSIGN_WEBHOOK_SECRET` | docusign-send, docusign-webhook, _shared/oauth | e-sign environment (sandbox default) + Connect HMAC |
| `META_ADS_ACCESS_TOKEN` | ads-sync | Meta Graph insights (System User token) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` / `_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` / `_LOGIN_CUSTOMER_ID` | ads-sync | Google Ads GAQL reporting |
| `SHOTSTACK_API_KEY` / `SHOTSTACK_ENV` | render-video | cloud video render (stage/v1) |
| `SCREENSHOT_API_KEY` / `SCREENSHOT_API_URL` | shot-worker, standing-worker | ScreenshotOne-compatible captures |
| `FF_PLATFORM_MANAGEMENT_TOKEN` / `FF_PLATFORM_ORG_ID` / `FF_FREE_MANAGED_LIMIT` / `FF_PRO_MANAGED_LIMIT` | provision-supabase, _shared/oauth | FableForge Cloud managed-DB provisioning + caps |
| `FF_AI_GATEWAY_MARGIN` | ai-gateway | managed-AI markup (default 1.25×) |
| `FABLEFORGE_AI_URL` / `FABLEFORGE_AI_KEY` | _shared/prompts (emitted into generated apps); set by deploy-backend | generated apps → ai-gateway |
| `APP_ORIGIN` | ingest-profile, standing-worker, shot-worker, automation-intake | public app origin for preview/report URLs |
| `BESPOKE_DEMOS` | standing-worker | toggle for the bespoke-HTML demo tier |
| `AYRSHARE_API_KEY` | (presence-checked by system-control only) | the actual Ayrshare key is per-user, sealed in `provider_connections` |
| Vault: `ff_heartbeat_base` / `ff_heartbeat_secret` | pg_cron jobs (DB-side) | heartbeat target + secret, set by `garvis_arm_heartbeat` |

`system-control`'s SECRETS presence map is the platform's own authoritative integration inventory (it
checks ~20 of the above and reports set/unset booleans to the operator panel).

## 13. Status assessment & notable findings

1. **Nothing is meaningfully stubbed.** Across all 67 functions and 30 shared modules there are no
   "not implemented" returns, mock data paths, or TODO-driven placeholders. Every external integration
   (Stripe, Resend, Twilio, DocuSign, Netlify, GitHub, Supabase Management, Ayrshare, Meta, Google Ads,
   RESO/MLS, Veo, Shotstack, ScreenshotOne, Perplexity, Serper, Places, OpenAI images) makes real API
   calls. The recurring pattern instead is **honest degradation**: missing keys yield
   `{available:false, setup:[...]}` or explicit skip records, never fake success. All
   "placeholder/mock" grep hits are either (a) the `[YOU FILL]`/`[EDIT]` honesty holes (which
   send-email/send-sms refuse to send) or (b) instructions telling *generated* apps how to build honest
   preview mocks.
2. **The approval spine is structural, not procedural** — send-email, send-sms, social-publish,
   docusign-send, deploy-site, deploy-backend all require an owned approved `approvals` row, payload-hash
   verified, atomically claimed. Autonomy is an explicit, capped, per-action-class grant. garvis-canary
   *nightly tests that the send gate refuses* an unauthorized send.
3. **Scheduling is in-database**, not in config.toml (none exists): `garvis_arm_heartbeat` +
   pg_cron + pg_net + Vault, 12 jobs, armed from the deploy workflow or the in-app system-control panel;
   liveness proven via `system_heartbeat` stamps.
4. **Deploy-list gap**: `booking` and `sender-domain` are in neither npm deploy list nor the workflow's
   curated lists — they require manual deployment and could silently be missing from a fresh environment.
5. **Auth-gate drift**: garvis-pulse and garvis-consolidate check `x-worker-secret` directly instead of
   the shared `cronGate` (which also accepts `CRON_SECRET`); the arm function papers over this by sending
   the one secret under both headers.
6. **Anticipated-but-unbuilt providers**: the credits ledger prices `voiceover` ("one ElevenLabs
   narration") and `video_clip` ("Sora/Runway/Luma"), but no function calls those providers — video is
   Veo 3.1 (generation) + Shotstack (render).
7. **Two AI stacks coexist**: the provider-agnostic `_shared/ai.ts` seam (default `claude-sonnet-4-6`,
   free tier `claude-haiku-4-5-20251001`) used by ~17 reasoning functions, and a small legacy direct-fetch
   path in outreach-followups/resend-inbound using `gpt-4o-mini` or Lovable-gateway
   `google/gemini-2.5-flash`. agent-turn is deliberately Anthropic-only (raw response pass-through).
8. **The platform recursively provisions its customers' infrastructure**: deploy-backend deploys generated
   edge functions into the *user's own* Supabase project, injects an `ai_gateway_key`, and wires a
   per-minute pg_cron tick to the child's `automation-runner` — generated apps then bill AI usage back
   through ai-gateway against the owner's FableForge credits (margin `FF_AI_GATEWAY_MARGIN`).
9. **icsCore v1 limitation**: recurring calendar events are not expanded (stated in-code); the morning
   brief simply misses recurrences.
10. **standing-worker is the de-facto second application** (2,375 lines): six order kinds plus eight
    drain/sweep subsystems, the demo intelligence chain (strategist → art director → simulated owner →
    refine → honesty-gated bespoke HTML), and the entire outward-execution machinery. Any reconstruction
    effort should treat it, `_shared/prompts.ts`, and `_shared/previewSpec.ts` as the three highest-value
    files in the fleet.

