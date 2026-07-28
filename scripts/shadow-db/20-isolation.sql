\set ON_ERROR_STOP on
-- RLS is only enforced for a NON-superuser. postgres bypasses it, so the earlier run proved
-- nothing about isolation. Grant the Supabase-style role and test inside a real transaction.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
create or replace function t(label text, cond boolean, detail text default '') returns void
language plpgsql as $$ begin
  raise notice '%  %  %', case when cond then 'PASS' else 'FAIL' end, rpad(label,62), detail;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  do $$
  declare vis int; foreign_vis int;
  begin
    select count(*) into vis from public.change_requests;
    select count(*) into foreign_vis from public.change_requests
      where owner_id='22222222-2222-2222-2222-222222222222';
    perform t('RLS: operator sees ONLY their own change requests', vis=1 and foreign_vis=0,
              'visible='||vis||' foreign='||foreign_vis);
    select count(*) into vis from public.client_subscriptions;
    perform t('RLS: operator sees ONLY their own clients', vis=1, 'visible='||vis);
    select count(*) into vis from public.knowledge_worlds;
    perform t('RLS: operator sees ONLY their own worlds', vis=1, 'visible='||vis);
    select count(*) into vis from public.client_reports;
    perform t('RLS: reports table is world/owner scoped', vis=0, 'visible='||vis);
  end $$;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare vis int; leaked int;
  begin
    select count(*) into vis from public.change_requests;
    select count(*) into leaked from public.change_requests
      where request='Add a gift-card page';
    perform t('RLS: the OTHER owner cannot see the pilot client''s request', vis=1 and leaked=0,
              'visible='||vis||' leaked='||leaked);
  end $$;
commit;

-- Cross-owner WRITE attempt: the WITH CHECK half of the policy.
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare wid uuid;
  begin
    select world_id into wid from public.client_subscriptions
      where business_name='Riverside Dental';   -- invisible to this owner, but we know the id
    begin
      insert into public.change_requests(owner_id,world_id,source,request)
      values ('11111111-1111-1111-1111-111111111111', wid, 'operator','forged on their behalf');
      perform t('RLS: forging a row for another owner is BLOCKED', false, 'IT WAS ACCEPTED');
    exception when insufficient_privilege then
      perform t('RLS: forging a row for another owner is BLOCKED', true, 'policy violation as designed');
    end;
  end $$;
commit;
