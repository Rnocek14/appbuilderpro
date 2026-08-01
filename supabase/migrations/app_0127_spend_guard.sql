-- app_0127_spend_guard.sql — THE SPEND GUARD. Real-money protection the credits system alone
-- doesn't give: per-owner daily/monthly USD caps + a kill switch, enforced INSIDE checkCredits —
-- the one chokepoint every AI-spending edge function and worker branch already goes through, so
-- no seam can run up the card. Spend truth comes from usage_events.cost_usd (what spendCredits
-- actually logged), summed server-side. Additive + idempotent.

create table if not exists public.spend_guard (
  owner_id        uuid primary key references public.profiles(id) on delete cascade,
  daily_cap_usd   numeric not null default 10  check (daily_cap_usd >= 0),
  monthly_cap_usd numeric not null default 100 check (monthly_cap_usd >= 0),
  kill_switch     boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.spend_guard enable row level security;
drop policy if exists "spend_guard owner all" on public.spend_guard;
create policy "spend_guard owner all" on public.spend_guard
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- One call answers everything the gate needs: caps (defaults when no row), the switch, and the
-- REAL spend so far today/this month (UTC windows). security definer: usage_events is service-write.
create or replace function public.spend_guard_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.spend_guard%rowtype; today numeric; mon numeric;
begin
  select * into g from public.spend_guard where owner_id = p_user;
  select coalesce(sum(cost_usd), 0) into today from public.usage_events
   where user_id = p_user and created_at >= date_trunc('day', now());
  select coalesce(sum(cost_usd), 0) into mon from public.usage_events
   where user_id = p_user and created_at >= date_trunc('month', now());
  return jsonb_build_object(
    'kill', coalesce(g.kill_switch, false),
    'daily_cap', coalesce(g.daily_cap_usd, 10),
    'monthly_cap', coalesce(g.monthly_cap_usd, 100),
    'spent_today', today, 'spent_month', mon);
end $$;
