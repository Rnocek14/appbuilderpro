-- app_0045_watchdog_heartbeat.sql — the heartbeat grows two organs and fixes one defect.
--
-- NEW JOBS (recreates garvis_arm_heartbeat with FIVE jobs — re-run the arm call to pick them up;
-- cron.schedule upserts by name, so re-arming replaces, never duplicates):
--   garvis-ads-watch-daily   10:15 UTC daily → ads-watch: refreshes ad metrics through the one
--                            sync path, judges YESTERDAY vs a 7-day baseline with the VERIFIED
--                            detection core, and pushes findings (spend spikes, stopped
--                            campaigns, CTR collapse, CPC spikes) with their arithmetic.
--                            Detection only — never mutates a campaign.
--   garvis-reactivate-monthly 14:00 UTC on the 1st → outreach-reactivate: stages honest check-in
--                            DRAFTS for conversations that went quiet 60–365 days ago, as
--                            PENDING approvals. Nothing sends without you.
--
-- FIX: the app_0043 tick called garvis-worker with only x-worker-secret, but that function is
-- deployed WITH platform JWT verification — the tick would 401 at the gate before the function
-- ran. garvis-worker now ships in the --no-verify-jwt deploy list (its own internal secret/JWT
-- gate remains); redeploy it via `npm run functions:deploy:webhooks`.
--
-- Arm (or re-arm) with the same one call:
--   select public.garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<shared secret>');
-- Disarm: select public.garvis_disarm_heartbeat();

create extension if not exists pg_cron;
create extension if not exists pg_net;

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

  select id into sid from vault.secrets where name = 'ff_heartbeat_base';
  if sid is null then perform vault.create_secret(base, 'ff_heartbeat_base');
  else perform vault.update_secret(sid, base); end if;
  select id into sid from vault.secrets where name = 'ff_heartbeat_secret';
  if sid is null then perform vault.create_secret(p_secret, 'ff_heartbeat_secret');
  else perform vault.update_secret(sid, p_secret); end if;

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 20000);
  $cron$);

  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $cron$);

  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  return 'armed: garvis-pulse-hourly, garvis-followups-daily, garvis-worker-tick, garvis-ads-watch-daily, garvis-reactivate-monthly';
end;
$$;

revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

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
  perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;
