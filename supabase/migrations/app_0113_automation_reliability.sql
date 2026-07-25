-- app_0113_automation_reliability.sql
-- THE REPAIR LOOP, first slice (capability-audit 09 §failure/repair; fix directive item 2).
-- Before this, a failing automation fire was released-and-retried every 15-minute tick forever:
-- the drain's catch block swallowed the error (zero records anywhere), and each doomed attempt
-- burned the shared per-tick fire budget — a single broken trigger could starve every healthy
-- automation queued behind it (the send_sms enum bug ran exactly this loop for weeks).
--
-- The fix is a per-trigger circuit breaker, because the TRIGGER is the operationally meaningful
-- unit: a transient failure should retry (release the claim, as before), but a trigger that fails
-- repeatedly is broken and must stop consuming the fleet's budget until a human looks at it.
--   * every failure records itself (last_error / last_error_at) and increments the streak;
--   * any successful enqueue resets the streak — transient blips never accumulate;
--   * at 5 consecutive failures the worker flips status → 'paused' (already a legal status) and
--     writes a LOUD mind_event; the operator re-activates from Automations after fixing the cause.
alter table public.automation_triggers
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

comment on column public.automation_triggers.consecutive_failures is
  'Circuit breaker: successive fire failures with no success between; 5 auto-pauses the trigger. Reset to 0 on any successful enqueue.';
comment on column public.automation_triggers.last_error is
  'The most recent fire failure, verbatim — an automation must never fail silently (audit 09).';
