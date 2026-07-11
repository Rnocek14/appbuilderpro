-- app_0046_full_heartbeat.sql — the complete heartbeat: SEVEN jobs. Recreates
-- garvis_arm_heartbeat (cron.schedule upserts by name — re-run the one arm call to pick up the
-- two new organs):
--   garvis-inbox-draft-daily   12:45 UTC daily → inbox-draft: every unanswered POSITIVE reply
--                              gets a response drafted overnight (thread-grounded; unknowable
--                              facts become visible [YOU FILL: …] holes, never inventions) and
--                              staged as a PENDING approval. The morning queue holds a ready
--                              batch; nothing sends without the owner.
--   garvis-scorecard-weekly    Sunday 22:00 UTC → garvis-scorecard: the EOS-style weekly review —
--                              this week vs last on real leading indicators (leads, visits,
--                              replies, sends, contacts, ad spend), pushed so Monday starts with
--                              judgment instead of archaeology. Empty fortnights send nothing.
--
-- Arm/re-arm:  select public.garvis_arm_heartbeat('https://<ref>.supabase.co/functions/v1', '<secret>');
-- Disarm:      select public.garvis_disarm_heartbeat();

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

  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  $cron$);

  return 'armed: pulse-hourly, followups-daily, worker-tick, ads-watch-daily, reactivate-monthly, inbox-draft-daily, scorecard-weekly';
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
  perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly');
  return 'disarmed';
exception when others then
  return 'partially disarmed (some jobs were not scheduled)';
end;
$$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;
