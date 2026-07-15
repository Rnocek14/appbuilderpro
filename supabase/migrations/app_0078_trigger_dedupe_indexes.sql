-- app_0078_trigger_dedupe_indexes.sql — QA hardening for the trigger engine.
--
-- (1) ONCE-ONLY across duplicate triggers. The fire ledger's unique index is per-trigger
--     (trigger_id, customer_id, fired_for), so two triggers of the SAME capability on the SAME list
--     would each fire the same customer for the same due date — a double-send. Enforce one instance of
--     a capability per list so that can't happen; createTriggerFromCapability surfaces the 23505 nicely.
-- (2) Indexes that actually serve the runner's hot queries (owner_id + status; owner_id + list_id).
--
-- Additive + idempotent.

create unique index if not exists uq_automation_triggers_owner_list_cap
  on public.automation_triggers(owner_id, list_id, capability_id);

create index if not exists idx_automation_triggers_owner_status
  on public.automation_triggers(owner_id, status);

create index if not exists idx_customers_owner_list
  on public.customers(owner_id, list_id);
