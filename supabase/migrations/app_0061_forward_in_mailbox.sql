-- app_0061_forward_in_mailbox.sql — TIER 2 ①: the mailbox connection (v0: forward-in).
--
-- The day-map audit's #1 gap: mail lives outside, the desk is copy-paste, and resend-inbound
-- SILENTLY DISCARDED any inbound email it couldn't match to an outreach thread. This gives every
-- owner a forward-in address (a per-user alias the inbound webhook resolves) and a real inbox
-- table, so forwarded mail lands in the Queue's Messages lane, gets drafted with the owner's own
-- record, and replies go out through the same approval spine as everything else.
--
-- Additive + idempotent.

-- 1) The per-owner forward-in alias --------------------------------------------------------------
-- Deterministic from the owner id (no secrets — the alias only ROUTES; the webhook still requires
-- INBOUND_SECRET). Backfill existing profiles; a trigger covers new signups.
alter table public.profiles add column if not exists inbound_alias text;
update public.profiles
  set inbound_alias = 'in-' || substr(md5(id::text || 'ff-forward-in'), 1, 10)
  where inbound_alias is null;
create unique index if not exists idx_profiles_inbound_alias on public.profiles(inbound_alias);

create or replace function public.set_inbound_alias()
returns trigger language plpgsql as $$
begin
  if new.inbound_alias is null then
    new.inbound_alias := 'in-' || substr(md5(new.id::text || 'ff-forward-in'), 1, 10);
  end if;
  return new;
end; $$;
drop trigger if exists trg_profiles_inbound_alias on public.profiles;
create trigger trg_profiles_inbound_alias
  before insert on public.profiles
  for each row execute function public.set_inbound_alias();

-- 2) The inbox -----------------------------------------------------------------------------------
create table if not exists public.inbound_mail (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  from_address text not null,
  from_name text,
  to_address text,
  subject text,
  body_text text,                                   -- capped by the webhook; the mail's own words
  message_id text,                                  -- provider id, for reply threading later
  status text not null default 'new' check (status in ('new', 'handled')),
  handled_at timestamptz,
  world_id uuid references public.knowledge_worlds(id) on delete set null,
  received_at timestamptz not null default now()
);
alter table public.inbound_mail enable row level security;
drop policy if exists "inbound_mail owner all" on public.inbound_mail;
-- Owner-scoped, with the same world-ownership pin as standing_orders/draft_verdicts.
create policy "inbound_mail owner all" on public.inbound_mail
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (
      select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()
    ))
  );
create index if not exists idx_inbound_mail_lane on public.inbound_mail(owner_id, status, received_at desc);
