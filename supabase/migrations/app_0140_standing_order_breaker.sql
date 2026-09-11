-- app_0140_standing_order_breaker.sql — THE CLOCK STOPS FAILING SILENTLY. A standing order
-- that threw just skipped to its next slot, forever: a hunt pointed at a dead URL burned its
-- slot every day with nothing anywhere the operator would see. This gives standing_orders the
-- same circuit breaker automation_triggers earned in app_0113: the worker counts straight
-- failures (success resets), and at 5 the order pauses ITSELF with the reason on the row, a
-- mind_event for the waking moment, and a webhook nudge. Resuming clears the streak — trying
-- again is a fresh start. The limit lives in _shared/standingCore.ts (ORDER_BREAKER_LIMIT,
-- verified by standing.verify.ts); the sweep runs at the end of every worker tick.
--
-- Additive + idempotent; existing rows read as "no failures yet".

alter table public.standing_orders
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

comment on column public.standing_orders.consecutive_failures is
  'Straight unreachable runs since the last success; at ORDER_BREAKER_LIMIT (standingCore.ts) the worker flips status to paused with the reason in last_error.';
