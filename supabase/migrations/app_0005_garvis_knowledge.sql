-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis KNOWLEDGE layer — the durable "Learn" store: decisions, outcomes, and lessons that Garvis
-- proposes and the owner approves. Every row is a SOURCED ASSERTION (claim + source + confidence).
--
-- Design notes:
--  * Stores ONLY what has no other source of truth (judgments). Derivable facts (repo/metrics) are
--    read live, never snapshotted here.
--  * Approval gate is a STATUS COLUMN: rows are written 'proposed' (inert) and only become part of
--    Garvis's reasoning memory once a human flips them to 'approved'. Every read path filters to
--    approved. No run-resume machinery is involved.
--  * Reuses the existing security model: owner_id + auth.uid() RLS, is_admin() read, and the
--    touch_updated_at() trigger from app_0003. Additive + idempotent.
--
-- Apply: paste into the Supabase SQL editor, or `supabase db push`. Run AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type knowledge_kind as enum ('decision', 'outcome', 'lesson');
exception when duplicate_object then null; end $$;

do $$ begin
  create type knowledge_status as enum ('proposed', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------- garvis_knowledge (the sourced-assertion store) ----------
create table if not exists public.garvis_knowledge (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,       -- null = portfolio-wide
  run_id      uuid references public.agent_runs(id) on delete set null, -- provenance: which run proposed it
  kind        knowledge_kind   not null,
  title       text not null,
  body        text not null,                       -- the claim / decision / lesson (the assertion)
  source      text,                                -- provenance: run | user | repo | research | free text
  confidence  numeric(3,2),                        -- 0..1, nullable
  status      knowledge_status not null default 'proposed',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id)
);
create index if not exists idx_gk_owner_status on public.garvis_knowledge(owner_id, status, created_at desc);
create index if not exists idx_gk_app on public.garvis_knowledge(app_id);

-- ---------- keep updated_at fresh (reuses touch_updated_at from app_0003) ----------
drop trigger if exists trg_gk_touch on public.garvis_knowledge;
create trigger trg_gk_touch before update on public.garvis_knowledge
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.garvis_knowledge enable row level security;

drop policy if exists "garvis_knowledge owner all" on public.garvis_knowledge;
create policy "garvis_knowledge owner all" on public.garvis_knowledge
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "garvis_knowledge admin read" on public.garvis_knowledge;
create policy "garvis_knowledge admin read" on public.garvis_knowledge
  for select using (public.is_admin());

-- ---------- realtime (stream proposed/approved knowledge to the Garvis dashboard) ----------
alter publication supabase_realtime add table public.garvis_knowledge;
