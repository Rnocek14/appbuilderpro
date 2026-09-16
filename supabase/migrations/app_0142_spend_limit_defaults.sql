-- app_0142_spend_limit_defaults.sql — SAFER DEFAULTS FOR THE SPENDING LIMIT, and a guard state that
-- is safe to read from the browser.
--
-- app_0127 gave every owner a daily and a monthly dollar cap, enforced inside checkCredits. Two
-- things were wrong with how it landed for a person who had never heard of it:
--
--   1. The default was $10 a day — $300 a month for someone who never opened Settings. One press of
--      "Find businesses" used to fan out to as many as 120 metered searches, so a cap nobody chose
--      was the only thing between a curious click and a real bill. $5 a day / $50 a month is a
--      default that cannot surprise anyone, and it is one field to raise for anyone who wants more.
--      Only owners who never set their own are affected — an explicit row is never overwritten.
--
--   2. Nothing could READ it except the gate that refuses. The screens with the expensive buttons
--      could not say what had been spent, so the cap arrived with no warning. spend_guard_state is
--      already security definer and already scoped to the caller's own id; it just needed to be
--      callable by a signed-in user so a page can show the number BEFORE the press rather than
--      after the refusal.
--
-- Additive and idempotent, like every migration here.

-- 0. STAND ON OUR OWN. This alters a table app_0127 created, and the live project's schema came
--    from hand-pastes at various vintages rather than a clean replay — the deploy workflow says so
--    in its own comments. A migration that assumes its predecessor landed fails the whole run on
--    exactly the project that needs it most, so this one creates what it needs if it is missing.
--    Identical to app_0127's definition apart from the two defaults, and a no-op where it exists.
create table if not exists public.spend_guard (
  owner_id        uuid primary key references public.profiles(id) on delete cascade,
  daily_cap_usd   numeric not null default 5  check (daily_cap_usd >= 0),
  monthly_cap_usd numeric not null default 50 check (monthly_cap_usd >= 0),
  kill_switch     boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.spend_guard enable row level security;
drop policy if exists "spend_guard owner all" on public.spend_guard;
create policy "spend_guard owner all" on public.spend_guard
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 1. The table default, for owners who get a row from here on.
alter table public.spend_guard alter column daily_cap_usd   set default 5;
alter table public.spend_guard alter column monthly_cap_usd set default 50;

-- 2. The effective default for the many owners who have no row at all — this coalesce, not the
--    column default, is what actually decides their cap.
create or replace function public.spend_guard_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.spend_guard%rowtype; today numeric; mon numeric;
begin
  -- ANSWER ONLY FOR THE CALLER. The function is security definer over usage_events, which is
  -- service-write, so without this anyone holding the anon key could total up somebody else's
  -- spending by passing their id. Two callers are legitimate: the service role, which asks on an
  -- owner's behalf from inside the edge functions and has no auth.uid(), and a signed-in owner
  -- asking about themselves. Everyone else is refused — including an anonymous caller, who has a
  -- null uid and would have slipped through a plain "uid is not null and uid <> p_user".
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user) then
    raise exception 'spend_guard_state: not your account';
  end if;

  select * into g from public.spend_guard where owner_id = p_user;
  select coalesce(sum(cost_usd), 0) into today from public.usage_events
   where user_id = p_user and created_at >= date_trunc('day', now());
  select coalesce(sum(cost_usd), 0) into mon from public.usage_events
   where user_id = p_user and created_at >= date_trunc('month', now());
  return jsonb_build_object(
    'kill', coalesce(g.kill_switch, false),
    'daily_cap', coalesce(g.daily_cap_usd, 5),
    'monthly_cap', coalesce(g.monthly_cap_usd, 50),
    'spent_today', today, 'spent_month', mon);
end $$;

-- PUBLIC holds EXECUTE on a new function by default, which is how this was reachable before any
-- grant existed. Take that back and hand it to the two roles that should have it.
revoke all on function public.spend_guard_state(uuid) from public;
grant execute on function public.spend_guard_state(uuid) to authenticated, service_role;
