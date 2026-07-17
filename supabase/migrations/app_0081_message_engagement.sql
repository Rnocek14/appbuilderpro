-- app_0081_message_engagement.sql — STOP THROWING AWAY ENGAGEMENT.
--
-- resend-webhook receives email.delivered/opened/clicked and discarded them — the operator could
-- never know a pitch was opened, and "opened 3x but silent" (the strongest follow-up trigger there
-- is) was invisible. Three timestamps + an open counter on the message row; the webhook stamps
-- them, the UI reads them. Additive + idempotent.

alter table public.outreach_messages add column if not exists delivered_at timestamptz;
alter table public.outreach_messages add column if not exists opened_at timestamptz;      -- first open
alter table public.outreach_messages add column if not exists clicked_at timestamptz;     -- first click
alter table public.outreach_messages add column if not exists open_count integer not null default 0;
