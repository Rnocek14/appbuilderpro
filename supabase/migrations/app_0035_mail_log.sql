-- app_0035_mail_log.sql — direct mail becomes a real, tracked action. A postcard design is a
-- studio artifact (knowledge_artifacts, source 'garvis-chat'); SENDING it is a logged batch with
-- honest state. Garvis does not mail anything itself — the operator prints/uploads to a vendor and
-- records what actually went out. That record is what the ledger and reflection count as real
-- outreach (mail, not email). Owner RLS. Additive + idempotent.

create table if not exists public.mail_batches (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid not null references public.knowledge_worlds(id) on delete cascade,
  cluster_id   uuid references public.knowledge_clusters(id) on delete set null,
  artifact_slug text,                          -- the postcard design this batch printed
  title        text not null,
  piece_count  int not null default 0 check (piece_count >= 0),
  channel      text not null default 'postcard',
  status       text not null default 'planned' check (status in ('planned', 'printed', 'mailed', 'canceled')),
  vendor       text,                            -- where it was printed/mailed (operator's note)
  cost_usd     numeric,                         -- operator's real cost, if they log it
  notes        text,
  mailed_at    timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.mail_batches enable row level security;
drop policy if exists "mail_batches owner all" on public.mail_batches;
create policy "mail_batches owner all" on public.mail_batches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_mail_batches_world on public.mail_batches(world_id, created_at desc);
