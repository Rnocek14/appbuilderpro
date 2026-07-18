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
