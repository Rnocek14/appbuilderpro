-- EARNED AUTONOMY, GENERALIZED (holy-grail gap 6). Trust stops being binary. The content-week
-- loop proved the pattern (clean approvals → auto_mode → instant revoke); this table is the
-- per-action-class trust dial for the recurring LOW-NOVELTY outbound classes — follow-ups,
-- invoice chases, reactivation notes, inbox reply drafts. The operator GRANTS auto per class
-- (the UI only offers it after a clean streak); the cron drafters then mint those approvals
-- pre-approved (decided_via 'autonomy_grant', capped per day) and execute through the one send
-- path where every gate still re-runs. Revoke is one click and instant. Cold pitches and
-- anything novel stay manual forever — autonomy is earned per class, never global.

create table if not exists public.autonomy_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_class text not null check (action_class in ('followup', 'invoice_chase', 'reactivation', 'inbox_reply')),
  mode text not null default 'manual' check (mode in ('manual', 'auto')),
  daily_cap int not null default 5 check (daily_cap between 1 and 25),
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, action_class)
);

alter table public.autonomy_grants enable row level security;
drop policy if exists "autonomy_grants owner all" on public.autonomy_grants;
create policy "autonomy_grants owner all" on public.autonomy_grants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
