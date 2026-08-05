-- app_0135 — ONE FIRM, ONE KEY.
--
-- Permit portals take the contractor's name as free text, so one company arrives spelled several
-- ways and every count over it is wrong. Measured on Austin, trailing 12 months:
--
--     IES Residential, Inc.              1,206      Radiant Plumbing & AC                 673
--     IES Residential Inc                  472      Radiant Plumbing and Air Conditioning 575
--
-- Two firms, four rows. A "most active contractors" list built on the raw column ranks neither
-- correctly, which is what blocks selling the contractor map at all.
--
-- The key is computed by leadEngine.companyKey() and written at ingest. It is stored rather than
-- derived at read time so the grouping can be indexed, and so a change to the folding rules is a
-- visible migration rather than a silent shift in everyone's numbers.
--
-- The DISPLAY name is never touched. company/contact_company keep exactly what the portal said.
-- Additive and idempotent, like every migration here.

alter table if exists public.le_event_parties
  add column if not exists company_key text;

alter table if exists public.le_leads
  add column if not exists contact_company_key text;

comment on column public.le_event_parties.company_key is
  'Grouping key from leadEngine.companyKey(company) — folds punctuation, legal form and &/and. Never displayed; `company` stays verbatim.';
comment on column public.le_leads.contact_company_key is
  'Grouping key from leadEngine.companyKey(contact_company). Never displayed.';

-- The contractor map groups by (world, key) and orders by count, so the index carries both.
create index if not exists le_event_parties_company_key_idx
  on public.le_event_parties (company_key) where company_key is not null;

create index if not exists le_leads_company_key_idx
  on public.le_leads (world_id, contact_company_key) where contact_company_key is not null;

-- BACKFILL. A SQL transliteration of companyKey() for rows that predate it — same folding order:
-- lowercase → & to ' and ' → non-alphanumerics to spaces → drop a leading 'the' → strip trailing
-- legal forms (three passes, matching the TS loop) → collapse whitespace. New rows are keyed by
-- the TS function at ingest; this only exists so the map is not blank on day one.
create or replace function public.le_company_key(p_name text)
returns text language sql immutable as $$
  with base as (
    select nullif(trim(regexp_replace(
      -- Apostrophes are DELETED before the general punctuation pass, exactly as companyKey() does
      -- it: "Stan's Heating" must fold to "stans heating", not "stan s heating".
      regexp_replace(
        regexp_replace(lower(coalesce(p_name, '')), '&', ' and ', 'g'),
        '[''\u2018\u2019\u201b`]', '', 'g'),
      '[^a-z0-9]+', ' ', 'g')), '') as s
  ),
  nothe as (select regexp_replace(s, '^the ', '') as s from base),
  p1 as (select regexp_replace(s, '\s+(incorporated|corporation|company|limited|inc|llc|lc|ltd|corp|co|lp|llp|lllp|pllc|plc|pc|pa|dba)$', '') as s from nothe),
  p2 as (select regexp_replace(s, '\s+(incorporated|corporation|company|limited|inc|llc|lc|ltd|corp|co|lp|llp|lllp|pllc|plc|pc|pa|dba)$', '') as s from p1),
  p3 as (select regexp_replace(s, '\s+(incorporated|corporation|company|limited|inc|llc|lc|ltd|corp|co|lp|llp|lllp|pllc|plc|pc|pa|dba)$', '') as s from p2)
  select nullif(trim(regexp_replace(s, '\s+', ' ', 'g')), '') from p3;
$$;

comment on function public.le_company_key(text) is
  'SQL mirror of leadEngine.companyKey(), for backfill only. The TS function is the source of truth at ingest.';

update public.le_event_parties
   set company_key = public.le_company_key(company)
 where company_key is null and company is not null;

update public.le_leads
   set contact_company_key = public.le_company_key(contact_company)
 where contact_company_key is null and contact_company is not null;

-- 'N/A', 'OWNER', 'None' and friends are not firms — the TS function returns null for them, and
-- the backfill must agree or the map's head is three rows of noise.
update public.le_event_parties set company_key = null
 where company_key in ('n a', 'na', 'none', 'unknown', 'owner', 'self', 'tbd');
update public.le_leads set contact_company_key = null
 where contact_company_key in ('n a', 'na', 'none', 'unknown', 'owner', 'self', 'tbd');

notify pgrst, 'reload schema';
