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
alter publication supabase_realtime add table public.garvis_goals;
alter publication supabase_realtime add table public.garvis_constraints;
alter publication supabase_realtime add table public.garvis_capabilities;
