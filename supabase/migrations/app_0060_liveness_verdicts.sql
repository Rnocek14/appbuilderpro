-- app_0060_liveness_verdicts.sql — Tier 1 trust plumbing: the clock's pulse + real draft verdicts.
--
-- 1) system_heartbeat — the readiness audit's worst finding: every "while you sleep" feature dies
--    SILENTLY when the heartbeat is unarmed (all cron jobs 401 into pg_net and nobody sees it).
--    Cron-hit functions now stamp a row per tick; the UI reads the freshest stamp and says plainly
--    "the clock has never ticked / hasn't ticked since X" instead of pretending.
--
-- 2) draft_verdicts — the one place the product violated its own no-theater law: "the ledger learns
--    which drafts you keep vs. rewrite" was promised in five places and measured nowhere. This is
--    the measurement: one row per copied draft, verdict 'kept' or 'rewritten', and the ledger reads
--    REAL counts.
--
-- Additive + idempotent.

-- 1) The clock's pulse ---------------------------------------------------------------------------
create table if not exists public.system_heartbeat (
  job text primary key,
  last_tick_at timestamptz not null default now()
);
alter table public.system_heartbeat enable row level security;
drop policy if exists "system_heartbeat read all" on public.system_heartbeat;
-- Any signed-in user may READ liveness (a job name + timestamp — nothing sensitive); only the
-- service-role workers write (no insert/update policy on purpose).
create policy "system_heartbeat read all" on public.system_heartbeat
  for select to authenticated using (true);

-- 2) Draft verdicts ------------------------------------------------------------------------------
create table if not exists public.draft_verdicts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  world_id uuid references public.knowledge_worlds(id) on delete cascade,
  kind text not null check (kind in ('assist', 'deliver')),
  verdict text not null check (verdict in ('kept', 'rewritten')),
  topic text,                                       -- what the draft was about, for thin-spot analysis
  created_at timestamptz not null default now()
);
alter table public.draft_verdicts enable row level security;
drop policy if exists "draft_verdicts owner all" on public.draft_verdicts;
-- Same world-ownership pin as standing_orders: a verdict may only point at a world this owner owns.
create policy "draft_verdicts owner all" on public.draft_verdicts
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (
      select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()
    ))
  );
create index if not exists idx_draft_verdicts_world on public.draft_verdicts(owner_id, world_id, kind, created_at desc);
