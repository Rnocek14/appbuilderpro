-- FableForge PLATFORM migration (not a generated-app migration).
-- PROJECT ASSETS — the user's own imagery, first-class (the Framer-parity asset library):
--   * Upload photos into a project, or HARVEST them from an existing website (copied into
--     storage so they survive the old site going away).
--   * Each build/edit receives an ASSET MANIFEST so generated pages use the user's REAL
--     images (heroes, galleries, ScrollScenes) instead of stock.
--
-- The storage bucket 'project-assets' already exists (schema.sql) with owner-folder write RLS.
-- Generated sites must be able to RENDER these images publicly (preview iframe + deployed site),
-- so the bucket flips to public READ; writes stay owner-scoped via the existing policy.

update storage.buckets set public = true where id = 'project-assets';

-- ---------- project_assets (manifest: name + public url + alt + provenance) ----------
create table if not exists public.project_assets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  url        text not null,                 -- public storage URL (or source URL while importing)
  alt        text not null default '',      -- injected into builds; good alt = better generated pages
  source     text not null default 'upload' check (source in ('upload', 'harvest')),
  width      int,
  height     int,
  created_at timestamptz not null default now()
);
create index if not exists idx_pa_project on public.project_assets(project_id, created_at desc);

alter table public.project_assets enable row level security;

drop policy if exists "project_assets owner all" on public.project_assets;
create policy "project_assets owner all" on public.project_assets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "project_assets admin read" on public.project_assets;
create policy "project_assets admin read" on public.project_assets
  for select using (public.is_admin());
