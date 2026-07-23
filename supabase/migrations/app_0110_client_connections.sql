-- CLIENT CONNECTIONS — the one place that answers "for THIS client, what accounts are hooked up, and
-- what's still needed?" Today a client is fragmented: billed as client_subscriptions, operated as
-- client_engagements (world + intake), with connectors scattered across missed_call_configs (voice),
-- world_sender_identities (email), preview_sites (domain/host), client_subscriptions.twilio_number (SMS),
-- and booking_pages. This migration does two things: (1) links the engagement to the billed client so a
-- client is ONE identity, and (2) adds a thin, typed index of connectors per client — one row per
-- (client, connector) with a status — so the operator's setup screen becomes a checklist. The rows POINT
-- AT the connector's own config (they don't duplicate it); status is derived by refreshing against those
-- tables. Additive + idempotent; every existing table keeps working untouched.

-- (1) One client identity: tie the operating engagement to the billed subscription. Nullable + set-null
-- so a standalone engagement (a client we operate but haven't billed) keeps working unattached.
alter table public.client_engagements add column if not exists client_subscription_id uuid
  references public.client_subscriptions(id) on delete set null;
create index if not exists idx_client_engagements_sub on public.client_engagements(client_subscription_id);

-- (2) The connector index. connector = which account/capability; status = where the hookup stands;
-- config = pointers into the connector's own table (e.g. missed_call_configs.id, world_id, booking slug),
-- never a copy of secrets; detail = a human one-liner for the checklist; error = last failure.
create table if not exists public.client_connections (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles(id) on delete cascade,
  client_subscription_id uuid not null references public.client_subscriptions(id) on delete cascade,
  connector              text not null check (connector in (
                           'domain', 'email_sender', 'sms_number', 'voice_number',
                           'booking', 'payments', 'google_business', 'calendar', 'esign')),
  status                 text not null default 'needed' check (status in (
                           'needed', 'pending', 'connected', 'error', 'not_needed')),
  config                 jsonb not null default '{}'::jsonb,
  detail                 text,
  error                  text,
  last_checked_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- One row per connector per client — the seed + refresh both upsert on this.
  unique (client_subscription_id, connector)
);
create index if not exists idx_client_connections_owner on public.client_connections(owner_id, client_subscription_id);

alter table public.client_connections enable row level security;
drop policy if exists "client_connections owner all" on public.client_connections;
create policy "client_connections owner all" on public.client_connections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
