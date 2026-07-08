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
