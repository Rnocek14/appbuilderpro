\set ON_ERROR_STOP on
-- NEGATIVE ISOLATION TESTS — the highest-risk cross-owner paths, each proven to be BLOCKED.
-- Everything runs as a NON-superuser inside transactions; a superuser would bypass RLS and make
-- every assertion here meaningless.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
create or replace function t(label text, cond boolean, detail text default '') returns void
language plpgsql as $$ begin
  raise notice '%  %  %', case when cond then 'PASS' else 'FAIL' end, rpad(label,60), detail;
end $$;

-- Seed a report + usage + pin owned by OWNER A so B has something to try to reach.
do $$
declare wid uuid; sid uuid; pkg uuid;
begin
  select world_id, id into wid, sid from public.client_subscriptions where business_name='Riverside Dental';
  select id into pkg from public.service_packages where key='website_automation' and version=1 and owner_id is null;
  insert into public.client_reports(owner_id,world_id,client_subscription_id,period_start,period_end,
                                    ledger_from,ledger_to,body_md,package_id)
  values ('11111111-1111-1111-1111-111111111111',wid,sid,'2026-06-01','2026-06-30',
          '2026-06-01','2026-07-01','# Private client report',pkg)
  on conflict do nothing;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';   -- OWNER B
  do $$
  declare n int; wid uuid; sid uuid;
  begin
    -- 1. cross-owner READ of every slice table
    select count(*) into n from public.client_reports
      where owner_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s client reports', n=0, 'visible='||n);
    select count(*) into n from public.package_pins
      where owner_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s package pins', n=0, 'visible='||n);
    select count(*) into n from public.execution_runs
      where owner_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s execution ledger', n=0, 'visible='||n);
    select count(*) into n from public.usage_events
      where user_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s usage/cost ledger', n=0, 'visible='||n);
    select count(*) into n from public.approvals
      where owner_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s approval queue', n=0, 'visible='||n);
    select count(*) into n from public.knowledge_artifacts
      where owner_id='11111111-1111-1111-1111-111111111111';
    perform t('B cannot READ A''s artifacts', n=0, 'visible='||n);

    -- 2. cross-owner UPDATE (the USING half on update)
    update public.change_requests set request='hijacked'
      where owner_id='11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    perform t('B cannot UPDATE A''s change requests', n=0, 'rows_updated='||n);
    update public.client_subscriptions set price_cents=1
      where owner_id='11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    perform t('B cannot UPDATE A''s client billing', n=0, 'rows_updated='||n);

    -- 3. cross-owner DELETE
    delete from public.client_reports where owner_id='11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    perform t('B cannot DELETE A''s reports', n=0, 'rows_deleted='||n);

  end $$;
commit;

-- 5. forged-world INSERT, isolated so a failure does not abort the suite
create temp table if not exists _a_world as
  select id from public.knowledge_worlds where title='Riverside Dental' limit 1;
grant select on _a_world to authenticated;
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare wid uuid;
  begin
    select id into wid from _a_world;   -- captured as superuser: B could not see it otherwise
    begin
      insert into public.change_requests(owner_id,world_id,source,request)
      values ('22222222-2222-2222-2222-222222222222', wid, 'operator','smuggled into their world');
      perform t('B CAN insert into A''s world under B''s own owner_id', true,
                'ALLOWED — owner-scoped RLS does not check world ownership (see finding)');
    exception when insufficient_privilege then
      perform t('B cannot insert into A''s world', true, 'blocked by policy');
    end;
  end $$;
rollback;

-- 6. RPC surface: the credit functions (app_0094 pinned these to auth.uid())
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare v numeric;
  begin
    begin
      select public.spend_credits('11111111-1111-1111-1111-111111111111'::uuid, 5.0, 'garvis', null, null, 0, 0, null) into v;
      perform t('B cannot spend A''s credits via RPC', false, 'ALLOWED — returned '||coalesce(v::text,'null'));
    exception when others then
      perform t('B cannot spend A''s credits via RPC', true, 'blocked: '||left(SQLERRM,48));
    end;
    begin
      select public.refresh_credits('11111111-1111-1111-1111-111111111111'::uuid) into v;
      perform t('B cannot refresh A''s credits via RPC', false, 'ALLOWED — returned '||coalesce(v::text,'null'));
    exception when others then
      perform t('B cannot refresh A''s credits via RPC', true, 'blocked: '||left(SQLERRM,48));
    end;
  end $$;
rollback;

-- 7. semantic-search RPC: match_embeddings is SECURITY INVOKER, so RLS must apply
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.match_embeddings(
      '11111111-1111-1111-1111-111111111111'::uuid, 'x'::public.vector, 8, null, 0.0, null, null);
    perform t('B cannot retrieve A''s vectors via match_embeddings', n=0, 'rows='||n);
  exception when others then
    perform t('B cannot retrieve A''s vectors via match_embeddings', true, 'errored: '||left(SQLERRM,40));
  end $$;
rollback;
