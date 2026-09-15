\set ON_ERROR_STOP on
\pset pager off
-- ============================================================================
-- STAGE 4 — THE APPROVAL BINDS THE CONTENT (app_0139/0140/0141).
-- The pure suites prove the hash covers the right fields. This proves the
-- DATABASE keeps its half of the bargain: a version really is immutable, the
-- version numbers really do climb, a phone-only inquiry really can be recorded,
-- and the widened status/kind constraints really do accept what the code writes.
-- Real rows, real triggers, real constraints. No external sends.
-- ============================================================================
-- Supabase grants these automatically via ALTER DEFAULT PRIVILEGES; stock Postgres does not, and
-- this suite must stand on its own as well as after 20-isolation (the same two lines it uses).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create or replace function t(label text, cond boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%  %  %', case when cond then 'PASS' else 'FAIL' end, rpad(label, 62), detail;
end $$;

insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','operator@test') on conflict do nothing;
insert into public.profiles(id,email,role,plan) values
  ('11111111-1111-1111-1111-111111111111','operator@test','admin','pro') on conflict do nothing;

-- ------------------------------------------------------------- fixtures
do $$
declare w uuid; p uuid; c uuid; f uuid;
begin
  insert into public.knowledge_worlds(owner_id,title) values
    ('11111111-1111-1111-1111-111111111111','Gina Marketing') returning id into w;
  insert into public.re_communities(owner_id,world_id,slug,name,kind,boundary_note) values
    ('11111111-1111-1111-1111-111111111111', w, 'abbey-springs','Abbey Springs','association','The association parcels only — not the wider town.')
    returning id into c;
  insert into public.re_facts(owner_id,world_id,community_id,claim,value_text,status,reviewed_at,review_due_at,reviewed_by)
    values ('11111111-1111-1111-1111-111111111111', w, c,'Dues are billed quarterly','billed quarterly','verified', now(), now() + interval '90 days','Gina')
    returning id into f;
  insert into public.re_fact_sources(owner_id,fact_id,url,title,source_kind,quote)
    values ('11111111-1111-1111-1111-111111111111', f,'https://abbeysprings.example/dues','Dues schedule','association','Dues are billed quarterly.');
  insert into public.social_posts(owner_id,world_id,body,platforms,status)
    values ('11111111-1111-1111-1111-111111111111', w,'Abbey Springs dues are billed quarterly.', array['instagram'],'queued')
    returning id into p;
  insert into public.post_versions(owner_id,post_id,body,platforms,fact_ids,content_hash,scheduled_local,schedule_tz)
    values ('11111111-1111-1111-1111-111111111111', p,'Abbey Springs dues are billed quarterly.', array['instagram'], array[f],'hash-v1','2026-09-20T18:30','America/Chicago');
  perform set_config('shadow.post', p::text, false);
  perform set_config('shadow.world', w::text, false);
  perform t('fixtures: community, sourced fact, post and version all insert', true, '');
end $$;

-- ------------------------------------------------- version numbering climbs
do $$
declare p uuid := current_setting('shadow.post')::uuid; v2 int;
begin
  insert into public.post_versions(owner_id,post_id,body,platforms,content_hash)
    values ('11111111-1111-1111-1111-111111111111', p,'Edited after approval.', array['instagram'],'hash-v2')
    returning version into v2;
  perform t('a second version is numbered 2 automatically', v2 = 2, format('version=%s', v2));
end $$;

-- ------------------------------------------------- a version is IMMUTABLE
do $$
declare p uuid := current_setting('shadow.post')::uuid; blocked boolean := false;
begin
  begin
    update public.post_versions set body = 'rewritten' where post_id = p and version = 1;
  exception when others then blocked := true;
  end;
  perform t('an approved version CANNOT be updated (even as superuser)', blocked, 'trigger refused the rewrite');
end $$;

do $$
declare p uuid := current_setting('shadow.post')::uuid; blocked boolean := false;
begin
  begin
    delete from public.post_versions where post_id = p and version = 1;
  exception when others then blocked := true;
  end;
  perform t('an approved version CANNOT be deleted', blocked, 'trigger refused the delete');
end $$;

do $$
declare p uuid := current_setting('shadow.post')::uuid; n int;
begin
  select count(*) into n from public.post_versions where post_id = p;
  perform t('both versions survive — history is intact', n = 2, format('versions=%s', n));
end $$;

-- ------------------------------------- one version per number, per post
do $$
declare p uuid := current_setting('shadow.post')::uuid; blocked boolean := false;
begin
  begin
    insert into public.post_versions(owner_id,post_id,version,body,platforms,content_hash)
      values ('11111111-1111-1111-1111-111111111111', p, 1,'duplicate', array['instagram'],'hash-dup');
  exception when unique_violation then blocked := true;
  end;
  perform t('a duplicate version number is refused', blocked, 'unique (post_id, version)');
end $$;

-- ----------------------------------------- the sending state now exists
do $$
declare p uuid := current_setting('shadow.post')::uuid; ok boolean := true;
begin
  begin
    update public.social_posts set status = 'in_flight', claimed_at = now() where id = p;
  exception when check_violation then ok := false;
  end;
  perform t('a post can be marked in_flight (the timeout state)', ok, 'app_0140 widened the check');
  update public.social_posts set status = 'queued', claimed_at = null where id = p;
end $$;

do $$
declare p uuid := current_setting('shadow.post')::uuid; blocked boolean := false;
begin
  begin
    update public.social_posts set status = 'whatever' where id = p;
  exception when check_violation then blocked := true;
  end;
  perform t('an invented status is still refused', blocked, 'check_violation as designed');
end $$;

-- ------------------------------------ rendered video finally has a home
do $$
declare w uuid := current_setting('shadow.world')::uuid; cl uuid; ok boolean := true;
begin
  insert into public.knowledge_clusters(owner_id,world_id,slug,title)
    values ('11111111-1111-1111-1111-111111111111', w,'media','Media') returning id into cl;
  begin
    insert into public.cluster_files(owner_id,cluster_id,name,url,kind)
      values ('11111111-1111-1111-1111-111111111111', cl,'render.mp4','https://x.test/render.mp4','video');
  exception when check_violation then ok := false;
  end;
  perform t('a rendered VIDEO can be recorded (render-video was silently failing)', ok, 'app_0140 widened cluster_files.kind');
end $$;

-- ------------------------------------------- a phone call is an inquiry
do $$
declare w uuid := current_setting('shadow.world')::uuid; ok boolean := true; blocked boolean := false;
begin
  begin
    insert into public.leads(owner_id,world_id,phone,name,message,source)
      values ('11111111-1111-1111-1111-111111111111', w,'+1-262-555-0100','Caller','Asked about Abbey Springs','phone');
  exception when others then ok := false;
  end;
  perform t('a phone-only inquiry can be recorded (email was not null before)', ok, '');

  begin
    insert into public.leads(owner_id,world_id,name,message,source)
      values ('11111111-1111-1111-1111-111111111111', w,'Ghost','no way to reply','phone');
  exception when check_violation then blocked := true;
  end;
  perform t('an inquiry with NEITHER email nor phone is still refused', blocked, 'leads_email_or_phone');
end $$;

-- --------------------------------------- attribution is a foreign key
do $$
declare w uuid := current_setting('shadow.world')::uuid; p uuid := current_setting('shadow.post')::uuid;
        cmp uuid; ld uuid; joined int;
begin
  insert into public.marketing_campaigns(owner_id,world_id,subject,offer,owner_name,status)
    values ('11111111-1111-1111-1111-111111111111', w,'Abbey Springs owner brief','A neighborhood owner brief','Gina','active')
    returning id into cmp;
  update public.social_posts set campaign_id = cmp where id = p;
  insert into public.leads(owner_id,world_id,email,campaign_id,post_id,source,first_source,stated_influence)
    values ('11111111-1111-1111-1111-111111111111', w,'owner@example.test', cmp, p,'social','social','Saw the dues post')
    returning id into ld;
  insert into public.re_outcomes(owner_id,world_id,lead_id,campaign_id,kind,occurred_on,attribution,note)
    values ('11111111-1111-1111-1111-111111111111', w, ld, cmp,'appointment_set', current_date,'stated','They said which post');

  select count(*) into joined
    from public.re_outcomes o
    join public.leads l on l.id = o.lead_id
    join public.social_posts sp on sp.id = l.post_id
    join public.marketing_campaigns mc on mc.id = o.campaign_id
   where o.world_id = w;
  perform t('post -> inquiry -> outcome joins end to end', joined = 1, format('rows=%s', joined));
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.re_outcomes(owner_id,kind,occurred_on,attribution)
      values ('11111111-1111-1111-1111-111111111111','listing_signed', current_date,'made-it-up');
  exception when check_violation then blocked := true;
  end;
  perform t('an invented attribution value is refused', blocked, 'stated | inferred | unknown only');
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.re_outcomes where attribution = 'unknown';
  insert into public.re_outcomes(owner_id,kind,occurred_on)
    values ('11111111-1111-1111-1111-111111111111','qualified_conversation', current_date);
  select count(*) into n from public.re_outcomes where attribution = 'unknown';
  perform t('attribution defaults to UNKNOWN, never to a guess', n = 1, format('unknown=%s', n));
end $$;

-- ------------------------------------------------- facts: RLS is scoped
do $$
declare visible int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  select count(*) into visible from public.re_facts;
  reset role;
  perform t('RLS: another operator sees NONE of these community facts', visible = 0, format('visible=%s', visible));
end $$;

do $$
declare visible int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  select count(*) into visible from public.post_versions;
  reset role;
  perform t('RLS: another operator sees NONE of these approved versions', visible = 0, format('visible=%s', visible));
end $$;

do $$
declare blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  begin
    update public.post_versions set body = 'owner rewrite' where content_hash = 'hash-v1';
    -- RLS grants no UPDATE policy, so this updates zero rows rather than raising.
    blocked := not found;
  exception when others then blocked := true;
  end;
  reset role;
  perform t('RLS: even the OWNER cannot rewrite an approved version', blocked, 'no update policy');
end $$;
