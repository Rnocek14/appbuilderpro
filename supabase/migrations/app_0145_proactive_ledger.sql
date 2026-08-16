-- app_0145_proactive_ledger.sql — ONE OBSERVATION, NOTIFIED ONCE (best-in-class plan SW5.1,
-- shaped by its adversarial review). The device-local spoken ledger (proactiveRun.ts,
-- localStorage) dedupes what the DOCK volunteers; server-side nudges — the approval half-life
-- reminder now, proactive SMS next (SW5.2) — need a SERVER-authoritative twin or the same
-- observation can fire on every channel and every device. This table is the one dedupe every
-- owner-nudge path consults: unique on (owner, key, channel), so cross-CHANNEL delivery is an
-- explicit choice and repeat delivery is impossible by construction.
--
-- Additive + idempotent. Writes are service-role (the workers); owners may read their trail.

create table if not exists public.proactive_spoken (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,               -- the Observation's stable identity (proactive.ts contract)
  channel text not null,           -- 'webhook' | 'email' | 'sms' | 'dock'
  said_at timestamptz not null default now(),
  unique (owner_id, key, channel)
);

create index if not exists idx_proactive_spoken_owner on public.proactive_spoken(owner_id, said_at desc);

alter table public.proactive_spoken enable row level security;
drop policy if exists "proactive_spoken owner read" on public.proactive_spoken;
create policy "proactive_spoken owner read" on public.proactive_spoken
  for select using (owner_id = auth.uid());
