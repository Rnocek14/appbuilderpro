# FableForge 🔨

Your own Lovable-style AI app builder. Describe an app in plain language; FableForge drafts a
blueprint, generates the files, renders a sandboxed live preview, and lets you iterate
conversationally — on **your** Supabase project, with **your** model keys, with no per-credit meter.

## What's inside

| Layer | What you get |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind. Sidebar SaaS layout, dark/light mode, command palette (⌘K), toasts, empty/error states. |
| Workspace | File tree (create/rename/delete), Monaco editor with tabs + ⌘S save, per-file version history with side-by-side diffs and restore, sandboxed Sandpack preview with device modes, console, error overlay, and "Fix with AI". |
| AI agent | 11-stage pipeline (interpret → blueprint → schema → file tree → frontend → backend → auth → styling → validate → fix → summarize) streamed live to the chat via Supabase Realtime. Conversational edits change only the relevant files and explain themselves. |
| Providers | Anthropic, OpenAI, OpenRouter, or any local OpenAI-compatible endpoint (Ollama, LM Studio). Token usage and cost are recorded per event. |
| Database | 13 tables with full row-level security, soft deletes, file version snapshots via trigger, audit + error logs, storage bucket for assets. |
| Roles & billing | Free / Pro plans with monthly generation limits enforced server-side, upgrade prompts, Stripe-ready subscription tables and a cleanly stubbed checkout. Admin role with a full panel (users, usage & cost charts, failed generations, logs, model settings). |
| Deployment | Deployment records + status UI for Vercel / Netlify / Supabase with a clean hook point for real deploy pipelines. |

## Quick start

### 1. Prerequisites
- Node 18+
- A [Supabase](https://supabase.com) project (free tier is fine)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`)
- An API key for at least one provider (or a local model server)

### 2. Install & configure
```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Supabase Dashboard → Settings → API
```

### 3. Create the database
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push          # applies supabase/schema.sql
```
Or paste `supabase/schema.sql` into the SQL editor in the dashboard.

> Magic links: enable the Email provider under Authentication → Providers (on by default).

### 4. Deploy the edge functions (production mode)
Model keys live in edge function secrets and never reach the browser.
```bash
supabase secrets set AI_PROVIDER=anthropic AI_MODEL=claude-sonnet-4-6 ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-app chat-edit job-worker
```
Swap the secrets for `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `LOCAL_AI_BASE_URL`
with the matching `AI_PROVIDER` to change providers — no code changes needed.

### 5. Run it
```bash
npm run dev               # http://localhost:5173
```
Sign up, then promote yourself to admin in the SQL editor:
```sql
update profiles set role = 'admin', plan = 'pro', monthly_generation_limit = 500
where email = 'you@example.com';
```

### Local-only shortcut (no edge functions)
For hacking without deploying functions, set in `.env`:
```
VITE_AI_DIRECT=true
VITE_AI_PROVIDER=anthropic
VITE_AI_MODEL=claude-sonnet-4-6
VITE_AI_API_KEY=sk-ant-...
```
The browser then calls the provider directly and writes files itself.
**Never ship a build with these set** — the key would be visible to anyone. Production
builds should always go through the edge functions.

## How generation works

1. `startGeneration()` invokes the `generate-app` edge function.
2. The function checks ownership and your monthly limit, inserts a `project_generations`
   row, and returns immediately.
3. The pipeline runs in the background, updating `stages` on that row as it goes;
   the workspace subscribes via Realtime and renders the forge progress live.
4. Generated files are upserted into `project_files` — a trigger snapshots every change
   into `project_file_versions`, which powers the diff viewer and restore.
5. Usage, cost, a chat summary, and an audit entry are recorded.

Conversational edits (`chat-edit`) send the current files + recent messages, apply only the
returned changes/deletions, and post an explanation with changed-file chips in the chat.

Generated apps target the Sandpack `react` template: `/App.js` entry, `/styles.css`,
components under `/components/`. External-service touchpoints inside generated apps are
marked with `// INTEGRATION:` comments.

## Wiring real Stripe billing

The schema (`subscriptions`), plan limits, upgrade prompts, and billing page are already in
place. To go live:

1. Create two Prices in Stripe (Pro monthly/yearly).
2. Add an edge function `create-checkout-session`: create a Checkout Session with
   `client_reference_id = user.id`, return `session.url`; replace the stub in
   `src/pages/Billing.tsx` (`upgrade()`) with an invoke + redirect.
3. Add an edge function `stripe-webhook` (verify with `STRIPE_WEBHOOK_SECRET`); on
   `checkout.session.completed` / `customer.subscription.updated`, upsert `subscriptions`
   and update `profiles.plan` + `monthly_generation_limit` with the service role key.
4. `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...`

Until then the app runs in stub mode: admins set plans manually from the admin panel.

## Wiring real deployments

`Deploy` records a row in `deployments` with status tracking UI. To push live builds,
replace the stub in `src/pages/ProjectWorkspace.tsx` (`recordDeployment`, marked
`// INTEGRATION`) with a call to a Vercel/Netlify deploy hook URL, then update the row's
`status`/`url` from the hook's response or a webhook.

## Importing your Lovable projects

FableForge can import existing projects two ways (sidebar → **Import**, or `/import`):

1. **From GitHub** (recommended) — Lovable syncs every project to a GitHub repo
   (in Lovable: project → GitHub → Connect). Paste the repo URL. For private repos,
   create a fine-grained personal access token with read-only **Contents** permission
   and paste it in — it's used once in your browser to download the repo and never stored.
2. **From a zip** — any zip of the project source (a downloaded GitHub archive or a
   zipped local clone). `node_modules`, build output, lockfiles, and binary assets are
   filtered out automatically.

What happens on import:

- Files are stored in `project_files` with full version history from that point on.
- Imported Vite/TypeScript apps run in the live preview using Sandpack's Vite runtime
  (dependencies from your `package.json` are installed in-browser — first boot takes
  a little longer than generated apps).
- Conversational editing works immediately. For large projects, FableForge sends the
  model the full file tree but only the contents of files relevant to your request,
  keeping token costs sane (see `src/lib/contextBudget.ts`).
- If the imported app uses its own Supabase project, keep its env values in the app's
  `.env` — the generated preview reads `import.meta.env` like any Vite app. Secrets in
  `.env` files are imported as text, so consider rotating anything sensitive.

Limitations worth knowing: binary assets (images, fonts) are skipped — re-add them via
URLs or Supabase Storage; extremely exotic build setups may not boot in the in-browser
preview even though editing and deployment still work.

## Autopilot — builds while you do other things

Autopilot turns FableForge from a tool you babysit into a queue you feed. Apply the
extra schema first:

```bash
# after the main schema.sql
psql or SQL editor: run supabase/schema_v2_autopilot.sql
supabase functions deploy job-worker
```

How it works:

1. **Queue a brief** (sidebar → Autopilot): a title, a product brief ("build the invoicing
   module: client CRUD, status filters, overdue highlighting…"), a project (existing or new),
   and a hard budget cap in dollars.
2. **The worker plans → builds → validates → fixes → reports.** Each job is decomposed into
   2-6 milestones; each milestone is built, run through a validation gate (broken imports,
   missing loading/empty/error states, non-responsive layout), and auto-fixed. Every step is
   checkpointed to the `jobs` row, so runs survive crashes and function time limits.
3. **Guardrails, always on:** jobs hard-stop at the budget cap; if the same milestone fails
   validation more than `max_fix_attempts` times the agent stops arguing with itself, marks it
   "done with warnings", and moves on; every token is logged to `usage_events`.
4. **The approval inbox** (sidebar → Inbox): when a decision would genuinely change what gets
   built (auth model, payments approach), the agent queues a question instead of guessing and
   keeps working on everything not blocked by it. Answer in a batch — blocked jobs resume
   automatically via a DB trigger.
5. **Project memory:** conventions and decisions persist in `project_memory` and are injected
   into every step, so hour-six output matches hour-one style.
6. **Notifications:** set a webhook in Settings (Discord and Slack URLs are auto-formatted;
   anything else gets JSON) to get pinged on completed / failed / paused / needs-answers.
7. **The morning report:** each finished job stores a report (summary, what was built,
   concerns, skipped items) shown on the job card and posted into the project chat.

Keeping the queue moving: the worker self-chains while work remains, and the app nudges it
whenever you queue or answer. For true laptop-closed autonomy, enable the optional pg_cron
tick — instructions are at the bottom of `schema_v2_autopilot.sql`.

## Deploying FableForge itself

**Vercel / Netlify**
- Build command `npm run build`, output `dist/`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build env vars (nothing else —
  model keys stay in Supabase secrets).
- SPA fallback: Vercel rewrite `/(.*) → /index.html`, or a Netlify `_redirects` with
  `/* /index.html 200`.

**Supabase hosting compatibility** — the static `dist/` output also serves fine from any
static host fronting your Supabase project.

## Security model

- All tables are protected by RLS: owners see only their rows; `is_admin()` (security
  definer) gates admin access; usage/subscription writes happen only via the service role
  inside edge functions.
- Plan limits are enforced server-side (`generations_this_month()` RPC) — the client UI is
  a convenience, not the gate.
- Significant actions (project create/delete, plan/role changes, generations) land in
  `audit_logs`; failures in `error_logs`. Both are admin-visible in the panel.
- The preview runs in Sandpack's sandboxed iframe; generated code never executes in the
  FableForge origin.

## Project map

```
supabase/
  schema.sql                    # tables, RLS, triggers, storage, realtime
  functions/_shared/ai.ts       # provider abstraction, pricing, retry
  functions/generate-app/       # 11-stage pipeline
  functions/chat-edit/          # conversational edits
src/
  lib/aiClient.ts               # edge invoke + local direct mode
  lib/prompts.ts                # prompt templates
  hooks/useProjectData.ts       # projects/files/generations/chat (realtime)
  components/editor/            # FileTree, Monaco pane + diffs, Sandpack preview
  components/chat/ChatPanel.tsx # chat + forge progress
  pages/                        # Landing, Auth, Dashboard, NewProject,
                                # ProjectWorkspace, Settings, Pricing, Billing, admin/
```

Forge well. It's your anvil now.
