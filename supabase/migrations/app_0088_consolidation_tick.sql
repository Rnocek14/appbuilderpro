-- The consolidation tick: schedules garvis-consolidate (mind_events → PROPOSED lessons through
-- the existing garvis_knowledge approval gate) weekly, Monday 08:00 UTC — judgment forms at the
-- start of the week, from the record of the last one.
--
-- Redefines garvis_arm_heartbeat with the 10th job. Additive + idempotent: re-run the one arm
-- call (or the Health page's Arm button) to pick up the new tick.

create or replace function public.garvis_arm_heartbeat(p_functions_base text, p_secret text)
returns text
language plpgsql security definer set search_path = public
as $$
declare sid uuid; base text := rtrim(p_functions_base, '/');
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

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-consolidate-weekly', '0 8 * * 1', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-consolidate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000);$c$);

  return 'armed: 10 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
