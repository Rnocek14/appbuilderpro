-- supabase/_apply_garvis_all.sql — GENERATED: EVERY migration, in dependency order:
-- timestamped 2026* (except garvis_worker) → app_00xx → garvis_worker (needs app_0003's
-- agent_runs). Regenerate with: node scripts/generate-apply-all.mjs (keep garvis_worker last).
-- Apply AFTER schema.sql and schema_v2_autopilot.sql (or supabase/schema_repair.sql).
-- All migrations are additive + idempotent; re-running is safe.
--

-- ======== supabase/migrations/20260702120000_message_changes.sql ========
-- Per-message file changes: [{path, before, after, additions, deletions}] captured at the agent's
-- write layer for each chat turn. Powers the chat's per-message diff cards (the "show me exactly
-- what changed" trust feature) and message-level restore. Full contents, not patches — files are
-- small and it makes revert/re-render trivial.
alter table public.ai_messages add column if not exists changes jsonb;

-- ======== supabase/migrations/20260702120001_stripe.sql ========
-- Stripe billing foundation: platform subscriptions (free/pro tiers) + webhook idempotency.
-- Webhooks are TRIGGERS only — canonical state is always re-fetched from Stripe (syncSubscription)
-- because event delivery has no ordering guarantee.

alter table public.profiles add column if not exists stripe_customer_id text unique;

create table if not exists public.stripe_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  status text,                          -- active | trialing | past_due | canceled | ...
  price_id text,
  tier text not null default 'free',    -- free | pro
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.stripe_subscriptions enable row level security;
drop policy if exists "own subscription" on public.stripe_subscriptions;
create policy "own subscription" on public.stripe_subscriptions
  for select using (auth.uid() = user_id);
-- writes: service role only (webhook/sync) — no client policies.

-- Processed Stripe event ids: a redelivered webhook is a no-op.
create table if not exists public.stripe_events (
  id text primary key,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- service-role only; no client policies.

-- ======== supabase/migrations/20260702120002_ai_gateway.sql ========
-- FableForge AI gateway: generated apps get server-side AI with NO app-owner API keys.
-- Each project gets a random gateway key (issued at backend deploy, pushed to the app's Function
-- Secrets as FABLEFORGE_AI_KEY); the ai-gateway function maps key -> project -> owner and meters
-- every call against the owner's credit balance. This is the Lovable AI model: their apps run on
-- OUR key, charged through OUR credits.
alter table public.projects add column if not exists ai_gateway_key text unique;
create index if not exists projects_ai_gateway_key_idx on public.projects (ai_gateway_key) where ai_gateway_key is not null;

-- ======== supabase/migrations/20260707120000_usage_client_insert.sql ========
-- Direct-mode usage recording: in DIRECT mode the BROWSER makes the model calls, so the client is
-- the only place that can log the generation/edit usage_events the monthly counter
-- (generations_this_month) and the Billing history read from. Until now only edge functions
-- (service role) could insert — so direct-mode users saw a "0/10 generations" counter that never
-- moved. Allow users to insert their OWN usage rows; select stays owner-or-admin as before.
drop policy if exists "usage insert own" on public.usage_events;
create policy "usage insert own" on public.usage_events
  for insert with check (user_id = auth.uid());

-- ======== supabase/migrations/20260707140000_preview_engine.sql ========
-- Business Website Preview Engine: the receiving side of the future scraper → builder pipeline.
-- business_profiles stores the scraper handoff payload (with content-usage flags inside the JSON);
-- preview_sites stores the generated SiteSpec + outreach pitch behind a public slug.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null,
  industry text not null,
  website_score int,
  profile jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bizprofiles_user on public.business_profiles(user_id, created_at desc);

create table if not exists public.preview_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid references public.business_profiles(id) on delete set null,
  slug text not null unique,
  business_name text not null,
  industry text not null,
  spec jsonb not null,
  pitch text not null default '',
  spec_source text not null default 'ai',        -- ai | fallback
  status text not null default 'preview',        -- preview | emailed | purchased | published
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_preview_sites_user on public.preview_sites(user_id, created_at desc);

alter table public.business_profiles enable row level security;
alter table public.preview_sites enable row level security;

drop policy if exists "bizprofiles own" on public.business_profiles;
create policy "bizprofiles own" on public.business_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The whole point of a preview is a no-login link in an email — anyone may READ a preview site.
-- Writes stay owner-only.
drop policy if exists "preview sites public read" on public.preview_sites;
create policy "preview sites public read" on public.preview_sites for select using (true);
drop policy if exists "preview sites insert own" on public.preview_sites;
create policy "preview sites insert own" on public.preview_sites for insert with check (user_id = auth.uid());
drop policy if exists "preview sites update own" on public.preview_sites;
create policy "preview sites update own" on public.preview_sites for update using (user_id = auth.uid());
drop policy if exists "preview sites delete own" on public.preview_sites;
create policy "preview sites delete own" on public.preview_sites for delete using (user_id = auth.uid());

-- ======== supabase/migrations/20260707150000_preview_intelligence.sql ========
-- Preview Engine intelligence layer: persist the marketing strategy, owner-simulation critique,
-- and audit report alongside each preview site — plus publish_requests, the purchase-intent
-- inbox filled by the PUBLIC preview's "Claim this website" form (owners aren't logged in, so
-- inserts run as anon; reading stays owner-only).

alter table public.preview_sites add column if not exists strategy jsonb;
alter table public.preview_sites add column if not exists critique jsonb;
alter table public.preview_sites add column if not exists audit jsonb;

create table if not exists public.publish_requests (
  id uuid primary key default gen_random_uuid(),
  preview_site_id uuid not null references public.preview_sites(id) on delete cascade,
  name text not null,
  contact text not null,
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_publish_requests_site on public.publish_requests(preview_site_id, created_at desc);

alter table public.publish_requests enable row level security;

drop policy if exists "publish requests anon insert" on public.publish_requests;
create policy "publish requests anon insert" on public.publish_requests
  for insert with check (true);

-- Only the agency (the preview's owner) can read/manage requests.
drop policy if exists "publish requests owner read" on public.publish_requests;
create policy "publish requests owner read" on public.publish_requests
  for select using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));
drop policy if exists "publish requests owner delete" on public.publish_requests;
create policy "publish requests owner delete" on public.publish_requests
  for delete using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));

-- ======== supabase/migrations/20260707160000_preview_events.sql ========
-- Preview engagement tracking — the validation instrument. Logged from the PUBLIC preview pages
-- (owners aren't logged in → anon insert), read only by the agency. This must exist BEFORE the
-- first outreach email: view/engage/return signal can't be retrofitted after sending.

create table if not exists public.preview_events (
  id uuid primary key default gen_random_uuid(),
  preview_site_id uuid not null references public.preview_sites(id) on delete cascade,
  event text not null,          -- view | engaged | report_view | claim_open
  visitor text not null default '', -- per-browser random id (dedupe + return-visit detection)
  created_at timestamptz not null default now()
);
create index if not exists idx_preview_events_site on public.preview_events(preview_site_id, created_at desc);

alter table public.preview_events enable row level security;

drop policy if exists "preview events anon insert" on public.preview_events;
create policy "preview events anon insert" on public.preview_events
  for insert with check (true);

drop policy if exists "preview events owner read" on public.preview_events;
create policy "preview events owner read" on public.preview_events
  for select using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));

-- ======== supabase/migrations/20260708100000_pipeline_spine.sql ========
-- PIPELINE SPINE — turns the Preview Engine from an admin tool into a real funnel:
--   * ingest_tokens: per-user API tokens so the EXTERNAL scraper/lead engine can POST
--     BusinessProfile JSON to the ingest-profile edge function without a browser session.
--   * publish_requests.status: the CRM seed — a claim is a lead with a lifecycle
--     (new → contacted → won/lost), not a row that scrolls away.
--   * Owners may UPDATE their requests' status (read/delete policies already exist).

-- ---------- ingest tokens ----------
create table if not exists public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token        text not null unique,             -- random 40+ chars; treat like a password
  label        text not null default 'scraper',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists idx_ingest_tokens_user on public.ingest_tokens(user_id);

alter table public.ingest_tokens enable row level security;

drop policy if exists "ingest tokens owner all" on public.ingest_tokens;
create policy "ingest tokens owner all" on public.ingest_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- claim lifecycle ----------
alter table public.publish_requests add column if not exists status text not null default 'new'
  check (status in ('new', 'contacted', 'won', 'lost'));
create index if not exists idx_publish_requests_status on public.publish_requests(status, created_at desc);

drop policy if exists "publish requests owner update" on public.publish_requests;
create policy "publish requests owner update" on public.publish_requests
  for update using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));

-- ======== supabase/migrations/app_0002_chat_threads.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Adds conversation threads: each chat message can belong to a named thread so users can keep
-- separate flows (e.g. "dark mode" vs "billing") without tangling one idea into another.
--
-- Design notes:
--  * Single, additive, idempotent column. Existing rows keep thread_id = NULL, which the app
--    treats as the default "Main" thread — so nothing breaks and no backfill is required.
--  * Thread metadata (id, title, order) is stored client-side in the project's
--    /.fableforge/threads.json meta file, so no new table / RLS change is needed here.
--  * thread_id is a free-form text id minted by the client ('main' for the default thread).
--
-- Apply once against FableForge's own Supabase project (the one in .env), e.g. in the
-- Supabase SQL editor. Safe to re-run.

alter table public.ai_messages add column if not exists thread_id text;

-- Speeds up per-thread history lookups.
create index if not exists ai_messages_project_thread_idx
  on public.ai_messages (project_id, thread_id, created_at);

-- ======== supabase/migrations/app_0003_garvis_portfolio.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis portfolio layer — the control plane that sits ABOVE the builder.
--
-- Design notes:
--  * `apps` are REAL owned products (idea-digester-spark, traction-engine, …) — deliberately
--    SEPARATE from `projects`, which are sandbox apps FableForge generated. An app MAY link to a
--    project via apps.project_id when FableForge builds/iterates it, but the two are distinct
--    entities and must not be conflated.
--  * Reuses the existing security model: owner_id + auth.uid() RLS and the is_admin() helper from
--    schema.sql. No new auth concepts.
--  * Additive and idempotent — safe to run once against FableForge's own Supabase project.
--
-- Apply: paste into the Supabase SQL editor, or `supabase db push`. Run AFTER schema.sql.

-- ---------- enums ----------
do $$ begin
  create type app_stage as enum ('idea', 'building', 'launched', 'growing', 'paused', 'archived');
exception when duplicate_object then null; end $$;

-- ---------- apps (the portfolio) ----------
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text,                                   -- repo / short id, unique per owner
  description text,
  repo_url text,
  deploy_url text,
  stage app_stage not null default 'idea',
  project_id uuid references public.projects(id) on delete set null, -- optional builder link
  goals text,
  monthly_revenue numeric(12,2) not null default 0, -- last-known MRR (denormalized for fast rollups)
  tags text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, slug)
);
create index if not exists idx_apps_owner on public.apps(owner_id) where deleted_at is null;

-- ---------- app_metrics (one row per app / day / source) ----------
create table if not exists public.app_metrics (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  metric_date date not null,
  source text not null default 'manual',       -- manual | ga | stripe | plausible | custom
  visitors int not null default 0,
  signups int not null default 0,
  active_users int not null default 0,
  revenue numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (app_id, metric_date, source)
);
create index if not exists idx_app_metrics_app_date on public.app_metrics(app_id, metric_date desc);

-- ---------- agent_runs (cross-app log of what Garvis did + its recommendations) ----------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid references public.apps(id) on delete set null, -- null = portfolio-wide
  kind text not null,                          -- research | content | build | analyze | recommend
  title text not null,
  status text not null default 'queued',       -- queued | running | succeeded | failed
  input text,
  output text,
  recommendation text,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_agent_runs_owner on public.agent_runs(owner_id, created_at desc);
create index if not exists idx_agent_runs_app on public.agent_runs(app_id);

-- ---------- keep apps.updated_at fresh ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_apps_touch on public.apps;
create trigger trg_apps_touch before update on public.apps
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors the schema.sql owner-scoped model)
-- ============================================================
alter table public.apps enable row level security;
alter table public.app_metrics enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "apps owner all" on public.apps;
create policy "apps owner all" on public.apps
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "apps admin read" on public.apps;
create policy "apps admin read" on public.apps for select using (public.is_admin());

drop policy if exists "app_metrics owner all" on public.app_metrics;
create policy "app_metrics owner all" on public.app_metrics
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "agent_runs owner all" on public.agent_runs;
create policy "agent_runs owner all" on public.agent_runs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- realtime (stream portfolio + agent activity to the Garvis dashboard) ----------
do $pub$ begin
alter publication supabase_realtime add table public.apps;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;
do $pub$ begin
alter publication supabase_realtime add table public.agent_runs;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;

-- ======== supabase/migrations/app_0004_garvis_runtime.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis agent runtime v0 — turns `agent_runs` into a queued, leased, checkpointed,
-- budget-capped unit of work (the job-worker pattern, generalized to the portfolio).
--
-- A run is BOTH the queue item and the record: status='queued' rows are pending work;
-- terminal rows ('succeeded'|'failed'|'cancelled') are the log. `checkpoint` holds resumable
-- state so a run survives a crash / reload mid-execution, exactly like jobs.lease_until.
--
-- NO reasoning is added here — this is the execution chassis only. Apply AFTER app_0003.

-- ---------- queue / checkpoint columns ----------
alter table public.agent_runs add column if not exists phase text not null default 'observe'; -- observe | plan | act
alter table public.agent_runs add column if not exists priority int not null default 0;       -- higher runs first
alter table public.agent_runs add column if not exists budget_usd numeric(10,4) not null default 0.50; -- hard spend cap
alter table public.agent_runs add column if not exists spent_usd numeric(10,5) not null default 0;
alter table public.agent_runs add column if not exists lease_until timestamptz;               -- worker lock (stale leases reclaimed)
alter table public.agent_runs add column if not exists checkpoint jsonb;                       -- resumable state
alter table public.agent_runs add column if not exists error text;
alter table public.agent_runs add column if not exists started_at timestamptz;
-- status now also takes: waiting_approval | paused | cancelled (plain text column; no enum change).

-- Index the runnable queue (owner-scoped: this app runs the runtime client-side in direct mode).
create index if not exists idx_agent_runs_runnable on public.agent_runs(owner_id, priority desc, created_at)
  where status in ('queued', 'running');

-- ---------- atomic owner-scoped claim ----------
-- Mirrors claim_next_job (FOR UPDATE SKIP LOCKED + lease), but scoped to auth.uid() so the
-- browser client can safely claim ITS OWN next run without a service-role key. An unattended
-- edge worker (Week 2+ follow-up) would use a service-role variant that claims across owners.
create or replace function public.claim_next_agent_run() returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from agent_runs
  where owner_id = auth.uid()
    and status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;
  return next r;
end $$;

-- Owner-scoped + auth.uid() guard inside makes this safe for authenticated callers.
revoke execute on function public.claim_next_agent_run() from anon;
grant execute on function public.claim_next_agent_run() to authenticated;

-- ======== supabase/migrations/app_0005_garvis_knowledge.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis KNOWLEDGE layer — the durable "Learn" store: decisions, outcomes, and lessons that Garvis
-- proposes and the owner approves. Every row is a SOURCED ASSERTION (claim + source + confidence).
--
-- Design notes:
--  * Stores ONLY what has no other source of truth (judgments). Derivable facts (repo/metrics) are
--    read live, never snapshotted here.
--  * Approval gate is a STATUS COLUMN: rows are written 'proposed' (inert) and only become part of
--    Garvis's reasoning memory once a human flips them to 'approved'. Every read path filters to
--    approved. No run-resume machinery is involved.
--  * Reuses the existing security model: owner_id + auth.uid() RLS, is_admin() read, and the
--    touch_updated_at() trigger from app_0003. Additive + idempotent.
--
-- Apply: paste into the Supabase SQL editor, or `supabase db push`. Run AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type knowledge_kind as enum ('decision', 'outcome', 'lesson');
exception when duplicate_object then null; end $$;

do $$ begin
  create type knowledge_status as enum ('proposed', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------- garvis_knowledge (the sourced-assertion store) ----------
create table if not exists public.garvis_knowledge (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,       -- null = portfolio-wide
  run_id      uuid references public.agent_runs(id) on delete set null, -- provenance: which run proposed it
  kind        knowledge_kind   not null,
  title       text not null,
  body        text not null,                       -- the claim / decision / lesson (the assertion)
  source      text,                                -- provenance: run | user | repo | research | free text
  confidence  numeric(3,2),                        -- 0..1, nullable
  status      knowledge_status not null default 'proposed',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id)
);
create index if not exists idx_gk_owner_status on public.garvis_knowledge(owner_id, status, created_at desc);
create index if not exists idx_gk_app on public.garvis_knowledge(app_id);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_gk_touch on public.garvis_knowledge;
create trigger trg_gk_touch before update on public.garvis_knowledge
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.garvis_knowledge enable row level security;

drop policy if exists "garvis_knowledge owner all" on public.garvis_knowledge;
create policy "garvis_knowledge owner all" on public.garvis_knowledge
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "garvis_knowledge admin read" on public.garvis_knowledge;
create policy "garvis_knowledge admin read" on public.garvis_knowledge
  for select using (public.is_admin());

-- ---------- realtime (stream proposed/approved knowledge to the Garvis dashboard) ----------
do $pub$ begin
alter publication supabase_realtime add table public.garvis_knowledge;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;

-- ======== supabase/migrations/app_0006_garvis_objective.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis OBJECTIVE layer — the brain's objective function + resource map:
--   * garvis_goals       — what we're optimizing for (priority, metric, target, lifecycle)
--   * garvis_constraints — global limits (budget/hours/risk/active-project cap), ONE row per owner
--   * garvis_capabilities— catalog of what each app/tool can do (the conductor's index)
--
-- Design notes:
--  * These are DURABLE JUDGMENTS (no other source of truth). Derived outputs (e.g. a resource
--    allocation %) are computed live by the brain from goals + constraints — never stored here.
--  * Only 'active' goals and 'approved' capabilities are injected into Garvis's reasoning context.
--  * The capability registry is a DESCRIPTIVE catalog, distinct from the executable GARVIS_TOOLS set;
--    they converge over time as registered capabilities get wired as callable tools.
--  * Reuses app_0003's security model (owner_id + auth.uid() RLS, is_admin() read, touch_updated_at).
--    Additive + idempotent. Run AFTER app_0003.

-- ---------- enums ----------
do $$ begin create type goal_status as enum ('proposed','active','achieved','paused','abandoned');
exception when duplicate_object then null; end $$;
do $$ begin create type risk_level as enum ('low','moderate','high');
exception when duplicate_object then null; end $$;
do $$ begin create type capability_safety as enum ('read_only','writes_data','external_action');
exception when duplicate_object then null; end $$;
do $$ begin create type capability_maturity as enum ('stub','draft','working','production');
exception when duplicate_object then null; end $$;
do $$ begin create type capability_status as enum ('proposed','approved','retired');
exception when duplicate_object then null; end $$;

-- ---------- garvis_goals (the objective function) ----------
-- status doubles as approval + lifecycle: 'proposed' (Garvis suggested) → 'active' (committed) →
-- 'achieved'/'paused'/'abandoned'. Only 'active' goals inject into context.
create table if not exists public.garvis_goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = portfolio-wide
  title       text not null,
  description text,
  priority    int not null default 3,             -- 1 = highest
  success_metric text,
  target_date date,
  status      goal_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_goals_owner_status on public.garvis_goals(owner_id, status, priority);

-- ---------- garvis_constraints (global settings — ONE row per owner) ----------
create table if not exists public.garvis_constraints (
  owner_id           uuid primary key references public.profiles(id) on delete cascade,
  weekly_hours       numeric(6,1),
  monthly_budget_usd numeric(12,2),
  risk_tolerance     risk_level not null default 'moderate',
  max_active_projects int,
  notes              text,
  updated_at         timestamptz not null default now()
);

-- ---------- garvis_capabilities (the catalog of what apps/tools can do) ----------
create table if not exists public.garvis_capabilities (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = Garvis-native
  name        text not null,
  description text not null,
  input_spec  text,
  output_spec text,
  safety_level      capability_safety not null default 'read_only',
  approval_required boolean not null default true,   -- does INVOKING it need user sign-off
  maturity    capability_maturity not null default 'stub',
  status      capability_status not null default 'approved', -- registration gate
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, app_id, name)
);
create index if not exists idx_caps_owner_status on public.garvis_capabilities(owner_id, status);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_goals_touch on public.garvis_goals;
create trigger trg_goals_touch before update on public.garvis_goals
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_constraints_touch on public.garvis_constraints;
create trigger trg_constraints_touch before update on public.garvis_constraints
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_caps_touch on public.garvis_capabilities;
create trigger trg_caps_touch before update on public.garvis_capabilities
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.garvis_goals        enable row level security;
alter table public.garvis_constraints  enable row level security;
alter table public.garvis_capabilities enable row level security;

drop policy if exists "garvis_goals owner all" on public.garvis_goals;
create policy "garvis_goals owner all" on public.garvis_goals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_goals admin read" on public.garvis_goals;
create policy "garvis_goals admin read" on public.garvis_goals for select using (public.is_admin());

drop policy if exists "garvis_constraints owner all" on public.garvis_constraints;
create policy "garvis_constraints owner all" on public.garvis_constraints
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "garvis_capabilities owner all" on public.garvis_capabilities;
create policy "garvis_capabilities owner all" on public.garvis_capabilities
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_capabilities admin read" on public.garvis_capabilities;
create policy "garvis_capabilities admin read" on public.garvis_capabilities for select using (public.is_admin());

-- ---------- realtime ----------
do $pub$ begin
alter publication supabase_realtime add table public.garvis_goals;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;
do $pub$ begin
alter publication supabase_realtime add table public.garvis_constraints;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;
do $pub$ begin
alter publication supabase_realtime add table public.garvis_capabilities;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;

-- ======== supabase/migrations/app_0007_garvis_app_profiles.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis APP-INTELLIGENCE layer — a durable, regenerable PROFILE per portfolio app:
--   * garvis_app_profiles — what each product IS (purpose/audience/business model),
--     where it stands (current state), what's blocking it, and the single next milestone.
--
-- Why this exists:
--  * Garvis apps are EXTERNAL GitHub repos, not FableForge `projects`, so they have no
--    project_files for the Brain/Map/Next/Check generators to read. The brain was reasoning
--    mostly off commit messages + "No description yet". This gives it product-level context.
--  * A profile is a GENERATED FACT (derived from the repo), not a durable judgment — so, unlike
--    garvis_knowledge, it is NOT approval-gated. It is regenerable and carries generated_at so
--    staleness is visible. One row per app (unique app_id), upserted on regeneration.
--  * Reuses app_0003's security model (owner_id + auth.uid() RLS, is_admin() read, touch_updated_at).
--    Additive + idempotent. Run AFTER app_0003.

-- ---------- garvis_app_profiles (one per app) ----------
create table if not exists public.garvis_app_profiles (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  app_id        uuid not null references public.apps(id) on delete cascade,
  purpose          text,  -- what the product does
  audience         text,  -- who it serves
  business_model   text,  -- how it could make money (or "none / learning project")
  current_state    text,  -- honest read of where it actually stands
  blocker          text,  -- the top thing blocking progress
  next_milestone   text,  -- the single most useful next milestone
  stage_assessment text,  -- Garvis's read of the real stage, vs the app row's stored stage
  confidence    numeric(3,2),       -- 0..1, the model's honest read of profile reliability
  source        text,               -- what evidence it was built from (e.g. 'readme+commits+issues')
  model         text,               -- which model generated it
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (app_id)
);
create index if not exists idx_app_profiles_owner on public.garvis_app_profiles(owner_id);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_app_profiles_touch on public.garvis_app_profiles;
create trigger trg_app_profiles_touch before update on public.garvis_app_profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.garvis_app_profiles enable row level security;

drop policy if exists "garvis_app_profiles owner all" on public.garvis_app_profiles;
create policy "garvis_app_profiles owner all" on public.garvis_app_profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_app_profiles admin read" on public.garvis_app_profiles;
create policy "garvis_app_profiles admin read" on public.garvis_app_profiles for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.garvis_app_profiles;
exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0008_garvis_liveness.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis SENSES layer — app_liveness: the first automatic OUTCOME signal Garvis gets.
--   * app_liveness — an append-only time series of "is this deployed app actually reachable?"
--
-- Why this exists:
--  * Until now Garvis reasoned over STATE (repos, profiles) but was blind to OUTCOMES. app_metrics
--    (visitors/signups/revenue) is only ever populated by hand, so in practice it's empty. Liveness is
--    the cheapest real signal we can gather automatically: ping each app's deploy_url from the browser.
--  * Deliberately SEPARATE from app_metrics: liveness is operational status, not a business metric.
--    (Same "don't overload" discipline that kept profiles out of garvis_knowledge.)
--  * Append-only (one row per check) so the brain can see a trend ("went down 3 days ago"), not just now.
--  * Browser pings are CORS-blind (no-cors), so `reachable` means "the host responded with something",
--    NOT "returned HTTP 200". Honest coarse signal. Reuses app_0003's RLS + is_admin().
--    Additive + idempotent. Run AFTER app_0003.

create table if not exists public.app_liveness (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid not null references public.apps(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  reachable   boolean not null,
  status      text,              -- 'reachable' | 'unreachable' | 'timeout'
  latency_ms  integer,           -- round-trip ms when reachable, else null
  source      text not null default 'browser'
);
create index if not exists idx_liveness_app on public.app_liveness(app_id, checked_at desc);
create index if not exists idx_liveness_owner on public.app_liveness(owner_id, checked_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.app_liveness enable row level security;

drop policy if exists "app_liveness owner all" on public.app_liveness;
create policy "app_liveness owner all" on public.app_liveness
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "app_liveness admin read" on public.app_liveness;
create policy "app_liveness admin read" on public.app_liveness for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.app_liveness;
exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0009_garvis_strategic.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis STRATEGIC layer — the second triage lens: the founder's JUDGMENT of what matters.
--   * apps.strategic_importance — core | supporting | experimental (null = unclassified)
--   * apps.strategic_role        — one line on WHY it matters / its platform role / relationship to others
--
-- Why on `apps` (a durable judgment) and NOT in garvis_app_profiles (a generated fact):
--  * Strategic importance is NOT derivable from a repo. An LLM reading code can't know that a quiet,
--    undeployed project is "core" because it becomes the intelligence layer later — that's the founder's
--    vision. Putting it in the regenerable profile would have the model GUESS strategy from operational
--    signals, the exact failure that nearly archived FableForge in the triage dry-run.
--  * So it lives with the other durable per-product judgments (stage, goals) on the apps row. Garvis may
--    PROPOSE an importance for unclassified apps, but the authoritative value is owner-set.
--  * 'archived' is a lifecycle/stage, NOT an importance — kept orthogonal. Additive + idempotent.

do $$ begin create type strategic_importance as enum ('core','supporting','experimental');
exception when duplicate_object then null; end $$;

alter table public.apps add column if not exists strategic_importance strategic_importance;
alter table public.apps add column if not exists strategic_role text;

-- ======== supabase/migrations/app_0010_garvis_marketing.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis DO-LAYER — the first WORKER that produces real deliverables: the Marketing Worker.
--   * marketing_campaigns — a marketing mission: a brief + subject (a portfolio app OR an external
--     thing like "my mom's real-estate business"), with a status lifecycle.
--   * marketing_assets    — the produced deliverables (strategy / calendar / social_post / email /
--     landing_page), each with its OWN draft → approved → scheduled → published lifecycle, a target
--     channel, and the Verifier's acceptance result. This table is also the approve-to-publish QUEUE.
--
-- Design notes:
--  * app_id is nullable — Garvis can market something that isn't in the portfolio (the "mom's
--    business" case). `subject` carries the human description either way.
--  * content is jsonb (kind-specific shape) so one table holds every asset kind.
--  * The autonomy ladder lives in `status` + `channel`: assets are generated as drafts (writes_data,
--    reviewable); publishing (external_action) only happens on explicit approval. Reuses app_0003 RLS.
--    Additive + idempotent. Run AFTER app_0003.

do $$ begin create type marketing_asset_kind as enum ('strategy','calendar','social_post','email','landing_page');
exception when duplicate_object then null; end $$;
do $$ begin create type marketing_asset_status as enum ('draft','approved','scheduled','published','rejected');
exception when duplicate_object then null; end $$;
do $$ begin create type marketing_campaign_status as enum ('generating','review','active','done','failed');
exception when duplicate_object then null; end $$;

create table if not exists public.marketing_campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = external subject
  subject     text not null,            -- what we're marketing (app name or "mom's real-estate business")
  brief       text,                     -- the founder's brief / goal for this campaign
  status      marketing_campaign_status not null default 'generating',
  summary     text,                     -- the strategy one-liner once generated
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_campaigns_owner on public.marketing_campaigns(owner_id, created_at desc);

create table if not exists public.marketing_assets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  campaign_id   uuid not null references public.marketing_campaigns(id) on delete cascade,
  kind          marketing_asset_kind not null,
  title         text,
  content       jsonb not null default '{}'::jsonb,  -- kind-specific shape
  channel       text,                                -- 'manual' | 'email' | 'x' | 'linkedin' | null
  status        marketing_asset_status not null default 'draft',
  scheduled_for timestamptz,
  published_at  timestamptz,
  verify        jsonb,                               -- the Verifier's acceptance result {ok, issues, warnings}
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_assets_campaign on public.marketing_assets(campaign_id, kind);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_campaigns_touch on public.marketing_campaigns;
create trigger trg_campaigns_touch before update on public.marketing_campaigns
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_assets_touch on public.marketing_assets;
create trigger trg_assets_touch before update on public.marketing_assets
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_assets    enable row level security;

drop policy if exists "marketing_campaigns owner all" on public.marketing_campaigns;
create policy "marketing_campaigns owner all" on public.marketing_campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "marketing_campaigns admin read" on public.marketing_campaigns;
create policy "marketing_campaigns admin read" on public.marketing_campaigns for select using (public.is_admin());

drop policy if exists "marketing_assets owner all" on public.marketing_assets;
create policy "marketing_assets owner all" on public.marketing_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "marketing_assets admin read" on public.marketing_assets;
create policy "marketing_assets admin read" on public.marketing_assets for select using (public.is_admin());

-- ---------- realtime ----------
do $$ begin alter publication supabase_realtime add table public.marketing_campaigns; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.marketing_assets; exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0011_garvis_missions.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis MISSION ORCHESTRATOR — the Jarvis front door + the worker dispatch model.
--   * garvis_missions — a high-level objective ("grow Theory Thread") the founder hands Garvis.
--   * garvis_tasks    — the decomposed, worker-typed steps of a mission, each with a result + verify.
--
-- This is the orchestrator-workers pattern (Anthropic / Manus): a Planner decomposes the objective
-- into typed Tasks, the runner dispatches each to its Worker, results are verified and reported.
-- Reuses the bounded-autonomy chassis Garvis already has (status lifecycle, per-task result/verify).
-- Reuses app_0003 RLS + touch_updated_at. Additive + idempotent. Run AFTER app_0003.

do $$ begin create type mission_status as enum ('planning','planned','running','review','done','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type task_status as enum ('queued','running','blocked','done','failed','skipped');
exception when duplicate_object then null; end $$;

create table if not exists public.garvis_missions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = external / portfolio-wide
  objective   text not null,
  subject     text,                       -- what it's about (app name or external thing)
  status      mission_status not null default 'planning',
  summary     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_missions_owner on public.garvis_missions(owner_id, created_at desc);

create table if not exists public.garvis_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  mission_id  uuid not null references public.garvis_missions(id) on delete cascade,
  seq         int not null default 0,     -- execution order within the mission
  worker      text not null,              -- research | analytics | marketing | bug | builder
  title       text not null,
  input       jsonb not null default '{}'::jsonb,
  status      task_status not null default 'queued',
  result      jsonb,                      -- { summary, artifacts:[{kind,title,body}] }
  verify      jsonb,                      -- { ok, issues, warnings }
  cost_usd    numeric(10,4) default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tasks_mission on public.garvis_tasks(mission_id, seq);

drop trigger if exists trg_missions_touch on public.garvis_missions;
create trigger trg_missions_touch before update on public.garvis_missions for each row execute function public.touch_updated_at();
drop trigger if exists trg_tasks_touch on public.garvis_tasks;
create trigger trg_tasks_touch before update on public.garvis_tasks for each row execute function public.touch_updated_at();

alter table public.garvis_missions enable row level security;
alter table public.garvis_tasks    enable row level security;

drop policy if exists "garvis_missions owner all" on public.garvis_missions;
create policy "garvis_missions owner all" on public.garvis_missions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_missions admin read" on public.garvis_missions;
create policy "garvis_missions admin read" on public.garvis_missions for select using (public.is_admin());

drop policy if exists "garvis_tasks owner all" on public.garvis_tasks;
create policy "garvis_tasks owner all" on public.garvis_tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_tasks admin read" on public.garvis_tasks;
create policy "garvis_tasks admin read" on public.garvis_tasks for select using (public.is_admin());

do $$ begin alter publication supabase_realtime add table public.garvis_missions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.garvis_tasks; exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0012_garvis_opportunities.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis OPPORTUNITY DETECTION — the proactive layer: Garvis reasons over the portfolio as a SYSTEM
-- and surfaces opportunities the founder didn't ask for ("Theory Thread could feed FableForge
-- marketing"; "Hyperlocal News could clone to 300 cities"; "these 3 apps overlap — consolidate").
--   * garvis_opportunities — the opportunity QUEUE (notice → persist → surface later → act/dismiss).
--
-- Why a table (despite "no more tables"): proactivity is impossible without it. To say "I found this
-- while you were away", dedupe re-scans, and remember what you dismissed/converted, opportunities need
-- a lifecycle (new → saved/dismissed/converted). This is a QUEUE, not another intelligence substrate.
-- A 'converted' opp links to the mission it became. Reuses app_0003 RLS. Additive + idempotent.

do $$ begin create type opportunity_type as enum ('synergy','expansion','consolidation','risk','quick_win','positioning');
exception when duplicate_object then null; end $$;
do $$ begin create type opportunity_status as enum ('new','saved','dismissed','converted');
exception when duplicate_object then null; end $$;

create table if not exists public.garvis_opportunities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  type          opportunity_type not null default 'synergy',
  rationale     text,                       -- the grounded "why", citing portfolio facts
  suggested_move text,                      -- the concrete next action (can become a mission objective)
  related_apps  text[] not null default '{}',  -- app names this spans (cross-app intelligence)
  confidence    numeric(3,2),
  status        opportunity_status not null default 'new',
  mission_id    uuid references public.garvis_missions(id) on delete set null,  -- set when converted
  source        text not null default 'scan',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_opps_owner on public.garvis_opportunities(owner_id, status, created_at desc);

drop trigger if exists trg_opps_touch on public.garvis_opportunities;
create trigger trg_opps_touch before update on public.garvis_opportunities for each row execute function public.touch_updated_at();

alter table public.garvis_opportunities enable row level security;
drop policy if exists "garvis_opportunities owner all" on public.garvis_opportunities;
create policy "garvis_opportunities owner all" on public.garvis_opportunities for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_opportunities admin read" on public.garvis_opportunities;
create policy "garvis_opportunities admin read" on public.garvis_opportunities for select using (public.is_admin());

do $$ begin alter publication supabase_realtime add table public.garvis_opportunities; exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0013_knowledge_universe.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- THE KNOWLEDGE UNIVERSE — the persistent substrate for Garvis as an "operating system for
-- intellectual exploration." A thought becomes a cluster, clusters nest into a living map, every
-- discovery attaches as an artifact, and the whole thing PERSISTS so it can grow across sessions —
-- which is what makes the epiphany engine, the patterns layer, and "welcome back, your universe
-- grew while you were away" possible at all.
--
--   * knowledge_worlds        — top-level containers (one per curiosity / domain / project)
--   * knowledge_clusters      — the living thoughts (self-nesting tree + salience + maturity + trajectory)
--   * knowledge_cluster_edges — cross-links beyond parent/child (the discovery trail + connections)
--   * knowledge_artifacts     — media/results/docs created or found (nothing ever gets lost)
--
-- Additive + idempotent. Owner-scoped via app_0003 RLS conventions (profiles + touch_updated_at + is_admin).

do $$ begin create type cluster_kind as enum ('topic','question','idea','investigation','artifact','project');
exception when duplicate_object then null; end $$;
do $$ begin create type cluster_maturity as enum ('spark','growing','mature','building','finished','dormant','archived');
exception when duplicate_object then null; end $$;
do $$ begin create type ku_edge_type as enum ('relates','leads_to','contradicts','supports');
exception when duplicate_object then null; end $$;
do $$ begin create type ku_artifact_kind as enum ('image','video','diagram','research','doc','link','post','data');
exception when duplicate_object then null; end $$;

-- ---- worlds ----
create table if not exists public.knowledge_worlds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_ku_worlds_owner on public.knowledge_worlds(owner_id, updated_at desc);

-- ---- clusters (the living thoughts) ----
create table if not exists public.knowledge_clusters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  parent_id   uuid references public.knowledge_clusters(id) on delete set null,
  slug        text not null,                       -- stable client id (entity resolution key)
  title       text not null,
  summary     text,
  trajectory  text,                                -- "where it's going" — the companion line
  kind        cluster_kind not null default 'topic',
  maturity    cluster_maturity not null default 'spark',
  salience    numeric(3,2) not null default 0.5,   -- 0..1 core↔trivia (DOI / zoom)
  turn_refs   int[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (world_id, slug)
);
create index if not exists idx_ku_clusters_world on public.knowledge_clusters(world_id);
create index if not exists idx_ku_clusters_parent on public.knowledge_clusters(parent_id);
create index if not exists idx_ku_clusters_owner on public.knowledge_clusters(owner_id);

-- ---- edges (cross-links / discovery trail / connections) ----
create table if not exists public.knowledge_cluster_edges (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  world_id   uuid not null references public.knowledge_worlds(id) on delete cascade,
  source_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  target_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  type       ku_edge_type not null default 'relates',
  created_at timestamptz not null default now()
);
create index if not exists idx_ku_edges_world on public.knowledge_cluster_edges(world_id);

-- ---- artifacts (media / results / docs — nothing lost) ----
create table if not exists public.knowledge_artifacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.knowledge_clusters(id) on delete cascade,
  kind       ku_artifact_kind not null default 'doc',
  title      text not null,
  detail     text,
  url        text,
  thumb      text,
  source     text default 'conversation',
  created_at timestamptz not null default now()
);
create index if not exists idx_ku_artifacts_cluster on public.knowledge_artifacts(cluster_id);

-- ---- touch triggers ----
drop trigger if exists trg_ku_worlds_touch on public.knowledge_worlds;
create trigger trg_ku_worlds_touch before update on public.knowledge_worlds for each row execute function public.touch_updated_at();
drop trigger if exists trg_ku_clusters_touch on public.knowledge_clusters;
create trigger trg_ku_clusters_touch before update on public.knowledge_clusters for each row execute function public.touch_updated_at();

-- ---- RLS (owner-all + admin-read), mirroring app_0003 ----
do $$
declare t text;
begin
  foreach t in array array['knowledge_worlds','knowledge_clusters','knowledge_cluster_edges','knowledge_artifacts'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s owner all" on public.%I;', t, t);
    execute format('create policy "%s owner all" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t, t);
    execute format('drop policy if exists "%s admin read" on public.%I;', t, t);
    execute format('create policy "%s admin read" on public.%I for select using (public.is_admin());', t, t);
    begin execute format('alter publication supabase_realtime add table public.%I;', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- ======== supabase/migrations/app_0014_connections.sql ========
-- app_0014_connections.sql
-- Server-side store for a user's external provider connections (Supabase / GitHub / Netlify / …).
-- Tokens live here instead of the browser's localStorage, so "connect once" works across devices and
-- the OAuth phases (C2/C3) have a consistent home to write into.
--
-- SECURITY MODEL: RLS is ENABLED with NO policies for end users — so the anon/authenticated client
-- (the browser) can NEVER select/insert/update/delete rows here. Only the service role (used by the
-- `connections` + oauth edge functions) bypasses RLS. Result: access/refresh tokens are never reachable
-- from the browser. (At-rest encryption via Supabase Vault is a later hardening; tokens are already
-- server-only by construction.)

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,                 -- 'supabase' | 'github' | 'netlify' | 'vercel' | …
  access_token text,
  refresh_token text,
  expires_at timestamptz,                  -- when access_token expires (for OAuth refresh)
  scope text,
  account_label text,                      -- e.g. the connected GitHub login / Supabase org name
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists provider_connections_user_idx on public.provider_connections (user_id);

alter table public.provider_connections enable row level security;
-- Intentionally NO policies: end users have zero direct access. The edge functions read/write with the
-- service role. This is what keeps the tokens out of the browser entirely.

-- keep updated_at fresh
create or replace function public.touch_provider_connections()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_provider_connections on public.provider_connections;
create trigger trg_touch_provider_connections before update on public.provider_connections
  for each row execute function public.touch_provider_connections();

-- Each app maps to a provisioned Supabase project (C2) — remember its ref on the FableForge project.
alter table public.projects add column if not exists supabase_project_ref text;

-- ======== supabase/migrations/app_0015_oauth_states.sql ========
-- app_0015_oauth_states.sql
-- Short-lived store for in-flight OAuth authorization requests (PKCE verifier + CSRF state), so the
-- /oauth/callback can be matched back to the user who started the flow. RLS-locked to the service role
-- (the oauth edge function) — the browser never touches these rows.

create table if not exists public.oauth_states (
  state text primary key,                 -- random CSRF token, also the lookup key on callback
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  code_verifier text not null,            -- PKCE verifier (exchanged with the provider, never exposed)
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_user_idx on public.oauth_states (user_id);

alter table public.oauth_states enable row level security;
-- No client policies: only the service role (oauth edge fn) reads/writes. Browser has zero access.

-- ======== supabase/migrations/app_0016_managed_cloud.sql ========
-- app_0016_managed_cloud.sql
-- Tiered provisioning: an app's database is either in the USER's own Supabase org (they connected via
-- OAuth) or managed under FABLEFORGE's org ("FableForge Cloud" — no user Supabase account). This flag
-- records which, so the deploy/console functions pick the right Management token (user OAuth vs platform).
alter table public.projects add column if not exists supabase_managed boolean not null default false;

-- ======== supabase/migrations/app_0017_credits.sql ========
-- app_0017_credits.sql
-- Platform-wide credits. ONE balance per user that EVERY server-side AI action deducts from — not
-- just app generation, but chat edits, Garvis, research, plan drafting, the agentic build loop, and
-- media discovery. A credit ≈ $0.01 of underlying AI cost; the deduction is proportional to the REAL
-- cost_usd of each action, so a cheap search costs a little and an app generation costs more, all from
-- the same balance. Monthly grant by plan. This is the margin/abuse guardrail before opening to
-- paying strangers. Enforced structurally via spend_credits() so no feature can forget to charge.

alter table public.profiles
  add column if not exists credits_balance int not null default 100,
  add column if not exists credits_period_start timestamptz not null default now();

-- Credits charged for an action (0 on historical rows). event_type carries the kind.
alter table public.usage_events
  add column if not exists credits int not null default 0;

-- Monthly credit grant by plan — the ONE place to tune allotments (or override per-profile later).
-- A credit ≈ $0.01 of AI cost, so credits × $0.01 is the cost CEILING you grant per user/month.
-- Sized for a healthy margin at typical use with a bounded worst case (see the pricing analysis):
--   free 150  → $1.50 ceiling (intended for Haiku — gate free-tier model choice to keep it cheap)
--   pro  2500 → $25   ceiling (Pro sold ~$49/mo → ~72% typical / ~45% worst-case gross margin)
-- (5000 was a margin bug: $50 of cost for a $49 plan = a loss at full use.) A 'starter' tier ($19 /
-- ~800 credits) needs a plan_tier enum migration — add it when wiring Stripe if you want 3 tiers.
create or replace function public.plan_monthly_credits(p plan_tier)
returns int language sql immutable as $$
  select case p when 'pro' then 2500 else 150 end;
$$;

-- Dollars of underlying AI cost that one credit represents (1 credit = $0.01 of cost).
create or replace function public.credit_usd()
returns numeric language sql immutable as $$ select 0.01::numeric $$;

-- Give every existing user their plan's grant now, and start the window.
update public.profiles set credits_balance = public.plan_monthly_credits(plan), credits_period_start = now();

-- Roll the monthly window if it has elapsed, refilling to the plan grant. Returns the current
-- (possibly refreshed) balance. security definer so the owner and the service role can call it.
create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz;
begin
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_balance := public.plan_monthly_credits(v_plan);
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
  end if;
  return v_balance;
end;
$$;

-- Atomically charge for an AI action: refresh the window, deduct credits derived from the REAL cost
-- (min 1 credit for any billable action), floor at 0, and log a usage_events row with the credits
-- charged. Returns the remaining balance. Called AFTER the AI call (cost is known) by the service role.
create or replace function public.spend_credits(
  p_user uuid, p_cost numeric, p_kind text,
  p_provider text default null, p_model text default null,
  p_in int default 0, p_out int default 0, p_project uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_credits int; v_balance int;
begin
  perform public.refresh_credits(p_user);
  v_credits := greatest(1, ceil(coalesce(p_cost, 0) / public.credit_usd()))::int;
  update public.profiles set credits_balance = greatest(0, credits_balance - v_credits)
    where id = p_user returning credits_balance into v_balance;
  insert into public.usage_events (user_id, project_id, event_type, provider, model, input_tokens, output_tokens, cost_usd, credits)
    values (p_user, p_project, p_kind, p_provider, p_model, coalesce(p_in, 0), coalesce(p_out, 0), coalesce(p_cost, 0), v_credits);
  return coalesce(v_balance, 0);
end;
$$;

grant execute on function public.plan_monthly_credits(plan_tier) to authenticated, service_role;
grant execute on function public.refresh_credits(uuid) to authenticated, service_role;
grant execute on function public.spend_credits(uuid, numeric, text, text, text, int, int, uuid) to authenticated, service_role;

-- SECURITY: users may update their own profile, but must NOT be able to grant themselves credits or
-- change plan/role/limits. Recreate the update policy pinning all privileged columns (credits included).
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and plan = (select plan from public.profiles where id = auth.uid())
    and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid())
    and credits_balance = (select credits_balance from public.profiles where id = auth.uid())
    and credits_period_start = (select credits_period_start from public.profiles where id = auth.uid())
  );

-- ======== supabase/migrations/app_0018_knowledge_universe_sync.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- KNOWLEDGE UNIVERSE SYNC — the columns the client sync layer (src/lib/garvis/universe.ts) needs to
-- round-trip a universe losslessly between the browser graph and the app_0013 tables:
--
--   * knowledge_worlds.focus_slug   — where the user was standing when they left ("welcome back
--                                     lands you ON the idea, not at the root")
--   * knowledge_worlds.mind         — Garvis's persisted inner model of the explorer (intent, state,
--                                     next directions) so the companion remembers YOU per world.
--                                     Written by a later phase; schema-ready now.
--   * knowledge_artifacts.slug      — the client's stable artifact key ('understanding',
--                                     'wiki-img-0', …) so repeated saves UPDATE an artifact instead
--                                     of duplicating it. Unique per cluster.
--
-- Additive + idempotent, mirroring app_0013 conventions.

alter table public.knowledge_worlds    add column if not exists focus_slug text;
alter table public.knowledge_worlds    add column if not exists mind jsonb;
alter table public.knowledge_artifacts add column if not exists slug text;

-- Upsert key for artifacts (nulls stay distinct, so pre-existing rows without a slug are untouched).
create unique index if not exists uq_ku_artifacts_cluster_slug
  on public.knowledge_artifacts(cluster_id, slug);

-- ======== supabase/migrations/app_0019_intelligence_core.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- INTELLIGENCE CORE v0 — the event spine the rest of the "living mind" derives from.
--
-- Architecture (see docs/legendary-roadmap.md discussion): the reasoner is rented; the RECORD is owned.
--  * mind_events    — append-only, typed event log. The one table everything else is derived from.
--                     Immutable by trigger: updates/deletes are rejected, so history can always be
--                     re-consolidated by a smarter future model.
--  * mind_beliefs   — distilled, evidence-COUNTED assertions (never invented scores): each belief
--                     links the event ids that support/contradict it. Status curates; nothing is deleted.
--  * mind_decisions — the decision journal: what was decided, what was predicted, what actually
--                     happened. Outcomes are what turn activity into learning.
--  * mind_identity  — the human-edited identity layer (goals / values / priorities / voice), one row
--                     per slot. Injected at the top of every compiled context. Never machine-written.
--
-- Reuses the app_0003 security model (owner_id + auth.uid() RLS, is_admin() read, touch_updated_at()).
-- Additive + idempotent. Apply AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type belief_status as enum ('active', 'retired');
exception when duplicate_object then null; end $$;

-- ---------- mind_events (the append-only spine) ----------
create table if not exists public.mind_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = portfolio-wide
  source      text not null,               -- which surface emitted it: commander | agent_run | workspace | import | user
  event_type  text not null,               -- typed contract enforced in src/lib/garvis/mind.ts
  subject     text not null,               -- one-line human/model-readable summary (data, never instructions)
  payload     jsonb not null default '{}', -- structured detail; excluded from compiled context by default
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_me_owner_time on public.mind_events(owner_id, occurred_at desc);
create index if not exists idx_me_type on public.mind_events(owner_id, event_type);

-- Append-only invariant: the record is immutable. Corrections are new events, never edits.
create or replace function public.mind_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'mind_events is append-only: % is not allowed', tg_op;
end $$;
drop trigger if exists trg_me_no_update on public.mind_events;
create trigger trg_me_no_update before update or delete on public.mind_events
  for each row execute function public.mind_events_immutable();

-- ---------- mind_beliefs (evidence-counted assertions) ----------
create table if not exists public.mind_beliefs (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  statement               text not null,            -- the assertion, in plain language
  scope                   text not null default 'portfolio', -- where it applies: portfolio | an app name | a domain
  supporting_event_ids    uuid[] not null default '{}',
  contradicting_event_ids uuid[] not null default '{}',
  status                  belief_status not null default 'active',
  review_at               timestamptz,              -- staleness: beliefs decay unless re-evidenced
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_mb_owner_status on public.mind_beliefs(owner_id, status, updated_at desc);

drop trigger if exists trg_mb_touch on public.mind_beliefs;
create trigger trg_mb_touch before update on public.mind_beliefs
  for each row execute function public.touch_updated_at();

-- ---------- mind_decisions (the decision journal) ----------
create table if not exists public.mind_decisions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,
  decision    text not null,               -- what was decided
  reasoning   text,                        -- why, at the time
  prediction  text,                        -- what was expected to happen
  outcome     text,                        -- what actually happened (null = still open)
  outcome_hit boolean,                     -- did the prediction hold? (set when outcome is recorded)
  decided_at  timestamptz not null default now(),
  outcome_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_md_owner_open on public.mind_decisions(owner_id, outcome_at nulls first, decided_at desc);

drop trigger if exists trg_md_touch on public.mind_decisions;
create trigger trg_md_touch before update on public.mind_decisions
  for each row execute function public.touch_updated_at();

-- ---------- mind_identity (human-edited; one row per slot) ----------
create table if not exists public.mind_identity (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  slot       text not null check (slot in ('goals', 'values', 'priorities', 'voice')),
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slot)
);

drop trigger if exists trg_mi_touch on public.mind_identity;
create trigger trg_mi_touch before update on public.mind_identity
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.mind_events    enable row level security;
alter table public.mind_beliefs   enable row level security;
alter table public.mind_decisions enable row level security;
alter table public.mind_identity  enable row level security;

-- events: owners may INSERT and SELECT only — the append-only trigger blocks the rest.
drop policy if exists "mind_events owner insert" on public.mind_events;
create policy "mind_events owner insert" on public.mind_events
  for insert with check (owner_id = auth.uid());
drop policy if exists "mind_events owner read" on public.mind_events;
create policy "mind_events owner read" on public.mind_events
  for select using (owner_id = auth.uid());
drop policy if exists "mind_events admin read" on public.mind_events;
create policy "mind_events admin read" on public.mind_events
  for select using (public.is_admin());

drop policy if exists "mind_beliefs owner all" on public.mind_beliefs;
create policy "mind_beliefs owner all" on public.mind_beliefs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mind_decisions owner all" on public.mind_decisions;
create policy "mind_decisions owner all" on public.mind_decisions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mind_identity owner all" on public.mind_identity;
create policy "mind_identity owner all" on public.mind_identity
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- realtime (stream the growing record to the Mind page) ----------
do $pub$ begin
alter publication supabase_realtime add table public.mind_events;
exception when duplicate_object then null;  -- already a member (manual-paste era)
end $pub$;

-- ======== supabase/migrations/app_0020_project_assets.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- PROJECT ASSETS — the user's own imagery, first-class (the Framer-parity asset library):
--   * Upload photos into a project, or HARVEST them from an existing website (copied into
--     storage so they survive the old site going away).
--   * Each build/edit receives an ASSET MANIFEST so generated pages use the user's REAL
--     images (heroes, galleries, ScrollScenes) instead of stock.
--
-- The storage bucket 'project-assets' already exists (schema.sql) with owner-folder write RLS.
-- Generated sites must be able to RENDER these images publicly (preview iframe + deployed site),
-- so the bucket flips to public READ; writes stay owner-scoped via the existing policy.

update storage.buckets set public = true where id = 'project-assets';

-- ---------- project_assets (manifest: name + public url + alt + provenance) ----------
create table if not exists public.project_assets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  url        text not null,                 -- public storage URL (or source URL while importing)
  alt        text not null default '',      -- injected into builds; good alt = better generated pages
  source     text not null default 'upload' check (source in ('upload', 'harvest')),
  width      int,
  height     int,
  created_at timestamptz not null default now()
);
create index if not exists idx_pa_project on public.project_assets(project_id, created_at desc);

alter table public.project_assets enable row level security;

drop policy if exists "project_assets owner all" on public.project_assets;
create policy "project_assets owner all" on public.project_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "project_assets admin read" on public.project_assets;
create policy "project_assets admin read" on public.project_assets
  for select using (public.is_admin());

-- ======== supabase/migrations/app_0021_brain_vector.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- PERSISTENT BRAIN v0 — the durable memory + meaning layer under the whole Garvis system.
--
-- Why this exists (see docs/garvis-system-architecture.md §4): today embeddings live in the
-- BROWSER, in-memory (src/lib/garvis/embeddings.ts). "Similar ideas" and entity resolution die on
-- reload and never span modules. This migration gives Garvis a real brain:
--   * documents  — anything ingested (upload | url | repo | email | scraped) with extracted text +
--                  a summary + a classification status. The file-intake object.
--   * embeddings — ONE 1536-dim vector column for EVERY meaningful object (document, artifact,
--                  cluster, knowledge, business, app). Learn from theory-thread's dimension sprawl
--                  (384/768/1536, mostly unpopulated): pick one dim, write it everywhere.
--   * insights   — the "Garvis noticed…" surface: a connection/drift/opportunity Garvis found by
--                  proximity, awaiting the user's eyes. Cheap to produce once vectors exist.
--   * match_embeddings() — cosine k-NN RPC, owner-scoped, optionally filtered by subject_type.
--
-- Reuses the app_0003/app_0019 security model (owner_id + auth.uid() RLS, is_admin() read,
-- touch_updated_at()). Additive + idempotent. Apply AFTER app_0013 (knowledge universe) and app_0019.

-- ---------- extension ----------
create extension if not exists vector;

-- ---------- enums ----------
do $$ begin
  create type document_source as enum ('upload', 'url', 'repo', 'email', 'scrape', 'note');
exception when duplicate_object then null; end $$;
do $$ begin
  create type document_status as enum ('uploaded', 'extracted', 'classified', 'linked', 'failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type insight_kind as enum ('noticed', 'connection', 'drift', 'opportunity');
exception when duplicate_object then null; end $$;
do $$ begin
  create type insight_status as enum ('new', 'surfaced', 'dismissed', 'actioned');
exception when duplicate_object then null; end $$;

-- ---------- documents (the file-intake object) ----------
create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null, -- proposed/confirmed home
  app_id         uuid references public.apps(id) on delete set null,             -- linked product, if any
  source_kind    document_source not null default 'upload',
  title          text not null,
  storage_path   text,                        -- object in the 'documents' bucket (null for url/note)
  source_url     text,                        -- origin for url/repo/scrape
  mime           text,
  bytes          integer,
  summary        text,                        -- model-written, 1-3 sentences
  extracted_text text,                        -- best-effort plain text (truncated for large files)
  concepts       text[] not null default '{}',-- extracted keywords/entities
  meta           jsonb not null default '{}',
  status         document_status not null default 'uploaded',
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_documents_owner on public.documents(owner_id, created_at desc);
create index if not exists idx_documents_world on public.documents(world_id);
create index if not exists idx_documents_status on public.documents(owner_id, status);

drop trigger if exists trg_documents_touch on public.documents;
create trigger trg_documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- ---------- embeddings (ONE vector space for every object) ----------
-- subject_type + subject_id is a polymorphic pointer (no FK — subjects live in many tables). The
-- writer is responsible for deleting stale rows when a subject changes (embed-worker upserts by
-- (owner_id, subject_type, subject_id, chunk_ix)).
create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null,                 -- document | artifact | cluster | knowledge | business | app
  subject_id   uuid not null,
  chunk_ix     integer not null default 0,    -- >0 for long docs split into chunks
  content      text not null,                 -- the exact text that was embedded (for display/debug)
  embedding    vector(1536) not null,
  model        text not null default 'text-embedding-3-small',
  created_at   timestamptz not null default now(),
  unique (owner_id, subject_type, subject_id, chunk_ix)
);
create index if not exists idx_embeddings_owner_subject on public.embeddings(owner_id, subject_type, subject_id);
-- HNSW cosine index — the k-NN workhorse. Safe on an empty table; builds incrementally.
create index if not exists idx_embeddings_hnsw on public.embeddings
  using hnsw (embedding vector_cosine_ops);

-- ---------- insights ("Garvis noticed…") ----------
create table if not exists public.insights (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  kind        insight_kind not null default 'noticed',
  title       text not null,
  body        text not null default '',
  refs        jsonb not null default '[]',    -- [{subject_type, subject_id, label}] the insight connects
  score       numeric(4,3) not null default 0,-- proximity/confidence, [0,1]; never invented — from cosine
  status      insight_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_insights_owner on public.insights(owner_id, status, created_at desc);

drop trigger if exists trg_insights_touch on public.insights;
create trigger trg_insights_touch before update on public.insights
  for each row execute function public.touch_updated_at();

-- ---------- match_embeddings() — owner-scoped cosine k-NN ----------
-- SECURITY INVOKER (default): runs as the caller, so RLS on public.embeddings applies and an owner
-- can only ever match their own vectors. _owner is passed for an explicit belt-and-suspenders filter.
create or replace function public.match_embeddings(
  _owner uuid,
  _query vector(1536),
  _k int default 8,
  _subject_type text default null,
  _min_similarity float default 0.0,
  _exclude_subject uuid default null
)
returns table (
  subject_type text,
  subject_id   uuid,
  chunk_ix     int,
  content      text,
  similarity   float
)
language sql
stable
as $$
  select e.subject_type, e.subject_id, e.chunk_ix, e.content,
         1 - (e.embedding <=> _query) as similarity
  from public.embeddings e
  where e.owner_id = _owner
    and (_subject_type is null or e.subject_type = _subject_type)
    and (_exclude_subject is null or e.subject_id <> _exclude_subject)
    and (1 - (e.embedding <=> _query)) >= _min_similarity
  order by e.embedding <=> _query
  limit greatest(1, least(_k, 50));
$$;

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped; mirrors app_0003/app_0019)
-- ============================================================
alter table public.documents  enable row level security;
alter table public.embeddings enable row level security;
alter table public.insights   enable row level security;

drop policy if exists "documents owner all" on public.documents;
create policy "documents owner all" on public.documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "documents admin read" on public.documents;
create policy "documents admin read" on public.documents
  for select using (public.is_admin());

-- Embeddings: owners read their own; WRITES are service-role only (the embed-worker holds the
-- embedding provider key server-side). No client insert/update path — vectors are never written
-- from the browser.
drop policy if exists "embeddings owner read" on public.embeddings;
create policy "embeddings owner read" on public.embeddings
  for select using (owner_id = auth.uid());

drop policy if exists "insights owner all" on public.insights;
create policy "insights owner all" on public.insights
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- storage bucket for uploaded documents (private) ----------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Owners manage only their own folder (path convention: <owner_id>/<uuid>-<filename>).
drop policy if exists "documents bucket owner read" on storage.objects;
create policy "documents bucket owner read" on storage.objects
  for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner write" on storage.objects;
create policy "documents bucket owner write" on storage.objects
  for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner delete" on storage.objects;
create policy "documents bucket owner delete" on storage.objects
  for delete using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ======== supabase/migrations/app_0022_execution.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- EXECUTION SPINE v0 — the single place consequences happen (see docs/garvis-system-architecture.md §4/§6).
--
-- Constraint from the vision prompt: "Approval is required before sending emails, posting, deploying,
-- or charging. External actions must be logged." Today approvals are scattered per-feature (knowledge
-- proposals, publish_requests) and there is no cross-module log. This adds the two missing tables:
--   * approvals      — ONE queue. Anything outward-facing (send_email | publish_post | deploy_site |
--                      deploy_backend | spend | apply_migration | crm_action) becomes a row here with a
--                      human-readable preview and a payload. Nothing executes until status='approved'.
--   * execution_runs — ONE ledger. Every connector call (Resend, Netlify, Supabase Mgmt, Stripe, …) is
--                      written here with request/response/status, whether or not it went through an
--                      approval. This is the audit trail external actions are required to leave.
--
-- Reuses the app_0003/app_0019 security model. Additive + idempotent. Apply AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type approval_kind as enum (
    'send_email', 'publish_post', 'deploy_site', 'deploy_backend',
    'spend', 'apply_migration', 'crm_action'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type execution_status as enum ('ok', 'failed', 'retrying', 'skipped');
exception when duplicate_object then null; end $$;

-- ---------- approvals (the one queue) ----------
create table if not exists public.approvals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  kind         approval_kind not null,
  title        text not null,               -- one-line "Garvis prepared this" summary
  preview      text not null default '',     -- the human-readable body the user is approving (email text, etc.)
  payload      jsonb not null default '{}',  -- everything the executor needs to act on approval
  requested_by text not null default 'user',-- user | mission | run | worker
  mission_id   uuid references public.garvis_missions(id) on delete set null,
  run_id       uuid references public.agent_runs(id) on delete set null,
  status       approval_status not null default 'pending',
  decided_at   timestamptz,
  decided_via  text,                         -- ui | auto | api
  result       jsonb,                        -- filled after execution (e.g. {resend_id})
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_approvals_owner_status on public.approvals(owner_id, status, created_at desc);
create index if not exists idx_approvals_kind on public.approvals(owner_id, kind);

drop trigger if exists trg_approvals_touch on public.approvals;
create trigger trg_approvals_touch before update on public.approvals
  for each row execute function public.touch_updated_at();

-- ---------- execution_runs (the one ledger) ----------
create table if not exists public.execution_runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  approval_id  uuid references public.approvals(id) on delete set null, -- null = no approval needed (e.g. read)
  connector    text not null,               -- resend | netlify | supabase_mgmt | stripe | github | ...
  action       text not null,               -- send_email | deploy | set_secret | ...
  request      jsonb not null default '{}',  -- sanitized request (never secrets)
  response     jsonb,                        -- sanitized response / error detail
  status       execution_status not null default 'ok',
  attempt      integer not null default 1,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_exec_owner_time on public.execution_runs(owner_id, created_at desc);
create index if not exists idx_exec_approval on public.execution_runs(approval_id);
create index if not exists idx_exec_connector on public.execution_runs(owner_id, connector, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.approvals      enable row level security;
alter table public.execution_runs enable row level security;

-- Approvals: the owner sees and decides their own; they may INSERT (a mission running in the client
-- enqueues one) and UPDATE (approve/reject). Service-role executors also write via the service key.
drop policy if exists "approvals owner all" on public.approvals;
create policy "approvals owner all" on public.approvals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "approvals admin read" on public.approvals;
create policy "approvals admin read" on public.approvals
  for select using (public.is_admin());

-- Execution ledger is READ-ONLY to owners (the record must not be editable after the fact — same
-- spirit as mind_events). Writes come from edge functions via the service role, which bypasses RLS.
drop policy if exists "execution_runs owner read" on public.execution_runs;
create policy "execution_runs owner read" on public.execution_runs
  for select using (owner_id = auth.uid());
drop policy if exists "execution_runs admin read" on public.execution_runs;
create policy "execution_runs admin read" on public.execution_runs
  for select using (public.is_admin());

-- ======== supabase/migrations/app_0023_outreach.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- OUTREACH / CRM v0 — the send + track half of the "scrape a business → send them a better website"
-- loop (see docs/garvis-system-architecture.md §6 Workflow B). The GENERATE half already exists here
-- (business_profiles → preview_sites → pitch, via ingest-profile). This adds the schema ported from
-- swift-prep-pros — the repo that had the full sending stack (sequences, suppression, warmup, kill
-- switch) but no website generator. Joining the two is the money loop.
--
-- Tables:
--   * outreach_settings  — per-owner sender identity + the SAFETY GATES (kill switch, daily cap,
--                          warmup ramp, CAN-SPAM physical address, unsubscribe template). One row/owner.
--   * contacts           — people at a business (email + evidence: status/confidence/source_url).
--   * outreach_campaigns — a sequence per (business, contact): pending_approval → sent → replied/…
--   * outreach_messages  — individual emails (step 0 initial / 1 bump / 2 breakup), linked to a
--                          preview_site so the pitch carries the generated website; status +
--                          approval_id tie it to the app_0022 approval queue.
--   * replies            — inbound, AI-classified positive/negative/neutral.
--   * suppression        — do-not-contact (bounce | complaint | unsub | manual); checked at send time.
--
-- Owner-scoped RLS throughout (so this is multi-tenant-safe from day one, unlike the single-tenant
-- original). Sending happens ONLY through the send-email edge function (service role + approval).
-- Additive + idempotent. Apply AFTER app_0021/app_0022 and the preview_engine migrations.

-- ---------- enums ----------
do $$ begin
  create type contact_email_status as enum ('unknown', 'valid', 'bounced', 'unsubscribed', 'invalid', 'complained');
exception when duplicate_object then null; end $$;
do $$ begin
  create type campaign_state as enum ('pending_approval', 'sent', 'replied', 'unsubscribed', 'bounced', 'stopped', 'won', 'lost');
exception when duplicate_object then null; end $$;
do $$ begin
  create type outreach_message_status as enum ('draft', 'approved', 'scheduled', 'sent', 'bounced', 'replied', 'failed', 'blocked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reply_classification as enum ('positive', 'negative', 'neutral', 'auto', 'unclassified');
exception when duplicate_object then null; end $$;
do $$ begin
  create type suppression_reason as enum ('bounce', 'complaint', 'unsubscribe', 'manual');
exception when duplicate_object then null; end $$;

-- ---------- outreach_settings (one row per owner; the safety gates) ----------
create table if not exists public.outreach_settings (
  owner_id                 uuid primary key references public.profiles(id) on delete cascade,
  from_name                text,
  from_email               text,
  reply_to                 text,
  company_name             text,
  physical_address         text,                         -- CAN-SPAM: required to send
  unsubscribe_url_template text,                          -- List-Unsubscribe target; falls back to mailto
  daily_send_cap           integer not null default 25,   -- 0 blocks all sends
  warmup_start_date        date,                          -- optional ramp anchor
  warmup_daily_step        integer not null default 5,    -- cap grows by this/day from warmup_start_date
  outbound_enabled         boolean not null default false,-- THE KILL SWITCH (off by default — opt in)
  timezone                 text not null default 'America/Chicago',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists trg_outreach_settings_touch on public.outreach_settings;
create trigger trg_outreach_settings_touch before update on public.outreach_settings
  for each row execute function public.touch_updated_at();

-- ---------- contacts ----------
create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  full_name           text,
  title               text,
  email               text,
  email_status        contact_email_status not null default 'unknown',
  confidence          integer not null default 0,       -- 0-100 evidence strength
  source_url          text,                              -- where the email was found (evidence)
  is_primary          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_contacts_owner on public.contacts(owner_id, created_at desc);
create index if not exists idx_contacts_biz on public.contacts(business_profile_id);
create index if not exists idx_contacts_email on public.contacts(lower(email));

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ---------- outreach_campaigns ----------
create table if not exists public.outreach_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid references public.business_profiles(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  preview_site_id     uuid references public.preview_sites(id) on delete set null,
  kind                text not null default 'cold_site_pitch', -- cold_site_pitch | newsletter | re_nurture
  state               campaign_state not null default 'pending_approval',
  follow_up_count     integer not null default 0,
  sequence_stopped    boolean not null default false,
  next_followup_at    timestamptz,
  last_send_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_ocampaigns_owner_state on public.outreach_campaigns(owner_id, state, created_at desc);
create index if not exists idx_ocampaigns_followup on public.outreach_campaigns(next_followup_at)
  where state = 'sent' and sequence_stopped = false;

drop trigger if exists trg_ocampaigns_touch on public.outreach_campaigns;
create trigger trg_ocampaigns_touch before update on public.outreach_campaigns
  for each row execute function public.touch_updated_at();

-- ---------- outreach_messages ----------
create table if not exists public.outreach_messages (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  campaign_id         uuid references public.outreach_campaigns(id) on delete cascade,
  contact_id          uuid references public.contacts(id) on delete set null,
  preview_site_id     uuid references public.preview_sites(id) on delete set null,
  approval_id         uuid references public.approvals(id) on delete set null,
  sequence_step       integer not null default 0,        -- 0 initial | 1 bump | 2 breakup
  subject             text not null default '',
  body_text           text not null default '',
  to_address          text,
  from_address        text,
  status              outreach_message_status not null default 'draft',
  provider_message_id text,                               -- Resend id, for webhook correlation
  model_version       text,
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_omessages_owner on public.outreach_messages(owner_id, created_at desc);
create index if not exists idx_omessages_campaign on public.outreach_messages(campaign_id);
create index if not exists idx_omessages_provider on public.outreach_messages(provider_message_id);

drop trigger if exists trg_omessages_touch on public.outreach_messages;
create trigger trg_omessages_touch before update on public.outreach_messages
  for each row execute function public.touch_updated_at();

-- ---------- replies ----------
create table if not exists public.replies (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  message_id     uuid references public.outreach_messages(id) on delete set null,
  campaign_id    uuid references public.outreach_campaigns(id) on delete set null,
  from_address   text,
  subject        text,
  body_text      text,
  classification reply_classification not null default 'unclassified',
  received_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_replies_owner on public.replies(owner_id, received_at desc);
create index if not exists idx_replies_campaign on public.replies(campaign_id);

-- ---------- suppression (owner-scoped do-not-contact) ----------
create table if not exists public.suppression (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  email      text,
  domain     text,
  reason     suppression_reason not null default 'manual',
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);
create index if not exists idx_suppression_owner_email on public.suppression(owner_id, lower(email));
create index if not exists idx_suppression_owner_domain on public.suppression(owner_id, lower(domain));

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped throughout)
-- ============================================================
alter table public.outreach_settings  enable row level security;
alter table public.contacts           enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_messages  enable row level security;
alter table public.replies            enable row level security;
alter table public.suppression        enable row level security;

drop policy if exists "outreach_settings owner all" on public.outreach_settings;
create policy "outreach_settings owner all" on public.outreach_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "contacts owner all" on public.contacts;
create policy "contacts owner all" on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ocampaigns owner all" on public.outreach_campaigns;
create policy "ocampaigns owner all" on public.outreach_campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "omessages owner all" on public.outreach_messages;
create policy "omessages owner all" on public.outreach_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "replies owner all" on public.replies;
create policy "replies owner all" on public.replies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "suppression owner all" on public.suppression;
create policy "suppression owner all" on public.suppression
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0024_work_web.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- WORK WEB v0 — missions stop being checklists and become living work webs.
--
-- The idea (docs/garvis-system-architecture.md §10b): the unit of Garvis work is a TERRITORY (a
-- knowledge world). The territory decomposes into PRODUCTION AREAS (clusters). Each production area
-- is three things at once: a thought (it lives in the knowledge graph), a workspace (it has tools),
-- and a ledger (its outputs and results accumulate on it). What turns a thought into a production
-- area is a CHARTER — pure data, not code:
--
--   knowledge_clusters.charter = {
--     "archetype": "intel|audience|studio|launch|loop|ledger|vault",
--     "flavor":    "generic|direct_mail|email|social|video|landing|market|brand|crm|lists",
--     "status":    "dormant|active|waiting|done",
--     "refs":      [{"type":"campaign|document|preview_site|app", "id":"...", "label":"..."}]
--   }
--
-- The tool registry that maps (archetype, flavor) → tools is client code (src/lib/garvis/workweb.ts,
-- single source of truth, verified) — the DB only stores the charter. NULL charter = a plain thought.
-- This is deliberately ONE jsonb column on the existing clusters table, not a parallel table: the
-- whole point is that an idea cluster CAN become an execution cluster without moving anywhere.
--
-- Bindings added:
--   * garvis_missions.world_id    — a mission is a campaign THROUGH a territory; the territory
--                                   persists across missions (campaign #2 starts warmer than #1).
--                                   NOT app_id repurposed — app_id keeps meaning "portfolio app".
--   * outreach_campaigns.world_id — outreach born in a web rolls up to that web's ledger clusters.
--
-- Additive + idempotent. Apply AFTER app_0013/app_0018 (universe) and app_0022/app_0023.

-- ---------- the charter ----------
alter table public.knowledge_clusters add column if not exists charter jsonb;
comment on column public.knowledge_clusters.charter is
  'Work Web charter: {archetype, flavor, status, refs[]}. NULL = plain thought (not a production area). Registry: src/lib/garvis/workweb.ts';

-- Fast "which worlds are work webs" lookups (a web = a world with >=1 chartered cluster).
create index if not exists idx_ku_clusters_chartered on public.knowledge_clusters(world_id)
  where charter is not null;

-- ---------- mission ↔ territory ----------
alter table public.garvis_missions add column if not exists world_id uuid
  references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_missions_world on public.garvis_missions(world_id);

-- ---------- outreach ↔ territory (per-web results rollups) ----------
alter table public.outreach_campaigns add column if not exists world_id uuid
  references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_ocampaigns_world on public.outreach_campaigns(world_id);

-- ======== supabase/migrations/app_0025_contacts_dedupe.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- CONTACTS DEDUPE — one contact per (owner, email). Closes the duplicate-contact → duplicate-send
-- path the Work Web review surfaced: without this constraint, re-uploading a mailing list or
-- queueing the same recipient twice created duplicate contact rows, and every code path that
-- "select-then-insert"s a contact had a non-atomic race. With this index in place, all contact
-- writes become upserts on (owner_id, email) — atomic and idempotent.
--
-- Full (not partial) unique index so PostgREST's onConflict:'owner_id,email' can use it. email is
-- nullable and Postgres keeps NULLs distinct, so contacts with no email never conflict. Safe on a
-- fresh table (contacts is created empty in app_0023); creating the index before any rows exist
-- means no duplicate-collision risk. Idempotent.
--
-- Apply AFTER app_0023 (contacts). Must run before/with the Work Web contact upserts.

create unique index if not exists uq_contacts_owner_email
  on public.contacts(owner_id, email);

-- ======== supabase/migrations/app_0026_cluster_studio.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- CLUSTER STUDIO SHELL v0 — the layer that turns a chartered cluster into a real studio
-- (docs/garvis-studios-blueprint.md §11/§15). A studio is not code — it is a cluster with context,
-- tools, artifacts, VERSIONS, FILES, BRAND KIT, CHAT, approvals, and execution history. This adds
-- the four missing storage pieces; the chat itself is the cluster-chat edge function + the pure
-- core in src/lib/garvis/clusterChat.ts.
--
--   * artifact_versions — snapshot-on-update history for knowledge_artifacts (same pattern as
--                         project_file_versions): every content change preserves the prior version,
--                         so "make it more luxury" yields v2 while v1 stays restorable.
--   * cluster_files     — files/assets attached to a cluster (photos for a postcard, a CSV, a logo).
--                         Binary lives in the project-assets bucket; this is the reference row.
--   * brand_kits        — one per world (nullable world = the owner's default kit): logo, palette,
--                         fonts, tone, headshots, compliance line. Injected into every generator.
--   * studio_messages   — the cluster chat transcript (+ the decision each turn produced), so a
--                         studio remembers its conversation across visits.
--
-- Reuses the app_0003 security model (owner_id + auth.uid() RLS, is_admin(), touch_updated_at()).
-- Additive + idempotent. Apply AFTER app_0013/app_0018 (universe) and app_0024 (work web).

-- ---------- artifact revisions ----------
alter table public.knowledge_artifacts add column if not exists revision int not null default 1;

create table if not exists public.artifact_versions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  artifact_id uuid not null references public.knowledge_artifacts(id) on delete cascade,
  version     int not null,
  kind        ku_artifact_kind not null default 'doc',
  title       text not null,
  detail      text,
  source      text,
  created_at  timestamptz not null default now(),
  unique (artifact_id, version)
);
create index if not exists idx_artifact_versions_artifact on public.artifact_versions(artifact_id, version desc);

-- Snapshot BEFORE UPDATE when content actually changes (a no-op upsert from a play re-run must not
-- spam identical versions). Bumps revision on the live row; the live row is always "current".
create or replace function public.snapshot_artifact_version() returns trigger
language plpgsql as $$
begin
  if (old.detail is distinct from new.detail) or (old.title is distinct from new.title) then
    insert into public.artifact_versions (owner_id, artifact_id, version, kind, title, detail, source)
    values (old.owner_id, old.id, coalesce(old.revision, 1), old.kind, old.title, old.detail, old.source);
    new.revision := coalesce(old.revision, 1) + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_ka_snapshot on public.knowledge_artifacts;
create trigger trg_ka_snapshot before update on public.knowledge_artifacts
  for each row execute function public.snapshot_artifact_version();

-- ---------- cluster files ----------
create table if not exists public.cluster_files (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  cluster_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  name        text not null,
  url         text not null,               -- public URL in the project-assets bucket
  kind        text not null default 'other' check (kind in ('image', 'doc', 'csv', 'other')),
  bytes       integer,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cluster_files_cluster on public.cluster_files(cluster_id, created_at desc);

-- ---------- brand kits ----------
create table if not exists public.brand_kits (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  world_id        uuid references public.knowledge_worlds(id) on delete cascade, -- null = owner default
  name            text not null default 'Brand kit',
  logo_url        text,
  palette         jsonb not null default '[]',   -- ["#0C0E13", "#FF8A3D", ...]
  fonts           jsonb not null default '[]',   -- ["Space Grotesk", "Inter"]
  tone            text,                          -- "calm, private, no hype"
  headshots       jsonb not null default '[]',   -- [url, ...]
  compliance_line text,                          -- brokerage/legal footer line
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One kit per world per owner (and one default kit with null world).
create unique index if not exists uq_brand_kits_owner_world on public.brand_kits(owner_id, world_id) where world_id is not null;
create unique index if not exists uq_brand_kits_owner_default on public.brand_kits(owner_id) where world_id is null;

drop trigger if exists trg_brand_kits_touch on public.brand_kits;
create trigger trg_brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

-- ---------- studio chat transcript ----------
create table if not exists public.studio_messages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.knowledge_clusters(id) on delete cascade,
  role       text not null check (role in ('user', 'garvis')),
  content    text not null,
  decision   jsonb,                        -- the StudioDecision this turn produced (garvis rows)
  cost_usd   numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_studio_messages_cluster on public.studio_messages(cluster_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped; mirrors app_0003)
-- ============================================================
alter table public.artifact_versions enable row level security;
alter table public.cluster_files     enable row level security;
alter table public.brand_kits        enable row level security;
alter table public.studio_messages   enable row level security;

drop policy if exists "artifact_versions owner all" on public.artifact_versions;
create policy "artifact_versions owner all" on public.artifact_versions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "cluster_files owner all" on public.cluster_files;
create policy "cluster_files owner all" on public.cluster_files
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "brand_kits owner all" on public.brand_kits;
create policy "brand_kits owner all" on public.brand_kits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "studio_messages owner all" on public.studio_messages;
create policy "studio_messages owner all" on public.studio_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0027_world_intelligence.sql ========
-- FableForge PLATFORM migration (not a generated-app migration).
-- WORLD INTELLIGENCE v0 — the synthesized understanding of each world (Sprint M, round 6).
--
-- Memory stores events; UNDERSTANDING stores implications. Every world gets one living row that
-- answers the heartbeat questions continuously: what are we trying to accomplish, how are we doing,
-- what's blocking us, what changed, what matters most now, what's next. Not regenerated each time —
-- persisted, updated, living. This is the fuel for the waking moment (Rule 6) and the "brain" the
-- P2 star renders.
--
-- Honesty invariants (the same ones, enforced by the pure core in src/lib/garvis/worldIntel.ts):
--   * `state` (Living State) is compiled DETERMINISTICALLY from rows — blockers, risks, momentum
--     signals are counted or structural, never opinions. Momentum is a derived LABEL from counts
--     ("surging — 3 replies, 12 artifacts this week"), never a stored score.
--   * `implications` / `recommendation` / `reflection` are LLM-synthesized, but every item must
--     carry an evidence string or the parser DROPS it. Understanding without evidence doesn't persist.
--
-- Additive + idempotent. Apply AFTER app_0013 (worlds) and app_0024 (work web).

create table if not exists public.world_intelligence (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  world_id          uuid not null references public.knowledge_worlds(id) on delete cascade,
  objective         text,                          -- what are we trying to accomplish
  state             jsonb not null default '{}',   -- Living State (deterministic): strategy, blockers[], risks[], momentum{label,signals}
  implications      jsonb not null default '[]',   -- [{observation, implication, evidence, at}] — understanding, evidence-required
  recommendation    text,                          -- current recommended direction (evidence-backed synthesis)
  open_questions    jsonb not null default '[]',   -- ["Should we target lakefront owners or move-up sellers?"]
  reflection        jsonb,                         -- latest reflection {period, tried[], learned[], at} — organizational learning
  signals           jsonb not null default '{}',   -- the counted momentum snapshot the label was derived from
  last_reflected_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (world_id)
);
create index if not exists idx_world_intel_owner on public.world_intelligence(owner_id, updated_at desc);

drop trigger if exists trg_world_intel_touch on public.world_intelligence;
create trigger trg_world_intel_touch before update on public.world_intelligence
  for each row execute function public.touch_updated_at();

alter table public.world_intelligence enable row level security;

drop policy if exists "world_intelligence owner all" on public.world_intelligence;
create policy "world_intelligence owner all" on public.world_intelligence
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "world_intelligence admin read" on public.world_intelligence;
create policy "world_intelligence admin read" on public.world_intelligence
  for select using (public.is_admin());

-- ======== supabase/migrations/app_0028_genesis.sql ========
-- app_0028_genesis.sql — PROJECT GENESIS: worlds born from intent, not hand-coded templates.
--
-- The pipeline is Intent → World DNA → generated Work Web (docs/garvis-genesis-blueprint.md).
-- Genesis generates DATA that existing validators accept — the same 7 archetypes, the same tool
-- registry, the same approval spine. This migration adds only the storage that pipeline needs:
--
--   * web_templates    — generated (and future builtin-mirrored) templates as rows: the World DNA
--                        (business synthesis: type, revenue model, customers, value prop, sales
--                        cycle, brand, assets, channels, loop, metrics, constraints), the template
--                        nodes, the data-driven play, the RATIONALE (why each cluster exists and
--                        what was deliberately omitted — trust requires the why), open questions,
--                        intake requests, and first moves. status: draft → instantiated. Nothing
--                        becomes a world without explicit approval.
--   * knowledge_worlds — gains dna + business_context so every generated world carries its own
--                        voice; generators read THE WORLD's context, never another world's.
--
-- Additive + idempotent. Apply after app_0024 (work web) and app_0027 (world intelligence).

create table if not exists public.web_templates (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  description      text not null default '',
  objective        text,
  dna              jsonb,                          -- WorldDNA (genesis.ts)
  business_context jsonb,                          -- merge tokens for generators
  template         jsonb not null,                 -- WebTemplate nodes (validated before save)
  play             jsonb,                          -- PlayData: data-driven steps + email sequence
  rationale        jsonb not null default '{}',    -- {clusters: {slug: why}, omissions: [{what, why}]}
  questions        jsonb not null default '[]',    -- what genesis could not know and refused to invent
  intake_requests  jsonb not null default '[]',    -- assets the user should upload
  first_moves      jsonb not null default '[]',
  source           text not null default 'generated' check (source in ('generated', 'builtin', 'edited')),
  status           text not null default 'draft'   check (status in ('draft', 'instantiated', 'archived')),
  world_id         uuid references public.knowledge_worlds(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.web_templates enable row level security;

drop policy if exists "web_templates owner all" on public.web_templates;
create policy "web_templates owner all" on public.web_templates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "web_templates admin read" on public.web_templates;
create policy "web_templates admin read" on public.web_templates
  for select using (public.is_admin());

create index if not exists idx_web_templates_owner_status on public.web_templates(owner_id, status);
create index if not exists idx_web_templates_world on public.web_templates(world_id);

drop trigger if exists trg_web_templates_touch on public.web_templates;
create trigger trg_web_templates_touch before update on public.web_templates
  for each row execute function public.touch_updated_at();

-- The world carries its own DNA and voice after instantiation.
alter table public.knowledge_worlds add column if not exists dna jsonb;
alter table public.knowledge_worlds add column if not exists business_context jsonb;

-- ======== supabase/migrations/app_0029_photo_intake.sql ========
-- app_0029_photo_intake.sql — G2: photos enter the living brain as understanding, not blobs.
--
-- * documents.cluster_id  — filing gains cluster precision: a photo lands in "Artwork Library",
--                           not just somewhere in the world. Filing into a cluster also writes a
--                           cluster_files bridge row (client-side, brain.ts) so the studio sees it.
-- * cluster_files.caption — the vision caption travels with the file into every studio context.
-- * cluster_files.label   — the routing tag ('website' / 'social' / 'video' / 'print' / free text)
--                           that generators and the future build-bridge filter on.
--
-- Additive + idempotent. Apply after app_0026 (cluster studio) and app_0028 (genesis).

alter table public.documents add column if not exists cluster_id uuid references public.knowledge_clusters(id) on delete set null;
create index if not exists idx_documents_cluster on public.documents(cluster_id);

alter table public.cluster_files add column if not exists caption text;
alter table public.cluster_files add column if not exists label text;

-- ======== supabase/migrations/app_0030_website_bridge.sql ========
-- app_0030_website_bridge.sql — G3: a world builds its own website.
--
-- * projects.world_id            — provenance: this app was built FROM a Garvis world; the
--                                  workspace can show it and world views can track it.
-- * project_assets.source 'world' — photos metadata-copied from a world's cluster_files (same
--                                  public bucket, zero data movement) into a project's manifest.
--
-- Additive + idempotent. Apply after app_0020 and app_0029.

alter table public.projects add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_projects_world on public.projects(world_id);

alter table public.project_assets drop constraint if exists project_assets_source_check;
alter table public.project_assets add constraint project_assets_source_check
  check (source in ('upload', 'harvest', 'world'));

-- ======== supabase/migrations/app_0031_ledger_policy.sql ========
-- app_0031_ledger_policy.sql — the honest ledger must actually land.
-- The audit found the client-side "decision recorded" execution_runs insert (execution.ts,
-- non-email approval kinds) is rejected by RLS: owners had no INSERT policy on execution_runs
-- (service-role edge functions write the rest). Grant a NARROW owner insert: only their own
-- rows, only the 'garvis' connector, only 'skipped' status — decision records, never fake
-- successes. Everything else still writes through service-role executors.

drop policy if exists "execution_runs owner decision insert" on public.execution_runs;
create policy "execution_runs owner decision insert" on public.execution_runs
  for insert with check (owner_id = auth.uid() and connector = 'garvis' and status = 'skipped');

-- ======== supabase/migrations/app_0032_prospects.sql ========
-- app_0032_prospects.sql — G4 Market Intelligence: prospects a world FOUND, with evidence-labeled
-- fit. Read-only research output — contacting anyone still goes through contacts + the approval
-- spine. Fit is a LABEL with a grounded reason (strong/possible/weak), never an invented score.

create table if not exists public.prospects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  category    text not null,                 -- which ideal-customer segment the scan targeted
  name        text not null,
  url         text,
  snippet     text,                          -- what the search actually said (the evidence)
  fit         text not null default 'unknown' check (fit in ('strong', 'possible', 'weak', 'unknown')),
  fit_reason  text,                          -- grounded in the snippet/DNA, never invented
  status      text not null default 'new'    check (status in ('new', 'qualified', 'dropped', 'contacted')),
  created_at  timestamptz not null default now()
);

alter table public.prospects enable row level security;
drop policy if exists "prospects owner all" on public.prospects;
create policy "prospects owner all" on public.prospects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create unique index if not exists uq_prospects_world_url on public.prospects(world_id, url) where url is not null;
create index if not exists idx_prospects_world on public.prospects(world_id, status);

-- ======== supabase/migrations/app_0033_prospect_audience.sql ========
-- app_0033_prospect_audience.sql — close the prospect → audience dead-end the bones audit found:
-- a QUALIFIED prospect had no path into contacts ('contacted' existed in the schema but nothing
-- ever wrote it). A prospect can now be moved into the audience (contact created, linked here),
-- and 'contacted' is reserved for when outreach is actually queued/sent — statuses stay honest.
-- Additive + idempotent.

alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('new', 'qualified', 'dropped', 'contacted', 'in_audience'));

alter table public.prospects add column if not exists contact_id uuid references public.contacts(id) on delete set null;

-- ======== supabase/migrations/app_0034_prospect_contact_scan.sql ========
-- app_0034_prospect_contact_scan.sql — prospects can carry the contact emails their OWN site
-- publicly lists (found by fetch-url mode 'contact'; Garvis never guesses an address). scanned_at
-- records that a scan happened even when it found nothing — "we looked, nothing public" is honest
-- state, distinct from "never looked". Additive + idempotent.

alter table public.prospects add column if not exists contact_emails jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists scanned_at timestamptz;

-- ======== supabase/migrations/app_0035_mail_log.sql ========
-- app_0035_mail_log.sql — direct mail becomes a real, tracked action. A postcard design is a
-- studio artifact (knowledge_artifacts, source 'garvis-chat'); SENDING it is a logged batch with
-- honest state. Garvis does not mail anything itself — the operator prints/uploads to a vendor and
-- records what actually went out. That record is what the ledger and reflection count as real
-- outreach (mail, not email). Owner RLS. Additive + idempotent.

create table if not exists public.mail_batches (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid not null references public.knowledge_worlds(id) on delete cascade,
  cluster_id   uuid references public.knowledge_clusters(id) on delete set null,
  artifact_slug text,                          -- the postcard design this batch printed
  title        text not null,
  piece_count  int not null default 0 check (piece_count >= 0),
  channel      text not null default 'postcard',
  status       text not null default 'planned' check (status in ('planned', 'printed', 'mailed', 'canceled')),
  vendor       text,                            -- where it was printed/mailed (operator's note)
  cost_usd     numeric,                         -- operator's real cost, if they log it
  notes        text,
  mailed_at    timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.mail_batches enable row level security;
drop policy if exists "mail_batches owner all" on public.mail_batches;
create policy "mail_batches owner all" on public.mail_batches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_mail_batches_world on public.mail_batches(world_id, created_at desc);

-- ======== supabase/migrations/app_0036_site_events.sql ========
-- app_0036_site_events.sql — G5 INSTRUMENTATION: the sensory organ. Generated websites finally
-- report back to the world that built them: lead-form submissions, visits (with ?src attribution
-- so a postcard QR is traceable to the site visit it caused), clicks. Three tables:
--
--   site_channels — one write-token per world's site. The channel id IS the bearer token embedded
--                   in the generated site's form code, so it must be unguessable (uuid) and
--                   revocable (revoked_at). Write-only: knowing the token lets you POST events,
--                   never read anything.
--   site_events   — the raw honest record: something hit the site. INSERTed only by the
--                   site-events edge function (service role); owners read their own.
--   leads         — a form submission that carried a real email. The inbound half of the audience:
--                   a lead consented to be answered, so the edge fn links (or creates) a contact —
--                   NEVER modifying an existing contact's email_status (suppression is sacred).
--
-- Additive + idempotent. Owner RLS mirrors the house model (owner_id = auth.uid()).

create table if not exists public.site_channels (
  id          uuid primary key default gen_random_uuid(),   -- this IS the ingest token
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,  -- stamped at bind time
  label       text not null default 'website',
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
alter table public.site_channels enable row level security;
drop policy if exists "site_channels owner all" on public.site_channels;
create policy "site_channels owner all" on public.site_channels
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_site_channels_world on public.site_channels(world_id);

create table if not exists public.site_events (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.site_channels(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  kind        text not null check (kind in ('visit', 'lead', 'click', 'qr')),
  path        text,                            -- page path, capped by the edge fn
  source      text,                            -- ?src= attribution (postcard, social, email, …)
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.site_events enable row level security;
drop policy if exists "site_events owner read" on public.site_events;
create policy "site_events owner read" on public.site_events
  for select using (owner_id = auth.uid());
-- No owner INSERT policy: rows arrive only via the service-role edge function.
create index if not exists idx_site_events_world on public.site_events(world_id, created_at desc);
create index if not exists idx_site_events_kind on public.site_events(world_id, kind, created_at desc);

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  channel_id  uuid references public.site_channels(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  name        text,
  email       text not null,
  phone       text,
  message     text,
  source      text not null default 'website', -- website | postcard-qr | social | …
  status      text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at  timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists "leads owner all" on public.leads;
create policy "leads owner all" on public.leads
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_leads_world on public.leads(world_id, status, created_at desc);

-- ======== supabase/migrations/app_0037_ad_spends.sql ========
-- app_0037_ad_spends.sql — real spend, logged. Until platform APIs are connected (Meta/Google
-- OAuth apps the owner must register — see docs/garvis-advertising-plan.md), spend is the
-- operator's honest log per channel/period. Cost-per-lead then exists ONLY as logged-spend ÷
-- measured-leads — two real numbers, never a modeled one. Owner RLS. Additive + idempotent.

create table if not exists public.ad_spends (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid not null references public.knowledge_worlds(id) on delete cascade,
  channel      text not null,                  -- 'meta ads' | 'google ads' | 'direct mail' | …
  label        text,                           -- campaign name / operator's note
  amount_usd   numeric not null check (amount_usd >= 0),
  period_start date,
  period_end   date,
  created_at   timestamptz not null default now()
);
alter table public.ad_spends enable row level security;
drop policy if exists "ad_spends owner all" on public.ad_spends;
create policy "ad_spends owner all" on public.ad_spends
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_ad_spends_world on public.ad_spends(world_id, channel, created_at desc);

-- ======== supabase/migrations/app_0038_connections.sql ========
-- app_0038_connections.sql — the ad-platform CONNECTIONS layer. Secrets live server-side only
-- (edge function env: META_ADS_ACCESS_TOKEN, GOOGLE_ADS_*); this table holds the NON-secret
-- per-user config (which ad account / customer id) and honest connection state. ad_metrics holds
-- PLATFORM-REPORTED numbers (spend/impressions/clicks) — labeled as such everywhere and never
-- merged with Garvis's own measured leads; spend is real money either way, so adaptive prefers
-- API-synced spend over the manual log when both exist (no double counting). Additive+idempotent.

create table if not exists public.connections (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  provider       text not null check (provider in ('meta_ads', 'google_ads')),
  config         jsonb not null default '{}'::jsonb,   -- {ad_account_id} / {customer_id} — ids, never secrets
  status         text not null default 'unconfigured' check (status in ('unconfigured', 'ready', 'error')),
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (owner_id, provider)
);
alter table public.connections enable row level security;
drop policy if exists "connections owner all" on public.connections;
create policy "connections owner all" on public.connections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.ad_metrics (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  provider      text not null check (provider in ('meta_ads', 'google_ads')),
  date          date not null,
  campaign_name text not null,
  spend_usd     numeric not null default 0,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  created_at    timestamptz not null default now(),
  unique (owner_id, provider, date, campaign_name)
);
alter table public.ad_metrics enable row level security;
drop policy if exists "ad_metrics owner read" on public.ad_metrics;
create policy "ad_metrics owner read" on public.ad_metrics
  for select using (owner_id = auth.uid());
-- Writes arrive only via the ads-sync edge function (service role).
create index if not exists idx_ad_metrics_world on public.ad_metrics(world_id, provider, date desc);

-- ======== supabase/migrations/app_0039_daily_driver.sql ========
-- app_0039_daily_driver.sql — Tier 1 "daily driver" surface: user reminders (the one operator
-- affordance with no home), a CRM stage + notes on contacts. All owner-scoped RLS. Additive +
-- idempotent. The inbox and health board need no new tables — they read existing rows.

-- ---------- reminders (the human's own todos — distinct from agent garvis_tasks) ----------
create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  detail      text,
  world_id    uuid references public.knowledge_worlds(id) on delete set null,  -- optional context
  due_at      timestamptz,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.reminders enable row level security;
drop policy if exists "reminders owner all" on public.reminders;
create policy "reminders owner all" on public.reminders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_reminders_owner on public.reminders(owner_id, done, due_at);

-- ---------- contacts CRM: a pipeline stage + free-text notes ----------
alter table public.contacts add column if not exists stage text not null default 'new'
  check (stage in ('new', 'contacted', 'qualified', 'customer', 'lost'));

create table if not exists public.contact_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.contact_notes enable row level security;
drop policy if exists "contact_notes owner all" on public.contact_notes;
create policy "contact_notes owner all" on public.contact_notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_contact_notes_contact on public.contact_notes(contact_id, created_at desc);

-- ======== supabase/migrations/app_0040_deploy_bundles.sql ========
-- app_0040_deploy_bundles.sql — makes the approval spine a REAL deploy path. The site build runs
-- client-side (WebContainer), so the built files only exist in the browser at build time. To route
-- a deploy through Approvals (nothing ships without sign-off) AND still execute it server-side, we
-- CAPTURE the built bundle at authorization time into this table; approveAndExecute loads it and
-- calls deploy-site. One-shot: the bundle is deleted after a successful deploy. Owner RLS.
-- Additive + idempotent.

create table if not exists public.deploy_bundles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  site_id     text,                          -- Netlify site id for a re-deploy (null = new site)
  files       jsonb not null,                -- the built dist/: [{path, b64, sha1}] — real bytes
  file_count  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.deploy_bundles enable row level security;
drop policy if exists "deploy_bundles owner all" on public.deploy_bundles;
create policy "deploy_bundles owner all" on public.deploy_bundles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_deploy_bundles_project on public.deploy_bundles(project_id, created_at desc);

-- ======== supabase/migrations/app_0041_wave_a_security.sql ========
-- app_0041_wave_a_security.sql — Wave A: the trust floor. Fixes found by the full-system audit.
--
-- 1) preview_sites lockdown (CRITICAL): the old "public read" policy was `using (true)`, which let
--    ANYONE with the public anon key SELECT the whole table — every tenant's prospect pipeline
--    (business names, generated specs, pitches, owner ids). The point of a preview is a no-login
--    link to ONE site behind an unguessable slug. So: public table read is gone; owners read their
--    own rows; the public path is a SECURITY DEFINER function that returns exactly one row for a
--    supplied slug (or id), minus the owner id. Slugs carry a nonce (ingest-profile), so they are
--    unguessable — the function makes that the *only* anonymous door.
-- 2) projects.netlify_site_id: the authoritative Netlify site binding, written server-side by
--    deploy-site on first deploy. Closes the audit's H3 (client-supplied siteId could point the
--    shared operator token at another tenant's site).
--
-- Additive + idempotent.

-- ── 1) preview_sites: kill the table-wide public read ─────────────────────────────────────────
drop policy if exists "preview sites public read" on public.preview_sites;

drop policy if exists "preview sites select own" on public.preview_sites;
create policy "preview sites select own" on public.preview_sites
  for select using (user_id = auth.uid());

-- The one anonymous door: one row, by exact slug (or id), owner id stripped.
create or replace function public.get_preview_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select to_jsonb(p) - 'user_id'
  from public.preview_sites p
  where p.slug = p_slug or p.id::text = p_slug
  limit 1
$$;

revoke all on function public.get_preview_by_slug(text) from public;
grant execute on function public.get_preview_by_slug(text) to anon, authenticated;

-- ── 2) projects: authoritative hosting binding ────────────────────────────────────────────────
alter table public.projects add column if not exists netlify_site_id text;

-- ======== supabase/migrations/app_0042_world_goals.sql ========
-- app_0042_world_goals.sql — THE GOALS SPINE: Garvis adapts every function toward what each
-- project is FOR. A goal is the owner's own statement of what a world is trying to achieve —
-- optionally measurable against rows the system already records honestly (leads, site visits),
-- optionally deadlined. The Next Move engine boosts moves that advance an active goal, producers
-- write toward it, and Ask states it — all grounded in this table, never invented.
--
-- HONESTY: progress is only ever computed from real owner-scoped rows (or the owner's own manual
-- number, labeled as such). A goal with no measurable metric shows "not measurable yet" — no
-- percentage theater. Additive + idempotent.

create table if not exists public.world_goals (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid not null references public.knowledge_worlds(id) on delete cascade,
  title          text not null,                  -- the owner's words: "10 seller leads a month"
  why            text not null default '',       -- what this unlocks (their words, optional)
  metric_kind    text not null default 'none' check (metric_kind in ('leads', 'visits', 'manual', 'none')),
  target_value   numeric,                        -- e.g. 10 (leads) — null = directional goal
  current_manual numeric,                        -- owner-updated progress for metric 'manual'
  target_date    date,                           -- optional deadline; sharpens Next Move urgency
  status         text not null default 'active' check (status in ('active', 'achieved', 'paused', 'dropped')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.world_goals enable row level security;
drop policy if exists "world_goals owner all" on public.world_goals;
create policy "world_goals owner all" on public.world_goals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_world_goals_world on public.world_goals(world_id, status, created_at desc);
create index if not exists idx_world_goals_owner on public.world_goals(owner_id, status);

-- ======== supabase/migrations/app_0043_heartbeat.sql ========
-- app_0043_heartbeat.sql — THE HEARTBEAT: Garvis works while you sleep.
--
-- The audit's finding: proactive execution was documented but inert — the worker tick was a
-- commented-out SQL block requiring hand-editing. This replaces that with ONE-CALL ARMING:
--
--   select public.garvis_arm_heartbeat(
--     'https://<project-ref>.supabase.co/functions/v1',   -- your functions base URL
--     '<shared secret>'                                    -- SAME value as the WORKER_SECRET and
--   );                                                     --   CRON_SECRET edge secrets
--
-- That call stores the URL + secret in Vault and schedules three pg_cron jobs (upsert by name —
-- re-running re-arms safely):
--   garvis-pulse-hourly    every hour     → garvis-pulse (morning brief in the OWNER's timezone,
--                                           once a day, only when something real happened)
--   garvis-followups-daily 13:00 UTC      → outreach-followups (drafts follow-up bumps as PENDING
--                                           approvals — never sends; you approve in the queue)
--   garvis-worker-tick     every 5 min    → garvis-worker (advances queued agent runs)
--
-- HONESTY: the heartbeat only ever (a) tells the owner what's real and (b) stages drafts into the
-- approval queue. Nothing outward happens unattended — sends/deploys/spends still require approval.
-- Additive + idempotent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- When each owner last received a morning brief (garvis-pulse stamps it).
alter table public.profiles add column if not exists last_pulse_at timestamptz;

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;

  -- Vault: the heartbeat's target + credential (upsert by name).
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  -- cron.schedule upserts by job name — re-arming replaces, never duplicates.
  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$);

  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);

  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);

  return 'armed: garvis-pulse-hourly, garvis-followups-daily, garvis-worker-tick';
end;
$$;

-- Only the operator (SQL editor / service role) may arm the heartbeat — never the browser.
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

-- Disarm everything (same restriction).
create or replace function public.garvis_disarm_heartbeat()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly');
  perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0044_speed_to_lead.sql ========
-- app_0044_speed_to_lead.sql — SPEED-TO-LEAD: the instant first touch.
--
-- The evidence (MIT lead-response study; Velocify's 3.5M-lead analysis): answering a lead within
-- minutes makes contact ~100x more likely and lifts conversion ~4x — and almost nobody does it,
-- because humans sleep. This is Garvis's first STANDING RULE (tiered autonomy): the owner
-- pre-authorizes ONE narrow action class — a template acknowledgment to a brand-new inbound
-- lead — and everything else stays per-send approval.
--
-- HONESTY + SAFETY BY CONSTRUCTION:
--   - Off by default. Turning it on requires outbound_enabled + from_email + physical_address
--     (the same CAN-SPAM floor as every send).
--   - The send still flows through the ONE send path (send-email) with every gate re-verified
--     server-side: fail-closed suppression, kill switch, daily cap + warmup, double-send CAS.
--   - The template is the owner's own words with {{first_name}}/{{business}} fills — no AI
--     invention at 11pm, no fabricated claims.
--   - Every instant touch is a normal approvals row (requested_by 'garvis-auto', decided_via
--     'standing_rule') + execution_runs ledger entry — same audit trail as a human-clicked send.
--   - leads.first_touch_at records exactly when (and whether) the lead was answered instantly.
-- Additive + idempotent.

alter table public.outreach_settings add column if not exists auto_first_touch boolean not null default false;
alter table public.outreach_settings add column if not exists first_touch_subject text;
alter table public.outreach_settings add column if not exists first_touch_body text;

alter table public.leads add column if not exists first_touch_at timestamptz;

-- ======== supabase/migrations/app_0045_watchdog_heartbeat.sql ========
-- app_0045_watchdog_heartbeat.sql — the heartbeat grows two organs and fixes one defect.
--
-- NEW JOBS (recreates garvis_arm_heartbeat with FIVE jobs — re-run the arm call to pick them up;
-- cron.schedule upserts by name, so re-arming replaces, never duplicates):
--   garvis-ads-watch-daily   10:15 UTC daily → ads-watch: refreshes ad metrics through the one
--                            sync path, judges YESTERDAY vs a 7-day baseline with the VERIFIED
--                            detection core, and pushes findings (spend spikes, stopped
--                            campaigns, CTR collapse, CPC spikes) with their arithmetic.
--                            Detection only — never mutates a campaign.
--   garvis-reactivate-monthly 14:00 UTC on the 1st → outreach-reactivate: stages honest check-in
--                            DRAFTS for conversations that went quiet 60–365 days ago, as
--                            PENDING approvals. Nothing sends without you.
--
-- FIX: the app_0043 tick called garvis-worker with only x-worker-secret, but that function is
-- deployed WITH platform JWT verification — the tick would 401 at the gate before the function
-- ran. garvis-worker now ships in the --no-verify-jwt deploy list (its own internal secret/JWT
-- gate remains); redeploy it via `npm run functions:deploy:webhooks`.
--
-- Arm (or re-arm) with the same one call:
--   select public.garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<shared secret>');
-- Disarm: select public.garvis_disarm_heartbeat();

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;

  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  $cron$);

  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  return 'armed: garvis-pulse-hourly, garvis-followups-daily, garvis-worker-tick, garvis-ads-watch-daily, garvis-reactivate-monthly';
end;
$$;

revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly');
  perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick');
  perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0046_full_heartbeat.sql ========
-- app_0046_full_heartbeat.sql — the complete heartbeat: SEVEN jobs. Recreates
-- garvis_arm_heartbeat (cron.schedule upserts by name — re-run the one arm call to pick up the
-- two new organs):
--   garvis-inbox-draft-daily   12:45 UTC daily → inbox-draft: every unanswered POSITIVE reply
--                              gets a response drafted overnight (thread-grounded; unknowable
--                              facts become visible [YOU FILL: …] holes, never inventions) and
--                              staged as a PENDING approval. The morning queue holds a ready
--                              batch; nothing sends without the owner.
--   garvis-scorecard-weekly    Sunday 22:00 UTC → garvis-scorecard: the EOS-style weekly review —
--                              this week vs last on real leading indicators (leads, visits,
--                              replies, sends, contacts, ad spend), pushed so Monday starts with
--                              judgment instead of archaeology. Empty fortnights send nothing.
--
-- Arm/re-arm:  select public.garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<secret>');
-- Disarm:      select public.garvis_disarm_heartbeat();

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;

  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  $cron$);

  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  return 'armed: pulse-hourly, followups-daily, worker-tick, ads-watch-daily, reactivate-monthly, inbox-draft-daily, scorecard-weekly';
end;
$$;

revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly');
  perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick');
  perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly');
  perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0047_money_loop.sql ========
-- app_0047_money_loop.sql — F1: THE MONEY LOOP. Invoices as first-class records, sent through
-- the one gated send path, chased overnight by the heartbeat (politely, escalating, always as
-- PENDING approvals), and counted as real revenue in the weekly scorecard the moment YOU mark
-- them paid (payment truth lives in your processor; Garvis never guesses money).
--
-- Payment collection: paste your own processor's payment link (Stripe/Square no-code links) —
-- funds flow to YOUR account; Garvis holds no money keys. Additive + idempotent.

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  world_id         uuid references public.knowledge_worlds(id) on delete set null,
  contact_id       uuid references public.contacts(id) on delete set null,
  number           text not null,                 -- owner-facing: INV-2026-001 (client-composed)
  title            text not null,
  to_email         text not null,
  line_items       jsonb not null default '[]'::jsonb,  -- [{description, qty, unit_usd}]
  amount_usd       numeric not null default 0,
  due_date         date,
  payment_url      text,                          -- the owner's own processor link (their money)
  status           text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  last_chase_stage int not null default 0,        -- 0 none · 1 upcoming · 2 due · 3 firm · 4 final
  sent_at          timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.invoices enable row level security;
drop policy if exists "invoices owner all" on public.invoices;
create policy "invoices owner all" on public.invoices
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_invoices_owner_status on public.invoices(owner_id, status, due_date);

-- Heartbeat v3 — EIGHT jobs (+ garvis-invoice-chase-daily). Re-run the one arm call to pick it up.
create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 8 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0048_command_thread.sql ========
-- app_0048_command_thread.sql — ONE BRAIN, part 1: the front door remembers.
-- The UX audit's finding: "Refresh and Garvis has amnesia" — the Command transcript lived in
-- useState while studio chats persisted. The conversation with your chief of staff is the one
-- transcript that must survive. Append-only; owner RLS. Additive + idempotent.

create table if not exists public.command_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'garvis')),
  text        text not null,
  mission_id  uuid,                        -- when the turn planned a mission (loose ref; missions table owns lifecycle)
  created_at  timestamptz not null default now()
);
alter table public.command_messages enable row level security;
drop policy if exists "command_messages owner all" on public.command_messages;
create policy "command_messages owner all" on public.command_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_command_messages_owner on public.command_messages(owner_id, created_at desc);

-- ======== supabase/migrations/app_0049_exploration_lab.sql ========
-- app_0049_exploration_lab.sql — THE EXPLORATION LAB (additive, idempotent).
--
-- Three small schema moves carry the whole Lab:
--   1. richer thought vocabulary: the map can say WHAT a node is (claim / theory / evidence /
--      what-if scenario / experiment / insight), not just that it exists.
--   2. the honesty layer: knowledge_clusters.epistemic — how solid a node is. A beautiful map
--      must never make speculation look like fact; the label is data, not a disclaimer.
--   3. simulation records: a new artifact kind for reproducible Lab Bench runs (template +
--      user-set inputs + stated basis + outputs), attached to the exact branch that spawned them.
--
-- ALTER TYPE ... ADD VALUE is safe inside this transaction (PG 12+) because no new value is
-- used within this migration.

alter type cluster_kind add value if not exists 'claim';
alter type cluster_kind add value if not exists 'theory';
alter type cluster_kind add value if not exists 'evidence';
alter type cluster_kind add value if not exists 'scenario';
alter type cluster_kind add value if not exists 'experiment';
alter type cluster_kind add value if not exists 'insight';

alter type ku_artifact_kind add value if not exists 'simulation';

alter table public.knowledge_clusters add column if not exists epistemic text
  constraint knowledge_clusters_epistemic_check
  check (epistemic is null or epistemic in ('established','strong','plausible','disputed','speculative','fiction','hypothesis'));

comment on column public.knowledge_clusters.epistemic is
  'Exploration Lab honesty layer: how solid this node is. Null = not applicable (most topics).';

-- ======== supabase/migrations/app_0050_reply_handled.sql ========
-- app_0050_reply_handled.sql — replies get a HANDLED state (additive, idempotent).
--
-- The flow audit found the Inbox badge couldn't honestly count replies: without a handled state,
-- a counted reply never stops counting. handled_at closes the loop — set when the owner queues an
-- answer (or marks it done), cleared never. The row itself is permanent record; only the "needs
-- you" signal retires.

alter table public.replies add column if not exists handled_at timestamptz;

comment on column public.replies.handled_at is
  'When the owner answered/dismissed this reply. Null = still waiting in the Inbox lane + badge.';

create index if not exists replies_unhandled_idx on public.replies (owner_id) where handled_at is null;

-- ======== supabase/migrations/app_0051_invoice_number_unique.sql ========
-- app_0051_invoice_number_unique.sql — invoice numbers get REAL uniqueness (additive).
--
-- The system scan found INV-year-NNN minted from a client-side row count with no constraint:
-- two tabs (or one same-tick double-click) could both read count=4 and both mint INV-2026-005,
-- silently. The unique index makes the second insert FAIL LOUDLY (23505), and the client now
-- re-mints and retries on that conflict. Numbers stay readable and monotonic-enough; they just
-- can't collide anymore.

create unique index if not exists invoices_owner_number_key
  on public.invoices (owner_id, number);

-- ======== supabase/migrations/app_0052_working_state.sql ========
-- app_0052_working_state.sql — THE WORKING SET (design review P1): the durable "what I'm holding
-- right now" row, one per owner (additive, idempotent).
--
-- The review's flow audit found context bussed through localStorage at every seam: the summoned
-- canvas died on a device switch, next-move dismissals reappeared on the phone after being
-- dismissed on the laptop, and the world→builder brief evaporated with a cleared cache. This row
-- is the baton: Command, Explore, studios, and the builder read and write the SAME object, so
-- handoffs stop being handoffs. localStorage remains a same-device cache, never the truth.

create table if not exists public.working_state (
  owner_id    uuid primary key references public.profiles(id) on delete cascade,
  -- the summoned Command canvas (mailer | video | explore), restored on any device
  canvas      jsonb,
  -- the world/constellation → builder handoff: { brief: {prompt, brief}, world: WorldBuildHandoff }
  build_brief jsonb,
  -- next-move dismissals: { [moveKey]: dismissedAtIso } — travels with the owner, not the browser
  dismissals  jsonb not null default '{}'::jsonb,
  -- when the waking digest was last actually seen (away-lines window)
  last_seen_at timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.working_state is
  'One row per owner: the traveling working set (canvas, build brief, dismissals, last-seen). The first graph node of the record-is-the-interface plan.';

alter table public.working_state enable row level security;

do $$ begin
  create policy "working_state owner all" on public.working_state
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ======== supabase/migrations/app_0053_universal_search.sql ========
-- app_0053_universal_search.sql — UNIVERSAL SEARCH (design review P1): one query over everything
-- the record holds, surfaced in ⌘K (additive, idempotent).
--
-- The review's completeness audit: "the one keystroke a personal OS must answer — 'where is that
-- thing I know I have' — doesn't exist." This function is that answer's substrate: a single
-- owner-scoped sweep over artifacts, areas, worlds, contacts, invoices, documents, beliefs, and
-- missions. SECURITY INVOKER on purpose — RLS on every underlying table scopes rows to the
-- caller; the function adds reach, never privilege. Every branch ALSO pins owner_id =
-- auth.uid() explicitly (review fix): several tables carry admin-read RLS policies, and an
-- admin's ⌘K must sweep the admin's own record, not every user's. ILIKE is honest at personal scale (one
-- owner's rows, all indexed by owner); trigram/tsvector can layer on later without changing the
-- contract.

create or replace function public.garvis_search(q text, cap int default 6)
returns table (
  kind    text,        -- artifact | area | world | contact | invoice | document | belief | mission
  id      uuid,
  title   text,
  snippet text,
  world_id uuid,       -- for routes that land inside a venture (null elsewhere)
  extra   jsonb,       -- kind-specific routing hints (area slug, invoice number, …)
  at      timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (select '%' || trim(q) || '%' as pat)

  (select 'artifact'::text, a.id, a.title,
          coalesce(left(regexp_replace(coalesce(a.detail, ''), '\s+', ' ', 'g'), 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), a.created_at
     from knowledge_artifacts a
     join knowledge_clusters c on c.id = a.cluster_id, needle
    where a.owner_id = auth.uid()
      and (a.title ilike needle.pat or a.detail ilike needle.pat)
    order by a.created_at desc limit cap)

  union all
  (select 'area'::text, c.id, c.title, coalesce(left(c.summary, 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), c.created_at
     from knowledge_clusters c, needle
    where c.owner_id = auth.uid()
      and (c.title ilike needle.pat or c.summary ilike needle.pat)
    order by c.updated_at desc limit cap)

  union all
  (select 'world'::text, w.id, w.title, coalesce(left(w.description, 140), ''),
          w.id, '{}'::jsonb, w.created_at
     from knowledge_worlds w, needle
    where w.owner_id = auth.uid()
      and (w.title ilike needle.pat or w.description ilike needle.pat)
    order by w.updated_at desc limit cap)

  union all
  (select 'contact'::text, ct.id, coalesce(nullif(ct.full_name, ''), ct.email), ct.email,
          null::uuid, '{}'::jsonb, ct.created_at
     from contacts ct, needle
    where ct.owner_id = auth.uid()
      and (ct.full_name ilike needle.pat or ct.email ilike needle.pat)
    order by ct.created_at desc limit cap)

  union all
  (select 'invoice'::text, i.id, i.number || ' — ' || i.title,
          i.status || ' · $' || i.amount_usd::text,
          i.world_id, jsonb_build_object('number', i.number), i.created_at
     from invoices i, needle
    where i.owner_id = auth.uid()
      and (i.title ilike needle.pat or i.number ilike needle.pat)
    order by i.created_at desc limit cap)

  union all
  (select 'document'::text, d.id, d.title, coalesce(left(d.summary, 140), ''),
          d.world_id, '{}'::jsonb, d.created_at
     from documents d, needle
    where d.owner_id = auth.uid()
      and (d.title ilike needle.pat or d.summary ilike needle.pat or d.extracted_text ilike needle.pat)
    order by d.created_at desc limit cap)

  union all
  (select 'belief'::text, b.id, b.statement, 'belief · ' || b.scope,
          null::uuid, '{}'::jsonb, b.created_at
     from mind_beliefs b, needle
    where b.owner_id = auth.uid()
      and b.statement ilike needle.pat
    order by b.updated_at desc limit cap)

  union all
  (select 'mission'::text, m.id, m.objective, coalesce(m.subject, '') || ' · ' || m.status::text,
          null::uuid, '{}'::jsonb, m.created_at
     from garvis_missions m, needle
    where m.owner_id = auth.uid()
      and (m.objective ilike needle.pat or m.subject ilike needle.pat)
    order by m.updated_at desc limit cap)
$$;

comment on function public.garvis_search(text, int) is
  'Universal search for ⌘K: owner-scoped (RLS, SECURITY INVOKER) sweep over the record. cap = max hits per kind.';

-- The callers are signed-in owners; anon gets nothing anyway (RLS), but be explicit.
revoke execute on function public.garvis_search(text, int) from anon;
grant execute on function public.garvis_search(text, int) to authenticated;

-- ======== supabase/migrations/app_0054_record_integrity.sql ========
-- app_0054_record_integrity.sql — REAL EDGES + LEDGERED GRANTS (design review P2; additive, idempotent).
--
-- Three integrity holes the review flagged in the data layer:
--   1. embeddings.(subject_type, subject_id) has no FK ("the writer is responsible for deleting
--      stale rows" — the cron/webhook writers never do). Deleting a document/artifact/cluster/
--      business orphaned its vectors forever, silently degrading retrieval. Cleanup triggers
--      close it at the database, where the invariant belongs.
--   2. command_messages.mission_id was a loose uuid ("missions table owns lifecycle" by hope).
--      A real FK (NOT VALID — tolerant of any existing orphans) makes the edge enforced for all
--      new rows without failing the migration on old ones.
--   3. profiles.credits_balance is the money guardrail, but only SPENDS were ledgered — monthly
--      grants mutated the balance invisibly, so the balance could never be audited or rebuilt.
--      refresh_credits now writes a usage_events row ('credit_grant', cost 0) whenever it rolls
--      the window. Zero-cost rows don't move any spend sum; counters filter by event_type.

-- ---- 1. embeddings orphan cleanup --------------------------------------------------------------

create or replace function public.garvis_embeddings_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.embeddings where subject_type = tg_argv[0] and subject_id = old.id;
  return old;
end;
$$;

do $$ begin
  create trigger trg_embeddings_cleanup_document
    after delete on public.documents
    for each row execute function public.garvis_embeddings_cleanup('document');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_artifact
    after delete on public.knowledge_artifacts
    for each row execute function public.garvis_embeddings_cleanup('artifact');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_cluster
    after delete on public.knowledge_clusters
    for each row execute function public.garvis_embeddings_cleanup('cluster');
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_embeddings_cleanup_business
    after delete on public.business_profiles
    for each row execute function public.garvis_embeddings_cleanup('business');
exception when duplicate_object then null; end $$;

-- One-time sweep: vectors whose subject rows are already gone (the debt this migration retires).
delete from public.embeddings e
 where (e.subject_type = 'document' and not exists (select 1 from public.documents d where d.id = e.subject_id))
    or (e.subject_type = 'artifact' and not exists (select 1 from public.knowledge_artifacts a where a.id = e.subject_id))
    or (e.subject_type = 'cluster'  and not exists (select 1 from public.knowledge_clusters c where c.id = e.subject_id))
    or (e.subject_type = 'business' and not exists (select 1 from public.business_profiles b where b.id = e.subject_id));

-- ---- 2. command_messages.mission_id becomes a real edge ---------------------------------------

do $$ begin
  alter table public.command_messages
    add constraint command_messages_mission_fk
    foreign key (mission_id) references public.garvis_missions(id) on delete set null
    not valid;
exception when duplicate_object then null; end $$;

-- ---- 3. credit grants join the ledger ----------------------------------------------------------

create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz; v_grant int;
begin
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_grant := public.plan_monthly_credits(v_plan);
    v_balance := v_grant;
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
    -- The grant is now ON the ledger: balance = Σ grants − Σ spends becomes checkable arithmetic.
    insert into public.usage_events (user_id, event_type, cost_usd, credits)
      values (p_user, 'credit_grant', 0, v_grant);
  end if;
  return v_balance;
end;
$$;

-- ======== supabase/migrations/app_0055_search_active_beliefs.sql ========
-- app_0055_search_active_beliefs.sql — deep scan fix: retired beliefs leaked into ⌘K.
-- The belief branch of garvis_search had no status filter, so a belief the owner had corrected and
-- retired (the sanctioned way to un-say something) reappeared in the palette looking exactly like a
-- held belief. This recreates the function with `b.status = 'active'` on that branch. Additive and
-- idempotent (CREATE OR REPLACE) — every other branch is byte-for-byte app_0053.

create or replace function public.garvis_search(q text, cap int default 6)
returns table (
  kind    text,
  id      uuid,
  title   text,
  snippet text,
  world_id uuid,
  extra   jsonb,
  at      timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (select '%' || trim(q) || '%' as pat)

  (select 'artifact'::text, a.id, a.title,
          coalesce(left(regexp_replace(coalesce(a.detail, ''), '\s+', ' ', 'g'), 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), a.created_at
     from knowledge_artifacts a
     join knowledge_clusters c on c.id = a.cluster_id, needle
    where a.owner_id = auth.uid()
      and (a.title ilike needle.pat or a.detail ilike needle.pat)
    order by a.created_at desc limit cap)

  union all
  (select 'area'::text, c.id, c.title, coalesce(left(c.summary, 140), ''),
          c.world_id, jsonb_build_object('area', c.slug), c.created_at
     from knowledge_clusters c, needle
    where c.owner_id = auth.uid()
      and (c.title ilike needle.pat or c.summary ilike needle.pat)
    order by c.updated_at desc limit cap)

  union all
  (select 'world'::text, w.id, w.title, coalesce(left(w.description, 140), ''),
          w.id, '{}'::jsonb, w.created_at
     from knowledge_worlds w, needle
    where w.owner_id = auth.uid()
      and (w.title ilike needle.pat or w.description ilike needle.pat)
    order by w.updated_at desc limit cap)

  union all
  (select 'contact'::text, ct.id, coalesce(nullif(ct.full_name, ''), ct.email), ct.email,
          null::uuid, '{}'::jsonb, ct.created_at
     from contacts ct, needle
    where ct.owner_id = auth.uid()
      and (ct.full_name ilike needle.pat or ct.email ilike needle.pat)
    order by ct.created_at desc limit cap)

  union all
  (select 'invoice'::text, i.id, i.number || ' — ' || i.title,
          i.status || ' · $' || i.amount_usd::text,
          i.world_id, jsonb_build_object('number', i.number), i.created_at
     from invoices i, needle
    where i.owner_id = auth.uid()
      and (i.title ilike needle.pat or i.number ilike needle.pat)
    order by i.created_at desc limit cap)

  union all
  (select 'document'::text, d.id, d.title, coalesce(left(d.summary, 140), ''),
          d.world_id, '{}'::jsonb, d.created_at
     from documents d, needle
    where d.owner_id = auth.uid()
      and (d.title ilike needle.pat or d.summary ilike needle.pat or d.extracted_text ilike needle.pat)
    order by d.created_at desc limit cap)

  union all
  -- BELIEFS: active only. A retired belief was corrected on purpose; it must not resurface in search.
  (select 'belief'::text, b.id, b.statement, 'belief · ' || b.scope,
          null::uuid, '{}'::jsonb, b.created_at
     from mind_beliefs b, needle
    where b.owner_id = auth.uid()
      and b.status = 'active'
      and b.statement ilike needle.pat
    order by b.updated_at desc limit cap)

  union all
  (select 'mission'::text, m.id, m.objective, coalesce(m.subject, '') || ' · ' || m.status::text,
          null::uuid, '{}'::jsonb, m.created_at
     from garvis_missions m, needle
    where m.owner_id = auth.uid()
      and (m.objective ilike needle.pat or m.subject ilike needle.pat)
    order by m.updated_at desc limit cap)
$$;

revoke execute on function public.garvis_search(text, int) from anon;
grant execute on function public.garvis_search(text, int) to authenticated;

-- ======== supabase/migrations/app_0056_credit_integrity.sql ========
-- app_0056_credit_integrity.sql — deep scan hardening (additive, idempotent).
-- (1) Reassert the fully-pinned profile-update policy as the LAST word in the numbered sequence, so
--     even if a loose file recreated a permissive version, the migrations end secure.
-- (2) An atomic credit-grant RPC so the Stripe top-up stops doing a read-modify-write on
--     credits_balance (two concurrent credited events could interleave and lose a grant).

-- (1) ------------------------------------------------------------------------
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and plan = (select plan from public.profiles where id = auth.uid())
    and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid())
    and credits_balance = (select credits_balance from public.profiles where id = auth.uid())
    and credits_period_start = (select credits_period_start from public.profiles where id = auth.uid())
  );

-- (2) ------------------------------------------------------------------------
-- Atomic increment: one UPDATE, no read-then-write. SECURITY DEFINER so it can move credits (the
-- update-own-profile policy correctly forbids the client from doing so); locked down to service_role
-- (the Stripe webhook runs as service role — this is never callable by anon/authenticated).
create or replace function public.grant_credits(p_user uuid, p_credits int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set credits_balance = credits_balance + greatest(0, coalesce(p_credits, 0))
   where id = p_user
  returning credits_balance;
$$;

revoke execute on function public.grant_credits(uuid, int) from anon, authenticated, public;
grant execute on function public.grant_credits(uuid, int) to service_role;

comment on function public.grant_credits(uuid, int) is
  'Atomically add credits to a user (Stripe top-up). service_role only; never client-callable.';

-- ======== supabase/migrations/app_0057_projects_ref_pin.sql ========
-- app_0057_projects_ref_pin.sql — deep scan VERIFICATION fix: the cross-tenant P0 was only relocated.
--
-- apply-migration / deploy-backend now derive the Supabase project ref from
-- projects.supabase_project_ref instead of trusting a client-supplied ref. But nothing stopped the
-- OWNER from writing that column: a managed-tier attacker could set a VICTIM's ref (+
-- supabase_managed=true) onto their OWN project row (via UPDATE, or a fresh INSERT), then call the
-- function — and the shared FF_PLATFORM_MANAGEMENT_TOKEN would operate on the victim's database. The
-- vector moved from the request body to the project row; this closes it.
--
-- These three columns are set ONLY server-side (provision-supabase / deploy-backend, which run as the
-- service role). A BEFORE trigger is used rather than an RLS WITH CHECK because a trigger compares
-- OLD vs NEW definitively — no dependency on subquery isolation semantics. The service role bypasses
-- the guard so legitimate provisioning still works. Additive + idempotent.

create or replace function public.guard_project_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Provisioning runs as the service role — let it set these columns. Everyone else is pinned.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.supabase_project_ref is not null
       or new.supabase_managed is distinct from false
       or new.ai_gateway_key is not null then
      raise exception 'projects.supabase_project_ref / supabase_managed / ai_gateway_key are set server-side only';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.supabase_project_ref is distinct from old.supabase_project_ref
       or new.supabase_managed is distinct from old.supabase_managed
       or new.ai_gateway_key is distinct from old.ai_gateway_key then
      raise exception 'projects.supabase_project_ref / supabase_managed / ai_gateway_key are set server-side only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_project_privileged_cols on public.projects;
create trigger guard_project_privileged_cols
  before insert or update on public.projects
  for each row execute function public.guard_project_privileged_cols();

comment on function public.guard_project_privileged_cols() is
  'Pins projects.supabase_project_ref / supabase_managed / ai_gateway_key to server-role writes only — closes the relocated cross-tenant ref vector (deep scan).';

-- ======== supabase/migrations/app_0058_job_retry.sql ========
-- app_0058_job_retry.sql — deep scan (deferred item, now done): the job-worker marked a job 'failed'
-- on ANY thrown error, so a transient AI/network 5xx killed the whole build. This adds a bounded
-- transient-retry counter; the worker requeues with a backoff lease (claim_next_job already gates on
-- lease_until) instead of failing, and resets the counter on real progress. Additive + idempotent.

alter table public.jobs add column if not exists retry_count int not null default 0;

-- ======== supabase/migrations/app_0059_standing_orders.sql ========
-- app_0059_standing_orders.sql — THE CLOCK: standing orders (watchers & schedules).
--
-- The capability the objective stress test ranked #1-missing: nothing in Garvis had a sense of
-- time. A standing order is a small honest promise — "check this page and tell me when it changes"
-- (watch_url), "give me a digest of this world every week" (cadence_digest) — executed by the
-- standing-worker edge function on the heartbeat.
--
-- HONESTY RULES (enforced by _shared/standingCore.ts, verified in standing.verify.ts):
--   * A failed fetch reports UNREACHABLE — never "no change". First sight is a baseline, never a
--     "change". Markup noise (nonces, whitespace) is not a change.
--   * Orders only READ and RECORD: findings land as mind_events (the waking moment) and shelf
--     records. An order never sends, posts, or spends — anything outward still goes through
--     Approvals like everything else.
--   * Digest numbers are counted from real rows (seeds excluded) — never composed by a model.
--
-- Additive + idempotent. Re-run the one arm call (garvis_arm_heartbeat) to pick up the new tick.

-- 1) The orders themselves --------------------------------------------------------------------
create table if not exists public.standing_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  world_id uuid references public.knowledge_worlds(id) on delete cascade,
  kind text not null check (kind in ('watch_url', 'cadence_digest')),
  label text not null,
  cadence text not null check (cadence in ('hourly', 'daily', 'weekly')),
  config jsonb not null default '{}'::jsonb,       -- watch_url: { url } · cadence_digest: { note? }
  status text not null default 'active' check (status in ('active', 'paused')),
  anchor_at timestamptz not null default now(),    -- the schedule grid origin (drift-free stepping)
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_result jsonb,                               -- the WatchResult of the last run (its honest line)
  last_hash text,                                  -- content identity after the last successful fetch
  last_text text,                                  -- normalized content (capped) for change excerpts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.standing_orders enable row level security;
drop policy if exists "standing_orders owner all" on public.standing_orders;
-- The with-check also pins world_id to a world THIS owner owns: without it, a crafted insert could
-- point a digest at another tenant's world and the service-role worker would read it (IDOR). The
-- worker re-verifies ownership at run time too (defense in depth).
create policy "standing_orders owner all" on public.standing_orders
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (
      select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()
    ))
  );

create index if not exists idx_standing_orders_due on public.standing_orders(status, next_run_at);
create index if not exists idx_standing_orders_owner on public.standing_orders(owner_id, created_at desc);

-- 2) Heartbeat v4 — NINE jobs (+ garvis-standing-tick). Re-run the one arm call to pick it up. ---
create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 9 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0060_liveness_verdicts.sql ========
-- app_0060_liveness_verdicts.sql — Tier 1 trust plumbing: the clock's pulse + real draft verdicts.
--
-- 1) system_heartbeat — the readiness audit's worst finding: every "while you sleep" feature dies
--    SILENTLY when the heartbeat is unarmed (all cron jobs 401 into pg_net and nobody sees it).
--    Cron-hit functions now stamp a row per tick; the UI reads the freshest stamp and says plainly
--    "the clock has never ticked / hasn't ticked since X" instead of pretending.
--
-- 2) draft_verdicts — the one place the product violated its own no-theater law: "the ledger learns
--    which drafts you keep vs. rewrite" was promised in five places and measured nowhere. This is
--    the measurement: one row per copied draft, verdict 'kept' or 'rewritten', and the ledger reads
--    REAL counts.
--
-- Additive + idempotent.

-- 1) The clock's pulse ---------------------------------------------------------------------------
create table if not exists public.system_heartbeat (
  job text primary key,
  last_tick_at timestamptz not null default now()
);
alter table public.system_heartbeat enable row level security;
drop policy if exists "system_heartbeat read all" on public.system_heartbeat;
-- Any signed-in user may READ liveness (a job name + timestamp — nothing sensitive); only the
-- service-role workers write (no insert/update policy on purpose).
create policy "system_heartbeat read all" on public.system_heartbeat
  for select to authenticated using (true);

-- 2) Draft verdicts ------------------------------------------------------------------------------
create table if not exists public.draft_verdicts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  world_id uuid references public.knowledge_worlds(id) on delete cascade,
  kind text not null check (kind in ('assist', 'deliver')),
  verdict text not null check (verdict in ('kept', 'rewritten')),
  topic text,                                       -- what the draft was about, for thin-spot analysis
  created_at timestamptz not null default now()
);
alter table public.draft_verdicts enable row level security;
drop policy if exists "draft_verdicts owner all" on public.draft_verdicts;
-- Same world-ownership pin as standing_orders: a verdict may only point at a world this owner owns.
create policy "draft_verdicts owner all" on public.draft_verdicts
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (
      select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()
    ))
  );
create index if not exists idx_draft_verdicts_world on public.draft_verdicts(owner_id, world_id, kind, created_at desc);

-- ======== supabase/migrations/app_0061_forward_in_mailbox.sql ========
-- app_0061_forward_in_mailbox.sql — TIER 2 ①: the mailbox connection (v0: forward-in).
--
-- The day-map audit's #1 gap: mail lives outside, the desk is copy-paste, and resend-inbound
-- SILENTLY DISCARDED any inbound email it couldn't match to an outreach thread. This gives every
-- owner a forward-in address (a per-user alias the inbound webhook resolves) and a real inbox
-- table, so forwarded mail lands in the Queue's Messages lane, gets drafted with the owner's own
-- record, and replies go out through the same approval spine as everything else.
--
-- Additive + idempotent.

-- 1) The per-owner forward-in alias --------------------------------------------------------------
-- Deterministic from the owner id (no secrets — the alias only ROUTES; the webhook still requires
-- INBOUND_SECRET). Backfill existing profiles; a trigger covers new signups.
alter table public.profiles add column if not exists inbound_alias text;
update public.profiles
  set inbound_alias = 'in-' || substr(md5(id::text || 'ff-forward-in'), 1, 10)
  where inbound_alias is null;
create unique index if not exists idx_profiles_inbound_alias on public.profiles(inbound_alias);

create or replace function public.set_inbound_alias()
returns trigger language plpgsql as $$
begin
  if new.inbound_alias is null then
    new.inbound_alias := 'in-' || substr(md5(new.id::text || 'ff-forward-in'), 1, 10);
  end if;
  return new;
end; $$;
drop trigger if exists trg_profiles_inbound_alias on public.profiles;
create trigger trg_profiles_inbound_alias
  before insert on public.profiles
  for each row execute function public.set_inbound_alias();

-- 2) The inbox -----------------------------------------------------------------------------------
create table if not exists public.inbound_mail (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  from_address text not null,
  from_name text,
  to_address text,
  subject text,
  body_text text,                                   -- capped by the webhook; the mail's own words
  message_id text,                                  -- provider id, for reply threading later
  status text not null default 'new' check (status in ('new', 'handled')),
  handled_at timestamptz,
  world_id uuid references public.knowledge_worlds(id) on delete set null,
  received_at timestamptz not null default now()
);
alter table public.inbound_mail enable row level security;
drop policy if exists "inbound_mail owner all" on public.inbound_mail;
-- Owner-scoped, with the same world-ownership pin as standing_orders/draft_verdicts.
create policy "inbound_mail owner all" on public.inbound_mail
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (
      select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()
    ))
  );
create index if not exists idx_inbound_mail_lane on public.inbound_mail(owner_id, status, received_at desc);

-- ======== supabase/migrations/app_0062_reminder_firing.sql ========
-- app_0062_reminder_firing.sql — TIER 2 ②: reminders that FIRE.
-- Reminders previously woke only when the app was next opened. The standing-worker's 15-minute
-- tick now fires due reminders (mind_event + webhook push) exactly once — notified_at is the
-- fired-marker, so a reminder never re-alerts and an unfired one never silently expires.
alter table public.reminders add column if not exists notified_at timestamptz;
create index if not exists idx_reminders_due_fire
  on public.reminders(due_at) where done = false and notified_at is null;

-- ======== supabase/migrations/app_0063_farm.sql ========
-- app_0063_farm.sql — THE FARM: geographic prospecting becomes real. The readiness audit found the
-- direct-mail pillar produced the creative but the LIST half lived entirely outside the system:
-- no geography entity, nowhere to store a postal address, no do-not-mail suppression. This adds:
--   farm_territories  — a named neighborhood/farm the operator works (zips are notes, not magic)
--   mail_recipients   — address-first households (email-never), deduped by normalized household key
--   do_not_mail       — postal suppression, sacred like email suppression: select-first-insert, never reset
--   mail_batches      — gains territory + batch-token links so a drop can be measured per neighborhood
-- Owner RLS everywhere; world_id pinned to an owned world (with-check), matching standing_orders.
-- Additive + idempotent.

create table if not exists public.farm_territories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  name        text not null,
  zips        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.farm_territories enable row level security;
drop policy if exists "farm_territories owner all" on public.farm_territories;
create policy "farm_territories owner all" on public.farm_territories
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_farm_territories_world on public.farm_territories(world_id, created_at desc);

create table if not exists public.mail_recipients (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  territory_id   uuid not null references public.farm_territories(id) on delete cascade,
  world_id       uuid not null references public.knowledge_worlds(id) on delete cascade,
  full_name      text not null default '',
  situs_address1 text not null,
  situs_city     text not null default '',
  situs_state    text not null default '',
  situs_zip      text not null default '',
  mail_address1  text,                          -- owner mailing address when the source provides one
  mail_city      text,
  mail_state     text,
  mail_zip       text,
  is_absentee    boolean not null default false, -- computed at import: mailing differs from situs
  household_key  text not null,                  -- normalized situs — dedupe + do-not-mail key
  attrs          jsonb not null default '{}',    -- every other source column, kept (close date, price…)
  source         text,
  created_at     timestamptz not null default now()
);
alter table public.mail_recipients enable row level security;
drop policy if exists "mail_recipients owner all" on public.mail_recipients;
create policy "mail_recipients owner all" on public.mail_recipients
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create unique index if not exists uq_mail_recipients_household
  on public.mail_recipients(owner_id, territory_id, household_key);
create index if not exists idx_mail_recipients_territory on public.mail_recipients(territory_id);

create table if not exists public.do_not_mail (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  household_key text not null,
  address_label text not null default '',       -- human-readable line so the list stays auditable
  reason        text,
  created_at    timestamptz not null default now()
);
alter table public.do_not_mail enable row level security;
drop policy if exists "do_not_mail owner all" on public.do_not_mail;
create policy "do_not_mail owner all" on public.do_not_mail
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create unique index if not exists uq_do_not_mail_household on public.do_not_mail(owner_id, household_key);

-- A mail batch can now name the territory it dropped into and carry a per-batch attribution token
-- (the QR link's ?src value), so "the Maple Grove drop: N pieces, M scans" becomes answerable.
alter table public.mail_batches add column if not exists territory_id uuid references public.farm_territories(id) on delete set null;
alter table public.mail_batches add column if not exists batch_token text;

-- ======== supabase/migrations/app_0064_send_batch.sql ========
-- app_0064_send_batch.sql — BULK SEND-TO-SEGMENT. The audit's "impractical newsletter" fix:
-- one approval approves a BATCH (a snapshotted segment of contacts); the standing worker drains it
-- under the daily cap by pushing every recipient through THE ONE SEND PATH (send-email), so every
-- safety gate — suppression, contact status, kill switch, cap/warmup — re-checks per recipient at
-- send time. The batch never bypasses anything; it only removes the 200-clicks problem.
-- Additive + idempotent. NOTE: the enum value is added here and only USED at runtime (PG allows
-- ADD VALUE in a transaction as long as the same transaction doesn't reference it).

alter type public.approval_kind add value if not exists 'send_batch';

create table if not exists public.outreach_batches (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  subject       text not null,
  body_text     text not null,
  recipients    jsonb not null default '[]',   -- snapshot: [{contactId,email,name,state,reason?}]
  status        text not null default 'queued' check (status in ('queued', 'draining', 'done', 'canceled')),
  approval_id   uuid references public.approvals(id) on delete set null,
  sent_count    int not null default 0,
  skipped_count int not null default 0,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table public.outreach_batches enable row level security;
drop policy if exists "outreach_batches owner all" on public.outreach_batches;
create policy "outreach_batches owner all" on public.outreach_batches
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_outreach_batches_active on public.outreach_batches(status, created_at) where status in ('queued', 'draining');
create index if not exists idx_outreach_batches_owner on public.outreach_batches(owner_id, created_at desc);

-- ======== supabase/migrations/app_0065_esign.sql ========
-- app_0065_esign.sql — AUTO-PAPERWORK + E-SIGNATURE. Rebuilt on Garvis's spines from the lakegen
-- audit (the source's send path was real; its OAuth UI, webhook wiring, and refresh flow were not):
--   paperwork_templates — the operator's own document templates ({{tokens}} merge with honest gaps)
--   esign_envelopes     — one row per signature request, driven ONLY through the approval spine
-- The enum value is added here and only USED at runtime. Owner RLS; world pinned when set.
-- Additive + idempotent.

alter type public.approval_kind add value if not exists 'send_for_signature';

create table if not exists public.paperwork_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid references public.knowledge_worlds(id) on delete set null,
  name        text not null,
  doc_kind    text not null default 'agreement',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.paperwork_templates enable row level security;
drop policy if exists "paperwork_templates owner all" on public.paperwork_templates;
create policy "paperwork_templates owner all" on public.paperwork_templates
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_paperwork_templates_owner on public.paperwork_templates(owner_id, updated_at desc);

create table if not exists public.esign_envelopes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  template_id  uuid references public.paperwork_templates(id) on delete set null,
  title        text not null,
  merged_body  text not null,                  -- the exact text queued for signature (the record)
  recipients   jsonb not null default '[]',    -- [{name,email,status?,signedAt?}]
  provider     text not null default 'docusign',
  envelope_id  text,                           -- provider envelope id once sent
  status       text not null default 'queued' check (status in ('queued','sent','delivered','completed','declined','voided','failed')),
  approval_id  uuid references public.approvals(id) on delete set null,
  sent_at      timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.esign_envelopes enable row level security;
drop policy if exists "esign_envelopes owner all" on public.esign_envelopes;
create policy "esign_envelopes owner all" on public.esign_envelopes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_esign_envelopes_owner on public.esign_envelopes(owner_id, created_at desc);
create index if not exists idx_esign_envelopes_envelope on public.esign_envelopes(envelope_id) where envelope_id is not null;

-- ======== supabase/migrations/app_0066_mls.sql ========
-- app_0066_mls.sql — MLS DATA RAIL. The audit's "every number-shaped artifact says 'fill from your
-- MLS'" gap: a RESO Web API feed (credentials sealed server-side in provider_connections) syncs
-- listings into mls_listings, and market stats are COMPUTED from these real rows — never from the
-- model's memory. No feed configured = honest empty state, never sample data.
-- Additive + idempotent. Owner RLS (world pin when set).

create table if not exists public.mls_listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  listing_key   text not null,                 -- RESO ListingKey (the feed's identity)
  status        text not null default '',      -- RESO StandardStatus, as the feed said it
  list_price    numeric,
  close_price   numeric,
  address1      text not null default '',
  city          text not null default '',
  zip           text not null default '',
  property_type text not null default '',
  beds          numeric,
  baths         numeric,
  sqft          numeric,
  list_date     date,
  close_date    date,
  dom           int,
  modified_at   timestamptz,                   -- RESO ModificationTimestamp (sync cursor)
  synced_at     timestamptz not null default now()
);
alter table public.mls_listings enable row level security;
drop policy if exists "mls_listings owner all" on public.mls_listings;
create policy "mls_listings owner all" on public.mls_listings
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create unique index if not exists uq_mls_listings_key on public.mls_listings(owner_id, listing_key);
create index if not exists idx_mls_listings_status on public.mls_listings(owner_id, status);
create index if not exists idx_mls_listings_close on public.mls_listings(owner_id, close_date desc) where close_date is not null;

-- ======== supabase/migrations/app_0067_timelines.sql ========
-- app_0067_timelines.sql — TRANSACTION TIMELINES. The lakegen harvest's most authentically
-- real-estate-shaped idea, rebuilt in house style: a contract-to-close (or listing-to-live)
-- checklist instantiated from a template with offset days against an anchor date. Steps can become
-- REMINDERS (app_0039/app_0062) so the clock fires them — deadlines that actually ring, not rows
-- that wait to be noticed. Owner RLS; world pinned. Additive + idempotent.

create table if not exists public.transaction_timelines (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  title       text not null,
  kind        text not null check (kind in ('listing', 'purchase')),
  anchor_date date not null,
  status      text not null default 'active' check (status in ('active', 'closed')),
  created_at  timestamptz not null default now()
);
alter table public.transaction_timelines enable row level security;
drop policy if exists "transaction_timelines owner all" on public.transaction_timelines;
create policy "transaction_timelines owner all" on public.transaction_timelines
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_timelines_world on public.transaction_timelines(world_id, created_at desc);

create table if not exists public.timeline_steps (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  timeline_id  uuid not null references public.transaction_timelines(id) on delete cascade,
  title        text not null,
  due_date     date,
  offset_days  int not null default 0,
  position     int not null default 0,
  done         boolean not null default false,
  done_at      timestamptz
);
alter table public.timeline_steps enable row level security;
drop policy if exists "timeline_steps owner all" on public.timeline_steps;
create policy "timeline_steps owner all" on public.timeline_steps
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_timeline_steps_timeline on public.timeline_steps(timeline_id, position);

-- ======== supabase/migrations/app_0068_mail_recipients_territory_pin.sql ========
-- app_0068_mail_recipients_territory_pin.sql — close the double-check finding: mail_recipients'
-- with-check pinned world ownership but NOT territory ownership. Because FKs bypass RLS, a user
-- could insert recipients referencing a territory they don't own (or one in a different world than
-- the row's world_id), and another owner's deleteTerritory cascade would then remove those rows.
-- Adds the territory-ownership pin so every recipient's territory_id must belong to the caller.
-- Additive + idempotent.

drop policy if exists "mail_recipients owner all" on public.mail_recipients;
create policy "mail_recipients owner all" on public.mail_recipients
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
    and exists (select 1 from public.farm_territories t where t.id = territory_id and t.owner_id = auth.uid())
  );

-- ======== supabase/migrations/app_0069_approval_payload_hash.sql ========
-- app_0069_approval_payload_hash.sql — tamper-evidence binding for approvals. An approval records a
-- human decision about a SPECIFIC payload; this stores a deterministic SHA-256 of that payload at
-- creation so the executor can refuse if the payload changed after it was approved. Null-grandfathered
-- (older + worker-minted rows have no hash and skip the check). Additive + idempotent.

alter table public.approvals add column if not exists payload_hash text;

-- ======== supabase/migrations/app_0070_social_posts.sql ========
-- app_0070_social_posts.sql — SOCIAL AUTO-POSTING. Her real accounts, connected once through a
-- provider (Ayrshare), posted to (or scheduled) from inside Garvis — nothing goes out without an
-- approval. Each row is one post; the edge function fills provider_post_id + status after sending.
-- Owner RLS; world pinned when set. Additive + idempotent.

create table if not exists public.social_posts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  world_id         uuid references public.knowledge_worlds(id) on delete set null,
  body             text not null default '',
  platforms        text[] not null default '{}',
  media_urls       text[] not null default '{}',
  scheduled_for    timestamptz,                    -- null = post immediately on approval
  status           text not null default 'queued'
                     check (status in ('queued', 'scheduled', 'posted', 'failed', 'canceled')),
  provider         text not null default 'ayrshare',
  provider_post_id text,
  approval_id      uuid references public.approvals(id) on delete set null,
  error            text,
  posted_at        timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.social_posts enable row level security;
drop policy if exists "social_posts owner all" on public.social_posts;
create policy "social_posts owner all" on public.social_posts
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_social_posts_owner on public.social_posts(owner_id, created_at desc);

-- ======== supabase/migrations/app_0071_reel_jobs.sql ========
-- app_0071_reel_jobs.sql — THE REEL FACTORY data model. A content_growth studio turns a niche idea
-- into a multi-scene vertical reel: one reel_job holds the storyboard; one reel_clip per scene is the
-- async generation job the clip engine (Sora/Runway/Luma) fills. Nothing here posts — a finished reel
-- rides the existing social_posts + approval spine, and every post carries the platform made-with-AI
-- label. Owner RLS on both tables; world/cluster pinned when set. Additive + idempotent.
--
-- HONESTY: reel_jobs.ai_generated is set true at creation and is the IMMUTABLE provenance the label
-- derives from — the whole content_growth carve-out (AI footage is honest here) rests on it being
-- true and on the label being applied, so it is not a settable publish-time flag.

create table if not exists public.reel_jobs (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null,
  cluster_id     uuid references public.knowledge_clusters(id) on delete set null,  -- the content_growth studio area
  account_id     uuid,                            -- which faceless account this reel is for (roster lands in a later slice)
  title          text not null default '',
  hook           text not null default '',
  storyboard     jsonb not null default '{}'::jsonb,   -- the full ReelStoryboard {hook, scenes:[{prompt,caption,vo}]}
  ai_generated   boolean not null default true,        -- immutable provenance — the made-with-AI label derives from this
  status         text not null default 'draft'
                   check (status in ('draft', 'generating', 'assembling', 'ready', 'failed')),
  assembled_url  text,                            -- the final vertical mp4 once assembled (render seam)
  error          text,
  created_at     timestamptz not null default now()
);
alter table public.reel_jobs enable row level security;
drop policy if exists "reel_jobs owner all" on public.reel_jobs;
create policy "reel_jobs owner all" on public.reel_jobs
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_reel_jobs_owner on public.reel_jobs(owner_id, created_at desc);
create index if not exists idx_reel_jobs_world on public.reel_jobs(world_id, created_at desc);

-- One generation job per scene. owner_id is denormalized so RLS never needs a join to reel_jobs.
create table if not exists public.reel_clips (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  reel_id      uuid not null references public.reel_jobs(id) on delete cascade,
  scene_index  int not null default 0,
  prompt       text not null default '',        -- the text-to-video generation prompt for this scene
  caption      text not null default '',        -- on-screen caption for this scene
  vo           text not null default '',        -- voiceover line for this scene ('' = none)
  provider     text not null default 'sora'
                 check (provider in ('sora', 'runway', 'luma')),
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'done', 'failed')),
  output_url   text,                            -- the generated clip once downloaded to storage
  seed         bigint,
  error        text,
  created_at   timestamptz not null default now()
);
alter table public.reel_clips enable row level security;
drop policy if exists "reel_clips owner all" on public.reel_clips;
create policy "reel_clips owner all" on public.reel_clips
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.reel_jobs r where r.id = reel_id and r.owner_id = auth.uid())
  );
create unique index if not exists idx_reel_clips_scene on public.reel_clips(reel_id, scene_index);
create index if not exists idx_reel_clips_status on public.reel_clips(status) where status in ('queued', 'running');

-- ======== supabase/migrations/app_0072_client_discovery.sql ========
-- app_0072_client_discovery.sql — THE HANDS-OFF PROSPECTING LAYER for Win Clients. Replaces the
-- daily hunt's Serper-organic sweep with the swift-prep-pros model: discover REAL businesses through
-- Google Places (structured records — name, phone, address, website, category, geo), persist them as
-- a lead pool, and drive discovery from a SELF-EXHAUSTING work queue so the machine stops wasting
-- searches on markets it has already drained.
--
--   discovery_queries      one row per (business-type × city) combo the owner is hunting. The daily
--                          worker picks the next-best non-exhausted query, runs it, and marks it
--                          exhausted after two consecutive zero-insert runs (that market is tapped).
--   discovered_businesses  every real business Places returned, deduped per owner by place_id then by
--                          normalized website. This is the lead pool the demo/pitch step draws from —
--                          businesses with NO website are the strongest "I'll build you one" prospects.
--
-- HONESTY: these tables hold only what Google Places actually returned — never an invented business,
-- phone, or address. status moves new → built (a demo was made) or skipped; nothing here sends.
-- Owner RLS on both. Additive + idempotent.

-- ---------------------------------------------------------------------------------------------
-- The self-exhausting discovery work queue
-- ---------------------------------------------------------------------------------------------
create table if not exists public.discovery_queries (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  keyword               text not null,                 -- the business type, e.g. "roofers"
  city                  text not null,
  state                 text not null,                 -- 2-letter
  query_text            text not null,                 -- "roofers in Austin, TX" (the Places textQuery)
  last_run_at           timestamptz,
  last_inserted         integer not null default 0,
  total_inserted        integer not null default 0,
  run_count             integer not null default 0,
  consecutive_zero_runs integer not null default 0,
  exhausted             boolean not null default false, -- true once the market is drained (2 zero runs)
  created_at            timestamptz not null default now()
);
alter table public.discovery_queries enable row level security;
drop policy if exists "discovery_queries owner all" on public.discovery_queries;
create policy "discovery_queries owner all" on public.discovery_queries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- One row per owner per exact query — re-seeding is a no-op (on conflict do nothing).
create unique index if not exists uq_discovery_queries_owner_query
  on public.discovery_queries(owner_id, query_text);
-- The worker's "next-best" scan: non-exhausted, least-recently-run first.
create index if not exists idx_discovery_queries_pick
  on public.discovery_queries(owner_id, exhausted, last_run_at nulls first);

-- ---------------------------------------------------------------------------------------------
-- The persistent lead pool (Places records)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.discovered_businesses (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  place_id           text,                              -- Google Places id (primary dedupe key)
  company_name       text not null,
  keyword            text,                              -- the business type it was found under
  website            text,
  website_normalized text,                              -- host, lowercased, no scheme/www (dedupe key)
  phone              text,
  address            text,
  city               text,
  state              text,
  category           text,                              -- Places primaryType
  lat                double precision,
  lng                double precision,
  has_website        boolean not null default false,    -- false ⇒ strongest "build you a site" prospect
  status             text not null default 'new'
                       check (status in ('new', 'built', 'skipped')),
  preview_site_id    uuid references public.preview_sites(id) on delete set null,
  source_query_id    uuid references public.discovery_queries(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.discovered_businesses enable row level security;
drop policy if exists "discovered_businesses owner all" on public.discovered_businesses;
create policy "discovered_businesses owner all" on public.discovered_businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Dedupe: never store the same place twice, nor the same website twice, for one owner. Partial
-- uniques so many rows may have NULL place_id / website_normalized without colliding.
create unique index if not exists uq_discovered_owner_place
  on public.discovered_businesses(owner_id, place_id) where place_id is not null;
create unique index if not exists uq_discovered_owner_site
  on public.discovered_businesses(owner_id, website_normalized) where website_normalized is not null;
-- The build step's queue: this owner's un-built leads, no-website first (best prospects).
create index if not exists idx_discovered_build_queue
  on public.discovered_businesses(owner_id, status, has_website, created_at);

-- ======== supabase/migrations/app_0073_cluster_working_state.sql ========
-- app_0073_cluster_working_state.sql — a small per-cluster scratch store so a studio/canvas REMEMBERS
-- what you were working on across reloads, instead of resetting to a blank "set it up" prompt every
-- visit. The marketing canvas uses it to persist the current campaign details, so reopening a
-- business shows your real work — the #1 "it feels empty" complaint. jsonb, and the existing
-- knowledge_clusters RLS (owner-scoped) already governs reads/writes. Additive + idempotent.
--
-- HONESTY: this holds WORKING state only (what you're in the middle of). Finished, made artifacts
-- stay in knowledge_artifacts — this column is never a source of truth for "work that happened".
alter table public.knowledge_clusters add column if not exists working_state jsonb;

-- ======== supabase/migrations/app_0074_prospect_audits.sql ========
-- app_0074_prospect_audits.sql — PHASE 0: stop discarding the honest audit.
--
-- Today the "Win clients" hunt (WinClients.tsx) fetches each prospect's site, audits it honestly
-- (siteAudit.ts — signals traced to observed facts, no faked Lighthouse), shows the verdict, and then
-- THROWS THE WHOLE RESULT AWAY when the React state unmounts. Every audit is paid for (Serper +
-- fetch-url) and then lost. This table keeps it.
--
-- WHY IT MATTERS: this is the foundation stone. Nothing downstream — opportunity detection
-- (manual_process:* signals), the sector-pack proposal layer, or the cross-business intelligence DB
-- (the moat) — can exist until audits persist. It is cheap and additive; it changes no existing
-- behaviour, it only records what was already computed.
--
-- HONESTY RULES (same ethos as siteAudit.ts / marketIntel.ts):
--   * Every column is something REALLY OBSERVED on the fetched page. An unreachable site is an honest
--     'unknown' verdict with a null score — never a guess. Missing data stays null.
--   * `vertical` is a DETERMINISTIC read (detectVertical) of the text actually scraped — no model call,
--     no invented classification.
--   * Read/record only. Nothing here contacts anyone; outreach still goes through the approval spine.
--
-- Additive + idempotent.

create table if not exists public.prospect_audits (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,

  -- Identity (what we looked at)
  url               text not null,                 -- the exact URL audited
  host              text,                          -- registrable-ish host, for grouping
  business_name     text,                          -- name from discovery, when known
  niche             text,                          -- the niche searched (e.g. "roofers"), when known
  area              text,                          -- the town/area searched, when known
  source            text not null default 'scan'   -- how it entered the funnel
                      check (source in ('find', 'scan', 'sweep', 'manual')),

  -- The honest audit (mirrors the SiteAudit shape; every field traces to observed facts)
  reachable         boolean not null default false,
  score             integer,                       -- 10-100, DERIVED; null when unreachable ('unknown')
  verdict           text not null default 'unknown'
                      check (verdict in ('weak', 'dated', 'solid', 'unknown')),
  headline          text,                          -- the owner-facing one-liner
  signals           jsonb not null default '[]'::jsonb,   -- AuditSignal[] worst-first (what's wrong)
  strengths         jsonb not null default '[]'::jsonb,   -- honest positives already present

  -- The scrape substrate future detection layers need (fetched today, discarded today)
  vertical          text,                          -- detectVertical() over the scraped text; null when no text
  checks            jsonb not null default '{}'::jsonb,   -- raw { viewport, form, email, https }
  meta_title        text,
  meta_description  text,
  text_snippet      text,                          -- capped readable page text (for manual_process:* detection)

  created_at        timestamptz not null default now(),
  last_audited_at   timestamptz not null default now()
);

alter table public.prospect_audits enable row level security;
drop policy if exists "prospect_audits owner all" on public.prospect_audits;
create policy "prospect_audits owner all" on public.prospect_audits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- One row per (owner, url): re-auditing refreshes the same prospect instead of duplicating it
-- (the client does SELECT-first, but the constraint makes the invariant real).
create unique index if not exists uq_prospect_audits_owner_url on public.prospect_audits(owner_id, url);
create index if not exists idx_prospect_audits_owner_verdict on public.prospect_audits(owner_id, verdict);
create index if not exists idx_prospect_audits_owner_vertical on public.prospect_audits(owner_id, vertical);
create index if not exists idx_prospect_audits_owner_recent on public.prospect_audits(owner_id, last_audited_at desc);

-- ======== supabase/migrations/app_0075_prospect_audit_tech.sql ========
-- app_0075_prospect_audit_tech.sql — keep the tech fingerprint alongside the honest audit.
--
-- fetch-url now reads the tech a business runs from their own raw HTML (site builder, booking widget,
-- analytics/ad pixels, live-chat, storefront) — the single best qualifier for both a rebuild and an
-- automation pitch. This adds one column to hold it, so detection can ground platform:* / stack:*
-- signals in a real observed tag instead of a text guess.
--
-- Same honesty rule as the rest of the table: the fingerprint claims only signatures really present in
-- the markup; an absent one is null/empty, never a guess. Old rows default to '{}' (unknown, not
-- computed) and detection treats an empty object as "no tech signal", never as "nothing installed".
--
-- Additive + idempotent.

alter table public.prospect_audits
  add column if not exists tech jsonb not null default '{}'::jsonb;

-- ======== supabase/migrations/app_0076_automation_triggers.sql ========
-- app_0076_automation_triggers.sql — THE TRIGGER ENGINE (tentpole #1): per-customer event/date/interval
-- automations, the mechanic every sector pack needs and the one Garvis's clock did not yet have.
--
-- standing_orders (app_0059) schedules ORDERS (watch a page, weekly digest). This adds the other axis:
-- fire ONCE per customer, a set number of days after an event on THAT customer's own record (6 months
-- after a patient's last visit; every spring for a maintenance customer; N days after a job closes).
-- The scheduling + once-only math is pure and verified (automation/triggers.ts + triggers.verify.ts);
-- this migration is the data it runs on. Wiring the runner (enqueue an approval-gated send per due
-- customer, on the heartbeat) is the next step — nothing here sends; the human still owns the trigger out.
--
-- HONESTY / SAFETY:
--   * A trigger fires only for customers whose due date was reached RECENTLY (window_days) — turning a
--     trigger on never retroactively blasts years of backlog.
--   * trigger_fires is the idempotency ledger: one row per (trigger, customer, due date) — fire once.
--   * consent_basis on customers records that this is the client's OWN warm list (processor model);
--     the actual send still re-checks suppression + goes through the approval spine.
--
-- Additive + idempotent. Owner-scoped RLS on every table (single-tenant today; the operator-membership
-- overlay from tentpole #2 extends these policies later — it does not replace them).

-- 1) A client's warm customer list ----------------------------------------------------------------
create table if not exists public.customer_lists (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid,
  name                text not null,
  source              text not null default 'manual' check (source in ('manual', 'import', 'crm')),
  created_at          timestamptz not null default now()
);
alter table public.customer_lists enable row level security;
drop policy if exists "customer_lists owner all" on public.customer_lists;
create policy "customer_lists owner all" on public.customer_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_customer_lists_owner on public.customer_lists(owner_id, created_at desc);

-- 2) Individual customers with the event dates triggers anchor on ---------------------------------
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  list_id         uuid not null references public.customer_lists(id) on delete cascade,
  email           text,
  name            text,
  -- the anchor dates a trigger can key on (all optional — a null anchor simply never fires)
  last_service_at date,
  last_visit_at   date,
  purchase_at     date,
  next_due_at     date,
  meta            jsonb not null default '{}'::jsonb,
  consent_basis   text not null default 'warm_transactional' check (consent_basis in ('warm_transactional', 'cold_prospecting')),
  consent_at      timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.customers enable row level security;
drop policy if exists "customers owner all" on public.customers;
create policy "customers owner all" on public.customers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_customers_list on public.customers(list_id);
create index if not exists idx_customers_owner on public.customers(owner_id);

-- 3) A trigger: an instance of a sector-pack automation the owner turned on -----------------------
create table if not exists public.automation_triggers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  list_id          uuid not null references public.customer_lists(id) on delete cascade,
  capability_id    text not null,                 -- the registry capability (e.g. 'hygiene_recall')
  label            text not null,
  anchor_field     text not null check (anchor_field in ('last_service_at', 'last_visit_at', 'purchase_at', 'next_due_at')),
  offset_days      integer not null,              -- fire this many days after the anchor date
  window_days      integer not null default 7 check (window_days >= 1),  -- only fire if it became due within this window
  template_subject text not null,
  template_body    text not null,
  status           text not null default 'active' check (status in ('active', 'paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.automation_triggers enable row level security;
drop policy if exists "automation_triggers owner all" on public.automation_triggers;
create policy "automation_triggers owner all" on public.automation_triggers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_automation_triggers_active on public.automation_triggers(status, list_id);
create index if not exists idx_automation_triggers_owner on public.automation_triggers(owner_id);

-- 4) The idempotency ledger: one row per (trigger, customer, due date) that fired -----------------
create table if not exists public.trigger_fires (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  trigger_id   uuid not null references public.automation_triggers(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  fired_for    date not null,                     -- the anchor-derived due date this fire satisfied
  approval_id  uuid,                              -- the approval enqueued for this fire (null until wired)
  created_at   timestamptz not null default now()
);
alter table public.trigger_fires enable row level security;
drop policy if exists "trigger_fires owner all" on public.trigger_fires;
create policy "trigger_fires owner all" on public.trigger_fires
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Fire once per (trigger, customer, due date): the DB makes the once-only invariant real.
create unique index if not exists uq_trigger_fires_once on public.trigger_fires(trigger_id, customer_id, fired_for);
create index if not exists idx_trigger_fires_trigger on public.trigger_fires(trigger_id);

-- ======== supabase/migrations/app_0077_client_billing.sql ========
-- app_0077_client_billing.sql — SELL THE TIERS. The agency's own client-billing ledger: who bought
-- which offer (Website, or Website + Automation), what they pay, and whether they're live.
--
-- This is DISTINCT from the FableForge SaaS billing (stripe_subscriptions / profiles.plan), which bills
-- the operator for using the app builder. THIS bills the operator's LOCAL-BUSINESS CLIENTS — a plumber
-- paying the operator for a rebuilt site + automations. The buyer is not a FableForge auth user, so it
-- can't ride the existing user-scoped billing; it's the operator's own book of business.
--
-- v1 fulfils via Stripe Payment Links (created by the operator in Stripe — zero code): the app records
-- the sale, shows the right link to send, and the operator marks a client active once paid. The fully
-- automated Checkout + webhook path layers on later (it needs Stripe keys to build + test safely).
--
-- Owner-scoped RLS throughout. Additive + idempotent.

-- 1) The operator's two Payment Links (set once, reused for every client) -------------------------
create table if not exists public.agency_billing_settings (
  owner_id                 uuid primary key references public.profiles(id) on delete cascade,
  website_payment_link     text,   -- Stripe Payment Link URL for the "New Website" offer
  automation_payment_link  text,   -- Stripe Payment Link URL for the "Website + Automation" offer
  updated_at               timestamptz not null default now()
);
alter table public.agency_billing_settings enable row level security;
drop policy if exists "agency_billing_settings owner all" on public.agency_billing_settings;
create policy "agency_billing_settings owner all" on public.agency_billing_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 2) The client ledger: one row per business the operator has sold (or is selling) a tier ---------
create table if not exists public.client_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_name       text not null,
  email               text,
  business_profile_id uuid,                       -- link back to the prospect, when known
  preview_site_id     uuid,                       -- the rebuilt site we pitched, when known
  tier                text not null check (tier in ('website', 'website_automation')),
  cadence             text not null check (cadence in ('one_time', 'monthly')),
  price_cents         integer not null default 0, -- the agreed price (monthly for retainers)
  status              text not null default 'pending' check (status in ('pending', 'active', 'canceled')),
  notes               text,
  created_at          timestamptz not null default now(),
  activated_at        timestamptz
);
alter table public.client_subscriptions enable row level security;
drop policy if exists "client_subscriptions owner all" on public.client_subscriptions;
create policy "client_subscriptions owner all" on public.client_subscriptions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_client_subs_owner_status on public.client_subscriptions(owner_id, status, created_at desc);

-- ======== supabase/migrations/app_0078_trigger_dedupe_indexes.sql ========
-- app_0078_trigger_dedupe_indexes.sql — QA hardening for the trigger engine.
--
-- (1) ONCE-ONLY across duplicate triggers. The fire ledger's unique index is per-trigger
--     (trigger_id, customer_id, fired_for), so two triggers of the SAME capability on the SAME list
--     would each fire the same customer for the same due date — a double-send. Enforce one instance of
--     a capability per list so that can't happen; createTriggerFromCapability surfaces the 23505 nicely.
-- (2) Indexes that actually serve the runner's hot queries (owner_id + status; owner_id + list_id).
--
-- Additive + idempotent.

create unique index if not exists uq_automation_triggers_owner_list_cap
  on public.automation_triggers(owner_id, list_id, capability_id);

create index if not exists idx_automation_triggers_owner_status
  on public.automation_triggers(owner_id, status);

create index if not exists idx_customers_owner_list
  on public.customers(owner_id, list_id);

-- ======== supabase/migrations/app_0079_standing_orders_client_hunt.sql ========
-- app_0079_standing_orders_client_hunt.sql — let the daily client hunt EXIST.
--
-- app_0072 built the hunt's lead pool and standing-worker carries a complete client_hunt branch,
-- but standing_orders' kind check (app_0059) was never widened past ('watch_url','cadence_digest')
-- — so createClientHuntOrder's insert (standingRun.ts) was rejected by Postgres 100% of the time
-- and "Turn on daily hunt" could never work. This is the one-line unlock.
--
-- Additive + idempotent: drop-if-exists then re-add with the full kind list.

alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt'));

-- ======== supabase/migrations/app_0080_standing_orders_idea_stream.sql ========
-- app_0080_standing_orders_idea_stream.sql — allow the idea_stream standing-order kind.
--
-- THE BUG THIS FIXES: the Idea Board's Auto-ideas toggle (IdeaBoard.tsx → createOrder with
-- kind 'idea_stream') has been rejected by Postgres on EVERY click since N2 shipped — the
-- standing-worker branch, the UI, and standingCore all know the kind, but the check constraint
-- (last widened in app_0079) never learned it. Same pattern as app_0079: drop + re-add.
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream'));

-- ======== supabase/migrations/app_0081_message_engagement.sql ========
-- app_0081_message_engagement.sql — STOP THROWING AWAY ENGAGEMENT.
--
-- resend-webhook receives email.delivered/opened/clicked and discarded them — the operator could
-- never know a pitch was opened, and "opened 3x but silent" (the strongest follow-up trigger there
-- is) was invisible. Three timestamps + an open counter on the message row; the webhook stamps
-- them, the UI reads them. Additive + idempotent.

alter table public.outreach_messages add column if not exists delivered_at timestamptz;
alter table public.outreach_messages add column if not exists opened_at timestamptz;      -- first open
alter table public.outreach_messages add column if not exists clicked_at timestamptz;     -- first click
alter table public.outreach_messages add column if not exists open_count integer not null default 0;

-- ======== supabase/migrations/app_0081_outreach_events.sql ========
-- app_0081_outreach_events.sql — STOP THROWING AWAY THE FEEDBACK.
-- The needle audit's sharpest finding: Resend delivers opened/clicked events and resend-webhook
-- discards them (TYPE_MAP maps them, no branch stores them), so no segment, subject line, or send
-- time can ever be ranked. This table is the substrate every future analytics lens reads:
-- one row per engagement event, correlated to the message (and through it the campaign/contact/
-- batch). Writes come ONLY from service-role edge functions; owners read their own rows.

create table if not exists public.outreach_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid references public.outreach_messages(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  batch_id    uuid,          -- outreach_batches.id when the message came from a bulk drain
  kind        text not null check (kind in ('delivered','opened','clicked','bounced','complained','unsubscribed','replied')),
  meta        jsonb not null default '{}',   -- e.g. {"url": "..."} on clicked
  created_at  timestamptz not null default now()
);

create index if not exists idx_outreach_events_owner_kind on public.outreach_events(owner_id, kind, created_at desc);
create index if not exists idx_outreach_events_message on public.outreach_events(message_id);
create index if not exists idx_outreach_events_batch on public.outreach_events(batch_id) where batch_id is not null;

alter table public.outreach_events enable row level security;
drop policy if exists "events select own" on public.outreach_events;
create policy "events select own" on public.outreach_events for select using (owner_id = auth.uid());
-- no insert/update policies on purpose: only service-role edge functions write events.

-- Batch joinability: messages drained from a batch never carried the batch id, making
-- per-batch open/click stats impossible. Additive column; standing-worker stamps it.
alter table public.outreach_messages add column if not exists batch_id uuid;
create index if not exists idx_outreach_messages_batch on public.outreach_messages(batch_id) where batch_id is not null;

-- ======== supabase/migrations/app_0082_audit_proposals.sql ========
-- app_0082_audit_proposals.sql — make "automation search" a QUERYABLE asset.
--
-- Detection results were recomputed client-side per render and thrown away — you could never ask
-- "which saved prospects need missed-call text-back?" across the audit pool. Store the proposed
-- capability ids on the audit row at write time. Additive + idempotent.

alter table public.prospect_audits add column if not exists proposals text[] not null default '{}';
create index if not exists idx_prospect_audits_proposals on public.prospect_audits using gin (proposals);

-- ======== supabase/migrations/app_0082_contacts_world.sql ========
-- app_0082_contacts_world.sql — CONTACTS BELONG TO A BUSINESS.
-- The multi-business audit's P0: contacts had owner_id but no world_id, so a batch launched from
-- one business's email board snapshotted the OWNER-GLOBAL list — a WealthCharts newsletter would
-- hit the real-estate farm (a consent problem, not just a UX one). A contact now belongs to the
-- business that acquired them; batch snapshots and segment counts filter on it.
--
-- Backfill assumption (stated, not hidden): every pre-existing contact was acquired in the
-- single-business era, so they are assigned to the owner's FIRST world. New uploads and
-- site-lead captures stamp world_id explicitly. Suppression stays owner-global on purpose —
-- an opt-out means the PERSON opted out, not one brand's copy of them.

alter table public.contacts add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_contacts_owner_world on public.contacts(owner_id, world_id);

update public.contacts c
set world_id = w.first_world
from (
  select owner_id, (array_agg(id order by created_at asc))[1] as first_world
  from public.knowledge_worlds
  group by owner_id
) w
where c.owner_id = w.owner_id and c.world_id is null;

-- ======== supabase/migrations/app_0083_approvals_world.sql ========
-- app_0083_approvals_world.sql — APPROVALS SAY WHICH BUSINESS THEY BELONG TO.
-- The multi-business audit: with several brands, the Queue read "Post to Instagram" / "Send X to
-- 41 contacts" with no brand attribution — approving meant guessing the business from the copy.
-- Additive column, stamped by enqueueApproval when the caller knows its world; old rows stay null
-- and render without a badge (honest: we don't invent attribution for history).

alter table public.approvals add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_approvals_world on public.approvals(world_id) where world_id is not null;

-- ======== supabase/migrations/app_0084_world_social_profiles.sql ========
-- app_0084_world_social_profiles.sql — EACH BUSINESS POSTS TO ITS OWN ACCOUNTS.
-- The multi-business audit's distribution gap: one Ayrshare connection meant every brand's posts
-- landed on the same linked accounts — professional creation, amateur distribution. Ayrshare's
-- multi-client plan issues a Profile-Key per client profile; this table maps business → profile.
-- social-publish resolves post.world_id here and sends the Profile-Key header. Fail-closed rule
-- lives in the function: once ANY mapping exists, a business-attributed post with NO mapping
-- blocks rather than silently posting to the wrong brand's accounts. Zero mappings = today's
-- single-account behavior, untouched.
-- The Profile-Key is a routing identifier, not the API key — the API key stays sealed in
-- provider_connections and never reaches the browser.

create table if not exists public.world_social_profiles (
  world_id    uuid primary key references public.knowledge_worlds(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  profile_key text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.world_social_profiles enable row level security;
drop policy if exists "world_social_profiles owner all" on public.world_social_profiles;
create policy "world_social_profiles owner all" on public.world_social_profiles
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_world_social_profiles_owner on public.world_social_profiles(owner_id);

-- ======== supabase/migrations/app_0085_world_sender_identity.sql ========
-- app_0085_world_sender_identity.sql — EACH BUSINESS SENDS EMAIL AS ITSELF.
-- The email twin of app_0084: outreach_settings is one row per owner, so with three brands every
-- email left with the same from-address, signature company, and CAN-SPAM footer — the wrong brand
-- on every message. This table gives a business its own sender identity; send-email resolves the
-- message's business (batch → contact) and uses it when mapped.
-- Identity is applied as a UNIT (name/email/reply-to never half-mix across brands); only the
-- CAN-SPAM mailing address may fall back to the global one, because brands under one roof
-- legitimately share a mailing address. SAFETY STAYS OWNER-GLOBAL on purpose: the kill switch,
-- daily cap, warmup ramp, and timezone in outreach_settings govern the human, not the brand.

create table if not exists public.world_sender_identities (
  world_id         uuid primary key references public.knowledge_worlds(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  from_name        text,
  from_email       text,
  reply_to         text,
  company_name     text,
  physical_address text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.world_sender_identities enable row level security;
drop policy if exists "world_sender_identities owner all" on public.world_sender_identities;
create policy "world_sender_identities owner all" on public.world_sender_identities
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_world_sender_identities_owner on public.world_sender_identities(owner_id);

-- ======== supabase/migrations/app_0086_invoice_provenance.sql ========
-- app_0086_invoice_provenance.sql — REVENUE KNOWS WHERE IT CAME FROM.
-- The audit's money-path gap: invoices had no origin. "Collected $1,500" couldn't answer WHICH
-- campaign, lead, or won deal earned it — so the scorecard's revenue line never taught anything.
-- Additive provenance: source ('manual' for the form, 'garvis_tool' for the assistant, 'won_deal'
-- for the client-book path) plus optional links to the lead, the originating marketing campaign
-- (distinct from the kind='invoice' send-vehicle campaign minted at send time), and the
-- client_subscriptions row when the invoice bills a won client. Old rows read 'manual' — honest,
-- because the form was the only path when they were created.

alter table public.invoices add column if not exists source text not null default 'manual';
alter table public.invoices add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.invoices add column if not exists campaign_id uuid references public.outreach_campaigns(id) on delete set null;
alter table public.invoices add column if not exists client_subscription_id uuid references public.client_subscriptions(id) on delete set null;
create index if not exists idx_invoices_subscription on public.invoices(client_subscription_id) where client_subscription_id is not null;

-- ======== supabase/migrations/app_0086_loop_closing.sql ========
-- app_0086_loop_closing.sql — AGENT-RUN RETRY/BACKOFF (the job-worker lesson, applied to agent_runs).
--
-- garvis-worker marked a run 'failed' on ANY thrown error, so one transient AI/network 5xx killed a
-- checkpointed run permanently. Same fix app_0058 gave jobs, made explicit here: a bounded
-- transient-retry counter + a backoff gate the claim functions honor. The worker requeues a
-- transient failure with next_attempt_at in the future (5m→10m→20m, capped 1h) and resets the
-- counter on real progress; only exhausted retries or a clearly permanent error fail terminally.
-- Additive + idempotent.

alter table public.agent_runs add column if not exists retry_count int not null default 0;
alter table public.agent_runs add column if not exists next_attempt_at timestamptz;  -- null = claimable now

-- BOTH claimants must honor the backoff — the platform worker AND the in-browser runtime. If the
-- owner-scoped claim ignored next_attempt_at, an open laptop would re-claim a backed-off run
-- instantly and defeat the backoff entirely.

create or replace function public.claim_next_agent_run_service() returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from agent_runs
  where status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
    and (next_attempt_at is null or next_attempt_at <= now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;
  return next r;
end $$;

-- create-or-replace preserves existing grants, but restate them so this file stands alone (the
-- whole point is that ONLY the platform worker may claim across owners).
revoke execute on function public.claim_next_agent_run_service() from public;
revoke execute on function public.claim_next_agent_run_service() from anon;
revoke execute on function public.claim_next_agent_run_service() from authenticated;
grant execute on function public.claim_next_agent_run_service() to service_role;

create or replace function public.claim_next_agent_run() returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from agent_runs
  where owner_id = auth.uid()
    and status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
    and (next_attempt_at is null or next_attempt_at <= now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;
  return next r;
end $$;

-- Owner-scoped + auth.uid() guard inside makes this safe for authenticated callers.
revoke execute on function public.claim_next_agent_run() from anon;
grant execute on function public.claim_next_agent_run() to authenticated;

-- ======== supabase/migrations/app_0087_social_metrics.sql ========
-- app_0087_social_metrics.sql — THE MACHINE READS ITS OWN POSTS.
-- The audit's distribution gap, closing from the read side now: Garvis posted to social and never
-- looked back — zero calls fetched performance, so "did that post work?" had no answer anywhere.
-- This is the storage half (level-10 Spec 3 Phase 2, renumbered): one row per (post, platform),
-- written ONLY by the social-sync edge function from Ayrshare's analytics API. Every metric is
-- nullable — an absent metric stays NULL, never a fake 0 — and the raw provider object is kept
-- verbatim so per-platform field-name corrections never lose data. Owner-read RLS, service-role
-- writes (the ad_metrics pattern, app_0038).

create table if not exists public.social_post_metrics (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  post_id      uuid not null references public.social_posts(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  platform     text not null,
  likes        integer,
  comments     integer,
  shares       integer,
  impressions  integer,
  video_views  integer,
  saves        integer,
  clicks       integer,
  engagement   integer,
  raw          jsonb not null default '{}',
  synced_at    timestamptz not null default now(),
  unique (post_id, platform)
);
alter table public.social_post_metrics enable row level security;
drop policy if exists "social_post_metrics owner read" on public.social_post_metrics;
create policy "social_post_metrics owner read" on public.social_post_metrics
  for select using (owner_id = auth.uid());
-- Writes arrive only via the social-sync edge function (service role).
create index if not exists idx_social_metrics_owner on public.social_post_metrics(owner_id, synced_at desc);
create index if not exists idx_social_metrics_world on public.social_post_metrics(world_id, synced_at desc);

alter table public.social_posts add column if not exists last_synced_at timestamptz;

-- Heartbeat v5: + garvis-social-sync (every 6 hours). Re-creating arm/disarm is the established
-- upgrade path (v4 did the same); an ALREADY-ARMED install gains the job immediately via the
-- conditional block below, a fresh install gets it when the owner arms.
create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 10 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, social-sync)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick'); perform cron.unschedule('garvis-social-sync');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- An already-armed heartbeat gains the new job NOW (fresh installs get it via arm above).
do $$
begin
  if exists (select 1 from vault.secrets where name = 'ff_heartbeat_base') then
    perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  end if;
exception when others then null; -- pg_cron/vault absent on this install → the arm call adds it later
end $$;

-- ======== supabase/migrations/app_0087_system_control.sql ========
-- System control: make "is the brain actually on?" a queryable fact instead of tribal knowledge.
--
-- The entire unattended layer hangs off 9 pg_cron jobs armed by garvis_arm_heartbeat() — a call
-- that lives only in a migration comment, so whether it ever ran is invisible from the app. This
-- migration adds one read-only helper so the system-control edge function (and the Health page)
-- can report the truth: which garvis cron jobs exist and their schedules.
--
-- Security: definer function, revoked from public — reachable only by the service role (the
-- system-control function), never by browser clients. It reads cron.job (pg_cron's catalog),
-- filtered to this system's own jobs, and returns names/schedules only — no command bodies
-- (they embed vault-decrypted secrets in SQL text).
--
-- Apply once in the Supabase SQL editor (or supabase db push). Safe to re-run.

create or replace function public.garvis_cron_status()
returns table (jobname text, schedule text, active boolean)
language sql security definer set search_path = public
as $$
  select j.jobname::text, j.schedule::text, j.active
  from cron.job j
  where j.jobname like 'garvis-%'
  order by j.jobname;
$$;

revoke all on function public.garvis_cron_status() from public;

-- ======== supabase/migrations/app_0088_consolidation_tick.sql ========
-- The consolidation tick: schedules garvis-consolidate (mind_events → PROPOSED lessons through
-- the existing garvis_knowledge approval gate) weekly, Monday 08:00 UTC — judgment forms at the
-- start of the week, from the record of the last one.
--
-- Redefines garvis_arm_heartbeat with the 10th job. Additive + idempotent: re-run the one arm
-- call (or the Health page's Arm button) to pick up the new tick.

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-consolidate-weekly', '0 8 * * 1', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-consolidate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000);$c$);

  return 'armed: 10 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;

-- ======== supabase/migrations/app_0088_content_week.sql ========
-- app_0088_content_week.sql — THE CONTENT PRODUCER + GRADUATED AUTONOMY (level-10 Spec 2).
-- One weekly standing order stages a judged week of content — N social posts + 1 email — as ONE
-- approval card. Every draft is scored by the same editor rubric the boards use; sub-bar drafts
-- are DISCARDED with their scores kept for audit. After 3 consecutive approved-without-edit weeks
-- the owner may grant auto-mode: weeks then stage pre-approved (the speed-to-lead class), still
-- visible in the Queue and the ledger, still capped, still killed by pausing the order or the
-- outbound kill switch. Every judge score is bound into the approval's payload_hash — "the
-- machine said this was a 9 when I approved it" is provable from the record.

-- The bundle approval kind (enum ADD VALUE precedent: app_0064).
alter type public.approval_kind add value if not exists 'content_week';

-- Widen the order-kind vocabulary (the app_0079/app_0080 drop + re-add shape).
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week'));

-- Graduated autonomy lives ON the order: consecutive approved-without-edit weeks, and the flag the
-- owner flips once the streak has earned it. A rejection or an edited week resets both.
alter table public.standing_orders add column if not exists clean_approvals integer not null default 0;
alter table public.standing_orders add column if not exists auto_mode boolean not null default false;

-- Social daily cap — the posting twin of daily_send_cap (email, app_0023). Governs garvis-auto
-- posts only; 0 blocks all automated posting. Human-approved posts are not capped here.
alter table public.outreach_settings add column if not exists social_daily_cap integer not null default 4;

-- One row per staged week. pieces = the survivors (each with its judge score + notes + schedule +
-- lifecycle state); discards = the audit of what the bar killed (scores kept). Nothing here sends:
-- the worker's drain executes only after the approval verifies, hash-bound.
create table if not exists public.content_weeks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  order_id     uuid references public.standing_orders(id) on delete set null,
  world_id     uuid references public.knowledge_worlds(id) on delete cascade,
  week_start   date not null,
  pieces       jsonb not null default '[]',
  discards     jsonb not null default '[]',
  status       text not null default 'staged' check (status in ('staged', 'queued', 'done', 'canceled')),
  approval_id  uuid references public.approvals(id) on delete set null,
  edited       boolean not null default false,
  model        text,
  cost_usd     numeric,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
alter table public.content_weeks enable row level security;
drop policy if exists "content_weeks owner all" on public.content_weeks;
create policy "content_weeks owner all" on public.content_weeks
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create unique index if not exists uq_content_weeks_order_week on public.content_weeks(order_id, week_start);
create index if not exists idx_content_weeks_active on public.content_weeks(status, created_at)
  where status in ('staged', 'queued');

-- ======== supabase/migrations/app_0089_opportunities.sql ========
-- THE OPPORTUNITY ENGINE: opportunities become a first-class concept — a job/RFP/grant/commission
-- as a structured row the hunt accumulates and the operator triages. Before this the system could
-- watch one page or find businesses, but a found "mural commission, $18k, deadline Aug 14" had
-- nowhere to live, dedupe, or be tracked to "applied".
--
-- Plus: standing_orders learns the 'opportunity_hunt' kind (scheduled Serper sweeps → fetch →
-- honest extraction → this table). Additive + idempotent.

alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'opportunity_hunt'));

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid references public.knowledge_worlds(id) on delete set null,  -- which business hunts for it (null = operator-wide)
  order_id uuid references public.standing_orders(id) on delete set null,   -- provenance: which hunt found it
  title text not null,
  summary text not null,                    -- what it is, from the page text only
  source_url text not null,
  kind text not null default 'other' check (kind in ('mural', 'public-art', 'grant', 'commission', 'job', 'other')),
  location text,                            -- null = the page didn't say (never guessed)
  budget_text text,                         -- verbatim from the page, else null
  deadline_text text,                       -- verbatim from the page, else null
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed', 'applied')),
  dedupe_key text not null,                 -- host+path :: normalized title (opportunityHunt.dedupeKey)
  found_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index if not exists idx_opportunities_owner_status on public.opportunities(owner_id, status, found_at desc);

alter table public.opportunities enable row level security;
drop policy if exists "opportunities owner all" on public.opportunities;
create policy "opportunities owner all" on public.opportunities
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0090_client_engagements.sql ========
-- THE CLIENT ENGAGEMENT LAYER: operating a business FOR someone becomes a first-class concept.
-- "Add my client Jane the realtor — I do her marketing" was an honest hole: worlds model
-- businesses, but nothing said WHOSE business a world is, what the operator does for them, or
-- what's still needed from them. An engagement is that record: the client, the scope, the intake
-- checklist, and (once its draft is approved) the world it operates.
--
-- world_id is nullable ON PURPOSE: onboarding creates the engagement immediately and drafts the
-- client's world through the normal genesis approval ceremony — the operator links the world in
-- the Client book after approving it. One engagement per world. Additive + idempotent.

create table if not exists public.client_engagements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid references public.knowledge_worlds(id) on delete set null,
  client_name text not null,
  client_email text,
  business text not null,                  -- what their business is, in the operator's words
  scope text not null,                     -- what the operator does for them ("marketing", "marketing + paperwork")
  status text not null default 'prospect' check (status in ('prospect', 'active', 'paused', 'ended')),
  intake jsonb not null default '[]'::jsonb,  -- [{ item: string, received: boolean }] — what's still needed from the client
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, world_id)
);

create index if not exists idx_client_engagements_owner on public.client_engagements(owner_id, status);

alter table public.client_engagements enable row level security;
drop policy if exists "client_engagements owner all" on public.client_engagements;
create policy "client_engagements owner all" on public.client_engagements
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0091_orchestrator_plans.sql ========
-- THE PROJECT LOOP: compiled plans become DURABLE ARCS instead of one-sitting executions.
-- Before this, a plan died at its first approval seam ("approve the company draft first") and
-- evaporated on reload. Now a plan persists with per-step statuses, WAITS honestly at seams
-- (waiting_reason says exactly what for), resumes with one click, and the morning brief nags
-- arcs that have stalled. This is the difference between a compiler and a project manager.

create table if not exists public.orchestrator_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  summary text not null,
  intent text not null,                        -- the operator's original sentence (provenance)
  steps jsonb not null,                        -- PlanStep[] (action, params, why, after)
  statuses jsonb not null default '[]',        -- StepStatus[] parallel to steps
  holes jsonb not null default '[]',
  questions jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'running', 'waiting', 'done', 'failed', 'abandoned')),
  waiting_reason text,                         -- honest: what the arc is waiting for (null unless waiting)
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orchestrator_plans_owner on public.orchestrator_plans(owner_id, status, last_activity_at desc);

alter table public.orchestrator_plans enable row level security;
drop policy if exists "orchestrator_plans owner all" on public.orchestrator_plans;
create policy "orchestrator_plans owner all" on public.orchestrator_plans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0091_preview_hardening.sql ========
-- app_0091_preview_hardening.sql
-- Deep-audit fix wave (operation hardening):
--
-- 1) get_preview_by_slug leaked the ENTIRE preview_sites row (minus user_id) to anyone holding
--    a preview slug — including the internal sales pitch email, the marketing strategy, and the
--    simulated-owner critique ("would_buy: false, weakest_part: …"). The prospect the demo was
--    pitched TO could read our private notes about their business. The public payload is now
--    the render surface only: spec + audit + identity fields.
--
-- 2) preview_sites.build_log — per-build provenance (model, stage reached, imagery count,
--    failure reasons, cost) so "why is this demo a template?" is answerable without joining
--    usage-event timestamps. Server-written only; excluded from the public RPC.

alter table public.preview_sites add column if not exists build_log jsonb;

create or replace function public.get_preview_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select to_jsonb(p) - 'user_id' - 'pitch' - 'strategy' - 'critique' - 'build_log'
  from public.preview_sites p
  where p.slug = p_slug or p.id::text = p_slug
  limit 1
$$;

revoke all on function public.get_preview_by_slug(text) from public;
grant execute on function public.get_preview_by_slug(text) to anon, authenticated;

-- ======== supabase/migrations/app_0092_heartbeat_repair.sql ========
-- HEARTBEAT + STANDING-ORDER REPAIR. The July 2026 full-system scan found two regressions born
-- from parallel migration branches landing out of order:
--
--   B1: app_0089_opportunities recreated standing_orders_kind_check WITHOUT 'content_week'
--       (added by app_0088_content_week) — content weeks became un-creatable at the DB layer.
--   B2: app_0088_consolidation_tick redefined garvis_arm_heartbeat WITHOUT 'garvis-social-sync'
--       (added by app_0087_social_metrics) — social metrics stopped auto-syncing on any re-arm,
--       and app_0088 also never redefined the disarm to include consolidate-weekly.
--
-- This migration is the union of both branches, plus one hardening: every job now sends BOTH
-- x-worker-secret AND x-cron-secret (same vault secret). Before, four daily jobs sent only
-- x-cron-secret, so a CRON_SECRET env var that differed from WORKER_SECRET made them 401
-- silently into pg_net forever. With both headers, arming with WORKER_SECRET is sufficient
-- regardless of which header a function checks. Additive + idempotent; re-run the arm call
-- (or the Health page's Arm button) to pick up the 11-job schedule.

-- B1: the full kind list — the union of every kind any migration has taught standing_orders.
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt'));

-- B2: the 11-job arm — 0088's ten plus social-sync restored, dual secret headers everywhere.
create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-consolidate-weekly', '0 8 * * 1', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-consolidate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000);$c$);
  perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 11 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate, social-sync)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

-- Disarm covers the full 11 (0087's version missed consolidate-weekly, 0088 never redefined it).
create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick'); perform cron.unschedule('garvis-consolidate-weekly');
  perform cron.unschedule('garvis-social-sync');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0093_paperwork_fields_isolation.sql ========
-- PAPERWORK FIELD PERSISTENCE + WORLD ISOLATION (July 2026 scan, defects B7 + B8).
--
-- B7: template extraction produced field labels + grounded hints and the save path THREW THEM
-- AWAY — paperwork_templates had no column for them, so the fill form showed bare token names.
-- fields: [{ token, label, hint }] — persisted verbatim from the reviewed extraction.
--
-- B8 (part): the Money page can now split by business — invoices had world_id since app_0047
-- but no read ever filtered on it; the new composite index makes the per-world list cheap.
-- Additive + idempotent.

alter table public.paperwork_templates add column if not exists fields jsonb not null default '[]'::jsonb;

create index if not exists idx_invoices_owner_world on public.invoices(owner_id, world_id, created_at desc);

-- ======== supabase/migrations/app_0094_credit_grant_pin.sql ========
-- CREDIT FUNCTION PINNING (July 2026 scan, defect B10). app_0017 granted refresh_credits and
-- spend_credits to `authenticated` with an arbitrary p_user parameter and no caller check — any
-- signed-in session could drain any account's balance (a griefing vector that 402-pauses the
-- whole autonomy loop) or roll a stranger's refill window. grant_credits was locked down in
-- app_0056; these two were missed.
--
-- The pin: when a real JWT is present (auth.uid() not null), p_user MUST be the caller. Service
-- role and pg_cron paths carry no user claim (auth.uid() null) and keep operating on any row —
-- that's the edge functions' path, unchanged. Definitions otherwise identical to app_0017.

create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'refresh_credits: callers may only refresh their own balance';
  end if;
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_balance := public.plan_monthly_credits(v_plan);
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
  end if;
  return v_balance;
end;
$$;

create or replace function public.spend_credits(
  p_user uuid, p_cost numeric, p_kind text,
  p_provider text default null, p_model text default null,
  p_in int default 0, p_out int default 0, p_project uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_credits int; v_balance int;
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'spend_credits: callers may only spend their own balance';
  end if;
  perform public.refresh_credits(p_user);
  v_credits := greatest(1, ceil(coalesce(p_cost, 0) / public.credit_usd()))::int;
  update public.profiles set credits_balance = greatest(0, credits_balance - v_credits)
    where id = p_user returning credits_balance into v_balance;
  insert into public.usage_events (user_id, project_id, event_type, provider, model, input_tokens, output_tokens, cost_usd, credits)
    values (p_user, p_project, p_kind, p_provider, p_model, coalesce(p_in, 0), coalesce(p_out, 0), coalesce(p_cost, 0), v_credits);
  return coalesce(v_balance, 0);
end;
$$;

-- ======== supabase/migrations/app_0095_arc_wake.sql ========
-- THE ARC WAKE LOOP (roadmap #1, first half): a waiting arc stops being the operator's memory
-- burden. Parked steps now record WHAT they wait for in machine-checkable form (waiting_on);
-- the standing-worker's wake sweep re-checks blockers on the clock and flips cleared arcs to
-- 'ready'; the Orchestrate page auto-resumes ready arcs on sight. Plus a concurrency claim so
-- two tabs can never double-run the same arc (statuses were last-writer-wins).

alter table public.orchestrator_plans add column if not exists waiting_on jsonb;
alter table public.orchestrator_plans add column if not exists claimed_until timestamptz;

alter table public.orchestrator_plans drop constraint if exists orchestrator_plans_status_check;
alter table public.orchestrator_plans
  add constraint orchestrator_plans_status_check
  check (status in ('draft', 'running', 'waiting', 'ready', 'done', 'failed', 'abandoned'));

-- The wake sweep scans waiting arcs across owners on the service role.
create index if not exists idx_orchestrator_plans_waiting on public.orchestrator_plans(status) where status = 'waiting';

-- ======== supabase/migrations/app_0096_canary_tick.sql ========
-- THE NIGHTLY CANARY JOB (holy-grail gap 9). garvis-canary proves the LIVE wiring every night
-- at 08:30 UTC: catalog+gauntlet inside the runtime, hardened egress, a DB round-trip, the
-- send gate REFUSING a fabricated approval, and stamp freshness. Silent when green; every
-- owner gets one honest line + webhook nudge on failure. Redefines the arm with the 12th job
-- (dual secret headers throughout, disarm covers all 12). Additive + idempotent; re-run the
-- arm call (or the Health page's Arm button) to pick it up.

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-consolidate-weekly', '0 8 * * 1', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-consolidate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000);$c$);
  perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-canary-nightly', '30 8 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-canary', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 12 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate, social-sync, canary)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

-- Disarm covers the full 11 (0087's version missed consolidate-weekly, 0088 never redefined it).
create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick'); perform cron.unschedule('garvis-consolidate-weekly');
  perform cron.unschedule('garvis-social-sync'); perform cron.unschedule('garvis-canary-nightly');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- ======== supabase/migrations/app_0097_autonomy.sql ========
-- EARNED AUTONOMY, GENERALIZED (holy-grail gap 6). Trust stops being binary. The content-week
-- loop proved the pattern (clean approvals → auto_mode → instant revoke); this table is the
-- per-action-class trust dial for the recurring LOW-NOVELTY outbound classes — follow-ups,
-- invoice chases, reactivation notes, inbox reply drafts. The operator GRANTS auto per class
-- (the UI only offers it after a clean streak); the cron drafters then mint those approvals
-- pre-approved (decided_via 'autonomy_grant', capped per day) and execute through the one send
-- path where every gate still re-runs. Revoke is one click and instant. Cold pitches and
-- anything novel stay manual forever — autonomy is earned per class, never global.

create table if not exists public.autonomy_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_class text not null check (action_class in ('followup', 'invoice_chase', 'reactivation', 'inbox_reply')),
  mode text not null default 'manual' check (mode in ('manual', 'auto')),
  daily_cap int not null default 5 check (daily_cap between 1 and 25),
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, action_class)
);

alter table public.autonomy_grants enable row level security;
drop policy if exists "autonomy_grants owner all" on public.autonomy_grants;
create policy "autonomy_grants owner all" on public.autonomy_grants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ======== supabase/migrations/app_0098_calendar_sense.sql ========
-- THE CALENDAR SENSE (holy-grail gap 7, part b). One column: the operator's secret ICS feed URL
-- (Google Calendar → Settings → "Secret address in iCal format"; Outlook publishes one too).
-- The morning pulse reads the next 24h of events into the brief — Garvis finally knows what the
-- day already holds before proposing what it should. The URL is operator-entered, fetched
-- through safeFetch (SSRF-guarded), read-only, and removable by clearing the field.

alter table public.profiles add column if not exists calendar_ics_url text;

-- ======== supabase/migrations/app_0099_rooms_esign_filing.sql ========
-- CUSTOM ROOMS v1 + SIGNED-DOCUMENT FILING (holy-grail gaps 4 + the paperwork back half).
--
-- world_rooms: creation that EXTENDS the creator — a built/deployed app mounted as a surface
-- INSIDE its business (the wardrobe room: build the t-shirt design tool, deploy it, mount it,
-- use it without leaving Garvis). v1 embeds by URL (https-only, iframe-sandboxed client-side);
-- genesis emitting room-backed areas comes later.
--
-- signed_pdf_path: a completed DocuSign envelope's combined PDF gets pulled and FILED to
-- storage — the signed artifact finally lands in the system of record instead of living only
-- in DocuSign's inbox.

create table if not exists public.world_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  title text not null,
  url text not null,
  kind text not null default 'deployed' check (kind in ('deployed', 'preview', 'external')),
  created_at timestamptz not null default now()
);

create index if not exists idx_world_rooms_world on public.world_rooms(world_id, created_at desc);

alter table public.world_rooms enable row level security;
drop policy if exists "world_rooms owner all" on public.world_rooms;
create policy "world_rooms owner all" on public.world_rooms
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

alter table public.esign_envelopes add column if not exists signed_pdf_path text;

-- ======== supabase/migrations/app_0100_execution_truth.sql ========
-- app_0100_execution_truth.sql — exact run identity + resumable Garvis questions.
--
-- Interactive callers used to INSERT a run and then claim "the next" run. With an older queued
-- row (or the unattended worker racing the browser), the command could execute a different run.
-- claim_agent_run() is an owner-scoped compare-and-swap for the exact row the caller created.
--
-- Agent runs could also enter waiting_approval with a question but had no state transition back to
-- queued. resume_agent_run() appends the human answer to the checkpoint history atomically and
-- requeues that exact run. This is a clarification seam, distinct from consequence approvals.

create or replace function public.create_and_claim_agent_run(
  p_kind text,
  p_title text,
  p_phase text,
  p_budget_usd numeric,
  p_input text,
  p_app_id uuid default null
)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_kind not in ('research', 'content', 'build', 'analyze', 'recommend') then
    raise exception 'Invalid run kind.';
  end if;
  if p_phase not in ('observe', 'plan', 'act') then raise exception 'Invalid run phase.'; end if;
  -- SECURITY DEFINER bypasses RLS inside this function. Re-assert ownership for every
  -- caller-supplied foreign key so a run can never be attached to another owner's app.
  if p_app_id is not null and not exists (
    select 1 from public.apps where id = p_app_id and owner_id = auth.uid()
  ) then
    raise exception 'App not found.';
  end if;

  insert into public.agent_runs (
    owner_id, app_id, kind, title, status, phase, budget_usd, input, lease_until, started_at
  ) values (
    auth.uid(), p_app_id, p_kind, p_title, 'running', p_phase,
    greatest(coalesce(p_budget_usd, 0), 0), p_input,
    now() + interval '10 minutes', now()
  ) returning * into r;

  return next r;
end $$;

revoke execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) from public;
revoke execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) from anon;
grant execute on function public.create_and_claim_agent_run(text, text, text, numeric, text, uuid) to authenticated;

create or replace function public.claim_agent_run(p_run_id uuid)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from public.agent_runs
  where id = p_run_id
    and owner_id = auth.uid()
    and (
      status = 'queued'
      or (status = 'running' and (lease_until is null or lease_until < now()))
    )
    and (next_attempt_at is null or next_attempt_at <= now())
  for update skip locked;

  if not found then return; end if;

  update public.agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;

  return next r;
end $$;

revoke execute on function public.claim_agent_run(uuid) from public;
revoke execute on function public.claim_agent_run(uuid) from anon;
grant execute on function public.claim_agent_run(uuid) to authenticated;

create or replace function public.resume_agent_run(p_run_id uuid, p_answer text)
returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare
  r public.agent_runs;
  cp jsonb;
  hist jsonb;
  question text;
begin
  if length(trim(coalesce(p_answer, ''))) = 0 then
    raise exception 'An answer is required.';
  end if;

  select * into r from public.agent_runs
  where id = p_run_id
    and owner_id = auth.uid()
    and status = 'waiting_approval'
  for update;

  if not found then return; end if;

  cp := coalesce(r.checkpoint, jsonb_build_object('step', 0, 'history', '[]'::jsonb));
  hist := case when jsonb_typeof(cp->'history') = 'array' then cp->'history' else '[]'::jsonb end;
  question := nullif(trim(cp #>> '{pendingQuestion,question}'), '');

  -- New checkpoints already include the question as an assistant turn. Older waiting rows do
  -- not, so repair them during resume. In both cases the model receives the actual Q/A pair.
  if question is not null and not (
    jsonb_array_length(hist) > 0
    and hist->(jsonb_array_length(hist) - 1)->>'role' = 'assistant'
    and hist->(jsonb_array_length(hist) - 1)->>'content' = question
  ) then
    hist := hist || jsonb_build_array(jsonb_build_object('role', 'assistant', 'content', question));
  end if;
  hist := hist || jsonb_build_array(jsonb_build_object('role', 'user', 'content', trim(p_answer)));
  cp := jsonb_set(cp, '{history}', hist, true) - 'pendingQuestion';

  update public.agent_runs set
    status = 'queued',
    checkpoint = cp,
    output = null,
    error = null,
    lease_until = null,
    next_attempt_at = null
  where id = r.id
  returning * into r;

  return next r;
end $$;

revoke execute on function public.resume_agent_run(uuid, text) from public;
revoke execute on function public.resume_agent_run(uuid, text) from anon;
grant execute on function public.resume_agent_run(uuid, text) to authenticated;

-- Mission outcomes need to distinguish a mixed result from a clean review, and a user stop from a
-- failure. PostgreSQL enum additions are additive and keep every existing value untouched.
alter type public.mission_status add value if not exists 'partial';
alter type public.mission_status add value if not exists 'cancelled';

-- One generated project represents at most one portfolio product for an owner. This turns the
-- existing optional apps.project_id bridge into a dependable lifecycle identity.
create unique index if not exists uq_apps_owner_project
  on public.apps(owner_id, project_id)
  where project_id is not null;

-- ======== supabase/migrations/app_0101_email_shot_wiring.sql ========
-- app_0101_email_shot_wiring.sql — SHOW the site in the pitch, don't just link it.
-- The outreach loop already had every piece EXCEPT the wiring: shot-worker can screenshot the
-- email-shot render of a preview site, but nothing called it and the result was never stored, and
-- send-email derived its HTML from plain text (so a real <img> could never ride in the body). These
-- two additive columns close both gaps:
--   * preview_sites.screenshot_url — the hosted PNG of the generated site (the hero of the email).
--     Persisted so the operator UI can show it, it can be reused on re-send, and a rebuild refreshes
--     it. NULL when no screenshot could be produced (SCREENSHOT_API_KEY unset / API error) — the
--     pitch then falls back to the honest text+link email; we never fabricate or break an image.
--   * outreach_messages.body_html — an optional custom HTML body (the screenshot pitch). When set,
--     send-email sends it verbatim (+ an HTML CAN-SPAM footer); when NULL, send-email keeps deriving
--     HTML from body_text exactly as before. No behaviour changes for any existing message.
-- Both columns are nullable and additive; re-running is safe.

alter table public.preview_sites   add column if not exists screenshot_url text;
alter table public.outreach_messages add column if not exists body_html text;

-- ======== supabase/migrations/20260708120000_garvis_worker.sql ========
-- GARVIS WORKER — the unattended, server-side runner for agent_runs (the "runs while your laptop
-- is closed" upgrade the client runtime documented as its follow-up).
--
--   * claim_next_agent_run_service(): like claim_next_agent_run() but for the PLATFORM worker —
--     claims the next runnable run across ALL owners (each run still executes scoped to its
--     owner_id; credits are checked/charged per owner per step). Service-role only.
--   * Schedule: pg_cron + pg_net tick every 2 minutes (setup block at the bottom — requires the
--     extensions to be enabled on the project and the two secrets filled in).

create or replace function public.claim_next_agent_run_service() returns setof public.agent_runs
language plpgsql security definer set search_path = public as $$
declare r public.agent_runs;
begin
  select * into r from agent_runs
  where status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update agent_runs set
    status = 'running',
    lease_until = now() + interval '10 minutes',
    started_at = coalesce(started_at, now())
  where id = r.id
  returning * into r;
  return next r;
end $$;

-- The whole point is that ONLY the platform worker (service role) may claim across owners.
revoke execute on function public.claim_next_agent_run_service() from public;
revoke execute on function public.claim_next_agent_run_service() from anon;
revoke execute on function public.claim_next_agent_run_service() from authenticated;
grant execute on function public.claim_next_agent_run_service() to service_role;

-- ============================================================
-- OPTIONAL: true laptop-closed autonomy — a cron tick that pokes the worker.
-- Requires: Dashboard → Database → Extensions → enable pg_cron AND pg_net.
-- Then run (SQL editor), filling in your project ref + the WORKER_SECRET you set
-- with `supabase secrets set WORKER_SECRET=...`:
--
--   select cron.schedule(
--     'garvis-worker-tick',
--     '*/2 * * * *',
--     $cron$
--     select net.http_post(
--       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/garvis-worker',
--       headers := jsonb_build_object('x-worker-secret', 'YOUR_WORKER_SECRET', 'content-type', 'application/json'),
--       body := '{}'::jsonb
--     );
--     $cron$
--   );
--
-- To stop: select cron.unschedule('garvis-worker-tick');
-- ============================================================
