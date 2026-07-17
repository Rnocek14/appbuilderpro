-- app_0085_world_sender_identity.sql — EACH BUSINESS SENDS EMAIL AS ITSELF.
-- The email twin of app_0084: outreach_settings is one row per owner, so with three brands every
-- email left with the same from-address, signature company, and CAN-SPAM footer — the wrong brand
-- on every message. This table gives a business its own sender identity; send-email resolves the
-- message's business (batch → contact) and uses it when mapped.
-- Identity is applied as a UNIT (name/email/reply-to never half-mix across brands); only the
-- CAN-SPAM mailing address may fall back to the global one, because brands under one roof
-- legitimately share a mailing address. SAFETY STAYS OWNER-GLOBAL on purpose: the kill switch,
-- daily cap, warmup ramp, and timezone in outreach_settings govern the human, not the brand.

create table if not exists public.world_sender_identities (
  world_id         uuid primary key references public.knowledge_worlds(id) on delete cascade,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  from_name        text,
  from_email       text,
  reply_to         text,
  company_name     text,
  physical_address text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.world_sender_identities enable row level security;
drop policy if exists "world_sender_identities owner all" on public.world_sender_identities;
create policy "world_sender_identities owner all" on public.world_sender_identities
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_world_sender_identities_owner on public.world_sender_identities(owner_id);
