-- app_0080_standing_orders_idea_stream.sql — allow the idea_stream standing-order kind.
--
-- THE BUG THIS FIXES: the Idea Board's Auto-ideas toggle (IdeaBoard.tsx → createOrder with
-- kind 'idea_stream') has been rejected by Postgres on EVERY click since N2 shipped — the
-- standing-worker branch, the UI, and standingCore all know the kind, but the check constraint
-- (last widened in app_0079) never learned it. Same pattern as app_0079: drop + re-add.
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream'));
