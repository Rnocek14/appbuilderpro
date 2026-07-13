-- app_0064_send_batch.sql — BULK SEND-TO-SEGMENT. The audit's "impractical newsletter" fix:
-- one approval approves a BATCH (a snapshotted segment of contacts); the standing worker drains it
-- under the daily cap by pushing every recipient through THE ONE SEND PATH (send-email), so every
-- safety gate — suppression, contact status, kill switch, cap/warmup — re-checks per recipient at
-- send time. The batch never bypasses anything; it only removes the 200-clicks problem.
-- Additive + idempotent. NOTE: the enum value is added here and only USED at runtime (PG allows
-- ADD VALUE in a transaction as long as the same transaction doesn't reference it).

alter type public.approval_kind add value if not exists 'send_batch';

create table if not exists public.outreach_batches (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  subject       text not null,
  body_text     text not null,
  recipients    jsonb not null default '[]',   -- snapshot: [{contactId,email,name,state,reason?}]
  status        text not null default 'queued' check (status in ('queued', 'draining', 'done', 'canceled')),
  approval_id   uuid references public.approvals(id) on delete set null,
  sent_count    int not null default 0,
  skipped_count int not null default 0,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table public.outreach_batches enable row level security;
drop policy if exists "outreach_batches owner all" on public.outreach_batches;
create policy "outreach_batches owner all" on public.outreach_batches
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_outreach_batches_active on public.outreach_batches(status, created_at) where status in ('queued', 'draining');
create index if not exists idx_outreach_batches_owner on public.outreach_batches(owner_id, created_at desc);
