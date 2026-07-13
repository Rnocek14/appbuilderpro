-- app_0056_credit_integrity.sql — deep scan hardening (additive, idempotent).
-- (1) Reassert the fully-pinned profile-update policy as the LAST word in the numbered sequence, so
--     even if a loose file recreated a permissive version, the migrations end secure.
-- (2) An atomic credit-grant RPC so the Stripe top-up stops doing a read-modify-write on
--     credits_balance (two concurrent credited events could interleave and lose a grant).

-- (1) ------------------------------------------------------------------------
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

-- (2) ------------------------------------------------------------------------
-- Atomic increment: one UPDATE, no read-then-write. SECURITY DEFINER so it can move credits (the
-- update-own-profile policy correctly forbids the client from doing so); locked down to service_role
-- (the Stripe webhook runs as service role — this is never callable by anon/authenticated).
create or replace function public.grant_credits(p_user uuid, p_credits int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set credits_balance = credits_balance + greatest(0, coalesce(p_credits, 0))
   where id = p_user
  returning credits_balance;
$$;

revoke execute on function public.grant_credits(uuid, int) from anon, authenticated, public;
grant execute on function public.grant_credits(uuid, int) to service_role;

comment on function public.grant_credits(uuid, int) is
  'Atomically add credits to a user (Stripe top-up). service_role only; never client-callable.';
