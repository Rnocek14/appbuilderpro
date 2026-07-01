-- FableForge PLATFORM migration (not a generated-app migration).
-- THE KNOWLEDGE UNIVERSE — the persistent substrate for Garvis as an "operating system for
-- intellectual exploration." A thought becomes a cluster, clusters nest into a living map, every
-- discovery attaches as an artifact, and the whole thing PERSISTS so it can grow across sessions —
-- which is what makes the epiphany engine, the patterns layer, and "welcome back, your universe
-- grew while you were away" possible at all.
--
--   * knowledge_worlds        — top-level containers (one per curiosity / domain / project)
--   * knowledge_clusters      — the living thoughts (self-nesting tree + salience + maturity + trajectory)
--   * knowledge_cluster_edges — cross-links beyond parent/child (the discovery trail + connections)
--   * knowledge_artifacts     — media/results/docs created or found (nothing ever gets lost)
--
-- Additive + idempotent. Owner-scoped via app_0003 RLS conventions (profiles + touch_updated_at + is_admin).

do $$ begin create type cluster_kind as enum ('topic','question','idea','investigation','artifact','project');
exception when duplicate_object then null; end $$;
do $$ begin create type cluster_maturity as enum ('spark','growing','mature','building','finished','dormant','archived');
exception when duplicate_object then null; end $$;
do $$ begin create type ku_edge_type as enum ('relates','leads_to','contradicts','supports');
exception when duplicate_object then null; end $$;
do $$ begin create type ku_artifact_kind as enum ('image','video','diagram','research','doc','link','post','data');
exception when duplicate_object then null; end $$;

-- ---- worlds ----
create table if not exists public.knowledge_worlds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_ku_worlds_owner on public.knowledge_worlds(owner_id, updated_at desc);

-- ---- clusters (the living thoughts) ----
create table if not exists public.knowledge_clusters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  parent_id   uuid references public.knowledge_clusters(id) on delete set null,
  slug        text not null,                       -- stable client id (entity resolution key)
  title       text not null,
  summary     text,
  trajectory  text,                                -- "where it's going" — the companion line
  kind        cluster_kind not null default 'topic',
  maturity    cluster_maturity not null default 'spark',
  salience    numeric(3,2) not null default 0.5,   -- 0..1 core↔trivia (DOI / zoom)
  turn_refs   int[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (world_id, slug)
);
create index if not exists idx_ku_clusters_world on public.knowledge_clusters(world_id);
create index if not exists idx_ku_clusters_parent on public.knowledge_clusters(parent_id);
create index if not exists idx_ku_clusters_owner on public.knowledge_clusters(owner_id);

-- ---- edges (cross-links / discovery trail / connections) ----
create table if not exists public.knowledge_cluster_edges (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  world_id   uuid not null references public.knowledge_worlds(id) on delete cascade,
  source_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  target_id  uuid not null references public.knowledge_clusters(id) on delete cascade,
  type       ku_edge_type not null default 'relates',
  created_at timestamptz not null default now()
);
create index if not exists idx_ku_edges_world on public.knowledge_cluster_edges(world_id);

-- ---- artifacts (media / results / docs — nothing lost) ----
create table if not exists public.knowledge_artifacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.knowledge_clusters(id) on delete cascade,
  kind       ku_artifact_kind not null default 'doc',
  title      text not null,
  detail     text,
  url        text,
  thumb      text,
  source     text default 'conversation',
  created_at timestamptz not null default now()
);
create index if not exists idx_ku_artifacts_cluster on public.knowledge_artifacts(cluster_id);

-- ---- touch triggers ----
drop trigger if exists trg_ku_worlds_touch on public.knowledge_worlds;
create trigger trg_ku_worlds_touch before update on public.knowledge_worlds for each row execute function public.touch_updated_at();
drop trigger if exists trg_ku_clusters_touch on public.knowledge_clusters;
create trigger trg_ku_clusters_touch before update on public.knowledge_clusters for each row execute function public.touch_updated_at();

-- ---- RLS (owner-all + admin-read), mirroring app_0003 ----
do $$
declare t text;
begin
  foreach t in array array['knowledge_worlds','knowledge_clusters','knowledge_cluster_edges','knowledge_artifacts'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s owner all" on public.%I;', t, t);
    execute format('create policy "%s owner all" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t, t);
    execute format('drop policy if exists "%s admin read" on public.%I;', t, t);
    execute format('create policy "%s admin read" on public.%I for select using (public.is_admin());', t, t);
    begin execute format('alter publication supabase_realtime add table public.%I;', t); exception when duplicate_object then null; end;
  end loop;
end $$;
