-- app_0120_client_reports.sql
-- THE MONTHLY CLIENT REPORT (vertical slice §2): an ARTIFACT with provenance, not a rendered
-- summary. The audit's finding was brutal — "the monthly report is one owner-wide sentence
-- rendered on page visit." This row is the fix's spine: derived ONLY from world-scoped ledgers
-- (the compile core refuses owner-wide aggregation presented as client truth), every claim
-- traceable (evidence jsonb: claim → row refs), unknowns EXPLICIT (a metric whose source is
-- empty/unarmed is listed as unavailable, never invented), approval-gated before delivery
-- through the one send spine, and correctable via version/supersedes history.

create table if not exists public.client_reports (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  world_id                uuid not null references public.knowledge_worlds(id) on delete cascade,
  client_subscription_id  uuid references public.client_subscriptions(id) on delete set null,
  period_start            date not null,
  period_end              date not null,
  package_id              uuid references public.service_packages(id) on delete set null,  -- version reported under
  ledger_from             timestamptz not null,     -- the exact source range the numbers came from
  ledger_to               timestamptz not null,
  generated_at            timestamptz not null default now(),
  body_md                 text not null,            -- client-facing, concise
  evidence                jsonb not null default '{}',  -- operator view: claim key → {count, row_refs[], source}
  unknowns                jsonb not null default '[]',  -- explicitly unavailable metrics + why
  approval_state          text not null default 'draft' check (approval_state in ('draft', 'approved')),
  approval_id             uuid references public.approvals(id) on delete set null,
  delivery_state          text not null default 'not_sent' check (delivery_state in ('not_sent', 'queued', 'sent')),
  message_id              uuid,                     -- the outreach message that delivered it
  version                 integer not null default 1,
  supersedes              uuid references public.client_reports(id) on delete set null,  -- corrections chain
  created_at              timestamptz not null default now(),
  unique (owner_id, world_id, period_start, period_end, version)
);

create index if not exists idx_client_reports_world on public.client_reports(world_id, period_end desc);
create index if not exists idx_client_reports_due on public.client_reports(owner_id, delivery_state, period_end);

alter table public.client_reports enable row level security;
drop policy if exists client_reports_all on public.client_reports;
create policy client_reports_all on public.client_reports
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
