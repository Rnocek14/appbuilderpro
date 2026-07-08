-- FableForge PLATFORM migration (not a generated-app migration).
-- WORLD INTELLIGENCE v0 — the synthesized understanding of each world (Sprint M, round 6).
--
-- Memory stores events; UNDERSTANDING stores implications. Every world gets one living row that
-- answers the heartbeat questions continuously: what are we trying to accomplish, how are we doing,
-- what's blocking us, what changed, what matters most now, what's next. Not regenerated each time —
-- persisted, updated, living. This is the fuel for the waking moment (Rule 6) and the "brain" the
-- P2 star renders.
--
-- Honesty invariants (the same ones, enforced by the pure core in src/lib/garvis/worldIntel.ts):
--   * `state` (Living State) is compiled DETERMINISTICALLY from rows — blockers, risks, momentum
--     signals are counted or structural, never opinions. Momentum is a derived LABEL from counts
--     ("surging — 3 replies, 12 artifacts this week"), never a stored score.
--   * `implications` / `recommendation` / `reflection` are LLM-synthesized, but every item must
--     carry an evidence string or the parser DROPS it. Understanding without evidence doesn't persist.
--
-- Additive + idempotent. Apply AFTER app_0013 (worlds) and app_0024 (work web).

create table if not exists public.world_intelligence (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  world_id          uuid not null references public.knowledge_worlds(id) on delete cascade,
  objective         text,                          -- what are we trying to accomplish
  state             jsonb not null default '{}',   -- Living State (deterministic): strategy, blockers[], risks[], momentum{label,signals}
  implications      jsonb not null default '[]',   -- [{observation, implication, evidence, at}] — understanding, evidence-required
  recommendation    text,                          -- current recommended direction (evidence-backed synthesis)
  open_questions    jsonb not null default '[]',   -- ["Should we target lakefront owners or move-up sellers?"]
  reflection        jsonb,                         -- latest reflection {period, tried[], learned[], at} — organizational learning
  signals           jsonb not null default '{}',   -- the counted momentum snapshot the label was derived from
  last_reflected_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (world_id)
);
create index if not exists idx_world_intel_owner on public.world_intelligence(owner_id, updated_at desc);

drop trigger if exists trg_world_intel_touch on public.world_intelligence;
create trigger trg_world_intel_touch before update on public.world_intelligence
  for each row execute function public.touch_updated_at();

alter table public.world_intelligence enable row level security;

drop policy if exists "world_intelligence owner all" on public.world_intelligence;
create policy "world_intelligence owner all" on public.world_intelligence
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "world_intelligence admin read" on public.world_intelligence;
create policy "world_intelligence admin read" on public.world_intelligence
  for select using (public.is_admin());
