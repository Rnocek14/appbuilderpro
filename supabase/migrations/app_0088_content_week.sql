-- app_0088_content_week.sql — THE CONTENT PRODUCER + GRADUATED AUTONOMY (level-10 Spec 2).
-- One weekly standing order stages a judged week of content — N social posts + 1 email — as ONE
-- approval card. Every draft is scored by the same editor rubric the boards use; sub-bar drafts
-- are DISCARDED with their scores kept for audit. After 3 consecutive approved-without-edit weeks
-- the owner may grant auto-mode: weeks then stage pre-approved (the speed-to-lead class), still
-- visible in the Queue and the ledger, still capped, still killed by pausing the order or the
-- outbound kill switch. Every judge score is bound into the approval's payload_hash — "the
-- machine said this was a 9 when I approved it" is provable from the record.

-- The bundle approval kind (enum ADD VALUE precedent: app_0064).
alter type public.approval_kind add value if not exists 'content_week';

-- Widen the order-kind vocabulary (the app_0079/app_0080 drop + re-add shape).
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week'));

-- Graduated autonomy lives ON the order: consecutive approved-without-edit weeks, and the flag the
-- owner flips once the streak has earned it. A rejection or an edited week resets both.
alter table public.standing_orders add column if not exists clean_approvals integer not null default 0;
alter table public.standing_orders add column if not exists auto_mode boolean not null default false;

-- Social daily cap — the posting twin of daily_send_cap (email, app_0023). Governs garvis-auto
-- posts only; 0 blocks all automated posting. Human-approved posts are not capped here.
alter table public.outreach_settings add column if not exists social_daily_cap integer not null default 4;

-- One row per staged week. pieces = the survivors (each with its judge score + notes + schedule +
-- lifecycle state); discards = the audit of what the bar killed (scores kept). Nothing here sends:
-- the worker's drain executes only after the approval verifies, hash-bound.
create table if not exists public.content_weeks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  order_id     uuid references public.standing_orders(id) on delete set null,
  world_id     uuid references public.knowledge_worlds(id) on delete cascade,
  week_start   date not null,
  pieces       jsonb not null default '[]',
  discards     jsonb not null default '[]',
  status       text not null default 'staged' check (status in ('staged', 'queued', 'done', 'canceled')),
  approval_id  uuid references public.approvals(id) on delete set null,
  edited       boolean not null default false,
  model        text,
  cost_usd     numeric,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
alter table public.content_weeks enable row level security;
drop policy if exists "content_weeks owner all" on public.content_weeks;
create policy "content_weeks owner all" on public.content_weeks
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create unique index if not exists uq_content_weeks_order_week on public.content_weeks(order_id, week_start);
create index if not exists idx_content_weeks_active on public.content_weeks(status, created_at)
  where status in ('staged', 'queued');
