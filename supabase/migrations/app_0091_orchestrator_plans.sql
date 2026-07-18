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
