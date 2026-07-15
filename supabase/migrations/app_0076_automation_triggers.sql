-- app_0076_automation_triggers.sql — THE TRIGGER ENGINE (tentpole #1): per-customer event/date/interval
-- automations, the mechanic every sector pack needs and the one Garvis's clock did not yet have.
--
-- standing_orders (app_0059) schedules ORDERS (watch a page, weekly digest). This adds the other axis:
-- fire ONCE per customer, a set number of days after an event on THAT customer's own record (6 months
-- after a patient's last visit; every spring for a maintenance customer; N days after a job closes).
-- The scheduling + once-only math is pure and verified (automation/triggers.ts + triggers.verify.ts);
-- this migration is the data it runs on. Wiring the runner (enqueue an approval-gated send per due
-- customer, on the heartbeat) is the next step — nothing here sends; the human still owns the trigger out.
--
-- HONESTY / SAFETY:
--   * A trigger fires only for customers whose due date was reached RECENTLY (window_days) — turning a
--     trigger on never retroactively blasts years of backlog.
--   * trigger_fires is the idempotency ledger: one row per (trigger, customer, due date) — fire once.
--   * consent_basis on customers records that this is the client's OWN warm list (processor model);
--     the actual send still re-checks suppression + goes through the approval spine.
--
-- Additive + idempotent. Owner-scoped RLS on every table (single-tenant today; the operator-membership
-- overlay from tentpole #2 extends these policies later — it does not replace them).

-- 1) A client's warm customer list ----------------------------------------------------------------
create table if not exists public.customer_lists (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid,
  name                text not null,
  source              text not null default 'manual' check (source in ('manual', 'import', 'crm')),
  created_at          timestamptz not null default now()
);
alter table public.customer_lists enable row level security;
drop policy if exists "customer_lists owner all" on public.customer_lists;
create policy "customer_lists owner all" on public.customer_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_customer_lists_owner on public.customer_lists(owner_id, created_at desc);

-- 2) Individual customers with the event dates triggers anchor on ---------------------------------
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  list_id         uuid not null references public.customer_lists(id) on delete cascade,
  email           text,
  name            text,
  -- the anchor dates a trigger can key on (all optional — a null anchor simply never fires)
  last_service_at date,
  last_visit_at   date,
  purchase_at     date,
  next_due_at     date,
  meta            jsonb not null default '{}'::jsonb,
  consent_basis   text not null default 'warm_transactional' check (consent_basis in ('warm_transactional', 'cold_prospecting')),
  consent_at      timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.customers enable row level security;
drop policy if exists "customers owner all" on public.customers;
create policy "customers owner all" on public.customers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_customers_list on public.customers(list_id);
create index if not exists idx_customers_owner on public.customers(owner_id);

-- 3) A trigger: an instance of a sector-pack automation the owner turned on -----------------------
create table if not exists public.automation_triggers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  list_id          uuid not null references public.customer_lists(id) on delete cascade,
  capability_id    text not null,                 -- the registry capability (e.g. 'hygiene_recall')
  label            text not null,
  anchor_field     text not null check (anchor_field in ('last_service_at', 'last_visit_at', 'purchase_at', 'next_due_at')),
  offset_days      integer not null,              -- fire this many days after the anchor date
  window_days      integer not null default 7 check (window_days >= 1),  -- only fire if it became due within this window
  template_subject text not null,
  template_body    text not null,
  status           text not null default 'active' check (status in ('active', 'paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.automation_triggers enable row level security;
drop policy if exists "automation_triggers owner all" on public.automation_triggers;
create policy "automation_triggers owner all" on public.automation_triggers
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_automation_triggers_active on public.automation_triggers(status, list_id);
create index if not exists idx_automation_triggers_owner on public.automation_triggers(owner_id);

-- 4) The idempotency ledger: one row per (trigger, customer, due date) that fired -----------------
create table if not exists public.trigger_fires (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  trigger_id   uuid not null references public.automation_triggers(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  fired_for    date not null,                     -- the anchor-derived due date this fire satisfied
  approval_id  uuid,                              -- the approval enqueued for this fire (null until wired)
  created_at   timestamptz not null default now()
);
alter table public.trigger_fires enable row level security;
drop policy if exists "trigger_fires owner all" on public.trigger_fires;
create policy "trigger_fires owner all" on public.trigger_fires
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Fire once per (trigger, customer, due date): the DB makes the once-only invariant real.
create unique index if not exists uq_trigger_fires_once on public.trigger_fires(trigger_id, customer_id, fired_for);
create index if not exists idx_trigger_fires_trigger on public.trigger_fires(trigger_id);
