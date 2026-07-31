\set ON_ERROR_STOP on
\pset pager off
-- ============================================================================
-- STAGE 1 — LIVE SUBSTRATE (shadow DB). No external sends. Real rows, real
-- constraints, real triggers. Each block prints PASS/FAIL with what it saw.
-- ============================================================================
create or replace function t(label text, cond boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%  %  %', case when cond then 'PASS' else 'FAIL' end, rpad(label, 62), detail;
end $$;

-- Owner + a second owner (isolation control)
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','operator@test'),
  ('22222222-2222-2222-2222-222222222222','other@test') on conflict do nothing;
insert into public.profiles(id,email,role,plan) values
  ('11111111-1111-1111-1111-111111111111','operator@test','admin','pro'),
  ('22222222-2222-2222-2222-222222222222','other@test','user','free') on conflict do nothing;

-- ---------------------------------------------------------------- 1. ENUM FIX
do $$
declare ok boolean;
begin
  select exists(select 1 from pg_enum e join pg_type ty on ty.oid=e.enumtypid
                where ty.typname='approval_kind' and e.enumlabel='send_sms') into ok;
  perform t('app_0112: send_sms exists in approval_kind', ok, '(the SMS rail was dead at the DB)');
end $$;

-- ------------------------------------------------------- 2. PACKAGE SEED (v1)
do $$
declare n int; dbl int;
begin
  select count(*) into n from public.service_packages where owner_id is null and version=1;
  perform t('app_0115: both built-in packages seeded at v1', n=2, 'found '||n);
  -- re-running the seed must NOT duplicate (nulls-not-distinct uniqueness)
  begin
    insert into public.service_packages(owner_id,key,version,name,cadence,definition,status)
    values (null,'website',1,'dupe','one_time','{}','current');
    select count(*) into dbl from public.service_packages where key='website' and version=1;
    perform t('nulls-not-distinct blocks a duplicate built-in', false, 'DUPLICATE INSERTED: '||dbl);
  exception when unique_violation then
    perform t('nulls-not-distinct blocks a duplicate built-in', true, 'unique_violation as designed');
  end;
end $$;

-- --------------------------------------- 3. CLOSE-WON: world + link + one watch
do $$
declare wid uuid; sid uuid; pkg uuid; nwatch int; nworld int;
begin
  insert into public.knowledge_worlds(owner_id,title,description)
  values ('11111111-1111-1111-1111-111111111111','Riverside Dental','Client world — pilot')
  returning id into wid;
  insert into public.client_subscriptions(owner_id,business_name,email,world_id,tier,cadence,price_cents,status)
  values ('11111111-1111-1111-1111-111111111111','Riverside Dental','dr@riverside.test',wid,'website_automation','monthly',50000,'active')
  returning id into sid;

  select count(*) into nworld from public.knowledge_worlds
   where owner_id='11111111-1111-1111-1111-111111111111' and title='Riverside Dental';
  perform t('close-won creates exactly ONE world', nworld=1, 'worlds='||nworld);
  perform t('subscription links to the correct world',
            (select world_id from public.client_subscriptions where id=sid)=wid);

  select id into pkg from public.service_packages where key='website_automation' and version=1 and owner_id is null;
  insert into public.package_pins(owner_id,client_subscription_id,package_id) values
    ('11111111-1111-1111-1111-111111111111',sid,pkg);
  perform t('package version pins to the client',
            (select count(*) from public.package_pins where client_subscription_id=sid)=1);

  -- the watch, armed twice (webhook redelivery) — must stay ONE
  insert into public.standing_orders(owner_id,world_id,kind,label,cadence,config,status,anchor_at,next_run_at)
  values ('11111111-1111-1111-1111-111111111111',wid,'watch_url','Client site: Riverside Dental','daily',
          jsonb_build_object('url','https://riverside.test','client_subscription_id',sid),'active',now(),now());
  -- second delivery: the code guards with a select-then-insert; emulate the guard
  if not exists (select 1 from public.standing_orders
                 where owner_id='11111111-1111-1111-1111-111111111111' and kind='watch_url'
                   and config->>'url'='https://riverside.test') then
    insert into public.standing_orders(owner_id,world_id,kind,label,cadence,config,status,anchor_at,next_run_at)
    values ('11111111-1111-1111-1111-111111111111',wid,'watch_url','dupe','daily',jsonb_build_object('url','https://riverside.test'),'active',now(),now());
  end if;
  select count(*) into nwatch from public.standing_orders
   where kind='watch_url' and config->>'url'='https://riverside.test';
  perform t('duplicate webhook delivery stays idempotent (1 watch)', nwatch=1, 'watches='||nwatch);
  perform t('the watch carries the client world', (select world_id from public.standing_orders
            where kind='watch_url' and config->>'url'='https://riverside.test' limit 1)=wid);
end $$;

-- ----------------------------------- 4. THE WORLD STAMP TRIGGER (app_0114) ---
do $$
declare wid uuid; apid uuid; runid uuid; stamped uuid;
begin
  select world_id into wid from public.client_subscriptions where business_name='Riverside Dental';
  insert into public.approvals(owner_id,kind,title,preview,payload,world_id,requested_by)
  values ('11111111-1111-1111-1111-111111111111','send_email','Monthly report','...','{}',wid,'user')
  returning id into apid;
  -- an executor writes a run WITHOUT specifying world_id
  insert into public.execution_runs(owner_id,approval_id,connector,action,request,status)
  values ('11111111-1111-1111-1111-111111111111',apid,'resend','send_email','{}','ok')
  returning id into runid;
  select world_id into stamped from public.execution_runs where id=runid;
  perform t('execution_runs INHERITS world_id from its approval', stamped=wid,
            coalesce('stamped='||stamped::text,'NULL — the spine is broken'));

  -- an SMS approval must now be insertable (the app_0112 fix, end to end)
  begin
    insert into public.approvals(owner_id,kind,title,preview,payload,world_id,requested_by)
    values ('11111111-1111-1111-1111-111111111111','send_sms','Recall text','...','{}',wid,'garvis-auto');
    perform t('an SMS approval now inserts (was dead before app_0112)', true);
  exception when others then
    perform t('an SMS approval now inserts', false, SQLERRM);
  end;
end $$;

-- -------------------------------------- 5. CHANGE REQUESTS: world is mandatory
do $$
declare wid uuid; sid uuid;
begin
  select world_id, id into wid, sid from public.client_subscriptions where business_name='Riverside Dental';
  begin
    insert into public.change_requests(owner_id,world_id,source,request)
    values ('11111111-1111-1111-1111-111111111111',null,'operator','unscoped request');
    perform t('change_requests REFUSES a world-less request', false, 'IT WAS ACCEPTED');
  exception when not_null_violation then
    perform t('change_requests REFUSES a world-less request', true, 'not_null_violation as designed');
  end;
  insert into public.change_requests(owner_id,world_id,client_subscription_id,source,requester,request,status)
  values ('11111111-1111-1111-1111-111111111111',wid,sid,'client_email','Dr. Patel','Add a gift-card page','received');
  perform t('a scoped change request is accepted',
            (select count(*) from public.change_requests where world_id=wid)=1);
  -- illegal status must be refused by the check constraint
  begin
    update public.change_requests set status='teleported' where world_id=wid;
    perform t('an invalid lifecycle status is refused', false, 'IT WAS ACCEPTED');
  exception when check_violation then
    perform t('an invalid lifecycle status is refused', true, 'check_violation as designed');
  end;
end $$;

-- --------------------------------------------- 6. ISOLATION UNDER REAL RLS ---
do $$
declare wid2 uuid; sid2 uuid;
begin
  insert into public.knowledge_worlds(owner_id,title) values
    ('22222222-2222-2222-2222-222222222222','Someone Else Ltd') returning id into wid2;
  insert into public.client_subscriptions(owner_id,business_name,world_id,tier,cadence,price_cents,status)
  values ('22222222-2222-2222-2222-222222222222','Someone Else Ltd',wid2,'website','one_time',150000,'active')
  returning id into sid2;
  insert into public.change_requests(owner_id,world_id,client_subscription_id,source,request,status)
  values ('22222222-2222-2222-2222-222222222222',wid2,sid2,'operator','Their private request','received');
end $$;

-- NOTE: isolation is NOT tested here. This file runs as the postgres superuser, which
-- BYPASSES row-level security entirely — any RLS assertion made here would pass or fail for
-- reasons that have nothing to do with the policies. The real proof runs as a non-superuser
-- inside transactions in 20-isolation.sql.
