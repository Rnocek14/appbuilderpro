# 07 — Integrations, Environment Variables, Testing/CI, and Scripts

> Part of the system-reconstruction series. Evidence-based catalog of every external service the
> FableForge + Garvis system talks to, every environment variable, the OAuth/connections plumbing,
> the test & CI story, and the operational/deployment architecture described in `docs/`.
> All paths are relative to the repo root (`/home/user/appbuilderpro`).

---

## 1. Integration catalog (summary table)

Status legend — **LIVE**: full production code path, real API calls, authenticated, gated;
**LIVE (degrades)**: full code path but returns an honest `{available:false, setup:[...]}` /
named-error when its secret is unset (the house pattern); **STUB/PLANNED**: name reserved or spec
only, no working call path.

| Service | Purpose | Implementation files (primary) | Secrets / auth | Status |
|---|---|---|---|---|
| Supabase (own project) | The entire backend: Postgres, Auth, Storage, Edge Functions, pg_cron+pg_net+vault heartbeat | every function; `src/lib/supabase.ts` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (platform-injected); `VITE_SUPABASE_URL/ANON_KEY` client-side | LIVE |
| Supabase Management API | Provision per-app databases, apply migrations, deploy generated backends, in-app DB console, secrets | `provision-supabase`, `apply-migration`, `deploy-backend`, `db-console`, `_shared/oauth.ts` (`projectSupabaseToken`) | user OAuth token (`provider_connections`) → `SB_MANAGEMENT_TOKEN` PAT fallback → `FF_PLATFORM_MANAGEMENT_TOKEN` for managed cloud | LIVE |
| FableForge Cloud (managed DBs) | Lovable-style managed per-app Supabase projects under the operator's org, plan-capped | `provision-supabase`, `_shared/oauth.ts` | `FF_PLATFORM_MANAGEMENT_TOKEN`, `FF_PLATFORM_ORG_ID`, `FF_FREE_MANAGED_LIMIT`, `FF_PRO_MANAGED_LIMIT` | LIVE (degrades) |
| Anthropic / Claude | Default AI provider for all generation: chat, vision, streaming, and the `web_search` tool (research + "Claude scout" business discovery) | `_shared/ai.ts`, `research`, `discover-run`, `generate-app`, `chat-edit`, ~22 functions | `ANTHROPIC_API_KEY`, x-api-key header | LIVE |
| OpenAI | Alt chat provider; embeddings (`text-embedding-3-small`); image generation (`gpt-image-1`); reply classification | `_shared/ai.ts`, `_shared/embeddings.ts`, `generate-image`, `resend-inbound`, `inbox-draft` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | LIVE |
| OpenRouter | Alt chat provider (OpenAI-compatible) | `_shared/ai.ts` | `OPENROUTER_API_KEY` | LIVE |
| Local models (Ollama etc.) | `provider:'local'` — any OpenAI-compatible endpoint | `_shared/ai.ts` | `LOCAL_AI_BASE_URL` (default `http://localhost:11434/v1`), dummy key | LIVE |
| Lovable AI gateway | Legacy fallback for reply classification / drafts (`google/gemini-2.5-flash` via `ai.gateway.lovable.dev`) | `resend-inbound`, `inbox-draft`, `outreach-followups` | `LOVABLE_API_KEY` | LIVE (degrades; legacy) |
| Google Gemini / Veo 3.1 | Photoreal video scene generation (long-running predict → poll → download → Storage) | `generate-video`, `src/lib/garvis/videoScenes.ts` | `GEMINI_API_KEY` (+`VEO_MODEL`, `VEO_MODEL_FAST`, `GEMINI_BASE`, `VEO_COST_PER_SEC`) | LIVE (degrades) |
| Shotstack | Cloud video render: storyboard edit-JSON → mp4 | `render-video` | `SHOTSTACK_API_KEY`, `SHOTSTACK_ENV` (stage/v1) | LIVE (degrades) |
| Stripe — SaaS billing | FableForge Pro subscription + credit top-ups, customer portal | `create-checkout`, `customer-portal`, `stripe-webhook`, `_shared/stripe.ts` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_CREDITS_PRICE_ID/AMOUNT`, `VITE_STRIPE_PUBLISHABLE_KEY` | LIVE (degrades: "stub mode" without keys) |
| Stripe — client billing | Prospect "Make it mine" checkout via the operator's Payment Links; sale recording, auto-publish, churn tracking, failed-invoice notes | `client-checkout`, `stripe-webhook` (`handleClientSale`), `src/lib/garvis/billing/clientSale.ts`, `invoice-chase` | Same Stripe secrets; operator's Payment Links stored in `agency_billing_settings` | LIVE |
| Resend — send | THE ONE email send path (approval-gated, CAN-SPAM, suppression, caps, warmup) | `send-email` | `RESEND_API_KEY` | LIVE |
| Resend — sender domains | Per-brand sending domains: register domain, SPF/DKIM/DMARC records, verification status | `sender-domain` | `RESEND_API_KEY` | LIVE |
| Resend — delivery webhook | Open/click/bounce/complaint events (Svix-signed HMAC-SHA256, ±5 min replay window, constant-time) | `resend-webhook` | `RESEND_WEBHOOK_SECRET` | LIVE |
| Resend — inbound email | Reply ingestion + AI classification + sequence stop; forward-in mailbox | `resend-inbound` | `INBOUND_SECRET` (header `x-inbound-secret` only) | LIVE |
| Twilio — SMS | THE ONE SMS send path (approval-gated, TCPA consent fail-closed, STOP, caps, per-client from-number) | `send-sms`, `src/lib/garvis/sms.ts` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (HTTP Basic) | LIVE |
| Twilio — Voice inbound | Missed-call text-back: TwiML ring-through + dial-status callback + auto-SMS; X-Twilio-Signature HMAC-SHA1 validated | `voice-inbound`, `src/lib/garvis/missedCall.ts` | Same Twilio secrets + `VOICE_WEBHOOK_URL` (proxy pinning) | LIVE |
| DocuSign | E-signature: approval-gated envelope send, status poll, Connect webhook (HMAC, fail-closed), signed-PDF filing to Storage | `docusign-send`, `docusign-webhook`, `_shared/esignCore.ts`, `oauth` | Per-user OAuth (`DOCUSIGN_OAUTH_CLIENT_ID/SECRET`, Basic token auth) + `DOCUSIGN_AUTH_BASE` (sandbox default) + `DOCUSIGN_WEBHOOK_SECRET` | LIVE (sandbox by default) |
| GitHub | Export project source to a real repo via Git Data API (blobs→tree→commit→ref) | `github-export`, `oauth`, `_shared/connections.ts` | User OAuth token → request token → `GITHUB_TOKEN` PAT fallback | LIVE |
| Netlify | ALL hosting: generated-app deploys, demo-site Go-Live, custom-domain connection + SSL | `deploy-site`, `publish-preview`, `connect-domain` | `NETLIFY_AUTH_TOKEN` (per-user token possible via connections; OAuth is "C4", not built) | LIVE |
| Google Ads | Read-only campaign metrics sync (GAQL searchStream) + 2AM anomaly watchdog | `ads-sync`, `ads-watch`, `_shared/adsWatchCore.ts` | `GOOGLE_ADS_DEVELOPER_TOKEN/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/LOGIN_CUSTOMER_ID` (OAuth refresh flow) | LIVE (degrades) |
| Meta Ads | Read-only Insights sync (Graph API v21) + same watchdog | `ads-sync`, `ads-watch` | `META_ADS_ACCESS_TOKEN` (System User token) | LIVE (degrades) |
| Ayrshare | Social publishing + analytics for 9 networks (facebook, instagram, linkedin, gmb, twitter/X, youtube, tiktok, pinterest, reddit) | `social-publish`, `social-sync`, `_shared/socialCore.ts` | Per-user API key in `provider_connections` (connections hub), Bearer | LIVE |
| MLS (RESO Web API) | Real-estate listing sync: OData feed probe/save/paged sync into `mls_listings` | `mls-sync` | Per-user feed `base_url` + bearer token, sealed in `provider_connections` | LIVE |
| Google Places | Business discovery firehose (searchText, paginated) for the daily client hunt | `discover-run`, `discover-media`, `standing-worker` | `GOOGLE_PLACES_API_KEY` (X-Goog-Api-Key) | LIVE (degrades) |
| Serper | Web search + page scrape (google.serper.dev / scrape.serper.dev) for research & opportunity hunts | `discover-media`, `standing-worker` | `SERPER_API_KEY` (X-API-KEY) | LIVE (degrades) |
| Perplexity | `sonar` model with `return_images` for Explorer topic discovery | `discover-media` | `PERPLEXITY_API_KEY` | LIVE (degrades) |
| ScreenshotOne (or compatible) | Server-side page screenshots for pitch emails / before-after audits | `shot-worker` | `SCREENSHOT_API_KEY`, `SCREENSHOT_API_URL` | LIVE (degrades) |
| Embeddings provider | Semantic memory vectors (1536-dim, pgvector) — OpenAI-compatible `/embeddings` | `_shared/embeddings.ts`, `embed-worker`, `ingest-document` | `EMBEDDINGS_API_KEY` (falls back to `OPENAI_API_KEY`), `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL` | LIVE (degrades to lexical) |
| Discord / Slack webhooks | Operator push notifications (pulse, sold, watchdog, canary) — URL-sniffed auto-format | `_shared/notify.ts` (SSRF-guarded via safeFetch) | Owner-set `profiles.webhook_url` | LIVE |
| ICS calendar feeds | Read-only "what's on the calendar next 24h" for the morning pulse | `_shared/icsCore.ts`, `garvis-pulse` | Owner-set `profiles.calendar_ics_url` (https only, safeFetch) | LIVE (v1: no recurrence expansion) |
| Booking | In-house public booking pages (no external calendar API); DB exclusion constraint prevents double-booking | `booking`, `src/lib/garvis/booking/schedule.ts`, `_shared/bookingNotify.ts` | Slug-keyed public endpoint, service role | LIVE (self-contained) |
| Web scraping | `fetch-url` (page text/images/save), tech fingerprinting, hardened SSRF-safe fetch | `fetch-url`, `_shared/safeFetch.ts`, `_shared/techFingerprint.ts` | none (browser-UA headers) | LIVE |
| Vercel | Named in the connections `PROVIDERS` set only — no probe, no OAuth config, no deploy path | `connections/index.ts` | — | STUB |
| Netlify OAuth | "C4 adds: netlify" comment in `_shared/oauth.ts`; today Netlify is token-paste only | `_shared/oauth.ts` | — | PLANNED |
| Google Business / Calendar sync / per-client e-sign connectors | In the per-client connector catalog with `built:false` ("Coming soon") | `src/lib/garvis/clients/connections.ts` | — | PLANNED |
| Shared free-tier DB (`data-api`) | Hybrid DB model S1 (edge-mediated multi-tenant shared project) | `docs/hybrid-db.md` spec only | — | SPEC ONLY |
| Cloud Console CC2–CC9 | Full Lovable-Cloud parity (auth users, storage, logs, backups) | `docs/cloud-console.md`; `db-console` implements CC1 row-edit + secrets + tables | — | PARTIAL (CC1 built) |

**Count: ~30 distinct external integrations; 25 are live code paths (most degrade honestly when
unconfigured), ~5 are stubs/specs (Vercel, Netlify OAuth, 3 "coming soon" client connectors, shared
DB tier, Cloud Console phases 2–9).**

---

## 2. Integration details, with evidence

### 2.1 Supabase (the platform itself)

- **Client side**: `src/lib/supabase.ts` builds the supabase-js client from `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`, falling back to `http://localhost:54321` + `'missing-key'` with a
  console warning when unset (`supabaseConfigured` flag). This graceful fallback is what lets the
  backendless Playwright suites boot the app.
- **Edge side**: every one of the 67 functions creates two clients — an anon client carrying the
  caller's `Authorization` JWT for `auth.getUser()` identity, and a service-role `admin` client
  for privileged reads/writes. The platform injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (127/44/76 usages respectively).
- **Management API** (`https://api.supabase.com/v1`): used server-side only (browser is blocked by
  CORS and must never hold the PAT). Token resolution ladder in
  `supabase/functions/_shared/oauth.ts` → `projectSupabaseToken(admin, userId, managed)`:
  - managed project → `FF_PLATFORM_MANAGEMENT_TOKEN` (the FableForge Cloud org PAT)
  - else the user's own Supabase OAuth token (refreshed if near expiry)
  - else the operator's `SB_MANAGEMENT_TOKEN` PAT.

### 2.2 provision-supabase — the managed-cloud story

`supabase/functions/provision-supabase/index.ts` is the Lovable-style one-click database:

1. Tier selection: user has their own Supabase OAuth connection → BYO (their org, uncapped);
   otherwise, if `FF_PLATFORM_MANAGEMENT_TOKEN` + `FF_PLATFORM_ORG_ID` are set → **managed** under
   FableForge's org (`supabase_managed=true` on `projects`), plan-capped
   (`FF_FREE_MANAGED_LIMIT` default 2, `FF_PRO_MANAGED_LIMIT` default 50; over-cap → HTTP 402
   upsell).
2. Creates the project (`POST /v1/projects`, region default `us-east-1`, random db password,
   `desired_instance_size:'nano'` for managed — "scale-to-zero on the Supabase for Platforms tier").
3. Polls up to ~50 s for `ACTIVE_HEALTHY`; if not ready returns `{status:'provisioning'}` and the
   client re-calls (idempotent, ref stored on the project row).
4. Fetches the anon API key, writes the generated app's `/.env`
   (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`) into `project_files`, and applies
   `/supabase/migrations/0001_init.sql` via the `database/query` endpoint.

`deploy-backend` then pushes the generated app's edge functions + Function Secrets to that project
through the same Management API (approval-spine gated — see §2.10), and issues each deployed app a
per-app `ai_gateway_key` so generated apps get managed AI (§2.3). `db-console` and
`apply-migration` give the in-app DB console (tables/rows/query/row-edit/secrets/storage-bucket
actions) over the same token ladder. `docs/hybrid-db.md` specs the not-yet-built shared free tier
(edge-mediated `data-api`, schema-per-app), explicitly rejecting "schema + shared anon key" as
unsafe.

### 2.3 AI providers (Anthropic / OpenAI / OpenRouter / local) + the AI gateway

`supabase/functions/_shared/ai.ts` is the single provider-agnostic seam:

- `AI_PROVIDER` ∈ `anthropic | openai | openrouter | local`, `AI_MODEL` (default
  `claude-sonnet-4-6`). Anthropic uses `x-api-key` + `anthropic-version: 2023-06-01`; the other
  three share the OpenAI `chat/completions` shape (OpenRouter at `openrouter.ai/api/v1`, local at
  `LOCAL_AI_BASE_URL`).
- Functions: `complete()`, `completeVision()` (base64 image blocks / `image_url` data URIs),
  `completeStream()` (SSE), `completeWithWebSearch()` (**Anthropic-only** — the
  `web_search_20250305` server-side tool with citations; used by `research` and by
  `discover-run`'s "Claude scout" mode where a lead is persisted only if grounded in a real
  citation URL).
- Cross-cutting discipline: 300 s `AbortSignal.timeout` on every provider call, 3-attempt
  exponential retry (never on 400/401), an in-file `PRICING` table (per-1M-token $) feeding
  `estimateCost`, and `modelForPlan()` which routes free-plan users to the cheapest capable model
  (`claude-haiku-4-5…` / `gpt-4o-mini` / `anthropic/claude-3.5-haiku`; overridable with
  `AI_FREE_MODEL`).
- ~22 functions consume it (generate-app, chat-edit, garvis-brain, garvis-worker,
  standing-worker, board-copy, cluster-chat, explorer-turn, agent-turn, draft-plan, inbox-draft,
  job-worker, ingest-document, garvis-consolidate, garvis-short-script, research, discover-run,
  docusign-send/webhook, booking, stripe-webhook, ai-gateway).
- Every AI-spend surface is **credit-gated** via `_shared/credits.ts`
  (`checkCredits`/`spendCredits`, `InsufficientCreditsError` → HTTP 402).
- **`ai-gateway`** is the managed-AI runtime for *generated apps*: external apps authenticate with
  a per-app key (`x-fableforge-key` / Bearer, matched to `projects.ai_gateway_key`), requests are
  bounded (last 24 messages × 8 k chars, ≤4096 tokens), run on the operator's provider key, and
  metered against the app **owner's** credit balance with a margin
  (`FF_AI_GATEWAY_MARGIN`, default 1.25). Deployed `--no-verify-jwt`.
- **Direct mode (dev only)**: `src/lib/aiClient.ts` + `src/lib/aiConfig.ts` — when
  `VITE_AI_DIRECT=true` the browser calls the provider itself with `VITE_AI_API_KEY` /
  `VITE_AI_PROVIDER` / `VITE_AI_MODEL` / `VITE_LOCAL_AI_BASE_URL`. `.env.example` warns "NEVER
  ship a build with these set."
- **Lovable gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`, model
  `google/gemini-2.5-flash`, `LOVABLE_API_KEY`) survives as a fallback classifier/drafter in
  `resend-inbound`, `inbox-draft`, `outreach-followups` — a remnant of the swift-prep-pros port
  (send-email explicitly notes "no Lovable gateway dependency" for sending).

### 2.4 Image, video, and screenshots

- **generate-image**: OpenAI `gpt-image-1` (`/v1/images/generations`, sizes 1024²/1536×1024/
  1024×1536, quality medium), result stored in the `project-assets` bucket, optional
  `cluster_files` vault row; credit-charged $0.04–0.07. No key → `{available:false, setup:[3-step
  instructions]}`. The honesty gate (never fake a real property photo) lives upstream in
  `src/lib/garvis/imagegen.ts`.
- **generate-video** (Google Veo 3.1 via Gemini API `generativelanguage.googleapis.com/v1beta`):
  `models/<model>:predictLongRunning` → poll operation → download clip with `x-goog-api-key` →
  store `scroll_scenes` mp4 in Storage → operator approves before the site generator may use it.
  Models `veo-3.1-generate-preview` / `veo-3.1-fast-generate-preview`
  (`src/lib/garvis/videoScenes.ts`), cost estimated at `VEO_COST_PER_SEC` (default $0.75) × 8 s.
- **render-video** (Shotstack): edit-JSON timeline → `POST /edit/{stage|v1}/render`, poll
  `/render/{id}`; browser preview works with zero config, mp4 needs the key; $0.25/render credits.
- **shot-worker** (ScreenshotOne-compatible): shoots either `APP_ORIGIN/preview-site/<slug>/email-shot`
  or an external URL (SSRF-validated first), 2× device-scale PNG, cookie-banner blocking, 10 MB cap,
  $0.03 credits, stored under `<uid>/shots/`.

### 2.5 Stripe — two distinct billing systems in one webhook

**A. FableForge SaaS billing** (the operator pays FableForge):
- `create-checkout`: Pro subscription or one-time credit top-up; same-origin `returnUrl`
  enforcement (open-redirect fix documented in-line); `ensureCustomer` persists
  `profiles.stripe_customer_id`.
- `customer-portal`: Stripe billing-portal session (portal config must exist in the dashboard).
- `_shared/stripe.ts`: pinned `apiVersion '2026-03-25.dahlia'`; **one canonical sync**
  (`syncSubscription`) re-fetches subscription state from Stripe and mirrors into
  `stripe_subscriptions` + `profiles.plan` — webhooks are triggers only, never trusted for state.
- `stripe-webhook` (deployed `--no-verify-jwt`): raw-body signature verification via
  `constructEventAsync`, event-id idempotency, credits granted on `checkout.session.completed`
  with `metadata.kind='credits'`.

**B. Client billing** (a local business pays the operator):
- `client-checkout` (public/anon): prospect taps "Make it mine" on their demo → pending
  `client_subscriptions` row → redirect to the operator's **Stripe Payment Link**
  (`agency_billing_settings.website_payment_link` / `automation_payment_link`) with
  `client_reference_id=<sale uuid>` + `prefilled_email` (`buildPaymentUrl` in
  `src/lib/garvis/billing/clientSale.ts`). Tiers: website $1,500 one-time / website+automation
  $500/mo (`clientTiers.ts`). Anon burst cap 5 pending/min/preview. No link configured → honest
  503 + a `mind_events` "a buyer is waiting" note.
- `stripe-webhook → handleClientSale()`: a uuid `client_reference_id` routes the event to the
  client-sale path (guarded so non-uuid FableForge sessions can't 500 the webhook): flips the sale
  active, records real `amount_total` + subscription id, marks the demo `purchased`, and
  **auto-publishes** the stashed site HTML via a worker-secret server-to-server call to
  `publish-preview` (decision table `saleActionOnPaid`: convert / publish / notify). Operator gets
  a 💰 SOLD mind-event + Discord/Slack push. `handleClientSubscriptionChange` books churn with a
  no-resurrection guard against out-of-order Stripe events; `invoice.payment_failed` drops a chase
  note.
- `invoice-chase` (daily cron): the operator's own invoices ride a 4-stage chase ladder
  (upcoming → due → firm → final), each stage firing once as a **pending approval** through
  send-email — nothing sends without the owner (or an explicit autonomy grant via
  `_shared/autonomyGate.ts`).

### 2.6 Resend (email, 4 functions)

- `send-email` — "THE ONE SEND PATH": requires an owned, APPROVED `approvals` row
  (kind `send_email`), payload-hash tamper check, atomic double-send claim, then gates: kill
  switch (`outreach_settings.outbound_enabled`), CAN-SPAM physical address + List-Unsubscribe
  headers, recipient validity, suppression list (email+domain), contact `email_status`, campaign
  state, daily cap + warmup ramp. Two callers, one path: owner JWT, or the standing worker with
  `x-worker-secret` restricted to `requested_by='garvis-auto'` approvals. Sends direct to
  `api.resend.com/emails`.
- `sender-domain` — registers a client's domain with Resend, returns exact SPF/DKIM/DMARC records,
  triggers + reports verification (per-brand from-addresses that land in inboxes).
- `resend-webhook` — Svix-signed delivery events (sent/delivered/opened/clicked/bounced/
  complained/delayed/failed); bounces/complaints feed the suppression list and flip contact
  status. HMAC-SHA256 over `id.ts.body`, base64-decoded `whsec_` secret, ±300 s replay window,
  constant-time compare.
- `resend-inbound` — inbound replies: shared secret **header-only** (`x-inbound-secret`; the
  query-param fallback was removed because it leaked into logs), correlates by in-reply-to /
  references / from-address, AI-classifies positive/negative/neutral (OpenAI → Lovable → keyword
  heuristic), stops the sequence, flips campaign state. Also the "forward-in mailbox"
  (`in-xxxxxxxx@yourdomain` via a Resend inbound domain MX).
- `unsubscribe` — RFC 8058 one-click List-Unsubscribe endpoint; the per-send message UUID is the
  capability (POST from mailbox providers, GET renders a confirmation page).

### 2.7 Twilio (SMS + voice)

- `send-sms` — the SMS twin of send-email: approval-spine, payload hash, atomic claim, then:
  `outreach_settings.sms_enabled` kill switch (OFF by default), Twilio configured, valid E.164,
  **TCPA consent fail-closed** (`smsConsentOk`, marketing vs transactional), STOP honored
  (`phone_status='unsubscribed'`), placeholder gate (`[YOU FILL…]` refuses), daily SMS cap.
  Per-client sender routing: `payload.from_number` (the client's own Twilio number stored on
  `client_subscriptions.twilio_number`) falls back to the shared `TWILIO_FROM_NUMBER`; one Twilio
  account (SID/token) for all. HTTP Basic to
  `api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`.
- `voice-inbound` — public Twilio Voice webhook, `--no-verify-jwt`, **every request
  X-Twilio-Signature-validated** (HMAC-SHA1 over URL+sorted-params, candidate URLs tried because
  Supabase's proxy can rewrite `req.url`; pin with `VOICE_WEBHOOK_URL`). Stage `inbound` returns
  TwiML that rings the business's real line; stage `status` texts the caller back on
  no-answer/busy/failed (missed-call text-back), with `call_sid` idempotency against Twilio
  callback retries, STOP honored, everything logged to `missed_call_events`. Errors always return
  valid TwiML — never crash a live call. Config rows (`missed_call_configs`) are the
  pre-authorization (fixed template, caller-initiated single reply).
- `docs/twilio-setup.md` covers the full external ceremony: paid account, Voice+SMS number
  (~$1.15/mo), **A2P 10DLC brand + campaign registration (1–3 business days, blocking for US
  SMS)**, voice webhook pointing, secrets, kill switches, cost table.

### 2.8 DocuSign

- OAuth provider (authorization-code, **no PKCE, HTTP Basic on the token endpoint**), scope
  `signature`; environment is config-not-code: `DOCUSIGN_AUTH_BASE` defaults to the developer
  sandbox `account-d.docusign.com` ("signatures there are NOT legally binding"), production flips
  the env after DocuSign go-live review.
- `docusign-send`: owner-JWT only ("a human approves every envelope" — no worker path), approval
  kind `send_for_signature`, atomic claim (envelope POST isn't idempotent), account/base-uri
  resolved from the token's `/oauth/userinfo` (env drift can't 401). `action:'status'` is an
  owner-scoped poll — the honest fallback when the webhook isn't configured.
- `docusign-webhook` (Connect receiver, `--no-verify-jwt`): **fails closed** — no
  `DOCUSIGN_WEBHOOK_SECRET` → reject everything; HMAC-SHA256 verified. On completion it pulls the
  combined signed PDF with the owner's token and files it in Storage
  (`<uid>/esign/<envelopeId>.pdf`).
- `_shared/esignCore.ts` (pure, verified): `{{token}}` merge that never invents values (unfilled →
  visible `[needs your input: …]` holes + refusal to send), status maps that return null on
  unknown states, chunked base64 (fixing a documented `String.fromCharCode(...spread)` crash in
  the harvested "lakegen" source).

### 2.9 GitHub

- `github-export`: full-snapshot export via the Git Data API — `/user` →
  ensure repo (auto-create private with `auto_init`) → blobs → tree (on base tree) → commit →
  ref PATCH. Token priority: user's OAuth connection (`freshProviderToken`) → request-supplied
  token → operator `GITHUB_TOKEN` PAT.
- OAuth: classic GitHub OAuth app (no PKCE, secret in body; the code handles GitHub's 200-on-error
  token responses), scope `repo`, creds `GITHUB_OAUTH_CLIENT_ID/SECRET`.

### 2.10 Netlify — where sites actually get hosted

Netlify is the **only** deploy target for static sites (Supabase Management API is the only
backend target; there is no Vercel/Cloudflare/S3 path):

- `deploy-site`: publishes a generated app's built `dist/` (built client-side in the
  WebContainer; the function only uploads). Requires an APPROVED `deploy_site` approval; replay
  returns the durable prior result. Files go up via Netlify's digest deploy API. Token: payload
  `netlify_token` (user's own) or `NETLIFY_AUTH_TOKEN`.
- `publish-preview` ("Go Live" for demo sites): the operator's browser renders the finished
  single-file `index.html`, the function uploads it, binds `preview_sites.netlify_site_id`, and
  **stashes the HTML in Storage** so a later Stripe sale can auto-publish with no browser. It also
  re-hosts external (scraped) images onto `project-assets` and rewrites the HTML (durability +
  provenance; fail-soft per image). Second caller: the Stripe webhook via `x-worker-secret`.
- `connect-domain`: migrates a client's existing domain — PATCH `custom_domain` on the Netlify
  site, POST `/ssl` to nudge provisioning, then reports the **exact DNS records** the client adds
  at their registrar (`dnsRecordsFor` from `src/lib/preview/domainCore.ts`) and live status:
  `Deno.resolveDns` A/CNAME verification against the Netlify host + SSL state. Web records only —
  never MX ("their email is never touched"). There is **no registrar API**; DNS changes are
  manual-by-client with honest verification.

### 2.11 Google Ads / Meta Ads

- `ads-sync` — **read-only by design** ("Garvis never mutates campaigns"). Meta: Graph API v21
  `act_<id>/insights` daily campaign metrics, System-User token. Google: OAuth
  refresh-token flow (`oauth2.googleapis.com/token`) → GAQL `googleAds:searchStream` on v21;
  optional MCC via `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Upserts last-30d rows into `ad_metrics`
  (idempotent), per-user non-secret config (ad-account / customer id) in `public.connections`
  (app_0038); errors land in `connections.last_error`, never invented rows. `mode:'status'`
  reports which providers are server-configured.
- `ads-watch` — the 2AM watchdog cron: re-syncs through ads-sync, judges yesterday against a
  7-day baseline with the verified `adsWatchCore` (min-sample gated, "a missing report is never
  zero"), pushes ≤5 alerts to webhook + mind_events, 3-day anomaly dedupe. Detection only — no
  auto-pause, no budget writes.

### 2.12 Social publishing (Ayrshare)

- `social-publish`: approval-spine (`publish_post`), per-user Ayrshare API key from
  `provider_connections` (connections hub — no global secret), posts via
  `app.ayrshare.com/api/post`. Networks (from `_shared/socialCore.ts`): **facebook, instagram,
  linkedin, gmb (Google Business), twitter/X, youtube, tiktok, pinterest, reddit** — with
  platform-specific refusal gates (media required for IG/TikTok/YouTube/Pinterest, 280-char X
  cap, no past-scheduling) enforced before queueing and re-checked server-side.
- `social-sync` (6-hourly cron + on-demand): per-post analytics from
  `app.ayrshare.com/api/analytics/post` into `social_post_metrics` — every metric nullable
  ("absent = NULL, never fake 0"), raw provider object stored verbatim, plan-gated 403 recorded
  as `available:false` (Ayrshare analytics needs Premium/Business; posting works on free).

### 2.13 MLS (real estate)

`mls-sync` is a real **RESO Web API (OData)** client, rebuilt from the harvested lakegen code
("its client was real; nothing ever called it"): `save` probes the feed with one `$top=1` query
before storing per-user `base_url`+token in `provider_connections` (sealed; browser never sees
them); `sync` pulls listings changed since the newest held `ModificationTimestamp`
(`$orderby`, 200/page, max 5 pages ≈1000 listings per call, honest partial-progress reporting)
into `mls_listings` with RESO standard field mapping (status text stored as-said, never
normalized guesses); `status` returns counts, no secrets. `world_id` stamping keeps two realtor
clients' markets separate.

### 2.14 Discovery / research / scraping

- `discover-run` — the lead-pool engine over an (every-local-niche × every-major-metro) grid,
  two engines: **Claude scout** (Anthropic `web_search`; a business persists only with a real
  returned citation URL — `groundScoutLeads`) and **Google Places** (`places:searchText`, 3 pages
  ≈60 results, field-mask). Dedupes into `discovered_businesses`; exhaustion tracking per query.
- `discover-media` — server-side proxy holding Perplexity (`sonar`, `return_images`) and Serper
  keys (they must never ship via VITE_), flat-cost credit metering ($0.006/$0.002/$0.003).
- `research` — deep app+market analysis: builds a ranked, capped source-code digest (140 k chars)
  and runs Anthropic web-search with a calibration-heavy system prompt (no bare completeness
  percentages, fact/judgment separation).
- `fetch-url` — the one hardened page reader: title/description/readable-text extraction (12 k
  cap), `mode:'images'` asset harvest (60 images max, skip-pixel heuristics), `mode:'save'`
  copies one image into Storage. Sends a **real Chrome browser fingerprint**
  (UA/Accept/Accept-Language) because small-business WAFs 403 bot-ish agents — documented as the
  honest way to see what a human sees; GET-only, SSRF-guarded. Plus
  `_shared/techFingerprint.ts` — regex fingerprints of builders (wix/squarespace/godaddy/
  wordpress/shopify…), booking widgets (calendly/jobber/opentable), chat (intercom/podium),
  analytics (GTM) on scraped sites.
- **`_shared/safeFetch.ts`** — the SSRF spine shared by fetch-url, shot-worker, notify, publish
  image-rehost, MLS: scheme+hostname literal checks, full private/reserved IPv4+IPv6 table (CGNAT,
  metadata 169.254, decimal/hex IP forms, IPv4-mapped v6), **DNS resolution requiring every A/AAAA
  record public** (rebinding defense), and manual redirect-following re-validating every hop
  (cap 5). There are **no proxies** — bot-blocking is handled only by browser headers, and heavy
  scraping is delegated to providers (Serper scrape, ScreenshotOne, Places, Anthropic web_search)
  who fetch on their own infrastructure.

### 2.15 Calendar / booking

- No Google Calendar / Calendly API integration exists. Calendar input is **read-only ICS**:
  `profiles.calendar_ics_url` (https-only) fetched by `garvis-pulse` through safeFetch,
  parsed by the pure `_shared/icsCore.ts` (all-day + UTC forms; recurrence NOT expanded — an
  explicitly stated v1 limitation). `src/lib/garvis/ics.ts` re-exports it; `verify:ics` tests it.
- Booking is fully in-house: `booking` edge function is the public API for `booking_pages` /
  `booking_services` / appointments, with availability computed by the pure verified
  `schedule.ts`, race-proof double-booking via a Postgres gist exclusion constraint, and operator
  notification via `bookingNotify` (mind_event + webhook). "Calendar sync" for clients is a
  `built:false` connector.

### 2.16 Voice/telephony beyond Twilio

None. Twilio is the only telephony provider (SMS + voice). No Vapi/Bland/ElevenLabs/etc.

---

## 3. The OAuth flow and the connections systems

There are **three distinct "connections" systems** — easy to confuse:

### 3.1 `provider_connections` — the operator's OAuth/token vault (app_0014)

- Table `provider_connections` (app_0014): one row per (user, provider) with
  access/refresh tokens, expiry, scope, label, metadata. **RLS enabled with zero policies** — the
  browser can never read tokens; only service-role edge functions touch them. `projects` gains
  `supabase_project_ref` in the same migration.
- `connections` edge function: `list` (sanitized status only), `connect` (paste a token —
  probe-validated first), `test`, `disconnect`. Providers accepted:
  `supabase, github, netlify, vercel, docusign, ayrshare`. `probeProvider` validates against each
  provider's identity endpoint (GitHub `/user`, Netlify `/api/v1/user`, Supabase
  `/v1/organizations`, DocuSign `/oauth/userinfo`, Ayrshare `/api/user`); unknown providers
  (vercel) are accepted without a probe.
- `oauth` edge function + `_shared/oauth.ts` + `oauth_states` (app_0015): the real OAuth
  authorization-code flow.
  - `action:'start'` → PKCE verifier+S256 challenge (when the provider requires it), random CSRF
    state stored in `oauth_states` (state, user_id, provider, code_verifier, redirect_uri;
    RLS-locked, service-role only), returns the authorize URL.
  - `action:'exchange'` → validates state ownership + provider match, **15-minute state TTL**
    (expired states deleted), exchanges the code (body creds or HTTP Basic per provider),
    probes the token for a label, upserts into `provider_connections`. Tokens never return to the
    browser. `src/pages/OAuthCallback.tsx` is the front-end callback route.
  - Configured providers in `OAUTH_PROVIDERS`: **supabase** (PKCE, scope `all`, creds
    `SB_OAUTH_CLIENT_ID/SECRET` — deliberately not `SUPABASE_*`, that prefix is platform-reserved),
    **github** (no PKCE, scope `repo`), **docusign** (no PKCE, Basic token auth, scope
    `signature`, env-switchable auth base). Comment: "C4 adds: netlify".
  - `freshProviderToken()` auto-refreshes near-expiry tokens; `projectSupabaseToken()` is the
    managed/BYO/PAT resolution ladder (§2.1).

### 3.2 `public.connections` — ad-platform config (app_0038)

A different table entirely: per-owner **non-secret** ad config (`{ad_account_id}` /
`{customer_id}`) with `status/last_synced_at/last_error`, owner-RLS'd. The actual ad tokens are
global edge secrets. `ad_metrics` (platform-reported spend/impressions/clicks) is owner-read-only;
writes arrive only via ads-sync's service role.

### 3.3 `client_connections` — the per-client account-hookup checklist

`src/lib/garvis/clients/connections.ts` (pure, verified by `verify:clientconnections`) +
`connectionsStore.ts` (impure) + the Client Book UI:

- Catalog of 9 connectors: **domain, email_sender, sms_number, voice_number, booking, payments**
  (built) and **google_business, calendar, esign** (`built:false` → "Coming soon", never nags).
- `seedForTier`: when a client is won, every connector gets a row; the purchased tier decides
  `needed` vs `not_needed` (website: domain+email_sender+payments; website_automation adds
  sms_number+voice_number+booking).
- `deriveStatus`: status is **derived from evidence in each connector's own table** (the row is a
  thin index, never a copy): `preview_sites.custom_domain`, `world_sender_identities.from_email`,
  `client_subscriptions.twilio_number`, `missed_call_configs` (exists + enabled),
  `booking_pages` (exists + enabled), `client_subscriptions.stripe_subscription_id`. A human's
  explicit `not_needed`/`pending`/`error` is never auto-overwritten.
- `requiredConnectors(capabilityId, channel)` + `automationReady`: an automation may be switched
  on only when every required connector is `connected`; missing ones are named exactly.

---

## 4. Environment variable inventory (complete)

### 4.1 Browser-side (`VITE_*`, baked into the bundle)

| Variable | Purpose | Consumed in |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | `src/lib/supabase.ts` (fallback `http://localhost:54321`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | `src/lib/supabase.ts` |
| `VITE_AI_DIRECT` | Dev-only: browser calls the AI provider directly | `src/lib/aiConfig.ts` (`DIRECT`) |
| `VITE_AI_PROVIDER`, `VITE_AI_MODEL`, `VITE_AI_API_KEY`, `VITE_LOCAL_AI_BASE_URL` | Direct-mode provider config/key | `src/lib/aiConfig.ts`, `aiClient.ts`, `garvis/directBrain.ts`, `garvis/embeddings.ts` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (billing UI) | referenced in `.env.example` / RUNBOOK (billing pages) |
| (dev script only) `VITE_PERPLEXITY_API_KEY`, `VITE_SERPER_API_KEY` | read from `.env.local` by `scripts/discover-test.mjs` — production keys moved server-side to `discover-media` | scripts only |

### 4.2 Edge-function secrets (`supabase secrets set …`)

Platform-injected (never set manually): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

| Variable | Pillar | Purpose / consumers |
|---|---|---|
| `AI_PROVIDER`, `AI_MODEL` | AI | provider+model selection (`_shared/ai.ts`) |
| `AI_FREE_MODEL` | AI | override the free-plan cheap model (`modelForPlan`) |
| `AI_PREMIUM_MODEL` | AI | premium model override (garvis-brain/worker paths) |
| `ANTHROPIC_API_KEY` | AI | Anthropic messages + web_search (`_shared/ai.ts`, `discover-run`) |
| `OPENAI_API_KEY` | AI | OpenAI chat, `gpt-image-1` (`generate-image`), embeddings fallback, reply classification |
| `OPENAI_BASE_URL` | AI | embeddings base fallback (`_shared/embeddings.ts`) |
| `OPENROUTER_API_KEY` | AI | OpenRouter provider |
| `LOCAL_AI_BASE_URL` | AI | local OpenAI-compatible endpoint |
| `LOVABLE_API_KEY` | AI (legacy) | Lovable gateway fallback (`resend-inbound`, `inbox-draft`, `outreach-followups`) |
| `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL` | memory | server-side embeddings (`_shared/embeddings.ts`, `embed-worker`) |
| `WORKER_SECRET` | heartbeat | shared `x-worker-secret` gate for all cron workers + server-to-server calls (19 usages; `_shared/cronGate.ts`) |
| `CRON_SECRET` | heartbeat | `x-cron-secret` for daily crons (arm sends one value under both headers since app_0092) |
| `RESEND_API_KEY` | email | `send-email`, `sender-domain`, followups/reactivate |
| `RESEND_WEBHOOK_SECRET` | email | Svix secret for `resend-webhook` |
| `INBOUND_SECRET` | email | `resend-inbound` shared secret |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | texting | `send-sms`, `voice-inbound` |
| `VOICE_WEBHOOK_URL` | texting | pin the exact Twilio-signed URL behind the proxy |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing | `_shared/stripe.ts`, `stripe-webhook` |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_CREDITS_PRICE_ID`, `STRIPE_CREDITS_AMOUNT` | billing | `create-checkout` |
| `AYRSHARE_API_KEY` | social | listed in `.env.example`; at runtime the key is per-user in `provider_connections` (connections hub) |
| `SHOTSTACK_API_KEY`, `SHOTSTACK_ENV` | video | `render-video` |
| `GEMINI_API_KEY`, `GEMINI_BASE`, `VEO_MODEL`, `VEO_MODEL_FAST`, `VEO_COST_PER_SEC` | video | `generate-video` (Veo) |
| `SERPER_API_KEY` | research | `discover-media`, `standing-worker` opportunity hunts |
| `PERPLEXITY_API_KEY` | research | `discover-media` |
| `GOOGLE_PLACES_API_KEY` | discovery | `discover-run`, `discover-media`, `standing-worker` daily hunt |
| `SCREENSHOT_API_KEY`, `SCREENSHOT_API_URL` | outreach | `shot-worker` |
| `APP_ORIGIN` | outreach | the deployed frontend origin — pitch emails embed `$APP_ORIGIN/preview-site/<slug>`; **unset = hunts build demos but queue no pitches (silent)** |
| `NETLIFY_AUTH_TOKEN` | ship | `deploy-site`, `publish-preview`, `connect-domain` |
| `GITHUB_TOKEN` | ship | operator PAT fallback for `github-export` |
| `SB_MANAGEMENT_TOKEN` | ship | operator Supabase PAT fallback (`apply-migration`, `deploy-backend`, `db-console`, `provision-supabase`) |
| `SB_OAUTH_CLIENT_ID`, `SB_OAUTH_CLIENT_SECRET` | oauth | Supabase OAuth app creds |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | oauth | GitHub OAuth app creds |
| `DOCUSIGN_OAUTH_CLIENT_ID`, `DOCUSIGN_OAUTH_CLIENT_SECRET`, `DOCUSIGN_AUTH_BASE`, `DOCUSIGN_WEBHOOK_SECRET` | e-sign | DocuSign OAuth + Connect HMAC |
| `META_ADS_ACCESS_TOKEN` | ads | Meta Insights (System User token) |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ads | Google Ads GAQL sync |
| `FF_PLATFORM_MANAGEMENT_TOKEN`, `FF_PLATFORM_ORG_ID` | managed cloud | FableForge Cloud org provisioning |
| `FF_FREE_MANAGED_LIMIT`, `FF_PRO_MANAGED_LIMIT` | managed cloud | per-plan managed-DB caps (2 / 50) |
| `FF_AI_GATEWAY_MARGIN` | managed AI | margin multiplier on gateway spend (1.25) |
| `FABLEFORGE_AI_URL`, `FABLEFORGE_AI_KEY` | managed AI | injected into deployed apps' function secrets (deploy-backend) |
| `BESPOKE_DEMOS` | hunts | `standing-worker`: `'0'` opts OUT of AI-bespoke demo specs (default on) |

Notes on `.env.example`: it documents every secret above except the OAuth client creds,
Twilio, DocuSign, Gemini/Veo, Stripe price ids, Lovable, and the FF_* platform family — those are
documented in `docs/RUNBOOK.md`, `docs/go-live-checklist.md`, `docs/twilio-setup.md` and in
function headers instead. The Health page (`system-control`'s SECRETS map) is the live
presence-check of the full list.

---

## 5. Testing & CI

### 5.1 The verify:* suites (116 scripts)

`package.json` carries **116 `verify:*` scripts**, each `tsx <module>.verify.ts` — pure-logic
assertion suites with no DB and no network (CI runs every one on every push). Categories:

- **Garvis core brain**: knowledge, objective, profiles, liveness, triage, followup, marketing,
  mission, commander, opportunities, observability, content, orchestrator (+cases), depth, mind,
  workweb, workshops, clusterChat, nextMove, worldIntel, systemView, universeView, genesis,
  intake, situation, adaptive, assist, gauntlet fuzz (`verify:fuzz`), clustering, universe, loops.
- **Builder/preview pipeline**: safeedit, pendingedit, branches, qa, preview spec, publishcore,
  bespokesite, domaincore, weblayout, scrapeprofile, visualgrammar, repogenesis.
- **Outreach/comms**: mailer, outreachbatch, sms, missedcall, senderdomain, emailboard,
  emailstudio, campaigncore, payloadhash, contacts, prospectstage, placesdiscovery,
  nationalsweep, huntreadiness, clienthuntbuild/schedule.
- **Money/billing**: money, clientsale, clienttiers, clientconsole, clientconnections,
  automationstats, goals.
- **Media/studios**: imagegen, mediaprovenance, storyboard, videoscenes, reelstudio,
  creativeboard, brandboard, postcardboard, socialboard, studiosuite, deliverable, briefdoc.
- **Automations**: automation (detect), triggers, automationreport, automationintake, standing,
  gardener, farm, timelines, verdicts, readiness, autonomygrants.
- **Domain data**: mlsstats, booking, ics, esign, data, expertise, verticals, lab, inquiry,
  paperworkextract, claudescout, bigcities, adswatch, producers, ask, buildbrief, websitebrief,
  marketintel.
- **Infra**: `verify:techfingerprint` (an edge-shared module), `verify:migrations`
  (`scripts/migrations.verify.ts` — the migration-collision guard: no new duplicate `app_NNNN`
  numbers, `_apply_garvis_all.sql` must match its generator byte-for-byte, and the **last**
  `garvis_arm_heartbeat` redefinition must schedule exactly the job set the UI expects — parity
  with `src/lib/garvis/systemControl.ts`).

### 5.2 Playwright e2e (`playwright.config.ts`, `e2e/`)

Config: testDir `./e2e`, Chromium only (uses the runner's pre-installed
`/opt/pw-browsers/chromium` when present), 1 worker, 30 s timeout, retries 1 in CI,
trace/screenshot on failure. Base URL `E2E_BASE_URL` or a self-managed Vite dev server on :4173.
Philosophy stated in-file: verify suites prove logic; these prove the app **boots** with no
backend.

- `smoke.spec.ts` (75 lines): landing, /auth, /pricing render with no *real* errors (a BENIGN
  filter swallows expected supabase/localhost network noise).
- `routes.spec.ts` (69): the full route sweep — 3 public routes render; **27 protected routes**
  (builder + the whole `/garvis/*` surface) must redirect to /auth cleanly when signed out.
  Hermetic: all external requests aborted.
- `authed-mock.spec.ts` (71): seeds a synthetic supabase-js session into localStorage (decodable
  fake JWT) and mocks `auth/rest/functions/realtime` locally so Orchestrate, Opportunity feed,
  and Client book actually mount — lazy chunks execute, queries run, empty states render.
- `flows.authed.spec.ts` (31): deep flows against a real seeded deployment; **skips unless**
  `E2E_BASE_URL` + `E2E_STORAGE_STATE` are provided ("never a false green") — command page, queue
  lanes, contacts segment sender.

### 5.3 GitHub Actions

**`.github/workflows/ci.yml`** — on every push/PR (concurrency-canceled per ref), four jobs:
1. `typecheck-and-verify`: `tsc --noEmit` + dynamically enumerates and runs **all** `verify:*`
   scripts, failing on any.
2. `build`: production `npm run build`.
3. `deno-check`: `deno check */index.ts` in `supabase/functions` — added because the ~60 edge
   functions "were typechecked NOWHERE" (tsconfig covers src/ only).
4. `e2e-smoke`: installs Chromium, runs Playwright with harmless
   `VITE_SUPABASE_URL=http://localhost:54321` env so the client counts as configured.

**`.github/workflows/deploy-supabase.yml`** — "the operator hour as one button." Triggers:
manual dispatch (inputs: `mode` = functions|full, `arm_heartbeat`, `single_migration`) and every
push to main touching `supabase/**` (functions mode). Steps:
- `tests` job gate (deno check + all verify suites) — "nothing used to stand between merge and
  prod."
- **Wake the project if paused** (free-tier auto-pause) via Management API `/restore`, polling to
  `ACTIVE_HEALTHY`.
- Optional single-migration surgical apply via the SQL query endpoint.
- mode=full migrations: `schema_repair.sql` first (idempotent rewrite of both base schemas for
  any DB vintage), then `supabase db push --include-all` when `SUPABASE_DB_PASSWORD` exists, else
  a **multi-pass** (3×) Management-API replay of all migrations (cross-directory dependency order
  is unsolvable statically; idempotency makes retries safe; a zero-progress pass fails).
- Always deploys the 14 "hot" JWT functions + 7 worker functions (`--no-verify-jwt`); mode=full
  deploys both curated `functions:deploy*` lists (44 + 20 functions).
- Syncs 12 function secrets from repo secrets (names only echoed).
- `arm_heartbeat`: **self-provisions** `WORKER_SECRET` (openssl rand) if absent, sets it as both
  WORKER_SECRET and CRON_SECRET, then calls `garvis_arm_heartbeat(<functions url>, <secret>)`
  through the SQL endpoint.
- **Verify deployment**: OPTIONS-probes 7 functions (404 = fail) and probes 6 key tables via
  `to_regclass` (missing table = error in full mode, warning otherwise).

Default project ref fallback baked into the workflow: `aobrsurgymnyxifoqfpu`.

### 5.4 `scripts/` directory

| Script | Role |
|---|---|
| `go-live.sh` | One command to light the AI layer: sets `ANTHROPIC_API_KEY`(+`OPENAI_API_KEY`) as edge secrets and deploys the AI-facing functions with the Supabase CLI (env-only keys, never written to disk) |
| `design-e2e.ts` | LIVE design-pipeline e2e: runs the real generation pipeline against a real model key, assembles with the real scaffold, gates with tsc + static QA + a design scorecard (costs ~$1/run) |
| `discover-test.mjs` | Node-side live test of the Perplexity/Serper discovery APIs (reads `.env.local`), isolating key/parsing issues from browser CORS |
| `kitcheck.ts` | Extracts the scaffold UI kit (template strings in `_shared/scaffold.ts`) to a temp tree and typechecks it as a real project |
| `make-schema-repair.py` | Generates `supabase/schema_repair.sql` — idempotent rewrite of the base schemas so any DB vintage can be repaired |
| `generate-apply-all.mjs` | Regenerates `supabase/_apply_garvis_all.sql` (all migrations concatenated in db-push order) — kept honest by `verify:migrations` |
| `migrations.verify.ts` | The migration-collision guard (see §5.1) |
| `seed-einstein.ts` / `einstein-seed-data.ts` | Builds a real Einstein exploration world through the product's own pure functions (seeded localStorage state for the full-product drive) |
| `sim-deep-run.ts` | Exercises every deterministic engine (lab sims, decision gates, build-brief compiler, next-move ranking) with real inputs, outside the browser |
| `idea-board-probe.mjs` | Playwright probe of the dev board's ideas tab (deterministic floor, no AI key) |
| `setup-connections.ps1` | Windows helper deploying the seamless-connections functions (C1–C3) via the Supabase CLI |

### 5.5 `public/` and `index.html`

- `public/anvil.svg` — the favicon.
- `public/flagship/` — flagship landing media: `astrolabe|city|esteban|war` mp4s (~1–1.5 MB each)
  + jpg posters, `pegasus.jpg`.
- `index.html` — dark-mode root, title "Garvis — your AI business OS", description "your AI
  operating system for running a business", Google Fonts preconnect (Space Grotesk / Inter /
  JetBrains Mono), single `#root` + `/src/main.tsx` module entry. (Root-level `ref2.png`/`ref3.png`
  are 25-byte placeholders.)

---

## 6. Operational architecture (from docs/)

What a live deployment looks like, distilled from `RUNBOOK.md`, `go-live-checklist.md`,
`twilio-setup.md`, `client-billing-setup.md`, `cloud-console.md`, `hybrid-db.md`:

1. **One Supabase project is the whole backend.** Database from three pastes
   (`schema.sql` → `schema_v2_autopilot.sql` → `_apply_garvis_all.sql`) or the one-button
   Deploy Supabase action (mode=full). ~125 migrations, all additive + idempotent.
2. **Two function fleets**: `functions:deploy` (44 user-JWT functions) and
   `functions:deploy:webhooks` (20 cron/webhook functions, `--no-verify-jwt`, each self-auths via
   worker/cron secret, provider signature, or capability token).
3. **Secrets tables / storage**: operator API keys live exclusively in Supabase Edge Function
   secrets; per-user provider tokens in `provider_connections` (RLS: no policies);
   in-flight OAuth in `oauth_states`; non-secret ad config in `connections`; per-client hookup
   state in `client_connections`. The heartbeat's two values (`ff_heartbeat_base`,
   `ff_heartbeat_secret`) are stored in **Supabase Vault** (`vault.decrypted_secrets`) by the arm
   function.
4. **Heartbeat arming** — the step everything "while you sleep" depends on:
   `select public.garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<WORKER_SECRET>')`
   (SQL editor, Health-page Arm button via `system-control`, or the deploy workflow). The latest
   redefinition (app_0092) schedules **11 pg_cron jobs** that `net.http_post` the workers with the
   vault secret under both `x-worker-secret` and `x-cron-secret`:
   pulse (hourly :07), followups (13:00), worker tick (*/5), ads-watch (10:15),
   reactivate (monthly), inbox-draft (12:45), scorecard (Sun 22:00), invoice-chase (13:30),
   standing tick (*/15), consolidate (Mon 08:00), social-sync (*/6h). (Doc drift: RUNBOOK says
   "9", the go-live checklist says "12"; the SQL truth is 11 and `verify:migrations` pins UI↔SQL
   parity.) `garvis_disarm_heartbeat()` stops everything; `system_heartbeat` stamps
   (`_shared/heartbeat.ts`) make liveness visible; the Health page's Master Switch
   (`system-control`) reports secret presence + cron schedule + stamps.
5. **Go-live tiers** (each opt-in, fails closed): T0 ship code → T1 heartbeat → T2 acquisition
   (Anthropic/Places/APP_ORIGIN/screenshots) → T3 email (Resend + verified domain + CAN-SPAM
   address + `outbound_enabled` switch) → T4 texting (Twilio + A2P 10DLC wait) → T5 get paid
   (Stripe payment links + webhook) → T6 optional pillars (Ayrshare/Shotstack/Veo/embeddings/
   Netlify/SB token). The **nightly canary** (`garvis-canary`) then self-tests live wiring
   (catalog, safeFetch egress, DB round-trip, *send-gate refusal*, heartbeat freshness) and only
   speaks on failure.
6. **Client-billing flow** (hands-off): pitch email (screenshot + demo link) → prospect "Make it
   mine" → operator's Stripe Payment Link (pending sale recorded) → webhook flips active,
   updates MRR, auto-publishes the stashed demo HTML to Netlify → 💰 SOLD push; fulfilment =
   connect their domain (DNS records surfaced by `connect-domain`) + turn on bought automations
   once the per-client connector checklist is green.
7. **Frontend**: static host of `dist/` with just `VITE_SUPABASE_URL`/`ANON_KEY`
   (+ Stripe publishable). `APP_ORIGIN` must point back at it.
8. **Deterministic floor**: documented list of what works with NO AI key (CSV analysis, trackers,
   standing orders, invoices/chase drafting, pulse/scorecard counting, lexical retrieval,
   exports) — generative features degrade with named messages, never silently.

---

## 7. Security patterns worth carrying forward (cross-integration)

- **Approval spine**: every outward action (email, SMS, social post, e-sign envelope, site
  deploy, backend deploy) requires an owned, APPROVED `approvals` row, re-verified server-side,
  with SHA-based `payload_hash` tamper checks and atomic claim columns against double-execution;
  fully-executed approvals are spent (replay returns the durable result).
- **Two callers, one path**: owner JWT or `x-worker-secret`, with the owner always derived from
  the approval row, never the caller.
- **Webhook auth is never optional**: Stripe (signature), Resend (Svix HMAC + replay window),
  Twilio (X-Twilio-Signature HMAC-SHA1), DocuSign (HMAC, fail-closed when unset), inbound email
  (shared secret header), site events (per-world capability token), cron (constant-time shared
  secrets).
- **SSRF**: one hardened `safeFetch` for every user-controlled URL (redirect re-validation, full
  reserved-IP table, all-records-public DNS rule).
- **Honest degradation**: missing secret → `{available:false, setup:[…]}` or a named error;
  missing data → NULL, never zero; unknown provider status → null, never guessed.

---

## 8. Compact digest

- **~30 external integrations; 25 live** (most with honest degradation), **5 stub/planned**
  (Vercel, Netlify OAuth, Google-Business/calendar/e-sign client connectors, shared free-tier DB,
  Cloud Console CC2–CC9). 67 edge functions, 116 verify suites, 4 Playwright specs, 2 workflows,
  11 pg_cron jobs.
