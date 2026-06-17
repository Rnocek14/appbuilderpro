-- ============================================================
-- FableForge — Supabase schema v1.0
-- Run with: supabase db push   (or paste into SQL editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type user_role as enum ('user', 'admin');
create type plan_tier as enum ('free', 'pro');
create type generation_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type generation_stage as enum (
  'interpret', 'blueprint', 'schema', 'file_tree', 'frontend',
  'backend', 'auth_logic', 'styling', 'validate', 'fix', 'summarize'
);
create type deployment_status as enum ('pending', 'building', 'live', 'failed');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role user_role not null default 'user',
  plan plan_tier not null default 'free',
  monthly_generation_limit int not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- admin check used by policies (security definer avoids RLS recursion)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  template_slug text,
  status text not null default 'draft', -- draft | generating | ready | error
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_projects_owner on public.projects(owner_id) where deleted_at is null;
create index idx_projects_name_search on public.projects using gin (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- ---------- app blueprints ----------
create table public.app_blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null default 1,
  app_name text not null,
  description text,
  user_roles jsonb not null default '[]',
  database_schema jsonb not null default '{}',
  pages jsonb not null default '[]',
  components jsonb not null default '[]',
  auth_rules jsonb not null default '{}',
  workflows jsonb not null default '[]',
  integrations jsonb not null default '[]',
  deployment_notes text,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create index idx_blueprints_project on public.app_blueprints(project_id);

-- ---------- project files ----------
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  content text not null default '',
  version int not null default 1,
  updated_by_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, path)
);
create index idx_files_project on public.project_files(project_id) where deleted_at is null;

-- version history for diffs / rollback
create table public.project_file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.project_files(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  content text not null,
  version int not null,
  generation_id uuid,
  created_at timestamptz not null default now()
);
create index idx_file_versions_file on public.project_file_versions(file_id);

-- snapshot previous content on every update
create or replace function public.snapshot_file_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.content is distinct from new.content then
    insert into public.project_file_versions (file_id, project_id, path, content, version)
    values (old.id, old.project_id, old.path, old.content, old.version);
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end; $$;

create trigger trg_snapshot_file before update on public.project_files
  for each row execute function public.snapshot_file_version();

-- ---------- generations (the agent pipeline) ----------
create table public.project_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  prompt text not null,
  kind text not null default 'create', -- create | edit | fix
  status generation_status not null default 'queued',
  current_stage generation_stage,
  stages jsonb not null default '[]', -- [{stage, status, started_at, finished_at, note}]
  summary text,
  error text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_generations_project on public.project_generations(project_id);
create index idx_generations_user on public.project_generations(user_id);
create index idx_generations_status on public.project_generations(status);

-- ---------- ai chat messages ----------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  generation_id uuid references public.project_generations(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  files_changed jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index idx_messages_project on public.ai_messages(project_id, created_at);

-- ---------- usage events ----------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  event_type text not null, -- generation | edit | preview | deploy
  provider text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_usage_user_time on public.usage_events(user_id, created_at);
create index idx_usage_time on public.usage_events(created_at);

-- monthly usage helper (for plan limits + rate limiting)
create or replace function public.generations_this_month(uid uuid)
returns int language sql security definer stable set search_path = public as $$
  select count(*)::int from public.usage_events
  where user_id = uid and event_type in ('generation', 'edit')
    and created_at >= date_trunc('month', now());
$$;

-- ---------- subscriptions (Stripe-ready) ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan plan_tier not null default 'free',
  status subscription_status not null default 'active',
  interval text check (interval in ('month', 'year')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_subs_user on public.subscriptions(user_id);

-- ---------- deployments ----------
create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target text not null check (target in ('vercel', 'netlify', 'supabase')),
  status deployment_status not null default 'pending',
  url text,
  logs text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_deployments_project on public.deployments(project_id);

-- ---------- error + audit logs ----------
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  generation_id uuid references public.project_generations(id) on delete set null,
  source text not null, -- pipeline | preview | edge | client
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);
create index idx_errors_time on public.error_logs(created_at);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,        -- project.create, file.update, user.plan_change ...
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_time on public.audit_logs(created_at);
create index idx_audit_actor on public.audit_logs(actor_id);

-- ---------- global settings (admin-configurable models etc.) ----------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('default_model', '{"provider": "anthropic", "model": "claude-sonnet-4-6"}'),
  ('free_plan_limits', '{"generations_per_month": 10, "projects": 3}'),
  ('pro_plan_limits', '{"generations_per_month": 500, "projects": 100}');

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.app_blueprints enable row level security;
alter table public.project_files enable row level security;
alter table public.project_file_versions enable row level security;
alter table public.project_generations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.deployments enable row level security;
alter table public.error_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;

-- profiles
create policy "read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and plan = (select plan from public.profiles where id = auth.uid())
    and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid())
  );
create policy "admin update any profile" on public.profiles for update using (public.is_admin());

-- ownership helper
create or replace function public.owns_project(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and owner_id = auth.uid());
$$;

-- projects
create policy "owner select projects" on public.projects for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "owner insert projects" on public.projects for insert
  with check (owner_id = auth.uid());
create policy "owner update projects" on public.projects for update
  using (owner_id = auth.uid() or public.is_admin());
create policy "owner delete projects" on public.projects for delete
  using (owner_id = auth.uid() or public.is_admin());

-- blueprints / files / versions / generations / messages: scoped by project ownership
create policy "project scope select" on public.app_blueprints for select using (public.owns_project(project_id) or public.is_admin());
create policy "project scope write" on public.app_blueprints for insert with check (public.owns_project(project_id));

create policy "files select" on public.project_files for select using (public.owns_project(project_id) or public.is_admin());
create policy "files insert" on public.project_files for insert with check (public.owns_project(project_id));
create policy "files update" on public.project_files for update using (public.owns_project(project_id));
create policy "files delete" on public.project_files for delete using (public.owns_project(project_id));

create policy "versions select" on public.project_file_versions for select using (public.owns_project(project_id) or public.is_admin());

create policy "gen select" on public.project_generations for select using (user_id = auth.uid() or public.is_admin());
create policy "gen insert" on public.project_generations for insert with check (user_id = auth.uid() and public.owns_project(project_id));
create policy "gen update own" on public.project_generations for update using (user_id = auth.uid() or public.is_admin());

create policy "msg select" on public.ai_messages for select using (user_id = auth.uid() or public.is_admin());
create policy "msg insert" on public.ai_messages for insert with check (user_id = auth.uid() and public.owns_project(project_id));

-- usage: users read own, only service role writes (edge functions)
create policy "usage select own" on public.usage_events for select using (user_id = auth.uid() or public.is_admin());

-- subscriptions: read own; writes via service role (Stripe webhook)
create policy "subs select own" on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());

-- deployments
create policy "deploy select" on public.deployments for select using (user_id = auth.uid() or public.is_admin());
create policy "deploy insert" on public.deployments for insert with check (user_id = auth.uid() and public.owns_project(project_id));
create policy "deploy update" on public.deployments for update using (user_id = auth.uid() or public.is_admin());

-- logs: admin read; error inserts allowed from authed clients for their own context
create policy "errors insert own" on public.error_logs for insert with check (user_id = auth.uid() or user_id is null);
create policy "errors admin read" on public.error_logs for select using (public.is_admin());
create policy "audit admin read" on public.audit_logs for select using (public.is_admin());
create policy "audit insert own" on public.audit_logs for insert with check (actor_id = auth.uid());

-- settings: everyone reads, admin writes
create policy "settings read" on public.platform_settings for select using (auth.role() = 'authenticated');
create policy "settings admin write" on public.platform_settings for update using (public.is_admin());

-- ============================================================
-- STORAGE — project assets bucket
-- ============================================================
insert into storage.buckets (id, name, public) values ('project-assets', 'project-assets', false)
  on conflict (id) do nothing;

create policy "assets owner all" on storage.objects for all
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- REALTIME — stream generation + file changes to the workspace
-- ============================================================
alter publication supabase_realtime add table public.project_generations;
alter publication supabase_realtime add table public.project_files;
alter publication supabase_realtime add table public.ai_messages;
