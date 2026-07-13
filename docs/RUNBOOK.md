# Garvis Runbook — from zero to a ticking system

The end-to-end setup the readiness audit found missing. Follow in order; each step ends with a
verification. A technical owner should land in **~1 hour** with this page (it was 4–8 undocumented
hours before).

## 0. Prerequisites

- A Supabase project (URL + anon key + service-role key), the Supabase CLI logged in.
- One AI provider key: `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` **or** `OPENROUTER_API_KEY`
  (or a local endpoint via `LOCAL_AI_BASE_URL`).
- Somewhere to host the built frontend (any static host).

## 1. Database — three pastes, in this order

In the Supabase SQL editor, run each file's full contents:

1. `schema.sql` — the app-builder base.
2. `schema_v2_autopilot.sql` — jobs/autopilot tables.
3. `supabase/_apply_garvis_all.sql` — **every Garvis migration (app_0003 → app_0061), concatenated
   in order.** All migrations are additive + idempotent; re-running is safe. (Regenerate this file
   after adding a migration — the command is in its header.)

**Verify:** `select count(*) from public.knowledge_worlds;` runs without error.

## 2. Edge functions — two commands

```sh
npm run functions:deploy            # user-JWT functions (builder, chat, ingest, billing, cloud panel…)
npm run functions:deploy:webhooks   # cron/webhook functions, deployed --no-verify-jwt
```

Both lists are complete — every function referenced by the app is in one of them.

**Verify:** open `/garvis/health` in the app — every function should probe "deployed".

## 3. Function secrets

Set in Supabase → Edge Functions → Secrets. Required for core:

| Secret | Why |
|---|---|
| `AI_PROVIDER` + `AI_MODEL` + the matching `*_API_KEY` | every generative feature |
| `WORKER_SECRET` and `CRON_SECRET` (use the SAME value) | the heartbeat's shared gate |
| `EMBEDDINGS_API_KEY` (or reuse `OPENAI_API_KEY`) | semantic retrieval (optional — lexical works without) |

Per-feature (add when you use the feature; every one degrades with a named message in the UI):
`RESEND_API_KEY` (+`RESEND_WEBHOOK_SECRET`, `INBOUND_SECRET`) for email · `STRIPE_SECRET_KEY`
(+webhook secret, price ids, `VITE_STRIPE_PUBLISHABLE_KEY`) for billing · `SERPER_API_KEY` for live
research · `SHOTSTACK_API_KEY` for mp4 render · Meta/Google ads tokens for ad sync ·
`NETLIFY_AUTH_TOKEN` / `GITHUB_TOKEN` for deploys/exports.

Note: overnight `inbox-draft` currently requires `OPENAI_API_KEY` or `LOVABLE_API_KEY` specifically.

## 4. Arm the heartbeat — the step everything "while you sleep" depends on

In the SQL editor (one call; re-running re-arms safely):

```sql
select public.garvis_arm_heartbeat(
  'https://<project-ref>.supabase.co/functions/v1',
  '<the same value you set as WORKER_SECRET/CRON_SECRET>'
);
-- → 'armed: 9 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick)'
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
