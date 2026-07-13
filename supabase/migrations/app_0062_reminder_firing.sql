-- app_0062_reminder_firing.sql — TIER 2 ②: reminders that FIRE.
-- Reminders previously woke only when the app was next opened. The standing-worker's 15-minute
-- tick now fires due reminders (mind_event + webhook push) exactly once — notified_at is the
-- fired-marker, so a reminder never re-alerts and an unfired one never silently expires.
alter table public.reminders add column if not exists notified_at timestamptz;
create index if not exists idx_reminders_due_fire
  on public.reminders(due_at) where done = false and notified_at is null;
