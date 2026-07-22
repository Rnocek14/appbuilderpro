-- SMS CHANNEL — the second delivery channel next to email. Adds the columns the send-sms path and the
-- (Slice 2) channel-aware trigger runner need: a phone + TCPA consent on the people we might text, a
-- channel tag on messages/triggers, and an SMS kill switch that is OFF by default (opt-in, exactly
-- like the email kill switch). Additive + idempotent. Nothing sends until the operator flips
-- outreach_settings.sms_enabled AND Twilio secrets are set.

-- People we might text: phone (E.164) + explicit consent (never text without it).
alter table public.contacts add column if not exists phone text;
alter table public.contacts add column if not exists phone_e164 text;
alter table public.contacts add column if not exists phone_status text not null default 'unknown'
  check (phone_status in ('unknown', 'ok', 'invalid', 'unsubscribed'));
alter table public.contacts add column if not exists sms_consent text not null default 'none'
  check (sms_consent in ('none', 'warm_transactional', 'express_written'));
alter table public.contacts add column if not exists sms_consent_at timestamptz;

-- The automation customer list also carries a phone for text reminders/review-requests.
alter table public.customers add column if not exists phone text;

-- Messages know which channel they are (body_text carries the SMS; to_address carries the E.164).
alter table public.outreach_messages add column if not exists channel text not null default 'email'
  check (channel in ('email', 'sms'));

-- A trigger can deliver by email (default) or sms.
alter table public.automation_triggers add column if not exists channel text not null default 'email'
  check (channel in ('email', 'sms'));

-- SMS kill switch + a conservative daily cap, mirroring the email outbound gate.
alter table public.outreach_settings add column if not exists sms_enabled boolean not null default false;
alter table public.outreach_settings add column if not exists sms_daily_cap integer not null default 50;

-- Fast lookup for the send path's daily-cap count.
create index if not exists idx_outreach_messages_sms_sent
  on public.outreach_messages(owner_id, sent_at) where channel = 'sms' and status = 'sent';
