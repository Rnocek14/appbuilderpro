-- PIPELINE SPINE — turns the Preview Engine from an admin tool into a real funnel:
--   * ingest_tokens: per-user API tokens so the EXTERNAL scraper/lead engine can POST
--     BusinessProfile JSON to the ingest-profile edge function without a browser session.
--   * publish_requests.status: the CRM seed — a claim is a lead with a lifecycle
--     (new → contacted → won/lost), not a row that scrolls away.
--   * Owners may UPDATE their requests' status (read/delete policies already exist).

-- ---------- ingest tokens ----------
create table if not exists public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token        text not null unique,             -- random 40+ chars; treat like a password
  label        text not null default 'scraper',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists idx_ingest_tokens_user on public.ingest_tokens(user_id);

alter table public.ingest_tokens enable row level security;

drop policy if exists "ingest tokens owner all" on public.ingest_tokens;
create policy "ingest tokens owner all" on public.ingest_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- claim lifecycle ----------
alter table public.publish_requests add column if not exists status text not null default 'new'
  check (status in ('new', 'contacted', 'won', 'lost'));
create index if not exists idx_publish_requests_status on public.publish_requests(status, created_at desc);

drop policy if exists "publish requests owner update" on public.publish_requests;
create policy "publish requests owner update" on public.publish_requests
  for update using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));
