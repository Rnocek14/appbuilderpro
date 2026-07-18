-- app_0081_outreach_events.sql — STOP THROWING AWAY THE FEEDBACK.
-- The needle audit's sharpest finding: Resend delivers opened/clicked events and resend-webhook
-- discards them (TYPE_MAP maps them, no branch stores them), so no segment, subject line, or send
-- time can ever be ranked. This table is the substrate every future analytics lens reads:
-- one row per engagement event, correlated to the message (and through it the campaign/contact/
-- batch). Writes come ONLY from service-role edge functions; owners read their own rows.

create table if not exists public.outreach_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid references public.outreach_messages(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  batch_id    uuid,          -- outreach_batches.id when the message came from a bulk drain
  kind        text not null check (kind in ('delivered','opened','clicked','bounced','complained','unsubscribed','replied')),
  meta        jsonb not null default '{}',   -- e.g. {"url": "..."} on clicked
  created_at  timestamptz not null default now()
);

create index if not exists idx_outreach_events_owner_kind on public.outreach_events(owner_id, kind, created_at desc);
create index if not exists idx_outreach_events_message on public.outreach_events(message_id);
create index if not exists idx_outreach_events_batch on public.outreach_events(batch_id) where batch_id is not null;

alter table public.outreach_events enable row level security;
drop policy if exists "events select own" on public.outreach_events;
create policy "events select own" on public.outreach_events for select using (owner_id = auth.uid());
-- no insert/update policies on purpose: only service-role edge functions write events.

-- Batch joinability: messages drained from a batch never carried the batch id, making
-- per-batch open/click stats impossible. Additive column; standing-worker stamps it.
alter table public.outreach_messages add column if not exists batch_id uuid;
create index if not exists idx_outreach_messages_batch on public.outreach_messages(batch_id) where batch_id is not null;
