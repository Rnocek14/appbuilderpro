-- Supabase-platform shim for a SHADOW-DB migration test on stock Postgres 16.
-- Stands in for what Supabase provides and this box does not: the auth schema, pgvector, pg_cron,
-- pg_net, vault, storage. The shims are deliberately behaviour-free — they exist so migration SQL
-- can APPLY, so what we are testing is our own DDL, constraints, triggers and RLS, not theirs.
create extension if not exists pgcrypto;

-- ---- auth (Supabase) ----
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

-- ---- pgvector: a shim TYPE so `vector(1536)` columns and casts parse ----
do $$ begin
  create domain public.vector as text;
exception when duplicate_object then null; end $$;

-- ---- pg_cron ----
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command) returning jobid
$$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  delete from cron.job where jobname = job_name; select true
$$;

-- ---- pg_net ----
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 1::bigint $$;

-- ---- vault ----
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets(name, secret) values (new_name, new_secret)
  on conflict (name) do update set secret = excluded.secret returning id
$$;

-- ---- storage ----
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);

-- Roles Supabase policies reference.
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
create or replace function storage.extension(name text) returns text language sql immutable as $$
  select nullif(split_part(storage.filename(name), '.', 2), '')
$$;
alter table cron.job add column if not exists active boolean not null default true;
alter table cron.job add column if not exists database text default current_database();
alter table cron.job add column if not exists username text default current_user;
alter table cron.job add column if not exists nodename text default 'localhost';
alter table cron.job add column if not exists nodeport int default 5432;
