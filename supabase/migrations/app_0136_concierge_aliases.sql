-- app_0136_concierge_aliases.sql
-- THE CONCIERGE'S LEARNED SHORTCUTS, cross-device. Tier 0 used to live in localStorage only —
-- a phrase the desktop learned was unknown on the phone. One tiny owner-scoped table: the
-- operator's exact phrasings mapped to the task ids they resolved to. Additive + idempotent.

create table if not exists public.concierge_aliases (
  owner_id uuid not null references auth.users(id) on delete cascade,
  sentence_norm text not null,
  sentence text not null,
  task_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, sentence_norm)
);

alter table public.concierge_aliases enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'concierge_aliases' and policyname = 'concierge_aliases_owner') then
    create policy concierge_aliases_owner on public.concierge_aliases
      for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;
