-- MISSED-CALL TEXT-BACK — auto-text a caller the business missed, within seconds. The config row IS the
-- pre-authorization: the operator sets a fixed transactional template + numbers once, and each missed
-- call auto-sends that exact template to the person who JUST called (caller-initiated, a single reply).
-- The Twilio Voice webhook (voice-inbound) rings the business's real line, and if it isn't answered,
-- texts the caller back. Additive + idempotent. Nothing rings or texts until the operator sets Twilio
-- secrets, points a Twilio number's Voice webhook at voice-inbound, and flips a config to enabled.

create table if not exists public.missed_call_configs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  label         text,                                   -- operator-facing name (e.g. the client business)
  twilio_number text not null,                          -- the Twilio number that receives calls (E.164)
  forward_to    text not null,                          -- the business's real line to ring first (E.164)
  template      text not null default 'Sorry we missed your call — how can we help? Reply here and we’ll get right back to you!',
  business_name text,                                   -- fills {business} in the template
  ring_seconds  integer not null default 20 check (ring_seconds between 5 and 60),
  enabled       boolean not null default false,         -- opt-in, exactly like every other send switch
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- The inbound webhook looks a config up by the CALLED number, so a Twilio number maps to exactly one
-- config globally (not just per owner) — otherwise two owners could claim the same number.
create unique index if not exists uq_missed_call_twilio on public.missed_call_configs(twilio_number);
create index if not exists idx_missed_call_configs_owner on public.missed_call_configs(owner_id, created_at desc);

-- The honest ledger: every inbound call + whether we texted back, for the ROI report and debugging.
create table if not exists public.missed_call_events (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  config_id    uuid references public.missed_call_configs(id) on delete set null,
  call_sid     text,
  from_number  text,
  to_number    text,
  dial_status  text,                                    -- completed / no-answer / busy / failed / canceled
  texted_back  boolean not null default false,
  message_sid  text,                                    -- the Twilio SMS sid when we texted back
  note         text,                                    -- why we didn't text (opted out, disabled, etc.)
  created_at   timestamptz not null default now()
);
create index if not exists idx_missed_call_events_owner on public.missed_call_events(owner_id, created_at desc);
create index if not exists idx_missed_call_events_config on public.missed_call_events(config_id, created_at desc);

alter table public.missed_call_configs enable row level security;
drop policy if exists "missed_call_configs owner all" on public.missed_call_configs;
create policy "missed_call_configs owner all" on public.missed_call_configs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Events are written by the service-role webhook and read by the owner (never written from the client).
alter table public.missed_call_events enable row level security;
drop policy if exists "missed_call_events owner read" on public.missed_call_events;
create policy "missed_call_events owner read" on public.missed_call_events
  for select using (owner_id = auth.uid());
