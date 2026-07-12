-- app_0043_heartbeat.sql — THE HEARTBEAT: Garvis works while you sleep.
--
-- The audit's finding: proactive execution was documented but inert — the worker tick was a
-- commented-out SQL block requiring hand-editing. This replaces that with ONE-CALL ARMING:
--
--   select public.garvis_arm_heartbeat(
--     'https://<project-ref>.supabase.co/functions/v1',   -- your functions base URL
--     '<shared secret>'                                    -- SAME value as the WORKER_SECRET and
--   );                                                     --   CRON_SECRET edge secrets
--
-- That call stores the URL + secret in Vault and schedules three pg_cron jobs (upsert by name —
-- re-running re-arms safely):
--   garvis-pulse-hourly    every hour     → garvis-pulse (morning brief in the OWNER's timezone,
--                                           once a day, only when something real happened)
--   garvis-followups-daily 13:00 UTC      → outreach-followups (drafts follow-up bumps as PENDING
--                                           approvals — never sends; you approve in the queue)
--   garvis-worker-tick     every 5 min    → garvis-worker (advances queued agent runs)
--
-- HONESTY: the heartbeat only ever (a) tells the owner what's real and (b) stages drafts into the
-- approval queue. Nothing outward happens unattended — sends/deploys/spends still require approval.
-- Additive + idempotent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- When each owner last received a morning brief (garvis-pulse stamps it).
alter table public.profiles add column if not exists last_pulse_at timestamptz;

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  base text := rtrim(p_functions_base, '/');
begin
  if base is null or base = '' or p_secret is null or p_secret = '' then
    return 'Pass the functions base URL and the shared secret.';
  end if;

  -- Vault: the heartbeat's target + credential (upsert by name).
  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  -- cron.schedule upserts by job name — re-arming replaces, never duplicates.
  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$);

  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);

  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);

  return 'armed: garvis-pulse-hourly, garvis-followups-daily, garvis-worker-tick';
end;
$$;

-- Only the operator (SQL editor / service role) may arm the heartbeat — never the browser.
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

-- Disarm everything (same restriction).
create or replace function public.garvis_disarm_heartbeat()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly');
  perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;
