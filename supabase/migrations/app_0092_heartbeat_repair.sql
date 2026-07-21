-- HEARTBEAT + STANDING-ORDER REPAIR. The July 2026 full-system scan found two regressions born
-- from parallel migration branches landing out of order:
--
--   B1: app_0089_opportunities recreated standing_orders_kind_check WITHOUT 'content_week'
--       (added by app_0088_content_week) — content weeks became un-creatable at the DB layer.
--   B2: app_0088_consolidation_tick redefined garvis_arm_heartbeat WITHOUT 'garvis-social-sync'
--       (added by app_0087_social_metrics) — social metrics stopped auto-syncing on any re-arm,
--       and app_0088 also never redefined the disarm to include consolidate-weekly.
--
-- This migration is the union of both branches, plus one hardening: every job now sends BOTH
-- x-worker-secret AND x-cron-secret (same vault secret). Before, four daily jobs sent only
-- x-cron-secret, so a CRON_SECRET env var that differed from WORKER_SECRET made them 401
-- silently into pg_net forever. With both headers, arming with WORKER_SECRET is sufficient
-- regardless of which header a function checks. Additive + idempotent; re-run the arm call
-- (or the Health page's Arm button) to pick up the 11-job schedule.

-- B1: the full kind list — the union of every kind any migration has taught standing_orders.
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt'));

-- B2: the 11-job arm — 0088's ten plus social-sync restored, dual secret headers everywhere.
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

  perform cron.schedule('garvis-pulse-hourly', '7 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-pulse', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$c$);
  perform cron.schedule('garvis-followups-daily', '0 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-followups', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-worker-tick', '*/5 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 30000);$c$);
  perform cron.schedule('garvis-ads-watch-daily', '15 10 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/ads-watch', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-reactivate-monthly', '0 14 1 * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/outreach-reactivate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-inbox-draft-daily', '45 12 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/inbox-draft', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-scorecard-weekly', '0 22 * * 0', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-scorecard', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-invoice-chase-daily', '30 13 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/invoice-chase', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-standing-tick', '*/15 * * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/standing-worker', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  perform cron.schedule('garvis-consolidate-weekly', '0 8 * * 1', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/garvis-consolidate', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 120000);$c$);
  perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret'),'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 11 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, consolidate, social-sync)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

-- Disarm covers the full 11 (0087's version missed consolidate-weekly, 0088 never redefined it).
create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick'); perform cron.unschedule('garvis-consolidate-weekly');
  perform cron.unschedule('garvis-social-sync');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;
