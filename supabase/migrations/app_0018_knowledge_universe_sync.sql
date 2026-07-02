-- FableForge PLATFORM migration (not a generated-app migration).
-- KNOWLEDGE UNIVERSE SYNC — the columns the client sync layer (src/lib/garvis/universe.ts) needs to
-- round-trip a universe losslessly between the browser graph and the app_0013 tables:
--
--   * knowledge_worlds.focus_slug   — where the user was standing when they left ("welcome back
--                                     lands you ON the idea, not at the root")
--   * knowledge_worlds.mind         — Garvis's persisted inner model of the explorer (intent, state,
--                                     next directions) so the companion remembers YOU per world.
--                                     Written by a later phase; schema-ready now.
--   * knowledge_artifacts.slug      — the client's stable artifact key ('understanding',
--                                     'wiki-img-0', …) so repeated saves UPDATE an artifact instead
--                                     of duplicating it. Unique per cluster.
--
-- Additive + idempotent, mirroring app_0013 conventions.

alter table public.knowledge_worlds    add column if not exists focus_slug text;
alter table public.knowledge_worlds    add column if not exists mind jsonb;
alter table public.knowledge_artifacts add column if not exists slug text;

-- Upsert key for artifacts (nulls stay distinct, so pre-existing rows without a slug are untouched).
create unique index if not exists uq_ku_artifacts_cluster_slug
  on public.knowledge_artifacts(cluster_id, slug);
