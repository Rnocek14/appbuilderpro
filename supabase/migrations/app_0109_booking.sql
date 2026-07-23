-- ONLINE BOOKING — the foundation of the AI-receptionist pillar: a business's bookable services, its
-- weekly availability, and the appointments customers claim. A public booking page (served by the
-- `booking` edge function with the service role, keyed by slug) lets a customer pick a service + an
-- open slot and book it; confirmations + reminders ride the existing send paths. The receptionist
-- agent (a later slice) books through the SAME tables, so there is one source of truth for the calendar.
--
-- Timezone: v1 stores a fixed UTC offset per page (utc_offset_min), not a named zone — exact and pure to
-- reason about, at the cost of not auto-handling a DST change. Named-zone + DST is a later upgrade.
-- Double-booking is prevented at the DATABASE with a gist exclusion constraint, so two customers racing
-- for the same slot can never both win. Additive + idempotent. Owner-scoped RLS; the public page never
-- reads these tables directly — it goes through the edge function.

create extension if not exists btree_gist;

-- One public booking page per business (per operator, optionally tied to a paying client).
create table if not exists public.booking_pages (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  client_subscription_id uuid references public.client_subscriptions(id) on delete set null,
  slug                  text not null,                       -- public URL key (/book/:slug)
  business_name         text not null,
  utc_offset_min        integer not null default 0,          -- local = UTC + this (e.g. US Central DST = -300)
  hours                 jsonb not null default '[]'::jsonb,  -- [{dow:0-6 (0=Sun), start:"09:00", end:"17:00"}]
  slot_min              integer not null default 30 check (slot_min between 5 and 240),
  min_notice_min        integer not null default 120 check (min_notice_min >= 0),   -- earliest bookable = now + this
  max_advance_days      integer not null default 30 check (max_advance_days between 1 and 365),
  confirm_channel       text not null default 'email' check (confirm_channel in ('email','sms','both')),
  enabled               boolean not null default false,      -- opt-in, like every other public surface
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- A slug maps to exactly one page globally (the public route resolves by slug alone).
create unique index if not exists uq_booking_pages_slug on public.booking_pages(slug);
create index if not exists idx_booking_pages_owner on public.booking_pages(owner_id, created_at desc);
create index if not exists idx_booking_pages_client on public.booking_pages(client_subscription_id);

-- The services a page offers for booking.
create table if not exists public.booking_services (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.booking_pages(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  duration_min integer not null default 60 check (duration_min between 5 and 480),
  buffer_min   integer not null default 0 check (buffer_min between 0 and 120),   -- padding after, kept free
  price_cents  integer,                                     -- ONLY when the operator states it; null = "ask"
  active       boolean not null default true,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_booking_services_page on public.booking_services(page_id, sort);

-- The claimed slots. `confirmed` rows can never overlap on a page (gist exclusion) — the real,
-- race-proof double-booking guard. Cancelled rows free the slot again.
create table if not exists public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  page_id               uuid not null references public.booking_pages(id) on delete cascade,
  service_id            uuid references public.booking_services(id) on delete set null,
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  client_subscription_id uuid references public.client_subscriptions(id) on delete set null,
  customer_name         text not null,
  customer_email        text,
  customer_phone        text,
  service_name          text,                                -- snapshot, survives a service rename/delete
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  status                text not null default 'confirmed' check (status in ('confirmed','canceled','completed','no_show')),
  source                text not null default 'booking_page' check (source in ('booking_page','receptionist','manual')),
  notes                 text,
  confirm_sent          boolean not null default false,
  reminder_sent         boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint appointments_time_valid check (ends_at > starts_at),
  -- No two CONFIRMED appointments on the same page may overlap. Cancelled/completed are excluded, so a
  -- freed slot is bookable again. This is the atomic slot claim — enforced by the DB, not by app logic.
  constraint appointments_no_overlap exclude using gist (
    page_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmed')
);
create index if not exists idx_appointments_page_time on public.appointments(page_id, starts_at);
create index if not exists idx_appointments_owner on public.appointments(owner_id, starts_at desc);
create index if not exists idx_appointments_reminders on public.appointments(starts_at)
  where status = 'confirmed' and reminder_sent = false;

-- RLS: the operator manages their own pages/services/appointments in-app. The PUBLIC booking page never
-- touches these tables directly — the `booking` edge function reads/writes with the service role, keyed
-- by slug + enabled — so there is no public policy to leak rows.
alter table public.booking_pages enable row level security;
drop policy if exists "booking_pages owner all" on public.booking_pages;
create policy "booking_pages owner all" on public.booking_pages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.booking_services enable row level security;
drop policy if exists "booking_services owner all" on public.booking_services;
create policy "booking_services owner all" on public.booking_services
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.appointments enable row level security;
drop policy if exists "appointments owner all" on public.appointments;
create policy "appointments owner all" on public.appointments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
