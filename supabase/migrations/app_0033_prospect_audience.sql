-- app_0033_prospect_audience.sql — close the prospect → audience dead-end the bones audit found:
-- a QUALIFIED prospect had no path into contacts ('contacted' existed in the schema but nothing
-- ever wrote it). A prospect can now be moved into the audience (contact created, linked here),
-- and 'contacted' is reserved for when outreach is actually queued/sent — statuses stay honest.
-- Additive + idempotent.

alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('new', 'qualified', 'dropped', 'contacted', 'in_audience'));

alter table public.prospects add column if not exists contact_id uuid references public.contacts(id) on delete set null;
