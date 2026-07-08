-- FableForge PLATFORM migration (not a generated-app migration).
-- EXECUTION SPINE v0 — the single place consequences happen (see docs/garvis-system-architecture.md §4/§6).
--
-- Constraint from the vision prompt: "Approval is required before sending emails, posting, deploying,
-- or charging. External actions must be logged." Today approvals are scattered per-feature (knowledge
-- proposals, publish_requests) and there is no cross-module log. This adds the two missing tables:
--   * approvals      — ONE queue. Anything outward-facing (send_email | publish_post | deploy_site |
--                      deploy_backend | spend | apply_migration | crm_action) becomes a row here with a
--                      human-readable preview and a payload. Nothing executes until status='approved'.
--   * execution_runs — ONE ledger. Every connector call (Resend, Netlify, Supabase Mgmt, Stripe, …) is
--                      written here with request/response/status, whether or not it went through an
--                      approval. This is the audit trail external actions are required to leave.
--
-- Reuses the app_0003/app_0019 security model. Additive + idempotent. Apply AFTER app_0003.

-- ---------- enums ----------
do $$ begin
  create type approval_kind as enum (
    'send_email', 'publish_post', 'deploy_site', 'deploy_backend',
    'spend', 'apply_migration', 'crm_action'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;
do $$ begin
  create type execution_status as enum ('ok', 'failed', 'retrying', 'skipped');
exception when duplicate_object then null; end $$;

-- ---------- approvals (the one queue) ----------
create table if not exists public.approvals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  kind         approval_kind not null,
  title        text not null,               -- one-line "Garvis prepared this" summary
  preview      text not null default '',     -- the human-readable body the user is approving (email text, etc.)
  payload      jsonb not null default '{}',  -- everything the executor needs to act on approval
  requested_by text not null default 'user',-- user | mission | run | worker
  mission_id   uuid references public.garvis_missions(id) on delete set null,
  run_id       uuid references public.agent_runs(id) on delete set null,
  status       approval_status not null default 'pending',
  decided_at   timestamptz,
  decided_via  text,                         -- ui | auto | api
  result       jsonb,                        -- filled after execution (e.g. {resend_id})
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_approvals_owner_status on public.approvals(owner_id, status, created_at desc);
create index if not exists idx_approvals_kind on public.approvals(owner_id, kind);

drop trigger if exists trg_approvals_touch on public.approvals;
create trigger trg_approvals_touch before update on public.approvals
  for each row execute function public.touch_updated_at();

-- ---------- execution_runs (the one ledger) ----------
create table if not exists public.execution_runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  approval_id  uuid references public.approvals(id) on delete set null, -- null = no approval needed (e.g. read)
  connector    text not null,               -- resend | netlify | supabase_mgmt | stripe | github | ...
  action       text not null,               -- send_email | deploy | set_secret | ...
  request      jsonb not null default '{}',  -- sanitized request (never secrets)
  response     jsonb,                        -- sanitized response / error detail
  status       execution_status not null default 'ok',
  attempt      integer not null default 1,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_exec_owner_time on public.execution_runs(owner_id, created_at desc);
create index if not exists idx_exec_approval on public.execution_runs(approval_id);
create index if not exists idx_exec_connector on public.execution_runs(owner_id, connector, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.approvals      enable row level security;
alter table public.execution_runs enable row level security;

-- Approvals: the owner sees and decides their own; they may INSERT (a mission running in the client
-- enqueues one) and UPDATE (approve/reject). Service-role executors also write via the service key.
drop policy if exists "approvals owner all" on public.approvals;
create policy "approvals owner all" on public.approvals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "approvals admin read" on public.approvals;
create policy "approvals admin read" on public.approvals
  for select using (public.is_admin());

-- Execution ledger is READ-ONLY to owners (the record must not be editable after the fact — same
-- spirit as mind_events). Writes come from edge functions via the service role, which bypasses RLS.
drop policy if exists "execution_runs owner read" on public.execution_runs;
create policy "execution_runs owner read" on public.execution_runs
  for select using (owner_id = auth.uid());
drop policy if exists "execution_runs admin read" on public.execution_runs;
create policy "execution_runs admin read" on public.execution_runs
  for select using (public.is_admin());
