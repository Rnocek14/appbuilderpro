-- app_0037_ad_spends.sql — real spend, logged. Until platform APIs are connected (Meta/Google
-- OAuth apps the owner must register — see docs/garvis-advertising-plan.md), spend is the
-- operator's honest log per channel/period. Cost-per-lead then exists ONLY as logged-spend ÷
-- measured-leads — two real numbers, never a modeled one. Owner RLS. Additive + idempotent.

create table if not exists public.ad_spends (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid not null references public.knowledge_worlds(id) on delete cascade,
  channel      text not null,                  -- 'meta ads' | 'google ads' | 'direct mail' | …
  label        text,                           -- campaign name / operator's note
  amount_usd   numeric not null check (amount_usd >= 0),
  period_start date,
  period_end   date,
  created_at   timestamptz not null default now()
);
alter table public.ad_spends enable row level security;
drop policy if exists "ad_spends owner all" on public.ad_spends;
create policy "ad_spends owner all" on public.ad_spends
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_ad_spends_world on public.ad_spends(world_id, channel, created_at desc);
