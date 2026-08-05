-- app_0131_lead_capture.sql — CAPTURE WHAT CANNOT BE RECOVERED LATER.
-- The completeness audit (docs/lead-engine-capture-spec.md) found the engine structurally unable to
-- hold the most valuable data in the corpus, and losing it every hour it ran:
--   * record identity: no permit number, so two permits at one address in one month COLLAPSED into
--     one event (electrical + plumbing + mechanical sub-permits on a job is the NORMAL case).
--   * lifecycle: no status or status date, so the stage feed ("final inspection scheduled" — the
--     moment the finish trades buy) was unobservable, and portals overwrite status in place.
--   * classification/sizing: no use type, work class, or square footage — the inputs that tell a
--     commercial lead from a house, and size the job when the record states no value.
--   * disqualified rows were DROPPED, not flagged, so a filter mistake was silent and permanent.
-- All of it is near-free at scrape time and impossible to reconstruct afterwards.
--
-- Additive + idempotent. RLS follows app_0129's owner-scoped pattern verbatim.

-- 1) le_events ------------------------------------------------------------------------------
-- identity (the dedupe fix)
alter table public.le_events add column if not exists source_record_id text;      -- permit/licence number
alter table public.le_events add column if not exists parent_record_id text;      -- master permit / project / job number
alter table public.le_events add column if not exists content_hash text;          -- change detection
alter table public.le_events add column if not exists source_config_hash text;    -- which filter was in effect

-- lifecycle
alter table public.le_events add column if not exists record_status text;         -- verbatim
alter table public.le_events add column if not exists status_normalized text
  check (status_normalized in ('in_review','active','final','inactive','unknown'));
alter table public.le_events add column if not exists status_date timestamptz;
alter table public.le_events add column if not exists applied_at   timestamptz;
alter table public.le_events add column if not exists issued_at    timestamptz;
alter table public.le_events add column if not exists approved_at  timestamptz;
alter table public.le_events add column if not exists completed_at timestamptz;
alter table public.le_events add column if not exists expires_at   timestamptz;
alter table public.le_events add column if not exists occurred_kind text;         -- which date occurred_at is

-- geography / parcel
alter table public.le_events add column if not exists lat numeric;
alter table public.le_events add column if not exists lon numeric;
alter table public.le_events add column if not exists parcel_id text;
alter table public.le_events add column if not exists jurisdiction text;          -- stable slug, not a label
alter table public.le_events add column if not exists city text;
alter table public.le_events add column if not exists state text;
alter table public.le_events add column if not exists postal_code text;
alter table public.le_events add column if not exists unit text;

-- classification / sizing (scoring inputs)
alter table public.le_events add column if not exists property_class text;        -- Commercial | Residential | null
alter table public.le_events add column if not exists work_class text;            -- New | Addition | Remodel | TI | Shell
alter table public.le_events add column if not exists permit_type text;
alter table public.le_events add column if not exists permit_sub_type text;
alter table public.le_events add column if not exists use_type text;
alter table public.le_events add column if not exists proposed_use text;
alter table public.le_events add column if not exists sqft_total   numeric;
alter table public.le_events add column if not exists sqft_new     numeric;
alter table public.le_events add column if not exists sqft_remodel numeric;
alter table public.le_events add column if not exists stories int;
alter table public.le_events add column if not exists units int;
alter table public.le_events add column if not exists year_built int;
alter table public.le_events add column if not exists fees_usd numeric;
alter table public.le_events add column if not exists trade_tags text[] not null default '{}';

-- observation history (irreversible if missed)
alter table public.le_events add column if not exists last_seen_at timestamptz;
alter table public.le_events add column if not exists seen_count int not null default 1;
alter table public.le_events add column if not exists qualified boolean not null default true;
alter table public.le_events add column if not exists disqualified_reason text;   -- store, don't drop

create index if not exists idx_le_events_record on public.le_events(owner_id, jurisdiction, source_record_id);
create index if not exists idx_le_events_parcel on public.le_events(owner_id, parcel_id) where parcel_id is not null;
create index if not exists idx_le_events_status on public.le_events(world_id, status_normalized, status_date desc);
create index if not exists idx_le_events_tags   on public.le_events using gin(trade_tags);

-- 2) parties, versions, ingest runs ---------------------------------------------------------
-- all parties on a record, with their contact data and provenance
create table if not exists public.le_event_parties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.le_events(id) on delete cascade,
  ordinal int not null default 0,          -- Chicago contact_1..contact_15
  role text,                               -- verbatim: 'CONTRACTOR-ELECTRICAL', 'OWNER', 'applicant'
  role_normalized text,                    -- owner | contractor | applicant | architect | filing_rep | other
  name text, company text,
  phone text, email text,
  address text, city text, state text, postal_code text,
  license_no text,
  source_field text not null,              -- which column this came from (verbatim discipline)
  created_at timestamptz not null default now()
);
create index if not exists idx_le_parties_event on public.le_event_parties(event_id, ordinal);
create index if not exists idx_le_parties_license on public.le_event_parties(owner_id, license_no) where license_no is not null;

-- append-only observation history: every time we see a row and it differs
create table if not exists public.le_event_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.le_events(id) on delete cascade,
  observed_at timestamptz not null default now(),
  record_status text, status_normalized text,
  valuation_usd numeric,
  content_hash text not null,
  changed_fields jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb
);
create index if not exists idx_le_versions_event on public.le_event_versions(event_id, observed_at desc);

-- the coverage log: what each run actually saw. Cannot be reconstructed later.
create table if not exists public.le_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.le_sources(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  request_url text,
  http_status int,
  body_bytes int,
  body_truncated boolean not null default false,   -- the 2MB slice, made visible
  rows_parsed int not null default 0,
  rows_disqualified int not null default 0,
  rows_new int not null default 0,
  rows_changed int not null default 0,
  cursor_before jsonb, cursor_after jsonb,
  config_hash text,
  error text
);
create index if not exists idx_le_runs_source on public.le_ingest_runs(source_id, started_at desc);

-- 3) le_leads -------------------------------------------------------------------------------
alter table public.le_leads add column if not exists contact_source text;      -- record | places | website | append:<vendor>
alter table public.le_leads add column if not exists contact_role text;
alter table public.le_leads add column if not exists contact_verified_at timestamptz;
alter table public.le_leads add column if not exists contact_line_type text;   -- mobile | landline | voip | main
alter table public.le_leads add column if not exists contact_confidence int;   -- 0..100, our own derivation
alter table public.le_leads add column if not exists email_status text
  check (email_status in ('valid','catch_all','invalid','role','unverified'));
alter table public.le_leads add column if not exists dnc_status text;
alter table public.le_leads add column if not exists dnc_checked_at timestamptz;
alter table public.le_leads add column if not exists est_value_usd numeric;    -- derived job size for THIS trade
alter table public.le_leads add column if not exists stage text;               -- lifecycle stage at scoring time
alter table public.le_leads add column if not exists score_version text;       -- historic scores stay interpretable
alter table public.le_leads add column if not exists delivered_latency_sec int;
alter table public.le_leads add column if not exists exclusive boolean not null default true;

-- 4) le_sources -----------------------------------------------------------------------------
alter table public.le_sources add column if not exists dialect text not null default 'array'
  check (dialect in ('array','arcgis','ckan','carto'));   -- envelope shape, orthogonal to kind
alter table public.le_sources add column if not exists records_path text;      -- e.g. 'result.records', 'rows'
alter table public.le_sources add column if not exists poll_mode text not null default 'discovery'
  check (poll_mode in ('discovery','status','backfill'));
alter table public.le_sources add column if not exists jurisdiction text;      -- stable slug
alter table public.le_sources add column if not exists config_hash text;       -- stamped onto every event
alter table public.le_sources add column if not exists backfill_cursor jsonb not null default '{}'::jsonb;

-- RLS — the app_0129 owner pattern, with the world-ownership check where a world is implied.
alter table public.le_event_parties enable row level security;
drop policy if exists "le_event_parties owner all" on public.le_event_parties;
create policy "le_event_parties owner all" on public.le_event_parties
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.le_event_versions enable row level security;
drop policy if exists "le_event_versions owner all" on public.le_event_versions;
create policy "le_event_versions owner all" on public.le_event_versions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.le_ingest_runs enable row level security;
drop policy if exists "le_ingest_runs owner all" on public.le_ingest_runs;
create policy "le_ingest_runs owner all" on public.le_ingest_runs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- RECORD IDENTITY: the real uniqueness of a permit is (jurisdiction, record number) — not its
-- address. Partial-unique so rows without a record number keep the old dedupe_key path.
create unique index if not exists uq_le_events_record
  on public.le_events(owner_id, jurisdiction, source_record_id)
  where source_record_id is not null and jurisdiction is not null;
