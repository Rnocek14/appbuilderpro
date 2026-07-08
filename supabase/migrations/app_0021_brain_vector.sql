-- FableForge PLATFORM migration (not a generated-app migration).
-- PERSISTENT BRAIN v0 — the durable memory + meaning layer under the whole Garvis system.
--
-- Why this exists (see docs/garvis-system-architecture.md §4): today embeddings live in the
-- BROWSER, in-memory (src/lib/garvis/embeddings.ts). "Similar ideas" and entity resolution die on
-- reload and never span modules. This migration gives Garvis a real brain:
--   * documents  — anything ingested (upload | url | repo | email | scraped) with extracted text +
--                  a summary + a classification status. The file-intake object.
--   * embeddings — ONE 1536-dim vector column for EVERY meaningful object (document, artifact,
--                  cluster, knowledge, business, app). Learn from theory-thread's dimension sprawl
--                  (384/768/1536, mostly unpopulated): pick one dim, write it everywhere.
--   * insights   — the "Garvis noticed…" surface: a connection/drift/opportunity Garvis found by
--                  proximity, awaiting the user's eyes. Cheap to produce once vectors exist.
--   * match_embeddings() — cosine k-NN RPC, owner-scoped, optionally filtered by subject_type.
--
-- Reuses the app_0003/app_0019 security model (owner_id + auth.uid() RLS, is_admin() read,
-- touch_updated_at()). Additive + idempotent. Apply AFTER app_0013 (knowledge universe) and app_0019.

-- ---------- extension ----------
create extension if not exists vector;

-- ---------- enums ----------
do $$ begin
  create type document_source as enum ('upload', 'url', 'repo', 'email', 'scrape', 'note');
exception when duplicate_object then null; end $$;
do $$ begin
  create type document_status as enum ('uploaded', 'extracted', 'classified', 'linked', 'failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type insight_kind as enum ('noticed', 'connection', 'drift', 'opportunity');
exception when duplicate_object then null; end $$;
do $$ begin
  create type insight_status as enum ('new', 'surfaced', 'dismissed', 'actioned');
exception when duplicate_object then null; end $$;

-- ---------- documents (the file-intake object) ----------
create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid references public.knowledge_worlds(id) on delete set null, -- proposed/confirmed home
  app_id         uuid references public.apps(id) on delete set null,             -- linked product, if any
  source_kind    document_source not null default 'upload',
  title          text not null,
  storage_path   text,                        -- object in the 'documents' bucket (null for url/note)
  source_url     text,                        -- origin for url/repo/scrape
  mime           text,
  bytes          integer,
  summary        text,                        -- model-written, 1-3 sentences
  extracted_text text,                        -- best-effort plain text (truncated for large files)
  concepts       text[] not null default '{}',-- extracted keywords/entities
  meta           jsonb not null default '{}',
  status         document_status not null default 'uploaded',
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_documents_owner on public.documents(owner_id, created_at desc);
create index if not exists idx_documents_world on public.documents(world_id);
create index if not exists idx_documents_status on public.documents(owner_id, status);

drop trigger if exists trg_documents_touch on public.documents;
create trigger trg_documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- ---------- embeddings (ONE vector space for every object) ----------
-- subject_type + subject_id is a polymorphic pointer (no FK — subjects live in many tables). The
-- writer is responsible for deleting stale rows when a subject changes (embed-worker upserts by
-- (owner_id, subject_type, subject_id, chunk_ix)).
create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null,                 -- document | artifact | cluster | knowledge | business | app
  subject_id   uuid not null,
  chunk_ix     integer not null default 0,    -- >0 for long docs split into chunks
  content      text not null,                 -- the exact text that was embedded (for display/debug)
  embedding    vector(1536) not null,
  model        text not null default 'text-embedding-3-small',
  created_at   timestamptz not null default now(),
  unique (owner_id, subject_type, subject_id, chunk_ix)
);
create index if not exists idx_embeddings_owner_subject on public.embeddings(owner_id, subject_type, subject_id);
-- HNSW cosine index — the k-NN workhorse. Safe on an empty table; builds incrementally.
create index if not exists idx_embeddings_hnsw on public.embeddings
  using hnsw (embedding vector_cosine_ops);

-- ---------- insights ("Garvis noticed…") ----------
create table if not exists public.insights (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  kind        insight_kind not null default 'noticed',
  title       text not null,
  body        text not null default '',
  refs        jsonb not null default '[]',    -- [{subject_type, subject_id, label}] the insight connects
  score       numeric(4,3) not null default 0,-- proximity/confidence, [0,1]; never invented — from cosine
  status      insight_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_insights_owner on public.insights(owner_id, status, created_at desc);

drop trigger if exists trg_insights_touch on public.insights;
create trigger trg_insights_touch before update on public.insights
  for each row execute function public.touch_updated_at();

-- ---------- match_embeddings() — owner-scoped cosine k-NN ----------
-- SECURITY INVOKER (default): runs as the caller, so RLS on public.embeddings applies and an owner
-- can only ever match their own vectors. _owner is passed for an explicit belt-and-suspenders filter.
create or replace function public.match_embeddings(
  _owner uuid,
  _query vector(1536),
  _k int default 8,
  _subject_type text default null,
  _min_similarity float default 0.0,
  _exclude_subject uuid default null
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
    and (1 - (e.embedding <=> _query)) >= _min_similarity
  order by e.embedding <=> _query
  limit greatest(1, least(_k, 50));
$$;

-- ============================================================
-- ROW LEVEL SECURITY (owner-scoped; mirrors app_0003/app_0019)
-- ============================================================
alter table public.documents  enable row level security;
alter table public.embeddings enable row level security;
alter table public.insights   enable row level security;

drop policy if exists "documents owner all" on public.documents;
create policy "documents owner all" on public.documents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "documents admin read" on public.documents;
create policy "documents admin read" on public.documents
  for select using (public.is_admin());

-- Embeddings: owners read their own; WRITES are service-role only (the embed-worker holds the
-- embedding provider key server-side). No client insert/update path — vectors are never written
-- from the browser.
drop policy if exists "embeddings owner read" on public.embeddings;
create policy "embeddings owner read" on public.embeddings
  for select using (owner_id = auth.uid());

drop policy if exists "insights owner all" on public.insights;
create policy "insights owner all" on public.insights
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- storage bucket for uploaded documents (private) ----------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Owners manage only their own folder (path convention: <owner_id>/<uuid>-<filename>).
drop policy if exists "documents bucket owner read" on storage.objects;
create policy "documents bucket owner read" on storage.objects
  for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner write" on storage.objects;
create policy "documents bucket owner write" on storage.objects
  for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner delete" on storage.objects;
create policy "documents bucket owner delete" on storage.objects
  for delete using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
