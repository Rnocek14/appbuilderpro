-- app_0139_copy_quality_events.sql — THE QUALITY BAR GETS A LEDGER. "Nothing automated ships
-- below score ≥ 8" is the level-10 invariant, and until now it had no machine-readable
-- existence: the 8 was a hardcoded literal in board-copy and no score was ever persisted, so
-- nothing could say how often the bar held, how often revision saved a piece, or whether the
-- judge is drifting. One row per judged piece: the draft score, the final score, whether the
-- revision pass ran, and whether the shipped piece held the bar. The shared constant lives in
-- supabase/functions/_shared/qualityCore.ts (verified by verify:quality).
--
-- Additive + idempotent; writes come from the service role (board-copy), reads are owner-scoped.

create table if not exists public.copy_quality_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  mode text not null default 'make',
  draft_score numeric,
  final_score numeric,
  revised boolean not null default false,
  held_bar boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_copy_quality_owner on public.copy_quality_events(owner_id, created_at desc);

alter table public.copy_quality_events enable row level security;
drop policy if exists "copy_quality_events owner read" on public.copy_quality_events;
-- Owner reads their own trail; inserts arrive via the service role in board-copy, so no
-- client-side insert policy exists on purpose.
create policy "copy_quality_events owner read" on public.copy_quality_events
  for select using (owner_id = auth.uid());
