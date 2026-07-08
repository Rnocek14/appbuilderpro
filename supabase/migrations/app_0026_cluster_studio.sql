-- FableForge PLATFORM migration (not a generated-app migration).
-- CLUSTER STUDIO SHELL v0 — the layer that turns a chartered cluster into a real studio
-- (docs/garvis-studios-blueprint.md §11/§15). A studio is not code — it is a cluster with context,
-- tools, artifacts, VERSIONS, FILES, BRAND KIT, CHAT, approvals, and execution history. This adds
-- the four missing storage pieces; the chat itself is the cluster-chat edge function + the pure
-- core in src/lib/garvis/clusterChat.ts.
--
--   * artifact_versions — snapshot-on-update history for knowledge_artifacts (same pattern as
--                         project_file_versions): every content change preserves the prior version,
--                         so "make it more luxury" yields v2 while v1 stays restorable.
--   * cluster_files     — files/assets attached to a cluster (photos for a postcard, a CSV, a logo).
--                         Binary lives in the project-assets bucket; this is the reference row.
--   * brand_kits        — one per world (nullable world = the owner's default kit): logo, palette,
--                         fonts, tone, headshots, compliance line. Injected into every generator.
--   * studio_messages   — the cluster chat transcript (+ the decision each turn produced), so a
--                         studio remembers its conversation across visits.
--
-- Reuses the app_0003 security model (owner_id + auth.uid() RLS, is_admin(), touch_updated_at()).
-- Additive + idempotent. Apply AFTER app_0013/app_0018 (universe) and app_0024 (work web).

-- ---------- artifact revisions ----------
alter table public.knowledge_artifacts add column if not exists revision int not null default 1;

create table if not exists public.artifact_versions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  artifact_id uuid not null references public.knowledge_artifacts(id) on delete cascade,
  version     int not null,
  kind        ku_artifact_kind not null default 'doc',
  title       text not null,
  detail      text,
  source      text,
  created_at  timestamptz not null default now(),
  unique (artifact_id, version)
);
create index if not exists idx_artifact_versions_artifact on public.artifact_versions(artifact_id, version desc);

-- Snapshot BEFORE UPDATE when content actually changes (a no-op upsert from a play re-run must not
-- spam identical versions). Bumps revision on the live row; the live row is always "current".
create or replace function public.snapshot_artifact_version() returns trigger
language plpgsql as $$
begin
  if (old.detail is distinct from new.detail) or (old.title is distinct from new.title) then
    insert into public.artifact_versions (owner_id, artifact_id, version, kind, title, detail, source)
    values (old.owner_id, old.id, coalesce(old.revision, 1), old.kind, old.title, old.detail, old.source);
    new.revision := coalesce(old.revision, 1) + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_ka_snapshot on public.knowledge_artifacts;
create trigger trg_ka_snapshot before update on public.knowledge_artifacts
  for each row execute function public.snapshot_artifact_version();

-- ---------- cluster files ----------
create table if not exists public.cluster_files (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  cluster_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  name        text not null,
  url         text not null,               -- public URL in the project-assets bucket
  kind        text not null default 'other' check (kind in ('image', 'doc', 'csv', 'other')),
  bytes       integer,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cluster_files_cluster on public.cluster_files(cluster_id, created_at desc);

-- ---------- brand kits ----------
create table if not exists public.brand_kits (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  world_id        uuid references public.knowledge_worlds(id) on delete cascade, -- null = owner default
  name            text not null default 'Brand kit',
  logo_url        text,
  palette         jsonb not null default '[]',   -- ["#0C0E13", "#FF8A3D", ...]
  fonts           jsonb not null default '[]',   -- ["Space Grotesk", "Inter"]
  tone            text,                          -- "calm, private, no hype"
  headshots       jsonb not null default '[]',   -- [url, ...]
  compliance_line text,                          -- brokerage/legal footer line
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- One kit per world per owner (and one default kit with null world).
create unique index if not exists uq_brand_kits_owner_world on public.brand_kits(owner_id, world_id) where world_id is not null;
create unique index if not exists uq_brand_kits_owner_default on public.brand_kits(owner_id) where world_id is null;

drop trigger if exists trg_brand_kits_touch on public.brand_kits;
create trigger trg_brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

-- ---------- studio chat transcript ----------
create table if not exists public.studio_messages (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.knowledge_clusters(id) on delete cascade,
  role       text not null check (role in ('user', 'garvis')),
  content    text not null,
  decision   jsonb,                        -- the StudioDecision this turn produced (garvis rows)
  cost_usd   numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_studio_messages_cluster on public.studio_messages(cluster_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped; mirrors app_0003)
-- ============================================================
alter table public.artifact_versions enable row level security;
alter table public.cluster_files     enable row level security;
alter table public.brand_kits        enable row level security;
alter table public.studio_messages   enable row level security;

drop policy if exists "artifact_versions owner all" on public.artifact_versions;
create policy "artifact_versions owner all" on public.artifact_versions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "cluster_files owner all" on public.cluster_files;
create policy "cluster_files owner all" on public.cluster_files
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "brand_kits owner all" on public.brand_kits;
create policy "brand_kits owner all" on public.brand_kits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "studio_messages owner all" on public.studio_messages;
create policy "studio_messages owner all" on public.studio_messages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
