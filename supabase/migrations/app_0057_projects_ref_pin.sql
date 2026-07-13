-- app_0057_projects_ref_pin.sql — deep scan VERIFICATION fix: the cross-tenant P0 was only relocated.
--
-- apply-migration / deploy-backend now derive the Supabase project ref from
-- projects.supabase_project_ref instead of trusting a client-supplied ref. But nothing stopped the
-- OWNER from writing that column: a managed-tier attacker could set a VICTIM's ref (+
-- supabase_managed=true) onto their OWN project row (via UPDATE, or a fresh INSERT), then call the
-- function — and the shared FF_PLATFORM_MANAGEMENT_TOKEN would operate on the victim's database. The
-- vector moved from the request body to the project row; this closes it.
--
-- These three columns are set ONLY server-side (provision-supabase / deploy-backend, which run as the
-- service role). A BEFORE trigger is used rather than an RLS WITH CHECK because a trigger compares
-- OLD vs NEW definitively — no dependency on subquery isolation semantics. The service role bypasses
-- the guard so legitimate provisioning still works. Additive + idempotent.

create or replace function public.guard_project_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Provisioning runs as the service role — let it set these columns. Everyone else is pinned.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.supabase_project_ref is not null
       or new.supabase_managed is distinct from false
       or new.ai_gateway_key is not null then
      raise exception 'projects.supabase_project_ref / supabase_managed / ai_gateway_key are set server-side only';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.supabase_project_ref is distinct from old.supabase_project_ref
       or new.supabase_managed is distinct from old.supabase_managed
       or new.ai_gateway_key is distinct from old.ai_gateway_key then
      raise exception 'projects.supabase_project_ref / supabase_managed / ai_gateway_key are set server-side only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_project_privileged_cols on public.projects;
create trigger guard_project_privileged_cols
  before insert or update on public.projects
  for each row execute function public.guard_project_privileged_cols();

comment on function public.guard_project_privileged_cols() is
  'Pins projects.supabase_project_ref / supabase_managed / ai_gateway_key to server-role writes only — closes the relocated cross-tenant ref vector (deep scan).';
