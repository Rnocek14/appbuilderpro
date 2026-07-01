-- app_0014_connections.sql
-- Server-side store for a user's external provider connections (Supabase / GitHub / Netlify / …).
-- Tokens live here instead of the browser's localStorage, so "connect once" works across devices and
-- the OAuth phases (C2/C3) have a consistent home to write into.
--
-- SECURITY MODEL: RLS is ENABLED with NO policies for end users — so the anon/authenticated client
-- (the browser) can NEVER select/insert/update/delete rows here. Only the service role (used by the
-- `connections` + oauth edge functions) bypasses RLS. Result: access/refresh tokens are never reachable
-- from the browser. (At-rest encryption via Supabase Vault is a later hardening; tokens are already
-- server-only by construction.)

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,                 -- 'supabase' | 'github' | 'netlify' | 'vercel' | …
  access_token text,
  refresh_token text,
  expires_at timestamptz,                  -- when access_token expires (for OAuth refresh)
  scope text,
  account_label text,                      -- e.g. the connected GitHub login / Supabase org name
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists provider_connections_user_idx on public.provider_connections (user_id);

alter table public.provider_connections enable row level security;
-- Intentionally NO policies: end users have zero direct access. The edge functions read/write with the
-- service role. This is what keeps the tokens out of the browser entirely.

-- keep updated_at fresh
create or replace function public.touch_provider_connections()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_provider_connections on public.provider_connections;
create trigger trg_touch_provider_connections before update on public.provider_connections
  for each row execute function public.touch_provider_connections();

-- Each app maps to a provisioned Supabase project (C2) — remember its ref on the FableForge project.
alter table public.projects add column if not exists supabase_project_ref text;
