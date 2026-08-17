-- app_0153_lob_mail.sql — direct mail grows a VERIFICATION RAIL (SW10.2): recipient-level USPS
-- deliverability status, the mail kill switch, and the batch/piece tables the send path (SW10.3/4)
-- will stage into. Additive + idempotent.
--
-- Honesty rules built into the schema:
--  - verify_status defaults 'unverified' and only lob-verify writes 'verified'/'undeliverable'
--    from a REAL lookup — an error leaves 'unverified', never a guess.
--  - mail_enabled defaults FALSE (the outbound_enabled discipline): no mail-side spend or send
--    happens until the operator opts in.
--  - mail_pieces carries a per-household qr_token so a scan attributes to the exact household.

-- ---------- recipient verification columns ----------
alter table public.mail_recipients add column if not exists verify_status text not null default 'unverified';
alter table public.mail_recipients add column if not exists verify_detail text;
alter table public.mail_recipients add column if not exists verified_at timestamptz;
do $$ begin
  alter table public.mail_recipients add constraint mail_recipients_verify_status_chk
    check (verify_status in ('unverified', 'verified', 'undeliverable'));
exception when duplicate_object then null; end $$;
create index if not exists idx_mail_recipients_verify on public.mail_recipients(territory_id, verify_status);

-- ---------- the mail kill switch (fail-closed, off by default) ----------
alter table public.outreach_settings add column if not exists mail_enabled boolean not null default false;

-- ---------- mail_drops: one staged Lob drop = one row = ONE approval ----------
-- (NOT mail_batches — that table has existed since app_0035 as the operator's MANUAL mail log
--  with its own planned/printed/mailed lifecycle. The API-submitted drop is a different thing
--  with a different lifecycle, so it gets its own table instead of overloading that one.)
create table if not exists public.mail_drops (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null,
  territory_id   uuid references public.farm_territories(id) on delete set null,
  spec           jsonb,                         -- the EXACT postcard design snapshot this drop prints
  status         text not null default 'staged'
                 check (status in ('staged', 'approved', 'submitted', 'partial', 'done', 'failed', 'canceled')),
  pieces         int not null default 0,
  est_piece_usd  numeric(8,4),
  est_total_usd  numeric(10,2),                 -- the approval binds this as the hard ceiling
  suppressed_count int not null default 0,
  suppressed_reasons jsonb not null default '{}'::jsonb,
  approval_id    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.mail_drops enable row level security;
drop policy if exists "mail_drops owner all" on public.mail_drops;
create policy "mail_drops owner all" on public.mail_drops
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_mail_drops_owner on public.mail_drops(owner_id, created_at desc);
drop trigger if exists trg_mail_drops_touch on public.mail_drops;
create trigger trg_mail_drops_touch before update on public.mail_drops
  for each row execute function public.touch_updated_at();

-- ---------- mail_pieces: the addressed snapshot, one row per household ----------
create table if not exists public.mail_pieces (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  drop_id        uuid not null references public.mail_drops(id) on delete cascade,
  household_key  text not null,
  full_name      text not null default '',
  address1       text not null,
  city           text not null,
  state          text not null,
  zip5           text not null,
  is_absentee    boolean not null default false,
  qr_token       text not null,                 -- per-household attribution token (site-events, SW10.4)
  status         text not null default 'staged'
                 check (status in ('staged', 'submitted', 'in_transit', 'delivered', 'returned', 'failed', 'canceled')),
  lob_id         text,
  last_event     text,
  cost_usd       numeric(8,4),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.mail_pieces enable row level security;
drop policy if exists "mail_pieces owner all" on public.mail_pieces;
create policy "mail_pieces owner all" on public.mail_pieces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create unique index if not exists idx_mail_pieces_qr on public.mail_pieces(qr_token);
create index if not exists idx_mail_pieces_drop on public.mail_pieces(drop_id, status);
drop trigger if exists trg_mail_pieces_touch on public.mail_pieces;
create trigger trg_mail_pieces_touch before update on public.mail_pieces
  for each row execute function public.touch_updated_at();
