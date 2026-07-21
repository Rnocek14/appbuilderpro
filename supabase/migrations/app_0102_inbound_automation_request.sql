-- app_0102_inbound_automation_request.sql — the custom-automation intake's landing place.
-- A prospect who visits their demo and types HOW THEY RUN THEIR BUSINESS is the hottest inbound
-- lead the system produces: they asked, in their own words, to be automated. It lands as an
-- opportunity (the operator's triage feed) with a new kind so it is distinguishable at a glance and
-- filterable. Only the check constraint changes — the existing kinds and every existing row are
-- untouched. Additive + idempotent (drop-if-exists then re-add, the same shape app_0089 used for
-- standing_orders_kind_check).

alter table public.opportunities drop constraint if exists opportunities_kind_check;
alter table public.opportunities
  add constraint opportunities_kind_check
  check (kind in ('mural', 'public-art', 'grant', 'commission', 'job', 'inbound_automation_request', 'other'));
