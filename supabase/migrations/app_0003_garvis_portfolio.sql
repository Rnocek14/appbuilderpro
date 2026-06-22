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
alter publication supabase_realtime add table public.apps;
alter publication supabase_realtime add table public.agent_runs;
