-- Garvis tables for FableForge (project axqudbzrevbhwcrqacpa)
-- Self-contained + idempotent. Paste the WHOLE file into the Supabase SQL editor and Run.

-- ===== prerequisites (safe re-create; no-ops if they already exist) =====
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;


-- ============================================================
-- migrations/app_0003_garvis_portfolio.sql
-- ============================================================
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
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='apps') then
    alter publication supabase_realtime add table public.apps; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_runs') then
    alter publication supabase_realtime add table public.agent_runs; end if;
end $$;


-- ============================================================
-- migrations/app_0004_garvis_runtime.sql
-- ============================================================
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


-- ============================================================
-- migrations/app_0005_garvis_knowledge.sql
-- ============================================================
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
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='garvis_knowledge') then
    alter publication supabase_realtime add table public.garvis_knowledge; end if;
end $$;


-- ============================================================
-- migrations/app_0006_garvis_objective.sql
-- ============================================================
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
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='garvis_goals') then
    alter publication supabase_realtime add table public.garvis_goals; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='garvis_constraints') then
    alter publication supabase_realtime add table public.garvis_constraints; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='garvis_capabilities') then
    alter publication supabase_realtime add table public.garvis_capabilities; end if;
end $$;

