-- app_0079_standing_orders_client_hunt.sql — let the daily client hunt EXIST.
--
-- app_0072 built the hunt's lead pool and standing-worker carries a complete client_hunt branch,
-- but standing_orders' kind check (app_0059) was never widened past ('watch_url','cadence_digest')
-- — so createClientHuntOrder's insert (standingRun.ts) was rejected by Postgres 100% of the time
-- and "Turn on daily hunt" could never work. This is the one-line unlock.
--
-- Additive + idempotent: drop-if-exists then re-add with the full kind list.

alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt'));
