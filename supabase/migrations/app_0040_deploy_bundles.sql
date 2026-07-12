-- app_0040_deploy_bundles.sql — makes the approval spine a REAL deploy path. The site build runs
-- client-side (WebContainer), so the built files only exist in the browser at build time. To route
-- a deploy through Approvals (nothing ships without sign-off) AND still execute it server-side, we
-- CAPTURE the built bundle at authorization time into this table; approveAndExecute loads it and
-- calls deploy-site. One-shot: the bundle is deleted after a successful deploy. Owner RLS.
-- Additive + idempotent.

create table if not exists public.deploy_bundles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  site_id     text,                          -- Netlify site id for a re-deploy (null = new site)
  files       jsonb not null,                -- the built dist/: [{path, b64, sha1}] — real bytes
  file_count  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.deploy_bundles enable row level security;
drop policy if exists "deploy_bundles owner all" on public.deploy_bundles;
create policy "deploy_bundles owner all" on public.deploy_bundles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_deploy_bundles_project on public.deploy_bundles(project_id, created_at desc);
