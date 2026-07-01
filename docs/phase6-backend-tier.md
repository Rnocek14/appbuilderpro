# Phase 6 — The Backend & Automation Tier (the "real systems" unlock)

Goal: move FableForge from "generates beautiful frontends + a Supabase schema" to "generates working
systems" — email automation, scraping, payments, AI features, scheduled jobs, webhooks — with a
Lovable-style **secret-request popup** when an integration needs an API key. Target: **at par or better
than Lovable.**

## Why this matters / the architecture ceiling it removes

The app runtime is the browser (blob/esm.sh preview; WebContainer for imported). The browser **cannot**:
hold a secret API key (it ships in the bundle), run a server/cron, or fetch most third-party APIs (CORS).
So today the builder *stubs* sending email, scraping, payments, etc. The fix is a real server target:
**Supabase Edge Functions (Deno)**, invoked from the client, with secrets held server-side.

```
Browser app  ──supabase.functions.invoke('send-email', {body})──▶  Edge Function (Deno)
   (no secret)                                                         Deno.env.get('RESEND_API_KEY')
                                                                       └─▶ external API (Resend/Stripe/…)
   data ◀──────────────── Supabase Postgres (RLS) ───────────────────────┘
secrets: Supabase Function Secrets (set via the SecretsModal → Management API). NEVER in the bundle.
```

## The pieces

### 1. Detection + the Integration Manifest (the brain)
The model declares what server-side work + secrets a build needs, structurally:
- **Blueprint** gains `integrations: [{ service, purpose, secrets:[ENV_VAR], edgeFunctions:[{name,purpose}], needsWebhook, needsCron }]`.
- **Edits** can add integrations mid-project (an "add Stripe checkout" request).
- From this we derive a **secrets manifest** written to `/supabase/.fableforge/secrets.json`:
  `{ secrets: [{ env, service, purpose, status:'missing'|'set' }], integrations:[…] }`.
- Prompt rule: *anything needing a secret key or server execution MUST be an edge function, never client.*

### 2. Edge Function generation (the engine)
The file-stream generation emits, alongside the app:
- `/supabase/functions/_shared/cors.ts` — shared CORS headers.
- `/supabase/functions/<name>/index.ts` — Deno function per the **edge-function template**: OPTIONS/CORS,
  auth (verify the Supabase JWT for user-scoped actions), input validation, secret via `Deno.env.get`,
  the external call, JSON response, error handling. Webhooks verify the provider signature first.
- Frontend calls them through `/src/lib/api.ts` (or db.ts) via `supabase.functions.invoke`.
- Knowledge for this lives in `INTEGRATIONS_GUIDE` (prompts.ts), injected into generate + edit.

### 3. The SecretsModal (the Lovable-style popup) — the headline UX
- A studio component that reads the manifest's `missing` secrets and **pops up** asking for each key,
  with: the service name, what it's for, a link to where to get the key, masked input, and a "Save" / 
  "Skip for now" action. Triggers: (a) right after a generation/edit that introduced new required
  secrets, (b) a persistent "N keys needed to go live" banner, (c) when the user clicks a feature that
  needs an unset key.
- **Storage (secure):** secrets are pushed to **Supabase Function Secrets** (server-side) via the
  Management API on connect/deploy — the raw value never persists in the app bundle or localStorage.
  Interim (pre-deploy-pipeline): hold in memory + a `project_secrets` row (value encrypted / Vault),
  status reflected in the manifest. Never a `VITE_` var.
- Mirrors Lovable's "add secret" flow but with **auto-detection + an explanation of why** each key is
  needed (a step beyond a bare prompt).

### 4. Deploy pipeline (makes it actually run)
Edge functions don't run in the in-browser preview, so we need a path to the user's real Supabase:
- **Connect Supabase** (project ref + a Management/access token, or OAuth) — already partially present
  via the "Supabase" connect flow.
- **One-click "Deploy backend":** push the migration, deploy the functions, and set the secrets via the
  Supabase **Management API** (`/v1/projects/{ref}/functions`, `/secrets`). 
- **Preview behavior:** until deployed, `invoke` calls fail gracefully → a clear "Connect & deploy
  <service> to enable this" state (generated code must handle this). Optionally a dev shim that mocks a
  function's response in preview so the UX is demoable.

### 5. Advanced (where we beat Lovable)
- **Integration catalog** with best-practice templates: Resend/SendGrid (email), Stripe (checkout +
  webhook + customer portal), OpenAI/Anthropic (server-side AI), Twilio (SMS), a **generic
  server-side fetch/proxy** for any CORS-blocked or secret-keyed API (the general case of the reader
  proxy we built), Supabase Storage (uploads), scheduled (cron) jobs, and webhook receivers.
- **Scheduled functions / cron** for drips, digests, syncs — declared via `needsCron`, scheduled in
  Supabase, noted in `deployment_notes`.
- **A "Backend Map"** — a generated view of functions, secrets, schedules, and webhooks so the user
  sees the whole system, not just the UI.
- **Webhook security by default** (signature verification), **auth on functions by default**, rate-limit
  notes — the safe patterns baked in, not left to chance.

## Build phasing
- **6a — Engine (this phase, buildable + verifiable now):** blueprint `integrations`, `INTEGRATIONS_GUIDE`
  knowledge + edge-function template in the generate/edit prompts, manifest written to project files.
- **6b — SecretsModal + store:** the popup, reading the manifest, collecting keys, status.
- **6c — Deploy pipeline:** Management API push of migration + functions + secrets; connect flow.
- **6d — Preview shim + graceful degradation** for undeployed functions.
- **6e — Advanced:** cron, webhooks, catalog depth, Backend Map.

## Security model (non-negotiable)
- Secret keys ONLY server-side (Supabase Function Secrets / Vault). Browser holds none. Only the public
  anon key + `VITE_` config ship to the client.
- Functions verify the caller (Supabase JWT) for user-scoped actions; webhooks verify provider signatures.
- RLS remains the data authority; functions use the service role only inside the function, never exposed.

## "Better than Lovable" scorecard
- Auto-detect needed secrets + **explain why** (not just a blank field). ✓ engine declares them.
- A real integration catalog with hardened templates (webhook sig, auth, CORS). ✓
- Cron + webhooks as first-class generated artifacts. ✓
- A Backend Map so huge ideas stay legible. ✓
- Generic secret-keyed proxy so ANY API works, not just blessed ones. ✓
