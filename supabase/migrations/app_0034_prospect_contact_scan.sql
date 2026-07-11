-- app_0034_prospect_contact_scan.sql — prospects can carry the contact emails their OWN site
-- publicly lists (found by fetch-url mode 'contact'; Garvis never guesses an address). scanned_at
-- records that a scan happened even when it found nothing — "we looked, nothing public" is honest
-- state, distinct from "never looked". Additive + idempotent.

alter table public.prospects add column if not exists contact_emails jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists scanned_at timestamptz;
