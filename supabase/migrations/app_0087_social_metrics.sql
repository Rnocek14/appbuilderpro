-- app_0087_social_metrics.sql — THE MACHINE READS ITS OWN POSTS.
-- The audit's distribution gap, closing from the read side now: Garvis posted to social and never
-- looked back — zero calls fetched performance, so "did that post work?" had no answer anywhere.
-- This is the storage half (level-10 Spec 3 Phase 2, renumbered): one row per (post, platform),
-- written ONLY by the social-sync edge function from Ayrshare's analytics API. Every metric is
-- nullable — an absent metric stays NULL, never a fake 0 — and the raw provider object is kept
-- verbatim so per-platform field-name corrections never lose data. Owner-read RLS, service-role
-- writes (the ad_metrics pattern, app_0038).

create table if not exists public.social_post_metrics (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  post_id      uuid not null references public.social_posts(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  platform     text not null,
  likes        integer,
  comments     integer,
  shares       integer,
  impressions  integer,
  video_views  integer,
  saves        integer,
  clicks       integer,
  engagement   integer,
  raw          jsonb not null default '{}',
  synced_at    timestamptz not null default now(),
  unique (post_id, platform)
);
alter table public.social_post_metrics enable row level security;
drop policy if exists "social_post_metrics owner read" on public.social_post_metrics;
create policy "social_post_metrics owner read" on public.social_post_metrics
  for select using (owner_id = auth.uid());
-- Writes arrive only via the social-sync edge function (service role).
create index if not exists idx_social_metrics_owner on public.social_post_metrics(owner_id, synced_at desc);
create index if not exists idx_social_metrics_world on public.social_post_metrics(world_id, synced_at desc);

alter table public.social_posts add column if not exists last_synced_at timestamptz;

-- Heartbeat v5: + garvis-social-sync (every 6 hours). Re-creating arm/disarm is the established
-- upgrade path (v4 did the same); an ALREADY-ARMED install gains the job immediately via the
-- conditional block below, a fresh install gets it when the owner arms.
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
  perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);

  return 'armed: 10 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick, social-sync)';
end; $$;
revoke all on function public.garvis_arm_heartbeat(text, text) from public;
revoke all on function public.garvis_arm_heartbeat(text, text) from anon;
revoke all on function public.garvis_arm_heartbeat(text, text) from authenticated;

create or replace function public.garvis_disarm_heartbeat()
returns text language plpgsql security definer set search_path = public
as $$
begin
  perform cron.unschedule('garvis-pulse-hourly'); perform cron.unschedule('garvis-followups-daily');
  perform cron.unschedule('garvis-worker-tick'); perform cron.unschedule('garvis-ads-watch-daily');
  perform cron.unschedule('garvis-reactivate-monthly'); perform cron.unschedule('garvis-inbox-draft-daily');
  perform cron.unschedule('garvis-scorecard-weekly'); perform cron.unschedule('garvis-invoice-chase-daily');
  perform cron.unschedule('garvis-standing-tick'); perform cron.unschedule('garvis-social-sync');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;

-- An already-armed heartbeat gains the new job NOW (fresh installs get it via arm above).
do $$
begin
  if exists (select 1 from vault.secrets where name = 'ff_heartbeat_base') then
    perform cron.schedule('garvis-social-sync', '20 */6 * * *', $c$select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_base') || '/social-sync', headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'ff_heartbeat_secret')), body := '{}'::jsonb, timeout_milliseconds := 60000);$c$);
  end if;
exception when others then null; -- pg_cron/vault absent on this install → the arm call adds it later
end $$;
