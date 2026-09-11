# Garvis Runbook — from zero to a ticking system

The end-to-end setup the readiness audit found missing. Follow in order; each step ends with a
verification. A technical owner should land in **~1 hour** with this page (it was 4–8 undocumented
hours before).

## Zero-click path (recommended): the Deploy Supabase action

Steps 1–4 below are now ONE GitHub Action. Add three repo secrets (Settings → Secrets and
variables → Actions): `SUPABASE_ACCESS_TOKEN` (dashboard → Account → Access Tokens),
`SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` — plus any function secrets you want synced
(`WORKER_SECRET`+`CRON_SECRET`, `GOOGLE_PLACES_API_KEY`, `APP_ORIGIN`, `RESEND_API_KEY`, AI keys).
Then Actions → **Deploy Supabase** → Run workflow (tick *arm heartbeat* on the first run). It
applies every migration, deploys both function lists with the right JWT flags, syncs the secrets,
arms the clock, and verifies functions + tables before going green. It also re-runs automatically
on every merge to main that touches `supabase/**`. The manual steps below remain as the fallback.

## 0. Prerequisites

- A Supabase project (URL + anon key + service-role key), the Supabase CLI logged in.
- One AI provider key: `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` **or** `OPENROUTER_API_KEY`
  (or a local endpoint via `LOCAL_AI_BASE_URL`).
- Somewhere to host the built frontend (any static host).

## 1. Database — three pastes, in this order

In the Supabase SQL editor, run each file's full contents:

1. `schema.sql` — the app-builder base.
2. `schema_v2_autopilot.sql` — jobs/autopilot tables.
3. `supabase/_apply_garvis_all.sql` — **EVERY migration (the timestamped 2026\* set + app_0002 →
   app_0079), concatenated in `db push` order.** This includes the preview engine
   (business_profiles/preview_sites), the daily-hunt lead pool (app_0072), prospect audits
   (app_0074/0075), automations (app_0076/0078), client billing (app_0077), and the hunt unlock
   (app_0079). All migrations are additive + idempotent; re-running is safe. (Regenerate this file
   after adding a migration — the command is in its header.)

**Verify:** `select count(*) from public.knowledge_worlds; select count(*) from public.preview_sites;
select count(*) from public.discovered_businesses;` all run without error — or just open
**/garvis/health**, whose Database card probes the loop's key tables.

## 2. Edge functions — two commands

```sh
npm run functions:deploy            # user-JWT functions (builder, chat, ingest, billing, cloud panel…)
npm run functions:deploy:webhooks   # cron/webhook functions, deployed --no-verify-jwt
```

Both lists are complete — every function referenced by the app is in one of them.

**Verify:** open `/garvis/health` in the app — every function should probe "deployed".

## 3. Function secrets

> **GitHub Actions (separate from Supabase secrets):** the AI review workflow
> (`.github/workflows/ai-review.yml`) needs the repo Actions secret `ANTHROPIC_API_KEY`
> (Settings → Secrets and variables → Actions). Optional Actions **variable** `REVIEW_MODEL`
> overrides the review model — it lives in a variable on purpose; model IDs never go in code.
> Without the secret, PRs simply get no AI review comment; nothing else is affected.

Set in Supabase → Edge Functions → Secrets. Required for core:

| Secret | Why |
|---|---|
| `AI_PROVIDER` + `AI_MODEL` + the matching `*_API_KEY` | every generative feature |
| `WORKER_SECRET` and `CRON_SECRET` (use the SAME value) | the heartbeat's shared gate |
| `GOOGLE_PLACES_API_KEY` | business discovery — Win Clients Find/sweep AND the daily hunt |
| `APP_ORIGIN` | the exact https origin the frontend is hosted on — pitch emails embed `$APP_ORIGIN/preview-site/<slug>`; without it the hunt builds demos but queues no pitches |
| `EMBEDDINGS_API_KEY` (or reuse `OPENAI_API_KEY`) | semantic retrieval (optional — lexical works without) |

Per-feature (add when you use the feature; every one degrades with a named message in the UI):
`RESEND_API_KEY` (+`RESEND_WEBHOOK_SECRET`, `INBOUND_SECRET`) for email · `STRIPE_SECRET_KEY`
(+webhook secret, price ids, `VITE_STRIPE_PUBLISHABLE_KEY`) for billing · `SERPER_API_KEY` for live
research · `SHOTSTACK_API_KEY` for mp4 render · `OPENAI_API_KEY` also powers TTS voiceover
(tts-voiceover, gpt-4o-mini-tts) and scene illustrations for the Fact Channel Studio; optional
`ELEVENLABS_API_KEY` upgrades the voice head · Meta/Google ads tokens for ad sync ·
`NETLIFY_AUTH_TOKEN` / `GITHUB_TOKEN` for deploys/exports. · `DOCUSIGN_OAUTH_CLIENT_ID` +
`DOCUSIGN_OAUTH_CLIENT_SECRET` (+ optional `DOCUSIGN_AUTH_BASE` — defaults to the developer
sandbox `https://account-d.docusign.com`, where signatures are for testing and NOT legally
binding; production flips this to `https://account.docusign.com` after DocuSign go-live review —
and `DOCUSIGN_WEBHOOK_SECRET`, the Connect HMAC key; without it the webhook rejects everything
fail-closed and statuses arrive via the poll button) for e-signature. Register
`<your-app-origin>/oauth/callback` as the integration key's redirect URI.

Note: overnight `inbox-draft` currently requires `OPENAI_API_KEY` or `LOVABLE_API_KEY` specifically.

## 4. Arm the heartbeat — the step everything "while you sleep" depends on

In the SQL editor (one call; re-running re-arms safely):

```sql
select public.garvis_arm_heartbeat(
  'https://<project-ref>.supabase.co/functions/v1',
  '<the same value you set as WORKER_SECRET/CRON_SECRET>'
);
-- → 'armed: 11 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate, social-sync)'
```

This schedules 9 pg_cron jobs (morning pulse, follow-ups, worker tick, ads watch, reactivation,
inbox drafts, weekly scorecard, invoice chase, and the 15-minute standing-orders tick).

**Verify:** within ~15 minutes, `/garvis/health` (and every Standing Orders panel) shows
**"Clock ticking — last tick N min ago."** If it still says *"The clock has never ticked"*, the
secret doesn't match `WORKER_SECRET` — re-run the arm call with the right value.
To stop everything: `select public.garvis_disarm_heartbeat();`

## 5. Frontend

`.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+`VITE_STRIPE_PUBLISHABLE_KEY` if billing).
Then `npm run build` and host `dist/`.

## 6. First-run checklist (in the app)

1. Sign up → you land on **Command**. Say what you want ("grow my business…", "set up a desk that
   answers my emails…") or use the chips.
2. Open **/garvis/health** — everything green, clock ticking.
3. Set one **standing order** (watch any page) and press *Run now* — you should get an honest
   "baseline recorded" line.
4. Optional: Settings → paste a Discord/Slack webhook URL so the morning pulse and watch alerts
   reach you outside the app.

## The growth engine — first channel to first post

The faceless-channel pipeline (Fact Channel Studio) needs, beyond the core setup above:

1. **Keys**: `OPENAI_API_KEY` (script images + TTS voiceover) and `SHOTSTACK_API_KEY` (mp4
   render) as edge secrets. Optional `ELEVENLABS_API_KEY` upgrades the voice.
2. **Ayrshare** (the posting rail — NOT an edge secret): create an account at ayrshare.com,
   link the channel's TikTok/YouTube/Instagram accounts on their dashboard, then paste the API
   key in **Settings → Connections → Ayrshare** in the app. Plan reality: the free tier posts
   ~50 images/mo and NO video — daily video channels need a paid tier, and post analytics
   (what the learning loop learns from) is Premium/Business-gated. Budget for it.
3. **One world per channel brand.** Ayrshare destinations map per-WORLD (Settings →
   Connections → Ayrshare → Profile-Keys), so two channels in one world would share one
   brand's accounts. Give each channel its own world with a `content_growth` studio area.
4. **First episode**: open the world → the studio is the front page → create a channel from a
   preset → set its destination link (your shop/app/page — every caption carries it,
   attribution-tagged) → Draft a cited episode → review the sources (uncited claims wear a
   visible flag) → Produce → watch the mp4 → Queue → approve in the Queue. The AI disclosure
   is enforced server-side; nothing posts without your yes.
5. **Numbers**: social-sync pulls per-post metrics on the 6h heartbeat (or "sync now"); after
   ~3 measured episodes the channel gets a baseline and episodes start wearing
   winner/quiet verdicts that feed the next drafts.

## Optional: the forward-in mailbox (Tier 2)

Give Garvis a real inbox without OAuth:

1. In Resend: add an **inbound domain** (set its MX record as Resend instructs).
2. Point the domain's inbound webhook at
   `https://<project-ref>.supabase.co/functions/v1/resend-inbound` with header
   `x-inbound-secret: <your INBOUND_SECRET>`.
3. Your personal forward-in address is on **Settings → Forward-in mailbox**
   (`in-xxxxxxxxxx@yourdomain`). Forward any email there — or add a Gmail auto-forward rule.

Forwarded mail lands in **Queue → Messages** (badge + waking moment + webhook ping), where
"Draft with Garvis" writes a reply from your own record and "Queue reply" sends it through
Approvals like every other send. Mail to an unknown alias is ignored, never misfiled.

## What works with NO AI key (the deterministic floor)

Data workspace (full CSV analysis), tracker registry, both standing-order kinds, expertise packs,
the whole invoice ledger + chase drafting, pulse + scorecard counting, lexical knowledge retrieval,
and every export. Generative drafting (desk/documents/briefs/builder) needs the AI key.
