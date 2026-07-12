-- app_0048_command_thread.sql — ONE BRAIN, part 1: the front door remembers.
-- The UX audit's finding: "Refresh and Garvis has amnesia" — the Command transcript lived in
-- useState while studio chats persisted. The conversation with your chief of staff is the one
-- transcript that must survive. Append-only; owner RLS. Additive + idempotent.

create table if not exists public.command_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'garvis')),
  text        text not null,
  mission_id  uuid,                        -- when the turn planned a mission (loose ref; missions table owns lifecycle)
  created_at  timestamptz not null default now()
);
alter table public.command_messages enable row level security;
drop policy if exists "command_messages owner all" on public.command_messages;
create policy "command_messages owner all" on public.command_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_command_messages_owner on public.command_messages(owner_id, created_at desc);
