-- app_0059_standing_orders.sql — THE CLOCK: standing orders (watchers & schedules).
--
-- The capability the objective stress test ranked #1-missing: nothing in Garvis had a sense of
-- time. A standing order is a small honest promise — "check this page and tell me when it changes"
-- (watch_url), "give me a digest of this world every week" (cadence_digest) — executed by the
-- standing-worker edge function on the heartbeat.
--
-- HONESTY RULES (enforced by _shared/standingCore.ts, verified in standing.verify.ts):
--   * A failed fetch reports UNREACHABLE — never "no change". First sight is a baseline, never a
--     "change". Markup noise (nonces, whitespace) is not a change.
--   * Orders only READ and RECORD: findings land as mind_events (the waking moment) and shelf
--     records. An order never sends, posts, or spends — anything outward still goes through
--     Approvals like everything else.
--   * Digest numbers are counted from real rows (seeds excluded) — never composed by a model.
--
-- Additive + idempotent. Re-run the one arm call (garvis_arm_heartbeat) to pick up the new tick.

-- 1) The orders themselves --------------------------------------------------------------------
create table if not exists public.standing_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  world_id uuid references public.knowledge_worlds(id) on delete cascade,
  kind text not null check (kind in ('watch_url', 'cadence_digest')),
  label text not null,
  cadence text not null check (cadence in ('hourly', 'daily', 'weekly')),
  config jsonb not null default '{}'::jsonb,       -- watch_url: { url } · cadence_digest: { note? }
  status text not null default 'active' check (status in ('active', 'paused')),
  anchor_at timestamptz not null default now(),    -- the schedule grid origin (drift-free stepping)
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_result jsonb,                               -- the WatchResult of the last run (its honest line)
  last_hash text,                                  -- content identity after the last successful fetch
  last_text text,                                  -- normalized content (capped) for change excerpts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.standing_orders enable row level security;
drop policy if exists "standing_orders owner all" on public.standing_orders;
create policy "standing_orders owner all" on public.standing_orders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_standing_orders_due on public.standing_orders(status, next_run_at);
create index if not exists idx_standing_orders_owner on public.standing_orders(owner_id, created_at desc);

-- 2) Heartbeat v4 — NINE jobs (+ garvis-standing-tick). Re-run the one arm call to pick it up. ---
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

  return 'armed: 9 jobs (pulse, followups, worker, ads-watch, reactivate, inbox-draft, scorecard, invoice-chase, standing-tick)';
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
  perform cron.unschedule('garvis-standing-tick');
  return 'disarmed';
exception when others then return 'partially disarmed (some jobs were not scheduled)';
end; $$;
revoke all on function public.garvis_disarm_heartbeat() from public;
revoke all on function public.garvis_disarm_heartbeat() from anon;
revoke all on function public.garvis_disarm_heartbeat() from authenticated;
