-- app_0157_email_flows.sql — email flows (SW10.7): behavioral segments + 2-3 step drips.
-- Definitions and per-contact state; execution stays on the EXISTING rails — the standing-worker
-- sweep turns each due cohort into one outreach_batch + one send_batch approval, and the batch
-- drain (suppression, caps, kill switch re-checked per recipient) does the sending. Flows are
-- paused by default: enrollment and staging start only when the operator activates.
-- Additive + idempotent.

create table if not exists public.email_flows (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  name          text not null,
  segment_rule  jsonb not null,                -- {kind: opened_no_reply|clicked|no_open|replied, sinceDays}
  steps         jsonb not null,                -- [{subject, body, delayDays}] × 2-3
  status        text not null default 'paused' check (status in ('paused', 'active', 'done')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.email_flows enable row level security;
drop policy if exists "email_flows owner all" on public.email_flows;
create policy "email_flows owner all" on public.email_flows
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_email_flows_owner on public.email_flows(owner_id, status);
drop trigger if exists trg_email_flows_touch on public.email_flows;
create trigger trg_email_flows_touch before update on public.email_flows
  for each row execute function public.touch_updated_at();

create table if not exists public.email_flow_members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  flow_id       uuid not null references public.email_flows(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  enrolled_at   timestamptz not null default now(),
  replied_at    timestamptz,                    -- a real reply ends the drip for this member, forever
  steps_sent    jsonb not null default '[]',    -- [{stepIndex, batch_id, staged_at, drained_at}]
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (flow_id, contact_id)                  -- enrollment is once — re-qualifying never restarts a drip
);
alter table public.email_flow_members enable row level security;
drop policy if exists "email_flow_members owner all" on public.email_flow_members;
create policy "email_flow_members owner all" on public.email_flow_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_email_flow_members_flow on public.email_flow_members(flow_id, replied_at);
drop trigger if exists trg_email_flow_members_touch on public.email_flow_members;
create trigger trg_email_flow_members_touch before update on public.email_flow_members
  for each row execute function public.touch_updated_at();
