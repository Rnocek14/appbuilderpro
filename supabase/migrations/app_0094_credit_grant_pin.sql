-- CREDIT FUNCTION PINNING (July 2026 scan, defect B10). app_0017 granted refresh_credits and
-- spend_credits to `authenticated` with an arbitrary p_user parameter and no caller check — any
-- signed-in session could drain any account's balance (a griefing vector that 402-pauses the
-- whole autonomy loop) or roll a stranger's refill window. grant_credits was locked down in
-- app_0056; these two were missed.
--
-- The pin: when a real JWT is present (auth.uid() not null), p_user MUST be the caller. Service
-- role and pg_cron paths carry no user claim (auth.uid() null) and keep operating on any row —
-- that's the edge functions' path, unchanged. Definitions otherwise identical to app_0017.

create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'refresh_credits: callers may only refresh their own balance';
  end if;
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

create or replace function public.spend_credits(
  p_user uuid, p_cost numeric, p_kind text,
  p_provider text default null, p_model text default null,
  p_in int default 0, p_out int default 0, p_project uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_credits int; v_balance int;
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'spend_credits: callers may only spend their own balance';
  end if;
  perform public.refresh_credits(p_user);
  v_credits := greatest(1, ceil(coalesce(p_cost, 0) / public.credit_usd()))::int;
  update public.profiles set credits_balance = greatest(0, credits_balance - v_credits)
    where id = p_user returning credits_balance into v_balance;
  insert into public.usage_events (user_id, project_id, event_type, provider, model, input_tokens, output_tokens, cost_usd, credits)
    values (p_user, p_project, p_kind, p_provider, p_model, coalesce(p_in, 0), coalesce(p_out, 0), coalesce(p_cost, 0), v_credits);
  return coalesce(v_balance, 0);
end;
$$;
