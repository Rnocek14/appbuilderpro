-- app_0030_website_bridge.sql — G3: a world builds its own website.
--
-- * projects.world_id            — provenance: this app was built FROM a Garvis world; the
--                                  workspace can show it and world views can track it.
-- * project_assets.source 'world' — photos metadata-copied from a world's cluster_files (same
--                                  public bucket, zero data movement) into a project's manifest.
--
-- Additive + idempotent. Apply after app_0020 and app_0029.

alter table public.projects add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_projects_world on public.projects(world_id);

alter table public.project_assets drop constraint if exists project_assets_source_check;
alter table public.project_assets add constraint project_assets_source_check
  check (source in ('upload', 'harvest', 'world'));
