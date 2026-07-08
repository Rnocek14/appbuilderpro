-- Preview Engine intelligence layer: persist the marketing strategy, owner-simulation critique,
-- and audit report alongside each preview site — plus publish_requests, the purchase-intent
-- inbox filled by the PUBLIC preview's "Claim this website" form (owners aren't logged in, so
-- inserts run as anon; reading stays owner-only).

alter table public.preview_sites add column if not exists strategy jsonb;
alter table public.preview_sites add column if not exists critique jsonb;
alter table public.preview_sites add column if not exists audit jsonb;

create table if not exists public.publish_requests (
  id uuid primary key default gen_random_uuid(),
  preview_site_id uuid not null references public.preview_sites(id) on delete cascade,
  name text not null,
  contact text not null,
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_publish_requests_site on public.publish_requests(preview_site_id, created_at desc);

alter table public.publish_requests enable row level security;

drop policy if exists "publish requests anon insert" on public.publish_requests;
create policy "publish requests anon insert" on public.publish_requests
  for insert with check (true);

-- Only the agency (the preview's owner) can read/manage requests.
drop policy if exists "publish requests owner read" on public.publish_requests;
create policy "publish requests owner read" on public.publish_requests
  for select using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));
drop policy if exists "publish requests owner delete" on public.publish_requests;
create policy "publish requests owner delete" on public.publish_requests
  for delete using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));
