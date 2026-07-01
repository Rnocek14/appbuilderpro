-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis OPPORTUNITY DETECTION — the proactive layer: Garvis reasons over the portfolio as a SYSTEM
-- and surfaces opportunities the founder didn't ask for ("Theory Thread could feed FableForge
-- marketing"; "Hyperlocal News could clone to 300 cities"; "these 3 apps overlap — consolidate").
--   * garvis_opportunities — the opportunity QUEUE (notice → persist → surface later → act/dismiss).
--
-- Why a table (despite "no more tables"): proactivity is impossible without it. To say "I found this
-- while you were away", dedupe re-scans, and remember what you dismissed/converted, opportunities need
-- a lifecycle (new → saved/dismissed/converted). This is a QUEUE, not another intelligence substrate.
-- A 'converted' opp links to the mission it became. Reuses app_0003 RLS. Additive + idempotent.

do $$ begin create type opportunity_type as enum ('synergy','expansion','consolidation','risk','quick_win','positioning');
exception when duplicate_object then null; end $$;
do $$ begin create type opportunity_status as enum ('new','saved','dismissed','converted');
exception when duplicate_object then null; end $$;

create table if not exists public.garvis_opportunities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  type          opportunity_type not null default 'synergy',
  rationale     text,                       -- the grounded "why", citing portfolio facts
  suggested_move text,                      -- the concrete next action (can become a mission objective)
  related_apps  text[] not null default '{}',  -- app names this spans (cross-app intelligence)
  confidence    numeric(3,2),
  status        opportunity_status not null default 'new',
  mission_id    uuid references public.garvis_missions(id) on delete set null,  -- set when converted
  source        text not null default 'scan',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_opps_owner on public.garvis_opportunities(owner_id, status, created_at desc);

drop trigger if exists trg_opps_touch on public.garvis_opportunities;
create trigger trg_opps_touch before update on public.garvis_opportunities for each row execute function public.touch_updated_at();

alter table public.garvis_opportunities enable row level security;
drop policy if exists "garvis_opportunities owner all" on public.garvis_opportunities;
create policy "garvis_opportunities owner all" on public.garvis_opportunities for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_opportunities admin read" on public.garvis_opportunities;
create policy "garvis_opportunities admin read" on public.garvis_opportunities for select using (public.is_admin());

do $$ begin alter publication supabase_realtime add table public.garvis_opportunities; exception when duplicate_object then null; end $$;
