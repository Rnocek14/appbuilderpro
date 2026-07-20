-- CUSTOM ROOMS v1 + SIGNED-DOCUMENT FILING (holy-grail gaps 4 + the paperwork back half).
--
-- world_rooms: creation that EXTENDS the creator — a built/deployed app mounted as a surface
-- INSIDE its business (the wardrobe room: build the t-shirt design tool, deploy it, mount it,
-- use it without leaving Garvis). v1 embeds by URL (https-only, iframe-sandboxed client-side);
-- genesis emitting room-backed areas comes later.
--
-- signed_pdf_path: a completed DocuSign envelope's combined PDF gets pulled and FILED to
-- storage — the signed artifact finally lands in the system of record instead of living only
-- in DocuSign's inbox.

create table if not exists public.world_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  title text not null,
  url text not null,
  kind text not null default 'deployed' check (kind in ('deployed', 'preview', 'external')),
  created_at timestamptz not null default now()
);

create index if not exists idx_world_rooms_world on public.world_rooms(world_id, created_at desc);

alter table public.world_rooms enable row level security;
drop policy if exists "world_rooms owner all" on public.world_rooms;
create policy "world_rooms owner all" on public.world_rooms
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

alter table public.esign_envelopes add column if not exists signed_pdf_path text;
