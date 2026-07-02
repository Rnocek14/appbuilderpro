-- app_0017_credits.sql
-- Platform-wide credits. ONE balance per user that EVERY server-side AI action deducts from — not
-- just app generation, but chat edits, Garvis, research, plan drafting, the agentic build loop, and
-- media discovery. A credit ≈ $0.01 of underlying AI cost; the deduction is proportional to the REAL
-- cost_usd of each action, so a cheap search costs a little and an app generation costs more, all from
-- the same balance. Monthly grant by plan. This is the margin/abuse guardrail before opening to
-- paying strangers. Enforced structurally via spend_credits() so no feature can forget to charge.

alter table public.profiles
  add column if not exists credits_balance int not null default 100,
  add column if not exists credits_period_start timestamptz not null default now();

-- Credits charged for an action (0 on historical rows). event_type carries the kind.
alter table public.usage_events
  add column if not exists credits int not null default 0;

-- Monthly credit grant by plan — the ONE place to tune allotments (or override per-profile later).
-- A credit ≈ $0.01 of AI cost, so credits × $0.01 is the cost CEILING you grant per user/month.
-- Sized for a healthy margin at typical use with a bounded worst case (see the pricing analysis):
--   free 150  → $1.50 ceiling (intended for Haiku — gate free-tier model choice to keep it cheap)
--   pro  2500 → $25   ceiling (Pro sold ~$49/mo → ~72% typical / ~45% worst-case gross margin)
-- (5000 was a margin bug: $50 of cost for a $49 plan = a loss at full use.) A 'starter' tier ($19 /
-- ~800 credits) needs a plan_tier enum migration — add it when wiring Stripe if you want 3 tiers.
create or replace function public.plan_monthly_credits(p plan_tier)
returns int language sql immutable as $$
  select case p when 'pro' then 2500 else 150 end;
$$;

-- Dollars of underlying AI cost that one credit represents (1 credit = $0.01 of cost).
create or replace function public.credit_usd()
returns numeric language sql immutable as $$ select 0.01::numeric $$;

-- Give every existing user their plan's grant now, and start the window.
update public.profiles set credits_balance = public.plan_monthly_credits(plan), credits_period_start = now();

-- Roll the monthly window if it has elapsed, refilling to the plan grant. Returns the current
-- (possibly refreshed) balance. security definer so the owner and the service role can call it.
create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz;
begin
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_balance := public.plan_monthly_credits(v_plan);
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
  end if;
  return v_balance;
end;
$$;

-- Atomically charge for an AI action: refresh the window, deduct credits derived from the REAL cost
-- (min 1 credit for any billable action), floor at 0, and log a usage_events row with the credits
-- charged. Returns the remaining balance. Called AFTER the AI call (cost is known) by the service role.
create or replace function public.spend_credits(
  p_user uuid, p_cost numeric, p_kind text,
  p_provider text default null, p_model text default null,
  p_in int default 0, p_out int default 0, p_project uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_credits int; v_balance int;
begin
  perform public.refresh_credits(p_user);
  v_credits := greatest(1, ceil(coalesce(p_cost, 0) / public.credit_usd()))::int;
  update public.profiles set credits_balance = greatest(0, credits_balance - v_credits)
    where id = p_user returning credits_balance into v_balance;
  insert into public.usage_events (user_id, project_id, event_type, provider, model, input_tokens, output_tokens, cost_usd, credits)
    values (p_user, p_project, p_kind, p_provider, p_model, coalesce(p_in, 0), coalesce(p_out, 0), coalesce(p_cost, 0), v_credits);
  return coalesce(v_balance, 0);
end;
$$;

grant execute on function public.plan_monthly_credits(plan_tier) to authenticated, service_role;
grant execute on function public.refresh_credits(uuid) to authenticated, service_role;
grant execute on function public.spend_credits(uuid, numeric, text, text, text, int, int, uuid) to authenticated, service_role;

-- SECURITY: users may update their own profile, but must NOT be able to grant themselves credits or
-- change plan/role/limits. Recreate the update policy pinning all privileged columns (credits included).
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and plan = (select plan from public.profiles where id = auth.uid())
    and monthly_generation_limit = (select monthly_generation_limit from public.profiles where id = auth.uid())
    and credits_balance = (select credits_balance from public.profiles where id = auth.uid())
    and credits_period_start = (select credits_period_start from public.profiles where id = auth.uid())
  );
