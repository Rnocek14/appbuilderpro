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
