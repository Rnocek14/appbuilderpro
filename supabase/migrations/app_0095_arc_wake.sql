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
