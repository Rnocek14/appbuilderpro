-- app_0160_no_email_status.sql — THE 'no_email' PROSPECT STATUS (hunt tick, email-first builds).
-- The unattended hunt now checks for a public email BEFORE any model spend and sets aside a lead
-- it cannot email (status 'no_email', phone intact — the Prospects page lists them under their
-- own chip; "Build & send" still applies). app_0072's check constraint only knew new/built/
-- skipped, so the set-aside write would have failed silently and the lead would have bounced
-- between 'building' and 'new' forever. Additive + idempotent: the constraint is widened; rows
-- are untouched. (The constraint was created inline in app_0072, so its name is the default.)
alter table public.discovered_businesses drop constraint if exists discovered_businesses_status_check;
alter table public.discovered_businesses
  add constraint discovered_businesses_status_check
  check (status in ('new', 'building', 'built', 'skipped', 'no_email'));
