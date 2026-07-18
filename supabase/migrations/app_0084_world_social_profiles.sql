-- app_0084_world_social_profiles.sql — EACH BUSINESS POSTS TO ITS OWN ACCOUNTS.
-- The multi-business audit's distribution gap: one Ayrshare connection meant every brand's posts
-- landed on the same linked accounts — professional creation, amateur distribution. Ayrshare's
-- multi-client plan issues a Profile-Key per client profile; this table maps business → profile.
-- social-publish resolves post.world_id here and sends the Profile-Key header. Fail-closed rule
-- lives in the function: once ANY mapping exists, a business-attributed post with NO mapping
-- blocks rather than silently posting to the wrong brand's accounts. Zero mappings = today's
-- single-account behavior, untouched.
-- The Profile-Key is a routing identifier, not the API key — the API key stays sealed in
-- provider_connections and never reaches the browser.

create table if not exists public.world_social_profiles (
  world_id    uuid primary key references public.knowledge_worlds(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  profile_key text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.world_social_profiles enable row level security;
drop policy if exists "world_social_profiles owner all" on public.world_social_profiles;
create policy "world_social_profiles owner all" on public.world_social_profiles
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_world_social_profiles_owner on public.world_social_profiles(owner_id);
