-- Preview engagement tracking — the validation instrument. Logged from the PUBLIC preview pages
-- (owners aren't logged in → anon insert), read only by the agency. This must exist BEFORE the
-- first outreach email: view/engage/return signal can't be retrofitted after sending.

create table if not exists public.preview_events (
  id uuid primary key default gen_random_uuid(),
  preview_site_id uuid not null references public.preview_sites(id) on delete cascade,
  event text not null,          -- view | engaged | report_view | claim_open
  visitor text not null default '', -- per-browser random id (dedupe + return-visit detection)
  created_at timestamptz not null default now()
);
create index if not exists idx_preview_events_site on public.preview_events(preview_site_id, created_at desc);

alter table public.preview_events enable row level security;

drop policy if exists "preview events anon insert" on public.preview_events;
create policy "preview events anon insert" on public.preview_events
  for insert with check (true);

drop policy if exists "preview events owner read" on public.preview_events;
create policy "preview events owner read" on public.preview_events
  for select using (exists (
    select 1 from public.preview_sites ps where ps.id = preview_site_id and ps.user_id = auth.uid()
  ));
