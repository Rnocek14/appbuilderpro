-- app_0039_daily_driver.sql — Tier 1 "daily driver" surface: user reminders (the one operator
-- affordance with no home), a CRM stage + notes on contacts. All owner-scoped RLS. Additive +
-- idempotent. The inbox and health board need no new tables — they read existing rows.

-- ---------- reminders (the human's own todos — distinct from agent garvis_tasks) ----------
create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  detail      text,
  world_id    uuid references public.knowledge_worlds(id) on delete set null,  -- optional context
  due_at      timestamptz,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.reminders enable row level security;
drop policy if exists "reminders owner all" on public.reminders;
create policy "reminders owner all" on public.reminders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_reminders_owner on public.reminders(owner_id, done, due_at);

-- ---------- contacts CRM: a pipeline stage + free-text notes ----------
alter table public.contacts add column if not exists stage text not null default 'new'
  check (stage in ('new', 'contacted', 'qualified', 'customer', 'lost'));

create table if not exists public.contact_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.contact_notes enable row level security;
drop policy if exists "contact_notes owner all" on public.contact_notes;
create policy "contact_notes owner all" on public.contact_notes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_contact_notes_contact on public.contact_notes(contact_id, created_at desc);
