-- app_0151_strategies.sql — SW9.1: the STRATEGIES spine (the anticipation design's one new
-- table). A strategy is a proposed way to pursue an objective, with its evidence CARRIED ON THE
-- ROW: `evidence` holds the verbatim fact lines it stands on, `basis` says honestly whether
-- those are measured rows or a labeled heuristic (the pure core's grounding gate relabels any
-- uncited "measured" claim before it ever gets here). Lifecycle proposed → adopted → retired;
-- adopt/retire only shapes nextMove/briefing inputs — a strategy never sends anything.
-- Additive + idempotent (shadow-DB applies twice).

create table if not exists public.strategies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  mission_id  uuid references public.garvis_missions(id) on delete set null,
  world_id    uuid references public.knowledge_worlds(id) on delete cascade,
  title       text not null,
  rationale   text not null default '',
  evidence    jsonb not null default '[]'::jsonb,
  basis       text not null default 'heuristic' check (basis in ('measured', 'heuristic')),
  status      text not null default 'proposed' check (status in ('proposed', 'adopted', 'retired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_strategies_owner on public.strategies(owner_id, status, updated_at desc);
create index if not exists idx_strategies_world on public.strategies(world_id, status);

alter table public.strategies enable row level security;
drop policy if exists "strategies owner all" on public.strategies;
create policy "strategies owner all" on public.strategies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop trigger if exists trg_strategies_touch on public.strategies;
create trigger trg_strategies_touch before update on public.strategies
  for each row execute function public.touch_updated_at();
