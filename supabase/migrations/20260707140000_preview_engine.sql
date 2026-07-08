-- Business Website Preview Engine: the receiving side of the future scraper → builder pipeline.
-- business_profiles stores the scraper handoff payload (with content-usage flags inside the JSON);
-- preview_sites stores the generated SiteSpec + outreach pitch behind a public slug.

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null,
  industry text not null,
  website_score int,
  profile jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bizprofiles_user on public.business_profiles(user_id, created_at desc);

create table if not exists public.preview_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid references public.business_profiles(id) on delete set null,
  slug text not null unique,
  business_name text not null,
  industry text not null,
  spec jsonb not null,
  pitch text not null default '',
  spec_source text not null default 'ai',        -- ai | fallback
  status text not null default 'preview',        -- preview | emailed | purchased | published
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_preview_sites_user on public.preview_sites(user_id, created_at desc);

alter table public.business_profiles enable row level security;
alter table public.preview_sites enable row level security;

drop policy if exists "bizprofiles own" on public.business_profiles;
create policy "bizprofiles own" on public.business_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The whole point of a preview is a no-login link in an email — anyone may READ a preview site.
-- Writes stay owner-only.
drop policy if exists "preview sites public read" on public.preview_sites;
create policy "preview sites public read" on public.preview_sites for select using (true);
drop policy if exists "preview sites insert own" on public.preview_sites;
create policy "preview sites insert own" on public.preview_sites for insert with check (user_id = auth.uid());
drop policy if exists "preview sites update own" on public.preview_sites;
create policy "preview sites update own" on public.preview_sites for update using (user_id = auth.uid());
drop policy if exists "preview sites delete own" on public.preview_sites;
create policy "preview sites delete own" on public.preview_sites for delete using (user_id = auth.uid());
