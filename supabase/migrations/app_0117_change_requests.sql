-- app_0117_change_requests.sql
-- THE CHANGE REQUEST (vertical slice §1): a durable object, not a note. The audit found no
-- client-facing change loop at all — requests lived in email and memory. This is the client-ops
-- workhorse: every request is world-scoped BY CONSTRUCTION (world_id NOT NULL — the scope
-- contract forbids an account-wide fallback here; a request always belongs to a client), carries
-- its whole lifecycle in one row, and links every downstream object it causes (mission, approval,
-- deployment, rollback, the notify message) so time and cost attribute to the client.
--
-- Lifecycle (enforced in the pure core, recorded in `history` append-only):
--   received → understood → scoped → [approved] → in_progress → preview_ready → deployed
--   → verified → client_notified → closed        (+ declined, from any pre-deploy state)
-- Act-with-undo inside; EXPLICIT approval (needs_approval → approval_id) for publishing, billing
-- changes, destructive operations, or anything outside the client's established policy.

create table if not exists public.change_requests (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references public.profiles(id) on delete cascade,
  world_id                 uuid not null references public.knowledge_worlds(id) on delete cascade,
  client_subscription_id   uuid references public.client_subscriptions(id) on delete set null,
  source                   text not null check (source in ('operator', 'client_email', 'portal')),
  requester                text,                     -- who asked (name / email), their identity as given
  request                  text not null,            -- the requested change, in their words
  affected_url             text,                     -- the site/page it touches
  affected_artifact_id     uuid,                     -- or the artifact it touches
  priority                 text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status                   text not null default 'received' check (status in
    ('received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready',
     'deployed', 'verified', 'client_notified', 'closed', 'declined')),
  clarification            text not null default 'none' check (clarification in ('none', 'waiting_client', 'answered')),
  needs_approval           boolean not null default false,
  approval_id              uuid references public.approvals(id) on delete set null,
  mission_id               uuid,                     -- the assigned mission/execution, when one is spun up
  deploy_execution_id      uuid references public.execution_runs(id) on delete set null,
  rollback_ref             text,                     -- what restores the previous state (stashed html path / prior live url)
  notify_message_id        uuid,                     -- the completion communication (outreach_messages)
  received_at              timestamptz not null default now(),
  closed_at                timestamptz,
  minutes_spent            integer not null default 0,
  cost_usd                 numeric(10, 4) not null default 0,
  history                  jsonb not null default '[]',   -- append-only [{at, from, to, note}]
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_change_requests_world on public.change_requests(world_id, status);
create index if not exists idx_change_requests_open on public.change_requests(owner_id, status, received_at)
  where status not in ('closed', 'declined');

alter table public.change_requests enable row level security;
drop policy if exists change_requests_all on public.change_requests;
create policy change_requests_all on public.change_requests
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop trigger if exists trg_change_requests_touch on public.change_requests;
create trigger trg_change_requests_touch before update on public.change_requests
  for each row execute function public.touch_updated_at();
