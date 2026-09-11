-- app_0144_sms_channel.sql — TEXT GARVIS, part 2 (best-in-class plan SW4.4, amended by its
-- adversarial review): the ONE conversation record gains channel provenance, and the Line
-- gains reply-rate counters.
--
--   * command_messages.channel — a texted turn is replayed into later commander prompts
--     (thread history), so its ORIGIN must ride with it: the brain can weigh an 'sms' turn
--     as arriving over a spoofable channel, and the UI can badge it. Default 'app' keeps
--     every existing row honest.
--   * garvis_line reply counters — Garvis texting back is new outbound behavior; a loop with
--     another automated sender must throttle ITSELF (12 replies/number/hour) rather than
--     burn model spend and SMS segments all night.
--
-- Additive + idempotent.

alter table public.command_messages
  add column if not exists channel text not null default 'app';

alter table public.garvis_line
  add column if not exists last_reply_at timestamptz,
  add column if not exists replies_in_hour integer not null default 0;

comment on column public.command_messages.channel is
  'Where this turn arrived from: app (default) | sms. Provenance rides into replayed prompt history.';
