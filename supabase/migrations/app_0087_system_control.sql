-- System control: make "is the brain actually on?" a queryable fact instead of tribal knowledge.
--
-- The entire unattended layer hangs off 9 pg_cron jobs armed by garvis_arm_heartbeat() — a call
-- that lives only in a migration comment, so whether it ever ran is invisible from the app. This
-- migration adds one read-only helper so the system-control edge function (and the Health page)
-- can report the truth: which garvis cron jobs exist and their schedules.
--
-- Security: definer function, revoked from public — reachable only by the service role (the
-- system-control function), never by browser clients. It reads cron.job (pg_cron's catalog),
-- filtered to this system's own jobs, and returns names/schedules only — no command bodies
-- (they embed vault-decrypted secrets in SQL text).
--
-- Apply once in the Supabase SQL editor (or supabase db push). Safe to re-run.

create or replace function public.garvis_cron_status()
returns table (jobname text, schedule text, active boolean)
language sql security definer set search_path = public
as $$
  select j.jobname::text, j.schedule::text, j.active
  from cron.job j
  where j.jobname like 'garvis-%'
  order by j.jobname;
$$;

revoke all on function public.garvis_cron_status() from public;
