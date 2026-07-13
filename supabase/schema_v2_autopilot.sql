-- supabase/schema_v2_autopilot.sql
-- Autopilot: background job queue with checkpointing, budget guards,
-- approval questions, project memory, and webhook notifications.
-- Apply AFTER schema.sql:  supabase db push  (or paste into the SQL editor).

-- ---------- security hardening (upgrade for existing installs) ----------
-- Close a privilege-escalation hole: users could previously update their own
-- plan / generation limit directly. role was already protected.
-- Recreate the profile-update policy pinning every privileged column. CRITICAL (deep scan P1): this
-- file is loose and re-runnable, and it used to omit the credits pins app_0017 added — re-applying
-- it silently reopened "set your own credits to 999999". It now pins credits WHEN the column exists
-- (this file may be applied before app_0017 adds them), so re-running it is always safe.
do $$
begin
  drop policy if exists "update own profile" on public.profiles;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'credits_balance') then
    execute $p$create policy "update own profile" on public.profiles for update using (id = auth.uid())
      with check (id = auth.uid()
        and role = (select role from public.profiles where id = auth.uid())
        and plan = (select plan from public.profiles where id = auth.uid())
        and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid())
        and credits_balance = (select credits_balance from public.profiles where id = auth.uid())
        and credits_period_start = (select credits_period_start from public.profiles where id = auth.uid()))$p$;
  else
    execute $p$create policy "update own profile" on public.profiles for update using (id = auth.uid())
      with check (id = auth.uid()
        and role = (select role from public.profiles where id = auth.uid())
        and plan = (select plan from public.profiles where id = auth.uid())
        and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid()))$p$;
  end if;
end $$;

-- ---------- jobs (background build queue) ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  brief text not null,                  -- the product brief the agent executes
  status text not null default 'queued', -- queued | running | waiting_approval | paused | completed | failed | cancelled
  priority int not null default 0,       -- higher runs first
  phase text not null default 'decompose', -- decompose | build | validate | fix | report
  milestone_index int not null default 0,
  fix_attempts int not null default 0,
  budget_usd numeric not null default 2.00,  -- hard spend cap for the whole job
  spent_usd numeric not null default 0,
  max_fix_attempts int not null default 2,
  pause_reason text,
  report jsonb,                          -- { summary, built[], concerns[], skipped[] }
  lease_until timestamptz,               -- worker lock (stale leases are reclaimed)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_jobs_owner on public.jobs(owner_id);
create index idx_jobs_runnable on public.jobs(priority desc, created_at)
  where status in ('queued', 'running');

create table public.job_milestones (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  position int not null,
  title text not null,
  description text not null default '',
  status text not null default 'pending', -- pending | building | done | done_with_warnings | skipped
  summary text,
  warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_milestones_job on public.job_milestones(job_id, position);

-- ---------- approval inbox ----------
create table public.agent_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  context text,
  options jsonb not null default '[]',   -- suggested answers, free text always allowed
  blocking boolean not null default true,
  answer text,
  status text not null default 'pending', -- pending | answered | skipped
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index idx_questions_owner_pending on public.agent_questions(owner_id) where status = 'pending';
create index idx_questions_job on public.agent_questions(job_id);

-- When the last blocking question for a waiting job is answered, requeue the job.
create or replace function public.requeue_on_answer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('answered', 'skipped') and old.status = 'pending' then
    new.answered_at := now();
    if not exists (
      select 1 from agent_questions
      where job_id = new.job_id and blocking and status = 'pending' and id <> new.id
    ) then
      update jobs set status = 'queued', updated_at = now()
      where id = new.job_id and status = 'waiting_approval';
    end if;
  end if;
  return new;
end $$;
create trigger trg_requeue_on_answer before update on public.agent_questions
  for each row execute function public.requeue_on_answer();

-- ---------- project memory (keeps long runs coherent) ----------
create table public.project_memory (
  project_id uuid primary key references public.projects(id) on delete cascade,
  conventions text not null default '',  -- naming, styling, structure decisions
  decisions jsonb not null default '[]', -- [{decision, reason, at}]
  updated_at timestamptz not null default now()
);

-- ---------- webhook notifications ----------
alter table public.profiles add column if not exists webhook_url text;

-- ---------- atomic job claim for the worker ----------
create or replace function public.claim_next_job() returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from jobs
  where status in ('queued', 'running')
    and (lease_until is null or lease_until < now())
  order by priority desc, created_at
  limit 1
  for update skip locked;
  if not found then return; end if;
  update jobs set status = 'running',
    lease_until = now() + interval '10 minutes',
    updated_at = now()
  where id = j.id
  returning * into j;
  return next j;
end $$;
-- Only the service role (worker) should call this:
revoke execute on function public.claim_next_job() from anon, authenticated;

-- ---------- RLS ----------
alter table public.jobs enable row level security;
alter table public.job_milestones enable row level security;
alter table public.agent_questions enable row level security;
alter table public.project_memory enable row level security;

create policy "jobs owner all" on public.jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "jobs admin read" on public.jobs for select using (public.is_admin());

create policy "milestones via job" on public.job_milestones
  for select using (exists (select 1 from jobs where jobs.id = job_id and jobs.owner_id = auth.uid()));

create policy "questions owner read" on public.agent_questions
  for select using (owner_id = auth.uid());
create policy "questions owner answer" on public.agent_questions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "memory via project" on public.project_memory
  for select using (public.owns_project(project_id));

-- ---------- realtime ----------
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.job_milestones;
alter publication supabase_realtime add table public.agent_questions;

-- ---------- background ticking (optional but recommended) ----------
-- The job-worker edge function self-chains while work remains, and the app
-- tickles it when you're online. For true "builds while the laptop is closed"
-- autonomy, add a cron tick (Dashboard -> Database -> Extensions: enable
-- pg_cron + pg_net, then run — replace PROJECT_REF and SERVICE_ROLE_KEY):
--
-- select cron.schedule('fableforge-job-tick', '* * * * *', $cron$
--   select net.http_post(
--     url := 'https://PROJECT_REF.supabase.co/functions/v1/job-worker',
--     headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body := '{"source": "cron"}'::jsonb
--   );
-- $cron$);
