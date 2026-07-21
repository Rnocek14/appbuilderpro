-- THE CALENDAR SENSE (holy-grail gap 7, part b). One column: the operator's secret ICS feed URL
-- (Google Calendar → Settings → "Secret address in iCal format"; Outlook publishes one too).
-- The morning pulse reads the next 24h of events into the brief — Garvis finally knows what the
-- day already holds before proposing what it should. The URL is operator-entered, fetched
-- through safeFetch (SSRF-guarded), read-only, and removable by clearing the field.

alter table public.profiles add column if not exists calendar_ics_url text;
