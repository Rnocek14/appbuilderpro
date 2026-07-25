-- app_0114_world_spine.sql
-- THE WORLD_ID SPINE (capability-audit 10/12; fix directive items 3-4). Every fleet-level question
-- — cost per client, automation health per client, isolation proofs — was unanswerable because the
-- operational ledgers carried only owner_id. Three structural stamps + world-scoped retrieval:
--
--   1. execution_runs.world_id — auto-stamped from the approval that authorized the run (approvals
--      gained world_id in app_0083), via BEFORE INSERT trigger so every existing writer inherits
--      the stamp with zero call-site changes; backfilled from the approvals lineage.
--   2. usage_events.world_id — the column + index now; writers thread it as they route through the
--      metering chokepoint (same campaign, next slice).
--   3. embeddings.world_id — the isolation fix. match_embeddings was owner- but not world-scoped,
--      so a world-scoped ask mixed one client's documents into another client's AI context
--      (ask.ts's own comment: "vector is account-wide; world scope uses lexical"). The column is
--      backfilled from documents (which already carry world_id) and artifacts (via their cluster's
--      world), stamped server-side by embed-worker on new rows, and the RPC gains a _world filter.

-- ---------- 1. execution_runs ----------
alter table public.execution_runs
  add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_execution_runs_world on public.execution_runs(owner_id, world_id, created_at desc);

create or replace function public.stamp_execution_world()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.world_id is null and new.approval_id is not null then
    select a.world_id into new.world_id from public.approvals a where a.id = new.approval_id;
  end if;
  return new;
end;
$$;
-- Definer is deliberate: run inserts come from executors whose RLS view of approvals varies;
-- the stamp must read the approval row regardless. It only copies world_id, nothing else.
revoke all on function public.stamp_execution_world() from public;

drop trigger if exists trg_execution_runs_world on public.execution_runs;
create trigger trg_execution_runs_world
  before insert on public.execution_runs
  for each row execute function public.stamp_execution_world();

update public.execution_runs r
   set world_id = a.world_id
  from public.approvals a
 where r.approval_id = a.id and r.world_id is null and a.world_id is not null;

-- ---------- 2. usage_events ----------
alter table public.usage_events
  add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_usage_events_world on public.usage_events(world_id, created_at);

-- ---------- 3. embeddings ----------
alter table public.embeddings
  add column if not exists world_id uuid references public.knowledge_worlds(id) on delete set null;
create index if not exists idx_embeddings_world on public.embeddings(owner_id, world_id);

update public.embeddings e
   set world_id = d.world_id
  from public.documents d
 where e.subject_type = 'document' and e.subject_id = d.id
   and e.world_id is null and d.world_id is not null;

update public.embeddings e
   set world_id = c.world_id
  from public.knowledge_artifacts a
  join public.knowledge_clusters c on c.id = a.cluster_id
 where e.subject_type = 'artifact' and e.subject_id = a.id
   and e.world_id is null;

update public.embeddings e
   set world_id = c.world_id
  from public.knowledge_clusters c
 where e.subject_type = 'cluster' and e.subject_id = c.id
   and e.world_id is null;

-- ---------- 4. match_embeddings gains the world filter ----------
-- Recreated (not overloaded): a second signature would make PostgREST rpc-by-name ambiguous.
drop function if exists public.match_embeddings(uuid, vector, int, text, float, uuid);
create or replace function public.match_embeddings(
  _owner uuid,
  _query vector(1536),
  _k int default 8,
  _subject_type text default null,
  _min_similarity float default 0.0,
  _exclude_subject uuid default null,
  _world uuid default null
)
returns table (
  subject_type text,
  subject_id   uuid,
  chunk_ix     int,
  content      text,
  similarity   float
)
language sql
stable
as $$
  select e.subject_type, e.subject_id, e.chunk_ix, e.content,
         1 - (e.embedding <=> _query) as similarity
  from public.embeddings e
  where e.owner_id = _owner
    and (_subject_type is null or e.subject_type = _subject_type)
    and (_exclude_subject is null or e.subject_id <> _exclude_subject)
    and (_world is null or e.world_id = _world)
    and (1 - (e.embedding <=> _query)) >= _min_similarity
  order by e.embedding <=> _query
  limit greatest(1, least(_k, 50));
$$;
