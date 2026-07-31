\set ON_ERROR_STOP on
-- Every gather query the fleet hook and the report run-half issue, as raw SQL against the real
-- schema. A column that does not exist, or a filter PostgREST would reject, fails HERE.
create or replace function t(label text, cond boolean, detail text default '') returns void
language plpgsql as $$ begin
  raise notice '%  %  %', case when cond then 'PASS' else 'FAIL' end, rpad(label,58), detail;
end $$;

do $$
declare n int;
begin
  -- fleet: clients + pins + packages (the embed, expressed as its SQL join)
  select count(*) into n from public.client_subscriptions cs
    left join public.package_pins pp on pp.client_subscription_id = cs.id
    left join public.service_packages sp on sp.id = pp.package_id
   where cs.status <> 'canceled';
  perform t('fleet gather: clients+pins+packages join', true, 'rows='||n);

  select count(*) into n from public.package_consents;
  perform t('fleet gather: consents', true, 'rows='||n);

  select count(*) into n from public.standing_orders where kind='watch_url' and status='active';
  perform t('fleet gather: active watches', n>=1, 'rows='||n);

  -- the breaker columns the fleet reads (app_0113)
  select count(*) into n from public.automation_triggers
    where status is not null and consecutive_failures >= 0;
  perform t('fleet gather: automation_triggers breaker columns exist', true, 'rows='||n);

  select count(*) into n from public.standing_orders
    where kind='watch_url' and (last_result is null or last_result ? 'status');
  perform t('fleet gather: watch last_result is jsonb-shaped', true, 'rows='||n);

  select count(*) into n from public.change_requests
    where status not in ('closed','declined');
  perform t('fleet gather: open change requests filter', true, 'rows='||n);

  select count(*) into n from public.client_reports;
  perform t('fleet gather: reports', true, 'rows='||n);

  select count(*) into n from public.usage_events
    where world_id is not null and created_at >= now() - interval '30 days';
  perform t('fleet gather: usage by world (world_id column exists)', true, 'rows='||n);

  -- report gather: the exact joins clientReportRun issues
  select count(*) into n from public.trigger_fires tf
    join public.automation_triggers at2 on at2.id = tf.trigger_id
   where at2.client_subscription_id is not null;
  perform t('report gather: trigger_fires -> automation_triggers', true, 'rows='||n);

  select count(*) into n from public.outreach_messages om
    left join public.replies r on r.message_id = om.id;
  perform t('report gather: outreach_messages -> replies (real columns)', true, 'rows='||n);

  select count(*) into n from public.contacts where world_id is not null;
  perform t('report gather: contacts.world_id exists', true, 'rows='||n);

  -- the columns the report selects by name
  perform 1 from public.outreach_messages where sent_at is null and opened_at is null limit 1;
  perform t('report gather: sent_at + opened_at exist on messages', true);
end $$;

-- Cost attribution: does a client's spend actually land under their world?
do $$
declare wid uuid; total numeric;
begin
  select world_id into wid from public.client_subscriptions where business_name='Riverside Dental';
  insert into public.usage_events(user_id,event_type,provider,model,cost_usd,world_id)
  values ('11111111-1111-1111-1111-111111111111','garvis','anthropic','claude',0.31,wid);
  insert into public.usage_events(user_id,event_type,provider,model,cost_usd,world_id)
  values ('11111111-1111-1111-1111-111111111111','discover','anthropic','claude',9.99,null); -- pre-client hunt
  select coalesce(sum(cost_usd),0) into total from public.usage_events where world_id=wid;
  perform t('metering: client cost attributes to their world', total=0.31, 'client_total='||total);
  select coalesce(sum(cost_usd),0) into total from public.usage_events where world_id is null;
  perform t('metering: platform-scoped cost stays OUT of the client', total=9.99, 'platform_total='||total);
end $$;
