-- app_0143_garvis_line.sql — THE GARVIS LINE, part 1: identity binding (best-in-class plan
-- SW4.3). Before Garvis will ever answer a text (SW4.4) or send one first (SW5.2), the number
-- must be PROVEN to be the operator's own: a 6-digit code is texted to the phone and confirmed
-- in-app. One row per owner, one owner per phone (a number cannot be bound twice), and the
-- code hash is peppered server-side so even the row's owner cannot brute-force a code for a
-- phone they don't hold (the exact spoof the binding exists to prevent).
--
-- WRITES ARE SERVICE-ROLE ONLY (the garvis-line function): verified_at is unforgeable by
-- construction. The owner may READ their binding state and DELETE it (unbinding is always
-- theirs); proactive_enabled flips only through the function, and only while verified.
--
-- Additive + idempotent.

create table if not exists public.garvis_line (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null unique,
  verify_code_hash text,               -- sha-256 of pepper:owner:code — peppered, see header
  code_expires_at timestamptz,
  code_attempts integer not null default 0,
  last_start_at timestamptz,           -- hourly start-rate window (garvisLine.ts)
  starts_in_hour integer not null default 0,
  verified_at timestamptz,
  proactive_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.garvis_line enable row level security;
drop policy if exists "garvis_line owner read" on public.garvis_line;
create policy "garvis_line owner read" on public.garvis_line
  for select using (owner_id = auth.uid());
drop policy if exists "garvis_line owner unbind" on public.garvis_line;
create policy "garvis_line owner unbind" on public.garvis_line
  for delete using (owner_id = auth.uid());

comment on table public.garvis_line is
  'One verified operator phone per owner; all writes via the garvis-line function so verified_at cannot be self-granted.';
