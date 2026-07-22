-- PER-CLIENT AUTOMATION CONFIG — tie automations, missed-call numbers, and customer lists to the
-- specific paying client (client_subscriptions) they run for, so one operator can run many clients
-- cleanly and see honest per-client rollups. The FK is NULLABLE with on-delete-set-null, so every
-- existing owner-scoped automation keeps working unattached and deleting a client never deletes their
-- automations (they just go unassigned). Additive + idempotent.

alter table public.automation_triggers add column if not exists client_subscription_id uuid
  references public.client_subscriptions(id) on delete set null;
alter table public.missed_call_configs add column if not exists client_subscription_id uuid
  references public.client_subscriptions(id) on delete set null;
alter table public.customer_lists add column if not exists client_subscription_id uuid
  references public.client_subscriptions(id) on delete set null;

create index if not exists idx_automation_triggers_client on public.automation_triggers(client_subscription_id);
create index if not exists idx_missed_call_configs_client on public.missed_call_configs(client_subscription_id);
create index if not exists idx_customer_lists_client on public.customer_lists(client_subscription_id);

-- The client's dedicated Twilio identity (number + subaccount), for attribution now and per-client
-- send routing later. Optional — the global TWILIO_* secrets stay the default sender until a client
-- carries its own number.
alter table public.client_subscriptions add column if not exists twilio_number text;
alter table public.client_subscriptions add column if not exists twilio_subaccount_sid text;
