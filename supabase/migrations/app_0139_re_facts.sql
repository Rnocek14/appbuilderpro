-- app_0139_re_facts.sql — APPROVED FACTS, WITH SOURCES AND A REVIEW DATE.
-- The real-estate audit's gap 3 (docs/real-estate-marketing-implementation.md §2.9): nothing in this
-- schema pairs a claim with a source URL AND a date it must be re-checked. garvis_knowledge (app_0005)
-- comes closest — claim + free-text source + confidence + approved_at — but it has no source URL, no
-- re-review date, and no community scope, so the additive changes would have been these tables anyway.
--
-- The rule these tables exist to enforce: a community fact may appear in published copy ONLY while it
-- is verified, carries at least one source row, and has not passed its review date. Anything else
-- renders as a visible hole and blocks the queue — a missing fact must stay missing, never become a
-- confident sentence. Enforced in reFactsCore.ts (pure, CI-verified) AND re-checked server-side at
-- publish, the same three-layer shape the AI-disclosure gate already uses.
--
-- Additive + idempotent. Owner RLS, world-pinned (the app_0036/app_0087 house pattern).

-- ---------- communities (the territory a fact belongs to) ----------
create table if not exists public.re_communities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  slug          text not null,                     -- stable id: 'abbey-springs'
  name          text not null,
  kind          text not null default 'community'
                  check (kind in ('community', 'association', 'lake', 'town', 'development')),
  boundary_note text,                              -- the exact boundary IN WORDS. never inferred geometry
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, slug)
);
alter table public.re_communities enable row level security;
drop policy if exists "re_communities owner all" on public.re_communities;
create policy "re_communities owner all" on public.re_communities
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_re_communities_world on public.re_communities(world_id, name);

drop trigger if exists trg_re_communities_touch on public.re_communities;
create trigger trg_re_communities_touch before update on public.re_communities
  for each row execute function public.touch_updated_at();

-- ---------- facts ----------
-- status: draft (nobody checked it) → verified (a named human did) → stale (past its review date,
-- set by the reader, not by a job) → retired (no longer true; kept, never deleted).
create table if not exists public.re_facts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  community_id  uuid references public.re_communities(id) on delete cascade,
  claim         text not null,                     -- "Abbey Springs dues are billed quarterly"
  value_text    text,                              -- the specific value, AS VERIFIED. never computed
  status        text not null default 'draft'
                  check (status in ('draft', 'verified', 'stale', 'retired')),
  reviewed_at   timestamptz,
  review_due_at timestamptz,                       -- null = evergreen; a date = re-check by then
  reviewed_by   text,                              -- WHO checked it. a person, named
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.re_facts enable row level security;
drop policy if exists "re_facts owner all" on public.re_facts;
create policy "re_facts owner all" on public.re_facts
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_re_facts_community on public.re_facts(community_id, status);
create index if not exists idx_re_facts_due on public.re_facts(owner_id, review_due_at) where review_due_at is not null;

drop trigger if exists trg_re_facts_touch on public.re_facts;
create trigger trg_re_facts_touch before update on public.re_facts
  for each row execute function public.touch_updated_at();

-- ---------- sources ----------
-- A fact with no source row is never citable, whatever its status says. The quote is the fragment
-- that actually supports the claim — so a later reviewer can check the source without re-reading it.
create table if not exists public.re_fact_sources (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  fact_id     uuid not null references public.re_facts(id) on delete cascade,
  url         text,
  title       text,
  source_kind text not null default 'official'
                check (source_kind in ('official', 'association', 'document', 'person', 'observation')),
  quote       text,
  captured_at timestamptz not null default now(),
  note        text
);
alter table public.re_fact_sources enable row level security;
drop policy if exists "re_fact_sources owner all" on public.re_fact_sources;
create policy "re_fact_sources owner all" on public.re_fact_sources
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_re_fact_sources_fact on public.re_fact_sources(fact_id, captured_at desc);
