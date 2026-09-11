-- app_0161_replies_dedupe.sql — ONE REPLY, ONCE. Replies now arrive through resend-webhook
-- (Resend "Receiving", at-least-once delivery with retries from 5 s to 10 h). resend-inbound
-- classifies (a model spend), inserts the reply, stops the sequence, and notifies — with no
-- idempotency key, a redelivery would land the same reply twice in the Queue and charge twice.
-- The inbound mail's own Message-ID is the key: stored on the reply, unique per owner where
-- present; resend-inbound checks it BEFORE classification and answers "duplicate" instead.
alter table public.replies add column if not exists provider_message_id text;
create unique index if not exists replies_owner_provider_message_id_key
  on public.replies(owner_id, provider_message_id) where provider_message_id is not null;
