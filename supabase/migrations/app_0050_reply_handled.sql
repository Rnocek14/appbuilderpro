-- app_0050_reply_handled.sql — replies get a HANDLED state (additive, idempotent).
--
-- The flow audit found the Inbox badge couldn't honestly count replies: without a handled state,
-- a counted reply never stops counting. handled_at closes the loop — set when the owner queues an
-- answer (or marks it done), cleared never. The row itself is permanent record; only the "needs
-- you" signal retires.

alter table public.replies add column if not exists handled_at timestamptz;

comment on column public.replies.handled_at is
  'When the owner answered/dismissed this reply. Null = still waiting in the Inbox lane + badge.';

create index if not exists replies_unhandled_idx on public.replies (owner_id) where handled_at is null;
