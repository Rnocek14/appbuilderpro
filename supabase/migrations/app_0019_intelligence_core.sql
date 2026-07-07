-- FableForge PLATFORM migration (not a generated-app migration).
-- INTELLIGENCE CORE v0 — the event spine the rest of the "living mind" derives from.
--
-- Architecture (see docs/legendary-roadmap.md discussion): the reasoner is rented; the RECORD is owned.
--  * mind_events    — append-only, typed event log. The one table everything else is derived from.
--                     Immutable by trigger: updates/deletes are rejected, so history can always be
--                     re-consolidated by a smarter future model.
--  * mind_beliefs   — distilled, evidence-COUNTED assertions (never invented scores): each belief
--                     links the event ids that support/contradict it. Status curates; nothing is deleted.
--  * mind_decisions — the decision journal: what was decided, what was predicted, what actually
--                     happened. Outcomes are what turn activity into learning.
--  * mind_identity  — the human-edited identity layer (goals / values / priorities / voice), one row
--                     per slot. Injected at the top of every compiled context. Never machine-written.
--
-- Reuses the app_0003 security model (owner_id + auth.uid() RLS, is_admin() read, touch_updated_at()).
-- Additive + idempotent. Apply AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type belief_status as enum ('active', 'retired');
exception when duplicate_object then null; end $$;

-- ---------- mind_events (the append-only spine) ----------
create table if not exists public.mind_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = portfolio-wide
  source      text not null,               -- which surface emitted it: commander | agent_run | workspace | import | user
  event_type  text not null,               -- typed contract enforced in src/lib/garvis/mind.ts
  subject     text not null,               -- one-line human/model-readable summary (data, never instructions)
  payload     jsonb not null default '{}', -- structured detail; excluded from compiled context by default
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_me_owner_time on public.mind_events(owner_id, occurred_at desc);
create index if not exists idx_me_type on public.mind_events(owner_id, event_type);

-- Append-only invariant: the record is immutable. Corrections are new events, never edits.
create or replace function public.mind_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'mind_events is append-only: % is not allowed', tg_op;
end $$;
drop trigger if exists trg_me_no_update on public.mind_events;
create trigger trg_me_no_update before update or delete on public.mind_events
  for each row execute function public.mind_events_immutable();

-- ---------- mind_beliefs (evidence-counted assertions) ----------
create table if not exists public.mind_beliefs (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  statement               text not null,            -- the assertion, in plain language
  scope                   text not null default 'portfolio', -- where it applies: portfolio | an app name | a domain
  supporting_event_ids    uuid[] not null default '{}',
  contradicting_event_ids uuid[] not null default '{}',
  status                  belief_status not null default 'active',
  review_at               timestamptz,              -- staleness: beliefs decay unless re-evidenced
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists idx_mb_owner_status on public.mind_beliefs(owner_id, status, updated_at desc);

drop trigger if exists trg_mb_touch on public.mind_beliefs;
create trigger trg_mb_touch before update on public.mind_beliefs
  for each row execute function public.touch_updated_at();

-- ---------- mind_decisions (the decision journal) ----------
create table if not exists public.mind_decisions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,
  decision    text not null,               -- what was decided
  reasoning   text,                        -- why, at the time
  prediction  text,                        -- what was expected to happen
  outcome     text,                        -- what actually happened (null = still open)
  outcome_hit boolean,                     -- did the prediction hold? (set when outcome is recorded)
  decided_at  timestamptz not null default now(),
  outcome_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_md_owner_open on public.mind_decisions(owner_id, outcome_at nulls first, decided_at desc);

drop trigger if exists trg_md_touch on public.mind_decisions;
create trigger trg_md_touch before update on public.mind_decisions
  for each row execute function public.touch_updated_at();

-- ---------- mind_identity (human-edited; one row per slot) ----------
create table if not exists public.mind_identity (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  slot       text not null check (slot in ('goals', 'values', 'priorities', 'voice')),
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slot)
);

drop trigger if exists trg_mi_touch on public.mind_identity;
create trigger trg_mi_touch before update on public.mind_identity
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors app_0003's owner-scoped model)
-- ============================================================
alter table public.mind_events    enable row level security;
alter table public.mind_beliefs   enable row level security;
alter table public.mind_decisions enable row level security;
alter table public.mind_identity  enable row level security;

-- events: owners may INSERT and SELECT only — the append-only trigger blocks the rest.
drop policy if exists "mind_events owner insert" on public.mind_events;
create policy "mind_events owner insert" on public.mind_events
  for insert with check (owner_id = auth.uid());
drop policy if exists "mind_events owner read" on public.mind_events;
create policy "mind_events owner read" on public.mind_events
  for select using (owner_id = auth.uid());
drop policy if exists "mind_events admin read" on public.mind_events;
create policy "mind_events admin read" on public.mind_events
  for select using (public.is_admin());

drop policy if exists "mind_beliefs owner all" on public.mind_beliefs;
create policy "mind_beliefs owner all" on public.mind_beliefs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mind_decisions owner all" on public.mind_decisions;
create policy "mind_decisions owner all" on public.mind_decisions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mind_identity owner all" on public.mind_identity;
create policy "mind_identity owner all" on public.mind_identity
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- realtime (stream the growing record to the Mind page) ----------
alter publication supabase_realtime add table public.mind_events;
