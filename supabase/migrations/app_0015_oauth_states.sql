-- app_0015_oauth_states.sql
-- Short-lived store for in-flight OAuth authorization requests (PKCE verifier + CSRF state), so the
-- /oauth/callback can be matched back to the user who started the flow. RLS-locked to the service role
-- (the oauth edge function) — the browser never touches these rows.

create table if not exists public.oauth_states (
  state text primary key,                 -- random CSRF token, also the lookup key on callback
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  code_verifier text not null,            -- PKCE verifier (exchanged with the provider, never exposed)
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_user_idx on public.oauth_states (user_id);

alter table public.oauth_states enable row level security;
-- No client policies: only the service role (oauth edge fn) reads/writes. Browser has zero access.
