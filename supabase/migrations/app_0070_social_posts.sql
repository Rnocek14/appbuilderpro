-- app_0070_social_posts.sql — SOCIAL AUTO-POSTING. Her real accounts, connected once through a
-- provider (Ayrshare), posted to (or scheduled) from inside Garvis — nothing goes out without an
-- approval. Each row is one post; the edge function fills provider_post_id + status after sending.
-- Owner RLS; world pinned when set. Additive + idempotent.

create table if not exists public.social_posts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  world_id         uuid references public.knowledge_worlds(id) on delete set null,
  body             text not null default '',
  platforms        text[] not null default '{}',
  media_urls       text[] not null default '{}',
  scheduled_for    timestamptz,                    -- null = post immediately on approval
  status           text not null default 'queued'
                     check (status in ('queued', 'scheduled', 'posted', 'failed', 'canceled')),
  provider         text not null default 'ayrshare',
  provider_post_id text,
  approval_id      uuid references public.approvals(id) on delete set null,
  error            text,
  posted_at        timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.social_posts enable row level security;
drop policy if exists "social_posts owner all" on public.social_posts;
create policy "social_posts owner all" on public.social_posts
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_social_posts_owner on public.social_posts(owner_id, created_at desc);
