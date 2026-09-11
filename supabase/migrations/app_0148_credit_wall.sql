-- app_0148_credit_wall.sql — DEEP REVIEW 2026-08 fixes #5, #6, #7 (docs/reviews/deep-review-2026-08.md).
-- Three holes in the spend wall, all record/read-side, closed in one migration:
--
--  #5 spend_guard_state had no auth.uid() pin and no revoke — any anon-key session could read
--     any user's spend totals, caps, and kill-switch state (the app_0094 "B10" defect class,
--     repeated by the RPC added after that fix). Pinned + revoked like every other credit RPC.
--  #6 the direct-mode usage_events client-insert policy constrained only user_id — one
--     cost_usd = -99999 row made the guard's sums permanently negative, disarming the dollar
--     caps for that account forever. The policy now bounds what a client may log: non-negative,
--     sane per-event ceiling. Service-role writes are unaffected (RLS does not apply to them).
--  #7 app_0094 recreated refresh_credits from the app_0017 text and silently dropped
--     app_0054's credit_grant ledger insert — monthly grants vanished from the ledger on any
--     fresh DB. Recreated ONCE MORE with BOTH the auth pin (0094) and the grant insert (0054).
--
-- Additive + idempotent.

-- ---- #5: pin + revoke spend_guard_state --------------------------------------------------
create or replace function public.spend_guard_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.spend_guard%rowtype; today numeric; mon numeric;
begin
  -- The pin (app_0094 pattern): a real JWT may only read its own guard; service role and
  -- pg_cron carry no user claim (auth.uid() null) and keep operating on any row.
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'spend_guard_state: callers may only read their own guard';
  end if;
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
revoke all on function public.spend_guard_state(uuid) from public;
revoke all on function public.spend_guard_state(uuid) from anon;

-- ---- #6: bound what a client may log ------------------------------------------------------
drop policy if exists "usage insert own" on public.usage_events;
create policy "usage insert own" on public.usage_events
  for insert with check (
    user_id = auth.uid()
    and cost_usd >= 0            -- a negative row would poison the guard's sums forever
    and cost_usd <= 50           -- no single client-logged event costs more than this
  );

-- ---- #7: refresh_credits with the pin AND the grant ledger --------------------------------
create or replace function public.refresh_credits(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_plan plan_tier; v_balance int; v_start timestamptz; v_grant int;
begin
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'refresh_credits: callers may only refresh their own balance';
  end if;
  select plan, credits_balance, credits_period_start into v_plan, v_balance, v_start
    from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  if v_start is null or now() >= v_start + interval '1 month' then
    v_grant := public.plan_monthly_credits(v_plan);
    v_balance := v_grant;
    update public.profiles set credits_balance = v_balance, credits_period_start = now() where id = p_user;
    -- The grant stays ON the ledger (app_0054): balance = Σ grants − Σ spends is checkable.
    insert into public.usage_events (user_id, event_type, cost_usd, credits)
      values (p_user, 'credit_grant', 0, v_grant);
  end if;
  return v_balance;
end;
$$;
